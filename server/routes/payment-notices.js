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

  router.get('/portal/me', allowRoles('CUSTOMER'), async (req, res, next) => {
    try {
      if (!req.user.customerId) return res.status(403).json({ error: 'Esta cuenta todavía no está vinculada a un cliente.' });
      const customer = await db.customer.findFirst({
        where: { id: req.user.customerId, tenantId: req.user.tenantId },
        include: {
          subscriptions: {
            where: { status: { in: ['ACTIVE', 'SUSPENDED'] }, plan: { is: { tenantId: req.user.tenantId } } },
            include: { plan: { select: { name: true, speedDown: true, speedUp: true, price: true, currency: true } } },
            orderBy: { createdAt: 'desc' }, take: 1,
          },
          invoices: {
            where: { tenantId: req.user.tenantId, balance: { gt: 0 }, status: { in: ['ISSUED', 'PARTIAL', 'OVERDUE'] } },
            select: { id: true, number: true, dueDate: true, total: true, balance: true, currency: true, status: true },
            orderBy: { dueDate: 'asc' }, take: 20,
          },
        },
      });
      if (!customer) return res.status(404).json({ error: 'Cliente no encontrado.' });
      const config = await db.paymentNoticeConfig.findUnique({ where: { tenantId: req.user.tenantId } });
      const subscription = customer.subscriptions[0] || null;
      const now = new Date();
      const reminderDays = config?.daysBeforeDue ?? defaults.daysBeforeDue;
      const reminderCutoff = new Date(now.getTime() + reminderDays * 24 * 60 * 60 * 1000);
      const upcomingInvoices = customer.invoices.filter(invoice => {
        const dueDate = new Date(invoice.dueDate);
        return Number(invoice.balance || 0) > 0 && dueDate >= now && dueDate <= reminderCutoff;
      });
      const paymentReminder = config?.enabled === false || customer.status === 'SUSPENDED' || subscription?.status === 'SUSPENDED' || upcomingInvoices.length === 0
        ? null
        : { daysBeforeDue: reminderDays, invoices: upcomingInvoices, amount: upcomingInvoices.reduce((sum, invoice) => sum + Number(invoice.balance || 0), 0) };
      res.json({
        customer: { id: customer.id, code: customer.code, name: customer.name, status: customer.status },
        service: subscription ? {
          status: subscription.status,
          plan: subscription.plan,
        } : null,
        invoices: customer.invoices,
        outstandingBalance: customer.invoices.reduce((sum, invoice) => sum + Number(invoice.balance || 0), 0),
        paymentReminder,
        suspended: customer.status === 'SUSPENDED' || subscription?.status === 'SUSPENDED',
        notice: config?.enabled === false ? null : (config || defaults),
      });
    } catch (error) { next(error); }
  });

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
