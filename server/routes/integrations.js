import { Router } from 'express';
import crypto from 'node:crypto';
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
    const error = new Error(`Destino no autorizado. Añade exactamente ${parsed.host} a ${allowlistEnv} en el entorno seguro del servidor.`);\n    error.statusCode = 400;\n    throw error;
  }
  return parsed.toString().replace(/\/$/, '');
}
async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { ...options, redirect: 'error', signal: controller.signal, headers: { Accept: 'application/json', ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || body.message || `El equipo respondió HTTP ${response.status}.`);
    return body;
  } finally { clearTimeout(timeout); }
}
async function getConfig(tenantId) {
  return prisma.integrationConfig.findUnique({ where: { tenantId } });
}
function publicConfig(config) {
  return {
    mikrotik: { configured: Boolean(config?.mikrotikBaseUrl && config?.mikrotikUsername && config?.mikrotikPasswordEnc), baseUrl: config?.mikrotikBaseUrl || '', username: config?.mikrotikUsername || '' },
    smartolt: { configured: Boolean(config?.smartoltBaseUrl && config?.smartoltApiTokenEnc), baseUrl: config?.smartoltBaseUrl || '' },
    encryptionReady: Boolean(process.env.INTEGRATION_ENCRYPTION_KEY && process.env.INTEGRATION_ENCRYPTION_KEY.length >= 32),
  };
}

router.get('/status', async (req, res, next) => {
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
    const data = await fetchJson(`${config.mikrotikBaseUrl}/rest/system/resource`, { headers: { Authorization: `Basic ${auth}` } });
    res.json({ connected: true, device: data['board-name'] || 'MikroTik', version: data.version || 'No informada', uptime: data.uptime || 'No informado' });
  } catch (error) { res.status(502).json({ connected: false, error: error.name === 'AbortError' ? 'Tiempo de espera agotado al conectar con MikroTik.' : error.message }); }
});

router.post('/smartolt/test', roles, async (req, res, next) => {
  try {
    const config = await getConfig(req.user.tenantId);
    if (!config?.smartoltBaseUrl || !config.smartoltApiTokenEnc) return res.status(400).json({ error: 'Configura primero el dominio SmartOLT y su API Token.' });
    const token = decrypt(config.smartoltApiTokenEnc);
    const data = await fetchJson(`${config.smartoltBaseUrl}/api/system/get_olts`, { headers: { 'X-Token': token } });
    if (data.status === false) throw new Error(data.error || 'SmartOLT rechazó la autenticación.');
    res.json({ connected: true, olts: Array.isArray(data.response) ? data.response.length : 0 });
  } catch (error) { res.status(502).json({ connected: false, error: error.name === 'AbortError' ? 'Tiempo de espera agotado al conectar con SmartOLT.' : error.message }); }
});

router.get('/smartolt/unconfigured-onus', roles, async (req, res, next) => {
  try {
    const config = await getConfig(req.user.tenantId);
    if (!config?.smartoltBaseUrl || !config.smartoltApiTokenEnc) return res.status(400).json({ error: 'Configura primero SmartOLT.' });
    const data = await fetchJson(`${config.smartoltBaseUrl}/api/onu/unconfigured_onus`, { headers: { 'X-Token': decrypt(config.smartoltApiTokenEnc) } });
    if (data.status === false) throw new Error(data.error || 'SmartOLT no pudo consultar las ONUs.');
    res.json({ items: data.response || [] });
  } catch (error) { next(error); }
});

export default router;
