import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import router, { createPaymentNoticesRouter } from './payment-notices.js';

async function startApp({ db, role = 'OWNER' }) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => { req.user = { id: 'owner-1', tenantId: 'tenant-a', role }; next(); });
  app.use('/notices', createPaymentNoticesRouter({ db }));
  app.use((error, _req, res, _next) => res.status(error.name === 'ZodError' ? 400 : 500).json({ error: error.message }));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const address = server.address();
  return { server, request: (path, options = {}) => fetch(`http://127.0.0.1:${address.port}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } }) };
}

test('returns defaults when the tenant has not configured a notice', async t => {
  const app = await startApp({ db: { paymentNoticeConfig: { findUnique: async args => { assert.deepEqual(args.where, { tenantId: 'tenant-a' }); return null; } } } });
  t.after(() => app.server.close());
  const response = await app.request('/notices/config');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).config.daysBeforeDue, 3);
});

test('saves tenant-scoped payment notice branding and reconnection fee', async t => {
  let saved, audit;
  const db = {
    paymentNoticeConfig: { upsert: async args => { saved = args; return { id: 'cfg-1', ...args.create }; } },
    auditLog: { create: async args => { audit = args; } },
  };
  const app = await startApp({ db });
  t.after(() => app.server.close());
  const payload = { enabled: true, businessName: 'Fibra GABOT', logoDataUrl: null, qrDataUrl: null, message: 'Paga antes de la fecha de vencimiento.', paymentInstructions: 'Escanea el QR para pagar.', contactPhone: '999111222', daysBeforeDue: 4, reconnectionFee: 15, currency: 'PEN' };
  const response = await app.request('/notices/config', { method: 'PUT', body: JSON.stringify(payload) });
  assert.equal(response.status, 200);
  assert.equal(saved.where.tenantId, 'tenant-a');
  assert.equal(saved.create.reconnectionFee, 15);
  assert.equal(audit.data.action, 'UPDATE_PAYMENT_NOTICE_CONFIG');
});

test('rejects unsafe image formats and unknown fields', async t => {
  let saved = false;
  const db = { paymentNoticeConfig: { upsert: async () => { saved = true; } } };
  const app = await startApp({ db });
  t.after(() => app.server.close());
  const response = await app.request('/notices/config', { method: 'PUT', body: JSON.stringify({ enabled: true, businessName: 'Test', logoDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=', qrDataUrl: null, message: 'Mensaje de pago válido.', paymentInstructions: null, contactPhone: null, daysBeforeDue: 3, reconnectionFee: 0, currency: 'PEN', extra: true }) });
  assert.equal(response.status, 400);
  assert.equal(saved, false);
});

test('restricts configuration changes to billing and administrators', async t => {
  let saved = false;
  const app = await startApp({ role: 'TECHNICIAN', db: { paymentNoticeConfig: { upsert: async () => { saved = true; } } } });
  t.after(() => app.server.close());
  const response = await app.request('/notices/config', { method: 'PUT', body: '{}' });
  assert.equal(response.status, 403);
  assert.equal(saved, false);
});

test('denies customer accounts that are not linked to a customer record', async t => {
  const app = await startApp({ role: 'CUSTOMER', db: { customer: { findFirst: async () => assert.fail('must not query without a linked customer') } } });
  t.after(() => app.server.close());
  const response = await app.request('/notices/portal/me');
  assert.equal(response.status, 403);
});

test('returns only the authenticated customer invoices, plan, suspension and tenant payment branding', async t => {
  let customerQuery;
  const db = {
    customer: { findFirst: async args => {
      customerQuery = args;
      return {
        id: 'customer-7', tenantId: 'tenant-a', code: 'CLI-7', name: 'Cliente Demo', status: 'SUSPENDED',
        subscriptions: [{ status: 'SUSPENDED', plan: { name: 'Fibra 150', speedDown: 450, speedUp: 100, price: '95.00', currency: 'PEN' } }],
        invoices: [{ id: 'inv-1', number: 'F001', dueDate: new Date('2026-11-01'), total: '95.00', balance: '95.00', currency: 'PEN', status: 'OVERDUE' }],
      };
    } },
    paymentNoticeConfig: { findUnique: async args => { assert.deepEqual(args.where, { tenantId: 'tenant-a' }); return { enabled: true, businessName: 'Fibra Demo', reconnectionFee: '15.00', qrDataUrl: 'data:image/png;base64,AAAA' }; } },
  };
  const portalApp = await startPortalApp({ db });
  t.after(() => portalApp.server.close());
  const response = await portalApp.request('/notices/portal/me');
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(customerQuery.where.id, 'customer-7');
  assert.equal(customerQuery.where.tenantId, 'tenant-a');
  assert.equal(payload.service.plan.name, 'Fibra 150');
  assert.equal(payload.outstandingBalance, 95);
  assert.equal(payload.suspended, true);
  assert.equal(payload.notice.businessName, 'Fibra Demo');
});

async function startPortalApp({ db }) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => { req.user = { id: 'portal-user', tenantId: 'tenant-a', role: 'CUSTOMER', customerId: 'customer-7' }; next(); });
  app.use('/notices', createPaymentNoticesRouter({ db }));
  app.use((error, _req, res, _next) => res.status(error.name === 'ZodError' ? 400 : 500).json({ error: error.message }));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const address = server.address();
  return { server, request: (path, options = {}) => fetch(`http://127.0.0.1:${address.port}${path}`, options) };
}

test('exports a default router for mounting', () => assert.equal(typeof router, 'function'));

test('returns a reminder only for unpaid invoices due within the tenant configured window', async t => {
  const dueDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const db = {
    customer: { findFirst: async () => ({
      id: 'customer-7', tenantId: 'tenant-a', code: 'CLI-7', name: 'Cliente Demo', status: 'ACTIVE',
      subscriptions: [{ status: 'ACTIVE', plan: { name: 'Fibra 150', speedDown: 450, speedUp: 100, price: '95.00', currency: 'PEN' } }],
      invoices: [{ id: 'inv-2', number: 'F002', dueDate, total: '95.00', balance: '95.00', currency: 'PEN', status: 'ISSUED' }],
    }) },
    paymentNoticeConfig: { findUnique: async () => ({ enabled: true, daysBeforeDue: 3, businessName: 'Fibra Demo' }) },
  };
  const app = await startPortalApp({ db });
  t.after(() => app.server.close());
  const response = await app.request('/notices/portal/me');
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.paymentReminder.daysBeforeDue, 3);
  assert.equal(payload.paymentReminder.invoices[0].number, 'F002');
  assert.equal(payload.paymentReminder.amount, 95);
});
