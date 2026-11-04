import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { allowRoles } from '../middleware/auth.js';

export function createCustomersRouter({ db = prisma, hashPassword = value => bcrypt.hash(value, 12) } = {}) {
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


  router.post('/:id/portal-account', allowRoles('OWNER', 'ADMIN'), async (req, res, next) => {
    try {
      const input = z.object({
        email: z.string().trim().email().max(180).transform(value => value.toLowerCase()).optional(),
        password: z.string().min(12).max(200),
      }).strict().parse(req.body);
      const customer = await db.customer.findFirst({
        where: { id: req.params.id, tenantId: req.user.tenantId },
        select: { id: true, tenantId: true, name: true, email: true, portalUser: { select: { id: true } } },
      });
      if (!customer) return res.status(404).json({ error: 'Cliente no encontrado.' });
      if (customer.portalUser) return res.status(409).json({ error: 'Este cliente ya tiene una cuenta de acceso.' });
      const email = input.email || customer.email?.trim().toLowerCase();
      if (!email) return res.status(400).json({ error: 'Registra un correo para el cliente o indica uno para el acceso.' });
      const passwordHash = await hashPassword(input.password);
      const user = await db.user.create({
        data: { tenantId: req.user.tenantId, customerId: customer.id, name: customer.name, email, passwordHash, role: 'CUSTOMER' },
        select: { id: true, name: true, email: true, role: true, active: true },
      });
      await db.auditLog.create({
        data: { tenantId: req.user.tenantId, userId: req.user.id, action: 'CREATE_CUSTOMER_PORTAL_ACCOUNT', entity: 'User', entityId: user.id, metadata: { customerId: customer.id } },
      });
      res.status(201).json({ user });
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
