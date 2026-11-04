import { Router } from 'express';
import crypto from 'node:crypto';
import { fetchJson } from '../integration-http.js';
import { z } from 'zod';
import { prisma } from '../db.js';
import { allowRoles } from '../middleware/auth.js';

const router = Router();
const roles = allowRoles('OWNER', 'ADMIN');
const secretKey = () => {
  const value = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!value || value.length < 32) throw new Error('Falta INTEGRATION_ENCRYPTION_KEY (mínimo 32 caracteres).');
  return crypto.createHash('sha256').update(value, 'utf8').digest();
};
function encrypt(value) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}
function decrypt(value) {
  if (!value) return '';
  const [iv, tag, data] = value.split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
function httpsBaseUrl(value, allowlistEnv) {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('La dirección debe ser HTTPS y no debe incluir usuario, contraseña, consulta ni fragmento.');
  }
  const allowed = (process.env[allowlistEnv] || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  if (!allowed.length || !allowed.includes(parsed.host.toLowerCase())) {
    const error = new Error(`Destino no autorizado. Añade exactamente ${parsed.host} a ${allowlistEnv} en el entorno seguro del servidor.`);
    error.statusCode = 400;
    throw error;
  }
  return parsed.toString().replace(/\/$/, '');
}
async function getConfig(tenantId) {
  return prisma.integrationConfig.findUnique({ where: { tenantId } });
}
function integrationErrorMessage(error, device) {
  if (error?.name === 'AbortError') return `Tiempo de espera agotado al conectar con ${device}.`;
  if (error?.statusCode === 400) return error.message;
  if (error?.statusCode === 429) return `${device} aplicó un límite temporal de solicitudes. Inténtalo más tarde.`;
  return `No se pudo completar la comunicación segura con ${device}. Revisa la configuración y los registros del servidor.`;
}
function publicConfig(config) {
  return {
    mikrotik: { configured: Boolean(config?.mikrotikBaseUrl && config?.mikrotikUsername && config?.mikrotikPasswordEnc), baseUrl: config?.mikrotikBaseUrl || '', username: config?.mikrotikUsername || '' },
    smartolt: { configured: Boolean(config?.smartoltBaseUrl && config?.smartoltApiTokenEnc), baseUrl: config?.smartoltBaseUrl || '' },
    encryptionReady: Boolean(process.env.INTEGRATION_ENCRYPTION_KEY && process.env.INTEGRATION_ENCRYPTION_KEY.length >= 32),
  };
}

router.get('/status', roles, async (req, res, next) => {
  try { res.json(publicConfig(await getConfig(req.user.tenantId))); }
  catch (error) { next(error); }
});

router.put('/config', roles, async (req, res, next) => {
  try {
    const input = z.object({
      mikrotikBaseUrl: z.string().trim().url().optional().or(z.literal('')),
      mikrotikUsername: z.string().trim().max(100).optional().or(z.literal('')),
      mikrotikPassword: z.string().max(500).optional().or(z.literal('')),
      smartoltBaseUrl: z.string().trim().url().optional().or(z.literal('')),
      smartoltApiToken: z.string().max(1000).optional().or(z.literal('')),
    }).parse(req.body);
    const existing = await getConfig(req.user.tenantId);
    const mikrotikBaseUrl = input.mikrotikBaseUrl ? httpsBaseUrl(input.mikrotikBaseUrl, 'MIKROTIK_ALLOWED_HOSTS') : null;
    const smartoltBaseUrl = input.smartoltBaseUrl ? httpsBaseUrl(input.smartoltBaseUrl, 'SMARTOLT_ALLOWED_HOSTS') : null;
    const data = {
      mikrotikBaseUrl,
      mikrotikUsername: input.mikrotikUsername || null,
      mikrotikPasswordEnc: input.mikrotikPassword ? encrypt(input.mikrotikPassword) : (existing?.mikrotikPasswordEnc || null),
      smartoltBaseUrl,
      smartoltApiTokenEnc: input.smartoltApiToken ? encrypt(input.smartoltApiToken) : (existing?.smartoltApiTokenEnc || null),
    };
    if (!mikrotikBaseUrl && !input.mikrotikPassword && existing?.mikrotikPasswordEnc) data.mikrotikPasswordEnc = existing.mikrotikPasswordEnc;
    if (!smartoltBaseUrl && !input.smartoltApiToken && existing?.smartoltApiTokenEnc) data.smartoltApiTokenEnc = existing.smartoltApiTokenEnc;
    const config = await prisma.integrationConfig.upsert({
      where: { tenantId: req.user.tenantId },
      create: { tenantId: req.user.tenantId, ...data },
      update: data,
    });
    await prisma.auditLog.create({ data: { tenantId: req.user.tenantId, userId: req.user.id, action: 'UPDATE_INTEGRATIONS', entity: 'IntegrationConfig', entityId: config.id } });
    res.json({ saved: true, ...publicConfig(config) });
  } catch (error) { next(error); }
});

router.post('/mikrotik/test', roles, async (req, res, next) => {
  try {
    const config = await getConfig(req.user.tenantId);
    if (!config?.mikrotikBaseUrl || !config.mikrotikUsername || !config.mikrotikPasswordEnc) return res.status(400).json({ error: 'Configura primero la dirección HTTPS, usuario y contraseña de MikroTik.' });
    const password = decrypt(config.mikrotikPasswordEnc);
    const auth = Buffer.from(`${config.mikrotikUsername}:${password}`).toString('base64');
    const baseUrl = httpsBaseUrl(config.mikrotikBaseUrl, 'MIKROTIK_ALLOWED_HOSTS');
    const data = await fetchJson(`${baseUrl}/rest/system/resource`, { headers: { Authorization: `Basic ${auth}` } });
    // RouterOS REST may return a single object (current versions) or a one-item array.
    const resource = Array.isArray(data) ? data[0] : data;
    if (!resource || typeof resource !== 'object' || Array.isArray(resource)) {
      throw new Error('MikroTik devolvió una respuesta de recursos con formato inesperado.');
    }
    res.json({ connected: true, device: resource['board-name'] || resource.platform || 'MikroTik', version: resource.version || 'No informada', uptime: resource.uptime || 'No informado' });
  } catch (error) { res.status(error?.statusCode || 502).json({ connected: false, error: integrationErrorMessage(error, 'MikroTik'), ...(error?.retryAfter ? { retryAfter: error.retryAfter } : {}) }); }
});

router.post('/smartolt/test', roles, async (req, res, next) => {
  try {
    const config = await getConfig(req.user.tenantId);
    if (!config?.smartoltBaseUrl || !config.smartoltApiTokenEnc) return res.status(400).json({ error: 'Configura primero el dominio SmartOLT y su API Token.' });
    const token = decrypt(config.smartoltApiTokenEnc);
    const baseUrl = httpsBaseUrl(config.smartoltBaseUrl, 'SMARTOLT_ALLOWED_HOSTS');
    const data = await fetchJson(`${baseUrl}/api/system/get_olts`, { headers: { 'X-Token': token } });
    if (data?.status !== true || !Array.isArray(data.response)) {
      throw new Error('SmartOLT devolvió una respuesta inesperada al consultar las OLTs.');
    }
    res.json({ connected: true, olts: data.response.length });
  } catch (error) { res.status(error?.statusCode || 502).json({ connected: false, error: integrationErrorMessage(error, 'SmartOLT'), ...(error?.retryAfter ? { retryAfter: error.retryAfter } : {}) }); }
});

router.get('/smartolt/unconfigured-onus', roles, async (req, res, next) => {
  try {
    const config = await getConfig(req.user.tenantId);
    if (!config?.smartoltBaseUrl || !config.smartoltApiTokenEnc) return res.status(400).json({ error: 'Configura primero SmartOLT.' });
    const baseUrl = httpsBaseUrl(config.smartoltBaseUrl, 'SMARTOLT_ALLOWED_HOSTS');
    const data = await fetchJson(`${baseUrl}/api/onu/unconfigured_onus`, { headers: { 'X-Token': decrypt(config.smartoltApiTokenEnc) } });
    if (data?.status !== true || !Array.isArray(data.response)) {
      throw new Error('SmartOLT devolvió una respuesta inesperada al consultar las ONUs pendientes.');
    }
    // Expose only documented inventory fields; this endpoint is read-only.
    const items = data.response.map(onu => ({
      id: onu.id ?? null,
      ponType: onu.pon_type ?? null,
      board: onu.board ?? null,
      port: onu.port ?? null,
      onu: onu.onu ?? null,
      serial: onu.sn ?? null,
      onuType: onu.onu_type_name ?? null,
      onuTypeId: onu.onu_type_id ?? null,
      oltId: onu.olt_id ?? null,
      disabled: onu.is_disabled ?? null,
      externalId: onu.external_id ?? null,
    }));
    res.json({ items });
  } catch (error) {
    res.status(error?.statusCode || 502).json({
      error: integrationErrorMessage(error, 'SmartOLT'),
      ...(error?.retryAfter ? { retryAfter: error.retryAfter } : {}),
    });
  }
});

export default router;
