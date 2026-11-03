import test from 'node:test';
import assert from 'node:assert/strict';
import { isNonPublicAddress } from './integration-network.js';

test('rejects private, loopback, link-local and reserved IPv4 ranges', () => {
  for (const ip of ['10.0.0.1', '172.16.0.1', '192.168.1.1', '127.0.0.1', '169.254.1.1', '100.64.0.1', '192.0.2.1', '198.18.0.1', '224.0.0.1', '240.0.0.1']) {
    assert.equal(isNonPublicAddress(ip), true, ip);
  }
});

test('allows representative public IPv4 addresses', () => {
  for (const ip of ['1.1.1.1', '8.8.8.8', '203.0.114.1']) {
    assert.equal(isNonPublicAddress(ip), false, ip);
  }
});

test('rejects non-global and mapped IPv6 ranges', () => {
  for (const ip of ['::', '::1', 'fc00::1', 'fe80::1', 'ff02::1', '2001:db8::1', '::ffff:127.0.0.1']) {
    assert.equal(isNonPublicAddress(ip), true, ip);
  }
});

test('allows representative global IPv6 unicast addresses', () => {
  for (const ip of ['2606:4700:4700::1111', '2001:4860:4860::8888', '3001::1']) {
    assert.equal(isNonPublicAddress(ip), false, ip);
  }
});
