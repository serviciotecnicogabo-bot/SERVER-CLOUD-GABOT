import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import https from 'node:https';
import { fetchJson } from './integration-http.js';

const here = dirname(fileURLToPath(import.meta.url));
const cert = await readFile(resolve(here, 'test-fixtures/https-test-cert.pem'));
const key = await readFile(resolve(here, 'test-fixtures/https-test-key.pem'));

async function withHttpsServer(handler, run) {
  const server = https.createServer({ key, cert }, handler);
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const { port } = server.address();
  try {
    await run(`https://localhost:${port}`);
  } finally {
    await new Promise(resolveClose => server.close(resolveClose));
  }
}

const localDependencies = {
  ca: cert,
  resolveAddress: async () => ({ address: '127.0.0.1', family: 4 }),
};

test('requests a local HTTPS endpoint and parses JSON with trusted test CA', async () => {
  await withHttpsServer((req, res) => {
    assert.equal(req.url, '/health');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  }, async baseUrl => {
    const result = await fetchJson(`${baseUrl}/health`, {}, localDependencies);
    assert.deepEqual(result, { status: 'ok' });
  });
});

test('preserves HTTP 429 and Retry-After from the upstream server', async () => {
  await withHttpsServer((_req, res) => {
    res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '30' });
    res.end(JSON.stringify({ error: 'Límite temporal' }));
  }, async baseUrl => {
    await assert.rejects(fetchJson(baseUrl, {}, localDependencies), error =>
      error.statusCode === 429 && error.retryAfter === '30' && error.message === 'Límite temporal');
  });
});

test('maps other upstream HTTP errors to 502', async () => {
  await withHttpsServer((_req, res) => {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: 'Servicio no disponible' }));
  }, async baseUrl => {
    await assert.rejects(fetchJson(baseUrl, {}, localDependencies), error =>
      error.statusCode === 502 && error.message === 'Servicio no disponible');
  });
});

test('rejects a self-signed TLS certificate when its CA is not trusted', async () => {
  await withHttpsServer((_req, res) => res.end('{}'), async baseUrl => {
    await assert.rejects(fetchJson(baseUrl, {}, {
      resolveAddress: localDependencies.resolveAddress,
    }), error => error.code === 'SELF_SIGNED_CERT_IN_CHAIN' || error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT');
  });
});

test('aborts a stalled HTTPS response at the configured timeout', async () => {
  await withHttpsServer((_req, res) => {
    setTimeout(() => {
      if (!res.destroyed) res.end('{}');
    }, 150);
  }, async baseUrl => {
    await assert.rejects(fetchJson(baseUrl, {}, {
      ...localDependencies,
      timeoutMs: 25,
    }), error => error.name === 'AbortError');
  });
});
