const assignments = new Map();
const ranges = [
  { prefix: '192.0.2.', start: 10, end: 250 },
  { prefix: '198.51.100.', start: 10, end: 250 },
  { prefix: '203.0.113.', start: 10, end: 250 },
];

function key(tenantId, subscriptionId) {
  return tenantId + ':' + subscriptionId;
}

function isValidDocumentationIp(ip) {
  return ranges.some(({ prefix, start, end }) => {
    if (!ip.startsWith(prefix)) return false;
    const last = Number(ip.slice(prefix.length));
    return Number.isInteger(last) && last >= start && last <= end;
  });
}

function nextIp(tenantId) {
  const used = new Set([...assignments.values()]
    .filter(item => item.tenantId === tenantId)
    .map(item => item.ip));
  for (const range of ranges) {
    for (let last = range.start; last <= range.end; last += 1) {
      const candidate = range.prefix + last;
      if (!used.has(candidate)) return candidate;
    }
  }
  throw new Error('No quedan IP de simulación disponibles.');
}

export function getDemoOnuIp(tenantId, subscriptionId) {
  return assignments.get(key(tenantId, subscriptionId)) || null;
}

export function assignDemoOnuIp(tenantId, subscriptionId, onuSerial = null) {
  const id = key(tenantId, subscriptionId);
  const current = assignments.get(id);
  if (current) return current;
  const record = {
    tenantId,
    subscriptionId,
    ip: nextIp(tenantId),
    source: 'AUTO_SIMULATED',
    onuSerial: onuSerial || null,
    simulated: true,
    updatedAt: new Date().toISOString(),
  };
  assignments.set(id, record);
  return record;
}

export function updateDemoOnuIp(tenantId, subscriptionId, ip, onuSerial = null) {
  if (!isValidDocumentationIp(ip)) {
    throw new Error('Usa una IP reservada para documentación: 192.0.2.x, 198.51.100.x o 203.0.113.x.');
  }
  const duplicate = [...assignments.values()].some(item =>
    item.tenantId === tenantId && item.subscriptionId !== subscriptionId && item.ip === ip);
  if (duplicate) throw new Error('Esa IP de simulación ya está asignada a otro servicio de esta empresa.');
  const record = {
    tenantId,
    subscriptionId,
    ip,
    source: 'MANUAL_SIMULATED',
    onuSerial: onuSerial || null,
    simulated: true,
    updatedAt: new Date().toISOString(),
  };
  assignments.set(key(tenantId, subscriptionId), record);
  return record;
}
