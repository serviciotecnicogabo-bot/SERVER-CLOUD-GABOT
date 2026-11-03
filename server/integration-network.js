import net from 'node:net';
import dns from 'node:dns/promises';

function inIpv4Range(address, network, mask) {
  const value = address.split('.').reduce((n, part) => (n * 256) + Number(part), 0) >>> 0;
  const base = network.split('.').reduce((n, part) => (n * 256) + Number(part), 0) >>> 0;
  const bits = mask === 0 ? 0 : (0xffffffff << (32 - mask)) >>> 0;
  return (value & bits) === (base & bits);
}

export function isNonPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const blocked = [
      ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10],
      ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
      ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24],
      ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
      ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
    ];
    return blocked.some(([network, mask]) => inIpv4Range(address, network, mask));
  }
  if (family === 6) {
    const value = address.toLowerCase();
    // IPv4-mapped IPv6 addresses are rejected to avoid alternate encodings.
    if (value.startsWith('::ffff:')) return true;
    // Only globally routable unicast space (2000::/3) is accepted.
    return !/^[23][0-9a-f]{3}:/i.test(value) ||
      value.startsWith('2001:db8:') ||
      value.startsWith('2001:10:');
  }
  return true;
}

export async function resolvePinnedAddress(hostname, lookup = dns.lookup) {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isNonPublicAddress(address))) {
    const error = new Error('El destino DNS resuelve a una dirección no pública.');
    error.statusCode = 400;
    throw error;
  }
  return addresses[0];
}
