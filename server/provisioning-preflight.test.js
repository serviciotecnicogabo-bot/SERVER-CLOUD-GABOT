import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProvisioningPreflight } from './provisioning-preflight.js';

const completeSubscription = {
  pppoeUsername: '23huallaga789-150',
  vlanId: 120,
  onuSerial: 'HWTC12345678',
  oltName: 'OLT-CENTRO',
  ponPort: '0/1/2',
  plan: { speedDown: 450 },
};
const completeIntegrations = {
  mikrotikBaseUrl: 'https://router.example.net',
  mikrotikUsername: 'gabot-api',
  mikrotikPasswordEnc: 'encrypted',
  smartoltBaseUrl: 'https://operator.smartolt.example',
  smartoltApiTokenEnc: 'encrypted',
};

test('preflight reports ready only when all network identity and integration fields exist', () => {
  const result = buildProvisioningPreflight(completeSubscription, completeIntegrations);
  assert.equal(result.ready, true);
  assert.equal(result.status, 'READY_FOR_MANUAL_REVIEW');
  assert.equal(result.checks.length, 8);
  assert.equal(result.realActionsEnabled, false);
  assert.equal(result.hardwareChanged, false);
  assert.equal(result.externalRequests, 0);
});

test('preflight blocks missing VLAN, ONU, OLT and PON data without making external requests', () => {
  const result = buildProvisioningPreflight({ ...completeSubscription, vlanId: null, onuSerial: null, oltName: null, ponPort: null }, completeIntegrations);
  assert.equal(result.ready, false);
  assert.equal(result.status, 'BLOCKED_MISSING_DATA');
  assert.deepEqual(result.checks.filter(item => !item.ok).map(item => item.key), ['vlanId', 'onuSerial', 'oltName', 'ponPort']);
  assert.equal(result.externalRequests, 0);
});

test('preflight rejects a PPPoE plan suffix that does not match plan speed', () => {
  const result = buildProvisioningPreflight({ ...completeSubscription, pppoeUsername: '23huallaga789-100' }, completeIntegrations);
  assert.equal(result.ready, false);
  assert.equal(result.checks.find(item => item.key === 'plan').ok, false);
});

test('preflight never enables real actions even when all checks pass', () => {
  const result = buildProvisioningPreflight(completeSubscription, completeIntegrations);
  assert.equal(result.realActionsEnabled, false);
  assert.equal(result.hardwareChanged, false);
  assert.equal(result.externalRequests, 0);
});
