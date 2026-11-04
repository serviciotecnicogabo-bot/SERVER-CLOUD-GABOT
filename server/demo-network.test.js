import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoNetworkState, authorizeDemoOnu, createDemoPppoe, updateDemoPppoeStatus, deleteDemoPppoe, provisionDemoSubscription, resetDemoNetwork, simulatePaymentAccess } from './demo-network.js';

test('starts with fictional OLT and pending ONUs only', () => {
  const state = createDemoNetworkState();
  assert.equal(state.olts.length, 1);
  assert.equal(state.onus.length, 3);
  assert.ok(state.onus.every(onu => onu.status === 'PENDING'));
  assert.equal(state.pppoe.length, 0);
});

test('requires simulated ONU authorization before PPPoE creation', () => {
  const state = createDemoNetworkState();
  assert.throws(() => createDemoPppoe(state, { onuId: 'ONU-DEMO-001', username: '23huallaga789-150' }), /Autoriza primero/);
});

test('authorizes a fictional ONU and creates the correct simulated plan', () => {
  const state = createDemoNetworkState();
  const onu = authorizeDemoOnu(state, 'ONU-DEMO-001');
  assert.equal(onu.status, 'AUTHORIZED');
  const pppoe = createDemoPppoe(state, { onuId: onu.id, username: '23huallaga789-150' });
  assert.equal(pppoe.planCode, '150');
  assert.equal(pppoe.speedMbps, 450);
  assert.equal(pppoe.pricePen, 95);
  assert.equal(pppoe.status, 'SIMULATED');
});

test('rejects duplicate PPPoE usernames and unknown plan codes', () => {
  const state = createDemoNetworkState();
  authorizeDemoOnu(state, 'ONU-DEMO-001');
  authorizeDemoOnu(state, 'ONU-DEMO-002');
  createDemoPppoe(state, { onuId: 'ONU-DEMO-001', username: '23huallaga789-150' });
  assert.throws(() => createDemoPppoe(state, { onuId: 'ONU-DEMO-002', username: '23huallaga789-150' }), /ya existe/);
  assert.throws(() => createDemoPppoe(state, { onuId: 'ONU-DEMO-002', username: '23huallaga789-999' }), /Código de plan/);
});

test('reset clears simulated authorizations and PPPoE without device access', () => {
  const state = createDemoNetworkState();
  authorizeDemoOnu(state, 'ONU-DEMO-001');
  createDemoPppoe(state, { onuId: 'ONU-DEMO-001', username: '23huallaga789-150' });
  resetDemoNetwork(state);
  assert.equal(state.pppoe.length, 0);
  assert.ok(state.onus.every(onu => onu.status === 'PENDING'));
  assert.equal(state.events[0].action, 'LAB_RESET_SIMULATED');
});

test('simulates MikroTik suspend, reactivate and delete without real RouterOS access', () => {
  const state = createDemoNetworkState();
  authorizeDemoOnu(state, 'ONU-DEMO-001');
  const created = createDemoPppoe(state, { onuId: 'ONU-DEMO-001', username: '23huallaga789-150' });
  assert.equal(created.routerStatus, 'ACTIVE');
  assert.equal(updateDemoPppoeStatus(state, created.username, 'suspend').routerStatus, 'SUSPENDED');
  assert.equal(updateDemoPppoeStatus(state, created.username, 'reactivate').routerStatus, 'ACTIVE');
  assert.equal(deleteDemoPppoe(state, created.username).username, created.username);
  assert.equal(state.pppoe.length, 0);
  assert.deepEqual(state.events.slice(0, 3).map(event => event.action), [
    'PPPOE_DELETED_SIMULATED',
    'PPPOE_REACTIVATED_SIMULATED',
    'PPPOE_SUSPENDED_SIMULATED',
  ]);
});

test('rejects RouterOS actions for unknown simulated PPPoE users', () => {
  const state = createDemoNetworkState();
  assert.throws(() => updateDemoPppoeStatus(state, 'missing-user', 'suspend'), /no encontrado/);
  assert.throws(() => deleteDemoPppoe(state, 'missing-user'), /no encontrado/);
});


