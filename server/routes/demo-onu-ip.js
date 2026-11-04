import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { allowRoles } from '../middleware/auth.js';
import { assignDemoOnuIp, getDemoOnuIp, updateDemoOnuIp } from '../demo-onu-ip.js';

const router = Router();

async function findSubscription(req, res) {
  const subscription = await prisma.subscription.findFirst({
    where: {
      id: req.params.subscriptionId,
      customer: { is: { tenantId: req.user.tenantId } },
      plan: { is: { tenantId: req.user.tenantId } },
    },
    select: { id: true, onuSerial: true },
  });
  if (!subscription) {
    res.status(404).json({ error: 'Servicio no encontrado.' });
    return null;
  }
  return subscription;
}

router.get('/:subscriptionId', allowRoles('OWNER', 'ADMIN', 'TECHNICIAN', 'SUPPORT'), async (req, res, next) => {
  try {
    const subscription = await findSubscription(req, res);
    if (!subscription) return;
    res.json({ assignment: getDemoOnuIp(req.user.tenantId, subscription.id), simulated: true });
  } catch (error) { next(error); }
});

router.post('/:subscriptionId/assign', allowRoles('OWNER', 'ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const subscription = await findSubscription(req, res);
    if (!subscription) return;
    const assignment = assignDemoOnuIp(req.user.tenantId, subscription.id, subscription.onuSerial);
    await prisma.auditLog.create({ data: {
      tenantId: req.user.tenantId, userId: req.user.id, action: 'DEMO_ONU_IP_ASSIGN',
      entity: 'Subscription', entityId: subscription.id, metadata: { ip: assignment.ip, source: assignment.source, simulated: true },
    } });
    res.json({ assignment, simulated: true });
  } catch (error) { next(error); }
});

router.patch('/:subscriptionId', allowRoles('OWNER', 'ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const input = z.object({ ip: z.string().trim().max(15) }).strict().parse(req.body);
    const subscription = await findSubscription(req, res);
    if (!subscription) return;
    let assignment;
    try { assignment = updateDemoOnuIp(req.user.tenantId, subscription.id, input.ip, subscription.onuSerial); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    await prisma.auditLog.create({ data: {
      tenantId: req.user.tenantId, userId: req.user.id, action: 'DEMO_ONU_IP_UPDATE',
      entity: 'Subscription', entityId: subscription.id, metadata: { ip: assignment.ip, source: assignment.source, simulated: true },
    } });
    res.json({ assignment, simulated: true });
  } catch (error) { next(error); }
});

export default router;
