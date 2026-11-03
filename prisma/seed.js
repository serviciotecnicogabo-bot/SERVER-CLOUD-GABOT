import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenantName = process.env.SEED_TENANT_NAME;
  const tenantSlug = process.env.SEED_TENANT_SLUG;
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!tenantName || !tenantSlug || !adminEmail || !adminPassword) {
    throw new Error('Define SEED_TENANT_NAME, SEED_TENANT_SLUG, SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD para crear el administrador inicial.');
  }
  if (adminPassword.length < 12) throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 12 caracteres.');

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug.toLowerCase() },
    update: { name: tenantName },
    create: { name: tenantName, slug: tenantSlug.toLowerCase() },
  });
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: adminEmail.toLowerCase() } },
    update: { name: 'Administrador principal', passwordHash, role: 'OWNER', active: true },
    create: { tenantId: tenant.id, email: adminEmail.toLowerCase(), name: 'Administrador principal', passwordHash, role: 'OWNER' },
  });
  console.log('Tenant y usuario OWNER inicial creados/actualizados.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