test('provisions a saved FTTH subscription only in the isolated simulator', () => {
  const state = createDemoNetworkState();
  authorizeDemoOnu(state, 'ONU-DEMO-001');
  const subscription = {
    id: 'subscription-demo-1',
    pppoeUsername: '23huallaga789-150',
    customer: { name: 'gabot' },
    plan: { name: 'PLAN BASICO', speedDown: 450, price: 95 },
  };
  const pppoe = provisionDemoSubscription(state, subscription, 'ONU-DEMO-001');
  assert.equal(pppoe.username, '23huallaga789-150');
  assert.equal(pppoe.subscriptionId, 'subscription-demo-1');
  assert.equal(pppoe.customerName, 'gabot');
  assert.equal(pppoe.speedMbps, 450);
  assert.equal(pppoe.pricePen, 95);
  assert.equal(pppoe.status, 'SIMULATED');
  assert.equal(state.events[0].action, 'SUBSCRIPTION_PROVISIONED_SIMULATED');
});

test('rejects saved subscriptions without PPPoE identity or with a mismatched plan code', () => {
  const state = createDemoNetworkState();
  authorizeDemoOnu(state, 'ONU-DEMO-001');
  assert.throws(() => provisionDemoSubscription(state, { id: 's1', plan: { speedDown: 450 } }, 'ONU-DEMO-001'), /no tiene un usuario PPPoE/);
  assert.throws(() => provisionDemoSubscription(state, {
    id: 's2', pppoeUsername: '23huallaga789-100', plan: { speedDown: 450 },
  }, 'ONU-DEMO-001'), /no coincide con la velocidad/);
});


test('virtual MikroTik redirects suspended subscribers to non-dismissible payment portal', () => {
  const state = createDemoNetworkState();
  authorizeDemoOnu(state, 'ONU-DEMO-001');
  createDemoPppoe(state, { onuId: 'ONU-DEMO-001', username: '23huallaga789-150' });
  updateDemoPppoeStatus(state, '23huallaga789-150', 'suspend');
  const result = simulatePaymentAccess(state, { username: '23huallaga789-150', balance: 95 });
  assert.equal(result.decision, 'REDIRECT_TO_PAYMENT');
  assert.equal(result.path, '/portal/regularizar');
  assert.equal(result.dismissible, false);
  assert.equal(result.hardwareChanged, false);
});

test('virtual MikroTik shows a dismissible reminder for an invoice due within configured days', () => {
  const state = createDemoNetworkState();
  authorizeDemoOnu(state, 'ONU-DEMO-001');
  createDemoPppoe(state, { onuId: 'ONU-DEMO-001', username: '23huallaga789-150' });
  const now = new Date('2026-11-03T12:00:00.000Z');
  const result = simulatePaymentAccess(state, {
    username: '23huallaga789-150', balance: 95, dueDate: '2026-11-05T12:00:00.000Z', reminderDays: 3,
  }, now);
  assert.equal(result.decision, 'SHOW_DISMISSIBLE_REMINDER');
  assert.equal(result.path, '/portal/aviso-pago');
  assert.equal(result.dismissible, true);
});

test('virtual MikroTik allows paid or not-yet-due subscribers without redirect', () => {
  const state = createDemoNetworkState();
  authorizeDemoOnu(state, 'ONU-DEMO-001');
  createDemoPppoe(state, { onuId: 'ONU-DEMO-001', username: '23huallaga789-150' });
  const now = new Date('2026-11-03T12:00:00.000Z');
  const paid = simulatePaymentAccess(state, { username: '23huallaga789-150', balance: 0 }, now);
  const notDue = simulatePaymentAccess(state, {
    username: '23huallaga789-150', balance: 95, dueDate: '2026-11-20T12:00:00.000Z', reminderDays: 3,
  }, now);
  assert.equal(paid.decision, 'ALLOW');
  assert.equal(notDue.decision, 'ALLOW');
});

test('virtual MikroTik sends overdue invoices to the payment portal and validates input', () => {
  const state = createDemoNetworkState();
  authorizeDemoOnu(state, 'ONU-DEMO-001');
  createDemoPppoe(state, { onuId: 'ONU-DEMO-001', username: '23huallaga789-150' });
  const now = new Date('2026-11-03T12:00:00.000Z');
  const overdue = simulatePaymentAccess(state, {
    username: '23huallaga789-150', balance: 95, dueDate: '2026-11-02T12:00:00.000Z',
  }, now);
  assert.equal(overdue.decision, 'REDIRECT_TO_PAYMENT');
  assert.equal(overdue.reason, 'INVOICE_OVERDUE');
  assert.throws(() => simulatePaymentAccess(state, {
    username: '23huallaga789-150', balance: -1,
  }, now), /saldo pendiente/);
});
