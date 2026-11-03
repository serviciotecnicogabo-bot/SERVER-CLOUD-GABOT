import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoNetworkState, authorizeDemoOnu, createDemoPppoe, resetDemoNetwork } from './demo-network.js';

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
