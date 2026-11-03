import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from './db.js';
import { requireAuth, allowRoles } from './middleware/auth.js';

const app = express();
const port = Number(process.env.API_PORT || 4000);
const origins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(v => v.trim());

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('Falta JWT_SECRET (mínimo 32 caracteres). No se iniciará la API.');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL. Configura PostgreSQL antes de iniciar la API.');
  process.exit(1);
}

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: origins, credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'GABOT CLOUD FTTH API' }));

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const input = z.object({
      tenant: z.string().min(2).max(80),
      email: z.string().email().max(180),
      password: z.string().min(8).max(200),
    }).parse(req.body);

    const tenant = await prisma.tenant.findUnique({ where: { slug: input.tenant.toLowerCase() } });
    if (!tenant) return res.status(401).json({ error: 'Credenciales incorrectas.' });

    const user = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: input.email.toLowerCase() } },
    });
    if (!user || !user.active || !(await bcrypt.compare(input.password, user.passwordHash))) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    const token = jwt.sign(
      { tenantId: tenant.id, role: user.role },
      process.env.JWT_SECRET,
      { subject: user.id, expiresIn: process.env.JWT_EXPIRES_IN || '8h', issuer: 'gabot-cloud-ftth' },
    );
    res.json({ token, expiresIn: process.env.JWT_EXPIRES_IN || '8h', user: { id: user.id, name: user.name, email: user.email, role: user.role, tenant: tenant.name } });
  } catch (error) { next(error); }
});

app.use('/api', requireAuth);

app.get('/api/me', async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.user.id, tenantId: req.user.tenantId, active: true },
      select: { id: true, name: true, email: true, role: true, tenant: { select: { name: true, slug: true } } },
    });
    if (!user) return res.status(401).json({ error: 'Usuario no disponible.' });
    res.json({ user });
  } catch (error) { next(error); }
});

app.get('/api/dashboard/summary', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const [customers, activeCustomers, activeSubscriptions, pendingInvoices, overdueInvoices, equipment, monthlyPayments] = await Promise.all([
      prisma.customer.count({ where: { tenantId } }),
      prisma.customer.count({ where: { tenantId, status: 'ACTIVE' } }),
      prisma.subscription.count({ where: { status: 'ACTIVE', customer: { is: { tenantId } } } }),
      prisma.invoice.aggregate({ where: { tenantId, status: { in: ['ISSUED', 'PARTIAL'] } }, _sum: { balance: true }, _count: true }),
      prisma.invoice.aggregate({ where: { tenantId, status: 'OVERDUE' }, _sum: { balance: true }, _count: true }),
      prisma.networkEquipment.count({ where: { tenantId, active: true } }),
      prisma.payment.aggregate({ where: { tenantId, paidAt: { gte: monthStart, lt: nextMonthStart } }, _sum: { amount: true } }),
    ]);
    res.json({
      customers,
      activeCustomers,
      activeSubscriptions,
      pendingInvoices: pendingInvoices._count,
      pendingBalance: pendingInvoices._sum.balance || 0,
      overdueInvoices: overdueInvoices._count,
      overdueBalance: overdueInvoices._sum.balance || 0,
      registeredEquipment: equipment,
      monthlyPayments: monthlyPayments._sum.amount || 0,
    });
  } catch (error) { next(error); }
});

app.get('/api/customers', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const search = String(req.query.search || '').trim();
    const where = {
      tenantId: req.user.tenantId,
      ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }, { document: { contains: search } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.customer.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.customer.count({ where }),
    ]);
    res.json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});

app.post('/api/customers', allowRoles('OWNER', 'ADMIN', 'BILLING', 'SUPPORT'), async (req, res, next) => {
  try {
    const input = z.object({
      name: z.string().trim().min(2).max(160),
      document: z.string().trim().max(30).optional(),
      email: z.string().email().max(180).optional(),
      phone: z.string().trim().max(40).optional(),
      address: z.string().trim().max(240).optional(),
      district: z.string().trim().max(100).optional(),
      notes: z.string().trim().max(1000).optional(),
    }).parse(req.body);
    const count = await prisma.customer.count({ where: { tenantId: req.user.tenantId } });
    const customer = await prisma.customer.create({
      data: { ...input, tenantId: req.user.tenantId, code: `CLI-${String(count + 1).padStart(5, '0')}` },
    });
    await prisma.auditLog.create({ data: { tenantId: req.user.tenantId, userId: req.user.id, action: 'CREATE', entity: 'Customer', entityId: customer.id } });
    res.status(201).json({ customer });
  } catch (error) { next(error); }
});

app.patch('/api/customers/:id/status', allowRoles('OWNER', 'ADMIN', 'SUPPORT'), async (req, res, next) => {
  try {
    const { status } = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING', 'INACTIVE']) }).parse(req.body);
    const result = await prisma.customer.updateMany({ where: { id: req.params.id, tenantId: req.user.tenantId }, data: { status } });
    if (!result.count) return res.status(404).json({ error: 'Cliente no encontrado.' });
    const customer = await prisma.customer.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    await prisma.auditLog.create({ data: { tenantId: req.user.tenantId, userId: req.user.id, action: 'UPDATE_STATUS', entity: 'Customer', entityId: customer.id, metadata: { status } } });
    res.json({ customer });
  } catch (error) { next(error); }
});

app.get('/api/plans', async (req, res, next) => {
  try {
    const plans = await prisma.plan.findMany({ where: { tenantId: req.user.tenantId, active: true }, orderBy: { price: 'asc' } });
    res.json({ items: plans });
  } catch (error) { next(error); }
});

app.post('/api/plans', allowRoles('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const input = z.object({
      name: z.string().trim().min(2).max(100),
      speedDown: z.number().int().positive().max(100000),
      speedUp: z.number().int().positive().max(100000),
      price: z.number().nonnegative().max(1000000),
      currency: z.enum(['PEN', 'USD']).default('PEN'),
    }).parse(req.body);
    const plan = await prisma.plan.create({ data: { ...input, tenantId: req.user.tenantId } });
    res.status(201).json({ plan });
  } catch (error) { next(error); }
});

app.get('/api/invoices', allowRoles('OWNER', 'ADMIN', 'BILLING'), async (req, res, next) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { tenantId: req.user.tenantId },
      include: { customer: { select: { id: true, code: true, name: true } } },
      orderBy: { dueDate: 'desc' }, take: 100,
    });
    res.json({ items: invoices });
  } catch (error) { next(error); }
});

app.get('/api/equipment', allowRoles('OWNER', 'ADMIN', 'TECHNICIAN', 'SUPPORT'), async (req, res, next) => {
  try {
    const items = await prisma.networkEquipment.findMany({ where: { tenantId: req.user.tenantId }, orderBy: { createdAt: 'desc' } });
    // Deliberately never return passwords, SNMP communities, or device credentials from this endpoint.
    res.json({ items });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  if (error?.name === 'ZodError') return res.status(400).json({ error: 'Datos inválidos.', details: error.issues });
  if (error?.code === 'P2002') return res.status(409).json({ error: 'Ya existe un registro con esos datos.' });
  console.error(error);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

app.listen(port, () => console.log(`GABOT CLOUD FTTH API escuchando en puerto ${port}`));

process.on('SIGTERM', async () => { await prisma.$disconnect(); process.exit(0); });
