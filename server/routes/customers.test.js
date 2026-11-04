import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import customersRouter, { createCustomersRouter } from './customers.js';

async function startApp({ db, role = 'OWNER' } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'user-1', tenantId: 'tenant-a', role }; next(); });
  app.use('/customers', createCustomersRouter({ db }));
  app.use((error, _req, res, _next) => res.status(error.name === 'ZodError' ? 400 : 500).json({ error: error.message }));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address();
  return {
    server,
    request: (path, options = {}) => fetch(`http://127.0.0.1:${address.port}${path}`, {
      ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    }),
  };
}

test('lists customers scoped to the authenticated tenant', async t => {
  let args;
  const db = {
    customer: {
      findMany: async value => { args = value; return []; },
      count: async () => 0,
    },
  };
  const app = await startApp({ db });
  t.after(() => app.server.close());
  const response = await app.request('/customers?search=ana&page=2');
  assert.equal(response.status, 200);
  assert.equal(args.where.tenantId, 'tenant-a');
  assert.equal(args.skip, 20);
  assert.equal(args.where.OR[0].name.contains, 'ana');
});

test('creates a customer in the current tenant and records audit', async t => {
  let createArgs, auditArgs;
  const db = {
    customer: {
      count: async () => 3,
      create: async args => { createArgs = args; return { id: 'c4', ...args.data }; },
    },
    auditLog: { create: async args => { auditArgs = args; } },
  };
  const app = await startApp({ db });
  t.after(() => app.server.close());
  const response = await app.request('/customers', {
    method: 'POST', body: JSON.stringify({ name: ' Cliente Nuevo ' }),
  });
  assert.equal(response.status, 201);
  assert.equal(createArgs.data.tenantId, 'tenant-a');
  assert.equal(createArgs.data.code, 'CLI-00004');
  assert.equal((await response.json()).customer.name, 'Cliente Nuevo');
  assert.equal(auditArgs.data.action, 'CREATE');
});

test('updates only an existing customer in the authenticated tenant', async t => {
  let findArgs, updateArgs, auditArgs;
  const db = {
    customer: {
      findFirst: async args => { findArgs = args; return { id: 'customer-1' }; },
      update: async args => { updateArgs = args; return { id: 'customer-1', ...args.data }; },
    },
    auditLog: { create: async args => { auditArgs = args; } },
  };
  const app = await startApp({ db });
  t.after(() => app.server.close());
  const response = await app.request('/customers/customer-1', {
    method: 'PATCH', body: JSON.stringify({ phone: '999111222', district: 'Breña' }),
  });
  assert.equal(response.status, 200);
  assert.equal(findArgs.where.tenantId, 'tenant-a');
  assert.deepEqual(updateArgs.data, { phone: '999111222', district: 'Breña' });
  assert.equal(auditArgs.data.action, 'UPDATE');
});

test('does not update a customer belonging to another tenant', async t => {
  let updated = false, findArgs;
  const db = {
    customer: {
      findFirst: async args => { findArgs = args; return null; },
      update: async () => { updated = true; },
    },
  };
  const app = await startApp({ db });
  t.after(() => app.server.close());
  const response = await app.request('/customers/foreign-id', {
    method: 'PATCH', body: JSON.stringify({ name: 'Intruso' }),
  });
  assert.equal(response.status, 404);
  assert.equal(findArgs.where.tenantId, 'tenant-a');
  assert.equal(updated, false);
});

test('rejects unknown fields and empty updates', async t => {
  let updated = false;
  const db = { customer: { findFirst: async () => ({ id: 'c1' }), update: async () => { updated = true; } } };
  const app = await startApp({ db });
  t.after(() => app.server.close());
  const unknown = await app.request('/customers/c1', { method: 'PATCH', body: JSON.stringify({ tenantId: 'tenant-b' }) });
  const empty = await app.request('/customers/c1', { method: 'PATCH', body: JSON.stringify({}) });
  assert.equal(unknown.status, 400);
  assert.equal(empty.status, 400);
  assert.equal(updated, false);
});

test('exports a default router for the API mount', () => {
  assert.equal(typeof customersRouter, 'function');
});
