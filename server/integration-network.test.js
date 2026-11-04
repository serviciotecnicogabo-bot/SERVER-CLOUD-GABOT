import test from 'node:test';
import assert from 'node:assert/strict';
import { isNonPublicAddress, resolvePinnedAddress } from './integration-network.js';

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

test('rejects IPv6 special-purpose ranges inside global unicast space', () => {
  for (const ip of ['2001:20::1', '2001:100::1', '2001:1ff::1', '2002:c000:0201::1', '3fff::1']) {
    assert.equal(isNonPublicAddress(ip), true, ip);
  }
});

test('allows representative global IPv6 unicast addresses', () => {
  for (const ip of ['2606:4700:4700::1111', '2001:4860:4860::8888', '3001::1']) {
    assert.equal(isNonPublicAddress(ip), false, ip);
  }
});

test('pins the first address only after all DNS answers pass validation', async () => {
  const pinned = await resolvePinnedAddress('router.example', async () => [
    { address: '1.1.1.1', family: 4 },
    { address: '8.8.8.8', family: 4 },
  ]);
  assert.deepEqual(pinned, { address: '1.1.1.1', family: 4 });
});

test('rejects DNS answers containing a private address (rebinding/mixed answer)', async () => {
  await assert.rejects(
    resolvePinnedAddress('router.example', async () => [
      { address: '1.1.1.1', family: 4 },
      { address: '192.168.1.10', family: 4 },
    ]),
    error => error.statusCode === 400,
  );
});

test('rejects an empty DNS answer', async () => {
  await assert.rejects(
    resolvePinnedAddress('missing.example', async () => []),
    error => error.statusCode === 400,
  );
});
