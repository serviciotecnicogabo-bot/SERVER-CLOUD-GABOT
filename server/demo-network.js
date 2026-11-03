import { Router } from 'express';
import { z } from 'zod';
import { allowRoles } from './middleware/auth.js';
import { prisma } from './db.js';

// Laboratorio en memoria: nunca realiza llamadas a MikroTik, SmartOLT ni a la base de datos.
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
  record.subscriptionId = subscription.id;
  record.customerName = subscription.customer?.name || '';
  record.planName = subscription.plan?.name || '';
  state.events.unshift({ at: new Date().toISOString(), action: 'SUBSCRIPTION_PROVISIONED_SIMULATED', target: subscription.pppoeUsername });
  return { ...record };
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
router.post('/reset', (_req, res) => res.json({ simulated: true, hardwareChanged: false, state: resetDemoNetwork(state) }));

export default router;
