import { Router } from 'express';
import crypto from 'node:crypto';
import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
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
function isBlockedAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 127 || (a === 169 && b === 254) || a >= 224;
  }
  if (family === 6) {
    const value = address.toLowerCase();
    return value === '::' || value === '::1' || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb') || value.startsWith('ff') || value.startsWith('::ffff:');
  }
  return true;
}
async function fetchJson(url, options = {}) {
  const target = new URL(url);
  const addresses = await dns.lookup(target.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isBlockedAddress(address))) {
    const error = new Error('El destino DNS resuelve a una dirección no permitida.');
    error.statusCode = 400;
    throw error;
  }
  // Pin the validated DNS result for the TLS request to prevent DNS rebinding.
  const pinned = addresses[0];
  return new Promise((resolve, reject) => {
    const request = https.request(target, {
      method: 'GET',
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
    }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 1024 * 1024) request.destroy(new Error('La respuesta del equipo supera el límite permitido.'));
        else chunks.push(chunk);
      });
      response.on('end', () => {
        let body = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(body.error || body.message || `El equipo respondió HTTP ${response.statusCode}.`);
          error.statusCode = response.statusCode === 429 ? 429 : 502;
          const retryAfter = response.headers['retry-after'];
          if (retryAfter) error.retryAfter = retryAfter;
          reject(error);
          return;
        }
        resolve(body);
      });
    });
    request.setTimeout(10000, () => {
      const error = new Error('Tiempo de espera agotado al conectar con el equipo.');
      error.name = 'AbortError';
      request.destroy(error);
    });
    request.on('error', reject);
    request.end();
  });
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
    const baseUrl = httpsBaseUrl(config.mikrotikBaseUrl, 'MIKROTIK_ALLOWED_HOSTS');
    const data = await fetchJson(`${baseUrl}/rest/system/resource`, { headers: { Authorization: `Basic ${auth}` } });
    // RouterOS REST may return a single object (current versions) or a one-item array.
    const resource = Array.isArray(data) ? data[0] : data;
    if (!resource || typeof resource !== 'object' || Array.isArray(resource)) {
      throw new Error('MikroTik devolvió una respuesta de recursos con formato inesperado.');
    }
    res.json({ connected: true, device: resource['board-name'] || resource.platform || 'MikroTik', version: resource.version || 'No informada', uptime: resource.uptime || 'No informado' });
  } catch (error) { res.status(error?.statusCode || 502).json({ connected: false, error: error.name === 'AbortError' ? 'Tiempo de espera agotado al conectar con MikroTik.' : error.message, ...(error?.retryAfter ? { retryAfter: error.retryAfter } : {}) }); }
});

router.post('/smartolt/test', roles, async (req, res, next) => {
  try {
    const config = await getConfig(req.user.tenantId);
    if (!config?.smartoltBaseUrl || !config.smartoltApiTokenEnc) return res.status(400).json({ error: 'Configura primero el dominio SmartOLT y su API Token.' });
    const token = decrypt(config.smartoltApiTokenEnc);
    const baseUrl = httpsBaseUrl(config.smartoltBaseUrl, 'SMARTOLT_ALLOWED_HOSTS');
    const data = await fetchJson(`${baseUrl}/api/system/get_olts`, { headers: { 'X-Token': token } });
    if (data?.status !== true || !Array.isArray(data.response)) {
      throw new Error(data?.error || 'SmartOLT devolvió una respuesta inesperada al consultar las OLTs.');
    }
    res.json({ connected: true, olts: data.response.length });
  } catch (error) { res.status(error?.statusCode || 502).json({ connected: false, error: error.name === 'AbortError' ? 'Tiempo de espera agotado al conectar con SmartOLT.' : error.message, ...(error?.retryAfter ? { retryAfter: error.retryAfter } : {}) }); }
});

router.get('/smartolt/unconfigured-onus', roles, async (req, res, next) => {
  try {
    const config = await getConfig(req.user.tenantId);
    if (!config?.smartoltBaseUrl || !config.smartoltApiTokenEnc) return res.status(400).json({ error: 'Configura primero SmartOLT.' });
    const baseUrl = httpsBaseUrl(config.smartoltBaseUrl, 'SMARTOLT_ALLOWED_HOSTS');
    const data = await fetchJson(`${baseUrl}/api/onu/unconfigured_onus`, { headers: { 'X-Token': decrypt(config.smartoltApiTokenEnc) } });
    if (data?.status !== true || !Array.isArray(data.response)) {
      throw new Error(data?.error || 'SmartOLT devolvió una respuesta inesperada al consultar las ONUs pendientes.');
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
      error: error.name === 'AbortError' ? 'Tiempo de espera agotado al consultar SmartOLT.' : error.message,
      ...(error?.retryAfter ? { retryAfter: error.retryAfter } : {}),
    });
  }
});

export default router;
