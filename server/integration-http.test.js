import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import https from 'node:https';
import { fetchJson } from './integration-http.js';

const certDir = await mkdtemp(join(tmpdir(), 'gabot-https-test-'));
const certPath = join(certDir, 'cert.pem');
const keyPath = join(certDir, 'key.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore' });
const cert = await readFile(certPath);
const key = await readFile(keyPath);

async function withHttpsServer(handler, run) {
  const server = https.createServer({ key, cert }, handler);
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const { port } = server.address();
  try { await run(`https://localhost:${port}`); }
  finally { await new Promise(resolveClose => server.close(resolveClose)); }
}

const localDependencies = { ca: cert, resolveAddress: async () => ({ address: '127.0.0.1', family: 4 }) };

test('requests a local HTTPS endpoint and parses JSON with trusted test CA', async () => {
  await withHttpsServer((req, res) => {
    assert.equal(req.url, '/health');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  }, async url => assert.deepEqual(await fetchJson(`${url}/health`, {}, localDependencies), { status: 'ok' }));
});

test('preserves HTTP 429 and Retry-After', async () => {
  await withHttpsServer((_req, res) => {
    res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '30' });
    res.end(JSON.stringify({ error: 'Límite temporal' }));
  }, async url => assert.rejects(fetchJson(url, {}, localDependencies), error =>
    error.statusCode === 429 && error.retryAfter === '30' && error.message === 'Límite temporal'));
});

test('maps other upstream HTTP errors to 502', async () => {
  await withHttpsServer((_req, res) => {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: 'Servicio no disponible' }));
  }, async url => assert.rejects(fetchJson(url, {}, localDependencies), error =>
    error.statusCode === 502 && error.message === 'Servicio no disponible'));
});

test('rejects a self-signed TLS certificate when its CA is not trusted', async () => {
  await withHttpsServer((_req, res) => res.end('{}'), async url => {
    await assert.rejects(fetchJson(url, {}, { resolveAddress: localDependencies.resolveAddress }),
      error => ['SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT'].includes(error.code));
  });
});

test('aborts a stalled HTTPS response at the configured timeout', async () => {
  await withHttpsServer((_req, res) => {
    setTimeout(() => { if (!res.destroyed) res.end('{}'); }, 150);
  }, async url => assert.rejects(fetchJson(url, {}, { ...localDependencies, timeoutMs: 25 }),
    error => error.name === 'AbortError'));
});

test.after(async () => rm(certDir, { recursive: true, force: true }));
