import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import { resolvePinnedAddress } from './integration-network.js';

/**
 * Read-only HTTPS JSON transport for MikroTik/SmartOLT.
 * Dependencies are injectable only to support isolated local TLS tests.
 */
export async function fetchJson(url, options = {}, dependencies = {}) {
  const target = new URL(url);
  const hostname = target.hostname.replace(/^\[|\]$/g, '');
  const literalIp = net.isIP(hostname) !== 0;
  // Private IP literals can pass only after the exact host has passed the configured allowlist.
  const pinned = literalIp
    ? await (dependencies.dnsLookup || dns.lookup)(hostname, { verbatim: true }).then(({ address, family }) => ({ address, family }))
    : await (dependencies.resolveAddress || resolvePinnedAddress)(hostname);

  return new Promise((resolve, reject) => {
    const request = (dependencies.httpsRequest || https.request)(target, {
      method: 'GET',
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      lookup: (_hostname, lookupOptions, callback) => lookupOptions?.all
        ? callback(null, [pinned])
        : callback(null, pinned.address, pinned.family),
      ...(dependencies.ca ? { ca: dependencies.ca } : {}),
    }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 1024 * 1024) request.destroy(new Error('La respuesta del equipo supera el límite permitido.'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
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
    request.setTimeout(dependencies.timeoutMs ?? 10000, () => {
      const error = new Error('Tiempo de espera agotado al conectar con el equipo.');
      error.name = 'AbortError';
      request.destroy(error);
    });
    request.on('error', reject);
    request.end();
  });
}
