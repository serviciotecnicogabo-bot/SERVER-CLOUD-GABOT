import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { allowRoles } from './middleware/auth.js';
import { prisma } from './db.js';

// Laboratorio aislado: solo lee la suscripción seleccionada; la simulación queda en memoria y nunca llama a MikroTik o SmartOLT.
export function createDemoNetworkState() {
  return {
    olts: [{ id: 'OLT-DEMO-01', name: 'OLT Huawei de laboratorio', status: 'SIMULATED' }],
    onus: [
      { id: 'ONU-DEMO-001', serial: 'HWTC-DEMO-001', pon: '0/1/1', oltId: 'OLT-DEMO-01', status: 'PENDING' },
      { id: 'ONU-DEMO-002', serial: 'HWTC-DEMO-002', pon: '0/1/1', oltId: 'OLT-DEMO-01', status: 'PENDING' },
      { id: 'ONU-DEMO-003', serial: 'HWTC-DEMO-003', pon: '0/1/2', oltId: 'OLT-DEMO-01', status: 'PENDING' },
    ],
    pppoe: [],
    mikrotik: { id: 'MIKROTIK-DEMO-01', name: 'RouterOS virtual de laboratorio', status: 'SIMULATED' },
    events: [],
  };
}

export function authorizeDemoOnu(state, onuId) {
  const onu = state.onus.find(item => item.id === onuId);
  if (!onu) throw Object.assign(new Error('ONU de laboratorio no encontrada.'), { statusCode: 404 });
  if (onu.status === 'AUTHORIZED') throw Object.assign(new Error('La ONU ya está autorizada en la simulación.'), { statusCode: 409 });
  onu.status = 'AUTHORIZED';
  state.events.unshift({ at: new Date().toISOString(), action: 'ONU_AUTHORIZED_SIMULATED', target: onu.id });
  return { ...onu };
}

export function createDemoPppoe(state, input) {
  const onu = state.onus.find(item => item.id === input.onuId);
  if (!onu || onu.status !== 'AUTHORIZED') {
    throw Object.assign(new Error('Autoriza primero una ONU del laboratorio.'), { statusCode: 409 });
  }
  if (!/^\d{2}[a-z]+\d+-\d{3}$/.test(input.username)) {
    throw Object.assign(new Error('Usuario PPPoE inválido. Ejemplo: 23huallaga789-150.'), { statusCode: 400 });
  }
  if (state.pppoe.some(item => item.username === input.username)) {
    throw Object.assign(new Error('Ese usuario PPPoE ya existe en la simulación.'), { statusCode: 409 });
  }
  const plans = { '100': { speedMbps: 300, pricePen: 75 }, '150': { speedMbps: 450, pricePen: 95 }, '200': { speedMbps: 650, pricePen: 125 } };
  const planCode = input.username.split('-').at(-1);
  if (!plans[planCode]) throw Object.assign(new Error('Código de plan no reconocido.'), { statusCode: 400 });
  const record = {
    id: `PPPOE-DEMO-${String(state.pppoe.length + 1).padStart(3, '0')}`,
    portalToken: randomUUID(),
    username: input.username,
    planCode,
    ...plans[planCode],
    onuId: onu.id,
    router: 'MIKROTIK-DEMO-01',
    status: 'SIMULATED',
    routerStatus: 'ACTIVE',
  };
  state.pppoe.push(record);
  state.events.unshift({ at: new Date().toISOString(), action: 'PPPOE_CREATED_SIMULATED', target: record.username });
  return { ...record };
}



export function provisionDemoSubscription(state, subscription, onuId) {
  if (!subscription?.id || !subscription.pppoeUsername) {
    throw Object.assign(new Error('El servicio no tiene un usuario PPPoE guardado.'), { statusCode: 400 });
  }
  const planBySpeed = { 300: '100', 450: '150', 650: '200' };
  const expectedCode = planBySpeed[subscription.plan?.speedDown];
  const actualCode = subscription.pppoeUsername.split('-').at(-1);
  if (!expectedCode || actualCode !== expectedCode) {
    throw Object.assign(new Error('El código PPPoE no coincide con la velocidad del plan guardado.'), { statusCode: 400 });
  }
  const record = createDemoPppoe(state, { onuId, username: subscription.pppoeUsername });
  const stored = state.pppoe.find(item => item.username === record.username);
  Object.assign(stored, {
    subscriptionId: subscription.id,
    customerName: subscription.customer?.name || '',
    planName: subscription.plan?.name || '',
  });
  state.events.unshift({ at: new Date().toISOString(), action: 'SUBSCRIPTION_PROVISIONED_SIMULATED', target: subscription.pppoeUsername });
  return { ...stored };
}

