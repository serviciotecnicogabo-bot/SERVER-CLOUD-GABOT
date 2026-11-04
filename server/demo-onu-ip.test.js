import test from 'node:test';
import assert from 'node:assert/strict';
import { assignDemoOnuIp, getDemoOnuIp, updateDemoOnuIp } from './demo-onu-ip.js';

test('assigns a documentation-only IP and keeps it stable for the service', () => {
  const first = assignDemoOnuIp('tenant-a', 'service-a', 'DEMO-ONU-001');
  const second = assignDemoOnuIp('tenant-a', 'service-a', 'DEMO-ONU-001');
  assert.equal(first.ip, second.ip);
  assert.equal(first.source, 'AUTO_SIMULATED');
  assert.equal(first.simulated, true);
  assert.match(first.ip, /^(192\.0\.2|198\.51\.100|203\.0\.113)\./);
});

test('manual IP changes reject duplicates within the same tenant', () => {
  updateDemoOnuIp('tenant-b', 'service-1', '192.0.2.20');
  assert.throws(() => updateDemoOnuIp('tenant-b', 'service-2', '192.0.2.20'), /ya está asignada/);
});

test('manual IP changes reject ordinary real-network addresses', () => {
  assert.throws(() => updateDemoOnuIp('tenant-c', 'service-1', '192.168.1.20'), /reservada para documentación/);
});

test('IP uniqueness is isolated between tenants', () => {
  updateDemoOnuIp('tenant-d', 'service-1', '198.51.100.40');
  assert.equal(updateDemoOnuIp('tenant-e', 'service-2', '198.51.100.40').ip, '198.51.100.40');
});

test('returns null until a demo address is assigned', () => {
  assert.equal(getDemoOnuIp('tenant-f', 'service-1'), null);
});
