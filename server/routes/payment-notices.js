import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { allowRoles } from '../middleware/auth.js';

const imageDataUrl = z.string().max(480_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/).nullable().optional();

export function createPaymentNoticesRouter({ db = prisma } = {}) {
  const router = Router();
  const canManage = allowRoles('OWNER', 'ADMIN', 'BILLING');
  const defaults = {
    enabled: true,
    businessName: null,
    logoDataUrl: null,
    qrDataUrl: null,
    message: 'Tu servicio está próximo a vencer. Realiza tu pago para evitar la suspensión.',
    paymentInstructions: null,
    contactPhone: null,
    daysBeforeDue: 3,
    reconnectionFee: '0.00',
    currency: 'PEN',
  };

  router.get('/config', async (req, res, next) => {
    try {
      const config = await db.paymentNoticeConfig.findUnique({ where: { tenantId: req.user.tenantId } });
      res.json({ config: config || defaults });
    } catch (error) { next(error); }
  });

  router.put('/config', canManage, async (req, res, next) => {
    try {
      const input = z.object({
        enabled: z.boolean(),
        businessName: z.string().trim().max(120).nullable(),
        logoDataUrl: imageDataUrl,
        qrDataUrl: imageDataUrl,
        message: z.string().trim().min(10).max(1000),
        paymentInstructions: z.string().trim().max(1000).nullable(),
        contactPhone: z.string().trim().max(40).nullable(),
        daysBeforeDue: z.number().int().min(1).max(30),
        reconnectionFee: z.number().min(0).max(100000).multipleOf(0.01),
        currency: z.enum(['PEN', 'USD']),
      }).strict().parse(req.body);
      const config = await db.paymentNoticeConfig.upsert({
        where: { tenantId: req.user.tenantId },
        create: { ...input, tenantId: req.user.tenantId },
        update: input,
      });
      await db.auditLog.create({
        data: { tenantId: req.user.tenantId, userId: req.user.id, action: 'UPDATE_PAYMENT_NOTICE_CONFIG', entity: 'PaymentNoticeConfig', entityId: config.id },
      });
      res.json({ config });
    } catch (error) { next(error); }
  });

  return router;
}

export default createPaymentNoticesRouter();
