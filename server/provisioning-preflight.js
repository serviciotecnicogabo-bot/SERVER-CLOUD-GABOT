export function buildProvisioningPreflight(subscription, integrationConfig) {
  const speedCodes = { 300: '100', 450: '150', 650: '200' };
  const username = subscription?.pppoeUsername || '';
  const expectedCode = speedCodes[subscription?.plan?.speedDown];
  const actualCode = username.split('-').at(-1);
  const checks = [
    { key: 'pppoeUsername', label: 'Usuario PPPoE', ok: /^\d{2}[a-z]+\d+-\d{3}$/.test(username), detail: username ? username : 'Falta guardar el usuario PPPoE.' },
    { key: 'plan', label: 'Plan y código', ok: Boolean(expectedCode && actualCode === expectedCode), detail: expectedCode ? (actualCode === expectedCode ? `Código ${expectedCode} coincide con ${subscription.plan.speedDown} Mbps.` : `El plan requiere código ${expectedCode}; el usuario contiene ${actualCode || 'ninguno'}.`) : 'Velocidad de plan no contemplada en el mapeo FTTH.' },
    { key: 'vlanId', label: 'VLAN real', ok: Number.isInteger(subscription?.vlanId) && subscription.vlanId >= 1 && subscription.vlanId <= 4094, detail: subscription?.vlanId ? `VLAN ${subscription.vlanId}` : 'Falta asignar VLAN real de la zona.' },
    { key: 'onuSerial', label: 'Serie ONU / ONT', ok: Boolean(subscription?.onuSerial?.trim()), detail: subscription?.onuSerial || 'Falta registrar la serie de la ONU.' },
    { key: 'oltName', label: 'OLT', ok: Boolean(subscription?.oltName?.trim()), detail: subscription?.oltName || 'Falta seleccionar la OLT.' },
    { key: 'ponPort', label: 'Puerto PON', ok: Boolean(subscription?.ponPort?.trim()), detail: subscription?.ponPort || 'Falta registrar el puerto PON.' },
    { key: 'mikrotik', label: 'MikroTik configurado', ok: Boolean(integrationConfig?.mikrotikBaseUrl && integrationConfig?.mikrotikUsername && integrationConfig?.mikrotikPasswordEnc), detail: integrationConfig?.mikrotikBaseUrl ? 'Configuración guardada; conexión aún no validada.' : 'Integración MikroTik pendiente.' },
    { key: 'smartolt', label: 'SmartOLT configurado', ok: Boolean(integrationConfig?.smartoltBaseUrl && integrationConfig?.smartoltApiTokenEnc), detail: integrationConfig?.smartoltBaseUrl ? 'Configuración guardada; conexión aún no validada.' : 'Integración SmartOLT pendiente.' },
  ];
  const ready = checks.every(item => item.ok);
  return {
    ready,
    status: ready ? 'READY_FOR_MANUAL_REVIEW' : 'BLOCKED_MISSING_DATA',
    checks,
    summary: ready ? 'Datos completos para revisión manual. Aún no se ha autorizado ninguna operación real.' : `${checks.filter(item => !item.ok).length} requisito(s) pendiente(s) antes de la revisión manual.`,
    realActionsEnabled: false,
    hardwareChanged: false,
    externalRequests: 0,
  };
}
