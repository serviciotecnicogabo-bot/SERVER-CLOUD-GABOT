import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { allowRoles } from '../middleware/auth.js';

export function createUsersRouter({ db = prisma, hashPassword = (value) => bcrypt.hash(value, 12) } = {}) {
const router = Router();
const managers = allowRoles('OWNER', 'ADMIN');
const staffRoles = ['ADMIN', 'BILLING', 'SUPPORT', 'TECHNICIAN'];
const emailSchema = z.string().trim().email().max(180).transform(value => value.toLowerCase());

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, createdAt: user.createdAt };
}

router.get('/', managers, async (req, res, next) => {
  try {
    const users = await db.user.findMany({
      where: { tenantId: req.user.tenantId },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });
    res.json({ items: users });
  } catch (error) { next(error); }
});

router.post('/', managers, async (req, res, next) => {
  try {
    const input = z.object({
      name: z.string().trim().min(2).max(120),
      email: emailSchema,
      password: z.string().min(12).max(200),
      role: z.enum(staffRoles).default('SUPPORT'),
    }).strict().parse(req.body);

    if (req.user.role !== 'OWNER' && input.role === 'ADMIN') {
      return res.status(403).json({ error: 'Solo el propietario puede crear administradores.' });
    }

    const passwordHash = await hashPassword(input.password);
    const user = await db.user.create({
      data: { tenantId: req.user.tenantId, name: input.name, email: input.email, passwordHash, role: input.role },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });
    await db.auditLog.create({
      data: { tenantId: req.user.tenantId, userId: req.user.id, action: 'CREATE_USER', entity: 'User', entityId: user.id, metadata: { role: user.role } },
    });
    res.status(201).json({ user });
  } catch (error) { next(error); }
});

router.patch('/:id', managers, async (req, res, next) => {
  try {
    const input = z.object({
      name: z.string().trim().min(2).max(120).optional(),
      password: z.string().min(12).max(200).optional(),
      role: z.enum(staffRoles).optional(),
      active: z.boolean().optional(),
    }).strict().refine(value => Object.keys(value).length > 0, 'Indica al menos un cambio.').parse(req.body);

    const existing = await db.user.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
      select: { id: true, role: true, active: true },
    });
    if (!existing) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (req.user.role !== 'OWNER' && existing.role === 'OWNER') {
      return res.status(403).json({ error: 'Solo el propietario puede administrar la cuenta OWNER.' });
    }
    if (req.user.role !== 'OWNER' && input.role === 'ADMIN') {
      return res.status(403).json({ error: 'Solo el propietario puede asignar el rol ADMIN.' });
    }
    if (existing.id === req.user.id && (input.active === false || (input.role && input.role !== existing.role))) {
      return res.status(400).json({ error: 'No puedes desactivar ni cambiar tu propio rol.' });
    }

    if (existing.role === 'OWNER' && (input.active === false || (input.role && input.role !== existing.role))) {
      const owners = await db.user.count({ where: { tenantId: req.user.tenantId, role: 'OWNER', active: true } });
      if (owners <= 1) return res.status(409).json({ error: 'La empresa debe conservar al menos un propietario activo.' });
    }

    const data = { ...input };
    if (data.password) {
      data.passwordHash = await hashPassword(data.password);
      delete data.password;
    }
    const user = await db.user.update({
      where: { id: existing.id },
      data,
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });
    await db.auditLog.create({
      data: { tenantId: req.user.tenantId, userId: req.user.id, action: 'UPDATE_USER', entity: 'User', entityId: user.id, metadata: { fields: Object.keys(input).filter(field => field !== 'password') } },
    });
    res.json({ user });
  } catch (error) { next(error); }
});

return router;
}

export default createUsersRouter();
