import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import usersRouter, { createUsersRouter } from './users.js';

async function startApp({ db, role = 'OWNER', userId = 'owner-1', hashPassword } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: userId, tenantId: 'tenant-a', role }; next(); });
  app.use('/users', createUsersRouter({ db, hashPassword }));
  app.use((error, _req, res, _next) => res.status(error.name === 'ZodError' ? 400 : 500).json({ error: error.message }));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address();
  return {
    server,
    request: (path, options = {}) => fetch(`http://127.0.0.1:${address.port}${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    }),
  };
}

test('lists only users from the current tenant and never selects password hashes', async t => {
  let args;
  const db = {
    user: { findMany: async value => { args = value; return [{ id: 'u1', name: 'Ana', email: 'ana@example.com', role: 'SUPPORT', active: true }]; } },
  };
  const app = await startApp({ db });
  t.after(() => app.server.close());
  const response = await app.request('/users');
  assert.equal(response.status, 200);
  assert.equal(args.where.tenantId, 'tenant-a');
  assert.equal('passwordHash' in args.select, false);
  assert.deepEqual((await response.json()).items[0], { id: 'u1', name: 'Ana', email: 'ana@example.com', role: 'SUPPORT', active: true });
});

test('creates staff with normalized email, tenant scope, and a password hash', async t => {
  let createArgs;
  let auditArgs;
  const db = {
    user: { create: async args => { createArgs = args; return { id: 'u2', name: args.data.name, email: args.data.email, role: args.data.role, active: true }; } },
    auditLog: { create: async args => { auditArgs = args; } },
  };
  const app = await startApp({ db, hashPassword: async value => `hashed:${value}` });
  t.after(() => app.server.close());
  const response = await app.request('/users', { method: 'POST', body: JSON.stringify({ name: ' Técnico ', email: ' TECNICO@EXAMPLE.COM ', password: 'a-strong-password', role: 'SUPPORT' }) });
  assert.equal(response.status, 201);
  assert.equal(createArgs.data.tenantId, 'tenant-a');
  assert.equal(createArgs.data.email, 'tecnico@example.com');
  assert.equal(createArgs.data.passwordHash, 'hashed:a-strong-password');
  assert.equal(auditArgs.data.action, 'CREATE_USER');
  assert.equal('passwordHash' in (await response.json()).user, false);
});

test('prevents an administrator from creating another administrator', async t => {
  let created = false;
  const db = { user: { create: async () => { created = true; } } };
  const app = await startApp({ db, role: 'ADMIN' });
  t.after(() => app.server.close());
  const response = await app.request('/users', { method: 'POST', body: JSON.stringify({ name: 'Nuevo admin', email: 'new@example.com', password: 'a-strong-password', role: 'ADMIN' }) });
  assert.equal(response.status, 403);
  assert.equal(created, false);
});

test('prevents removing the last active owner', async t => {
  let updated = false;
  const db = {
    user: {
      findFirst: async args => { assert.equal(args.where.tenantId, 'tenant-a'); return { id: 'owner-2', role: 'OWNER', active: true }; },
      count: async args => { assert.deepEqual(args.where, { tenantId: 'tenant-a', role: 'OWNER', active: true }); return 1; },
      update: async () => { updated = true; },
    },
  };
  const app = await startApp({ db });
  t.after(() => app.server.close());
  const response = await app.request('/users/owner-2', { method: 'PATCH', body: JSON.stringify({ role: 'ADMIN' }) });
  assert.equal(response.status, 409);
  assert.equal(updated, false);
});

test('does not allow changing another tenant user', async t => {
  let query;
  const db = { user: { findFirst: async args => { query = args; return null; } } };
  const app = await startApp({ db });
  t.after(() => app.server.close());
  const response = await app.request('/users/foreign-user', { method: 'PATCH', body: JSON.stringify({ active: false }) });
  assert.equal(response.status, 404);
  assert.equal(query.where.tenantId, 'tenant-a');
});

test('rejects weak passwords and unknown fields', async t => {
  let created = false;
  const db = { user: { create: async () => { created = true; } } };
  const app = await startApp({ db });
  t.after(() => app.server.close());
  const response = await app.request('/users', { method: 'POST', body: JSON.stringify({ name: 'Test', email: 'test@example.com', password: 'short', isOwner: true }) });
  assert.equal(response.status, 400);
  assert.equal(created, false);
});

test('exports a default router for the API mount', () => {
  assert.equal(typeof usersRouter, 'function');
});
