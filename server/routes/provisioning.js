import { Router } from 'express';
import { prisma } from '../db.js';
import { allowRoles } from '../middleware/auth.js';
import { buildProvisioningPreflight } from '../provisioning-preflight.js';

const router = Router();
router.get('/preflight/:subscriptionId', allowRoles('OWNER', 'ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const subscription = await prisma.subscription.findFirst({
      where: {
        id: req.params.subscriptionId,
        customer: { is: { tenantId: req.user.tenantId } },
        plan: { is: { tenantId: req.user.tenantId } },
      },
      include: {
        customer: { select: { name: true } },
        plan: { select: { name: true, speedDown: true, speedUp: true } },
      },
    });
    if (!subscription) return res.status(404).json({ error: 'Servicio no encontrado.' });
    const integrationConfig = await prisma.integrationConfig.findUnique({ where: { tenantId: req.user.tenantId } });
    const result = buildProvisioningPreflight(subscription, integrationConfig);
    res.json({
      subscription: {
        id: subscription.id,
        customerName: subscription.customer?.name || '',
        pppoeUsername: subscription.pppoeUsername || '',
        planName: subscription.plan?.name || '',
        speedDown: subscription.plan?.speedDown || null,
      },
      ...result,
    });
  } catch (error) { next(error); }
});

export default router;