export function updateDemoPppoeStatus(state, username, action) {
  const record = state.pppoe.find(item => item.username === username);
  if (!record) throw Object.assign(new Error('Usuario PPPoE no encontrado en el laboratorio.'), { statusCode: 404 });
  if (action === 'suspend') {
    if (record.routerStatus === 'SUSPENDED') throw Object.assign(new Error('El usuario ya está suspendido.'), { statusCode: 409 });
    record.routerStatus = 'SUSPENDED';
  } else if (action === 'reactivate') {
    if (record.routerStatus === 'ACTIVE') throw Object.assign(new Error('El usuario ya está activo.'), { statusCode: 409 });
    record.routerStatus = 'ACTIVE';
  } else {
    throw Object.assign(new Error('Acción RouterOS simulada no válida.'), { statusCode: 400 });
  }
  state.events.unshift({ at: new Date().toISOString(), action: action === 'suspend' ? 'PPPOE_SUSPENDED_SIMULATED' : 'PPPOE_REACTIVATED_SIMULATED', target: username });
  return { ...record };
}

export function markDemoOverdue(state, username) {
  const record = state.pppoe.find(item => item.username === username);
  if (!record) throw Object.assign(new Error('Cuenta de laboratorio no encontrada.'), { statusCode: 404 });
  if (record.billingStatus === 'OVERDUE') throw Object.assign(new Error('La cuenta ya figura vencida.'), { statusCode: 409 });
  record.billingStatus = 'OVERDUE';
  record.routerStatus = 'SUSPENDED';
  record.suspendedAt = new Date().toISOString();
  state.events.unshift({ at: new Date().toISOString(), action: 'OVERDUE_AND_SUSPENDED_SIMULATED', target: username });
  return { ...record };
}

export function recordDemoPayment(state, username) {
  const record = state.pppoe.find(item => item.username === username);
  if (!record) throw Object.assign(new Error('Cuenta de laboratorio no encontrada.'), { statusCode: 404 });
  if (record.billingStatus !== 'OVERDUE' || record.routerStatus !== 'SUSPENDED') {
    throw Object.assign(new Error('La cuenta no tiene una suspensión por deuda pendiente.'), { statusCode: 409 });
  }
  record.billingStatus = 'PAID';
  record.routerStatus = 'ACTIVE';
  record.paidAt = new Date().toISOString();
  state.events.unshift({ at: new Date().toISOString(), action: 'PAYMENT_RECEIVED_AND_REACTIVATED_SIMULATED', target: username });
  return { ...record };
}

export function deleteDemoPppoe(state, username) {
  const index = state.pppoe.findIndex(item => item.username === username);
  if (index < 0) throw Object.assign(new Error('Usuario PPPoE no encontrado en el laboratorio.'), { statusCode: 404 });
  const [record] = state.pppoe.splice(index, 1);
  state.events.unshift({ at: new Date().toISOString(), action: 'PPPOE_DELETED_SIMULATED', target: username });
  return { ...record };
}

export function resetDemoNetwork(state) {
  const fresh = createDemoNetworkState();
  state.olts = fresh.olts;
  state.onus = fresh.onus;
  state.pppoe = [];
  state.mikrotik = fresh.mikrotik;
  state.events = [{ at: new Date().toISOString(), action: 'LAB_RESET_SIMULATED', target: 'ALL' }];
  return state;
}

const router = Router();
const state = createDemoNetworkState();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

