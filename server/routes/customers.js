import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { allowRoles } from '../middleware/auth.js';

export function createCustomersRouter({ db = prisma } = {}) {
  const router = Router();
  const canCreate = allowRoles('OWNER', 'ADMIN', 'BILLING', 'SUPPORT');
  const canEdit = allowRoles('OWNER', 'ADMIN', 'BILLING', 'SUPPORT');
  const customerFields = {
    name: z.string().trim().min(2).max(160),
    document: z.string().trim().max(30).optional(),
    email: z.string().trim().email().max(180).optional(),
    phone: z.string().trim().max(40).optional(),
    address: z.string().trim().max(240).optional(),
    district: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(1000).optional(),
  };

  router.get('/', async (req, res, next) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const search = String(req.query.search || '').trim();
      const where = {
        tenantId: req.user.tenantId,
        ...(search ? { OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { document: { contains: search } },
        ] } : {}),
      };
      const [items, total] = await Promise.all([
        db.customer.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
        db.customer.count({ where }),
      ]);
      res.json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (error) { next(error); }
  });

  router.post('/', canCreate, async (req, res, next) => {
    try {
      const input = z.object(customerFields).strict().parse(req.body);
      const count = await db.customer.count({ where: { tenantId: req.user.tenantId } });
      const customer = await db.customer.create({
        data: { ...input, tenantId: req.user.tenantId, code: `CLI-${String(count + 1).padStart(5, '0')}` },
      });
      await db.auditLog.create({
        data: { tenantId: req.user.tenantId, userId: req.user.id, action: 'CREATE', entity: 'Customer', entityId: customer.id },
      });
      res.status(201).json({ customer });
    } catch (error) { next(error); }
  });

  router.patch('/:id', canEdit, async (req, res, next) => {
    try {
      const input = z.object({
        name: customerFields.name.optional(),
        document: customerFields.document,
        email: customerFields.email,
        phone: customerFields.phone,
        address: customerFields.address,
        district: customerFields.district,
        notes: customerFields.notes,
      }).strict().refine(value => Object.keys(value).length > 0, 'Indica al menos un dato para actualizar.').parse(req.body);
      const existing = await db.customer.findFirst({
        where: { id: req.params.id, tenantId: req.user.tenantId },
        select: { id: true },
      });
      if (!existing) return res.status(404).json({ error: 'Cliente no encontrado.' });
      const customer = await db.customer.update({
        where: { id: existing.id },
        data: input,
      });
      await db.auditLog.create({
        data: { tenantId: req.user.tenantId, userId: req.user.id, action: 'UPDATE', entity: 'Customer', entityId: customer.id, metadata: { fields: Object.keys(input) } },
      });
      res.json({ customer });
    } catch (error) { next(error); }
  });

  router.patch('/:id/status', allowRoles('OWNER', 'ADMIN', 'SUPPORT'), async (req, res, next) => {
    try {
      const { status } = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING', 'INACTIVE']) }).strict().parse(req.body);
      const result = await db.customer.updateMany({
        where: { id: req.params.id, tenantId: req.user.tenantId }, data: { status },
      });
      if (!result.count) return res.status(404).json({ error: 'Cliente no encontrado.' });
      const customer = await db.customer.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
      await db.auditLog.create({
        data: { tenantId: req.user.tenantId, userId: req.user.id, action: 'UPDATE_STATUS', entity: 'Customer', entityId: customer.id, metadata: { status } },
      });
      res.json({ customer });
    } catch (error) { next(error); }
  });

  return router;
}

export default createCustomersRouter();