// Portal público deliberadamente limitado a cuentas ficticias del laboratorio.
// No expone nombre legal, documento, correo, teléfono, dirección ni credenciales.
export const demoPortalRouter = Router();
demoPortalRouter.get('/:token', (req, res) => {
  const portalToken = String(req.params.token || '');
  const record = state.pppoe.find(item => item.portalToken === portalToken);
  if (!record) return res.status(404).type('html').send('<!doctype html><html lang="es"><meta charset="utf-8"><title>Cuenta no encontrada</title><body><h1>Cuenta de demostración no encontrada</h1></body></html>');
  const suspended = record.routerStatus === 'SUSPENDED' && record.billingStatus === 'OVERDUE';
  const title = suspended ? 'Servicio temporalmente suspendido' : 'Servicio activo';
  const heading = suspended ? 'Tu servicio está suspendido' : 'Tu conexión está activa';
  const detail = suspended
    ? 'Registramos una deuda pendiente en esta cuenta de prueba. Para continuar, comunícate con tu operador y solicita la confirmación del pago.'
    : 'Esta cuenta de demostración no presenta una suspensión por deuda.';
  res.set('Cache-Control', 'no-store');
  res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · GABOT CLOUD</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#0b1220;color:#edf3ff;font:16px system-ui,-apple-system,Segoe UI,sans-serif}.card{width:min(100%,520px);padding:32px;border:1px solid #293951;border-radius:20px;background:#121e30;box-shadow:0 20px 60px #0005}.brand{font-size:13px;letter-spacing:.14em;color:#91a6c3;font-weight:700}.mark{font-size:42px;margin:28px 0 12px}h1{font-size:28px;line-height:1.15;margin:0 0 12px}.detail{color:#b8c7dc;line-height:1.6}.data{margin-top:26px;padding:16px;border-radius:12px;background:#0b1525}.row{display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:1px solid #26364d}.row:last-child{border:0}.label{color:#91a6c3}.value{text-align:right;font-weight:650;overflow-wrap:anywhere}.notice{margin-top:22px;padding:13px;border-radius:10px;background:${suspended ? '#482b26' : '#173b32'};color:${suspended ? '#ffd6c9' : '#baf4d8'};font-size:14px}footer{margin-top:24px;color:#71839d;font-size:12px}
  </style></head><body><main class="card"><div class="brand">GABOT CLOUD · FTTH</div><div class="mark">${suspended ? '⚠️' : '✓'}</div><h1>${escapeHtml(heading)}</h1><p class="detail">${escapeHtml(detail)}</p><section class="data"><div class="row"><span class="label">Cuenta</span><span class="value">${escapeHtml(record.username)}</span></div><div class="row"><span class="label">Plan</span><span class="value">${escapeHtml(record.planName || `Plan ${record.planCode}`)}</span></div><div class="row"><span class="label">Velocidad</span><span class="value">${escapeHtml(record.speedMbps)} Mbps</span></div><div class="row"><span class="label">Estado</span><span class="value">${suspended ? 'Suspendido' : 'Activo'}</span></div></section><div class="notice">${suspended ? 'Esta es una simulación. No se ha bloqueado el acceso a Internet de ningún cliente real.' : 'Entorno de prueba: estado simulado.'}</div><footer>No mostramos DNI, contraseñas, correo ni otros datos personales en esta pantalla.</footer></main></body></html>`);
});
router.use(allowRoles('OWNER', 'ADMIN'));
router.get('/status', (_req, res) => res.json({ mode: 'DEMO_ONLY', hardwareConnected: false, persistence: 'MEMORY_ONLY', ...state }));
router.post('/onus/:id/authorize', (req, res) => {
  try { res.json({ simulated: true, onu: authorizeDemoOnu(state, req.params.id) }); }
  catch (error) { res.status(error.statusCode || 400).json({ error: error.message }); }
});

router.post('/subscriptions/:id/provision', async (req, res, next) => {
  try {
    const input = z.object({ onuId: z.string().min(1).max(80) }).strict().parse(req.body);
    const subscription = await prisma.subscription.findFirst({
      where: {
        id: req.params.id,
        customer: { is: { tenantId: req.user.tenantId } },
        plan: { is: { tenantId: req.user.tenantId } },
      },
      include: {
        customer: { select: { name: true } },
        plan: { select: { name: true, speedDown: true, price: true } },
      },
    });
    if (!subscription) return res.status(404).json({ error: 'Servicio no encontrado.' });
    const pppoe = provisionDemoSubscription(state, subscription, input.onuId);
    res.status(201).json({ simulated: true, hardwareChanged: false, persistence: 'MEMORY_ONLY', pppoe });
  } catch (error) {
    if (error.name === 'ZodError') return res.status(400).json({ error: 'Datos inválidos.' });
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'No se pudo simular la provisión.' });
  }
});

router.post('/pppoe', (req, res) => {
  try {
    const input = z.object({ onuId: z.string().min(1).max(80), username: z.string().trim().toLowerCase().max(80) }).parse(req.body);
    res.status(201).json({ simulated: true, pppoe: createDemoPppoe(state, input) });
  } catch (error) { res.status(error.statusCode || (error.name === 'ZodError' ? 400 : 400)).json({ error: error.name === 'ZodError' ? 'Datos inválidos.' : error.message }); }
});
router.post('/mikrotik/:username/:action', (req, res) => {
  try {
    const username = z.string().min(1).max(80).parse(req.params.username);
    const action = z.enum(['suspend', 'reactivate']).parse(req.params.action);
    res.json({ simulated: true, hardwareChanged: false, pppoe: updateDemoPppoeStatus(state, username, action) });
  } catch (error) { res.status(error.statusCode || 400).json({ error: error.message }); }
});
router.delete('/mikrotik/:username', (req, res) => {
  try {
    const username = z.string().min(1).max(80).parse(req.params.username);
    res.json({ simulated: true, hardwareChanged: false, pppoe: deleteDemoPppoe(state, username) });
  } catch (error) { res.status(error.statusCode || 400).json({ error: error.message }); }
});
router.post('/billing/:username/overdue', (req, res) => {
  try {
    const username = z.string().min(1).max(80).parse(req.params.username);
    res.json({ simulated: true, hardwareChanged: false, account: markDemoOverdue(state, username) });
  } catch (error) { res.status(error.statusCode || 400).json({ error: error.message }); }
});
router.post('/billing/:username/payment', (req, res) => {
  try {
    const username = z.string().min(1).max(80).parse(req.params.username);
    res.json({ simulated: true, hardwareChanged: false, account: recordDemoPayment(state, username) });
  } catch (error) { res.status(error.statusCode || 400).json({ error: error.message }); }
});
router.post('/reset', (_req, res) => res.json({ simulated: true, hardwareChanged: false, state: resetDemoNetwork(state) }));

export default router;
