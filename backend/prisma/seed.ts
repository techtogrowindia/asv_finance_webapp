/**
 * Seed the initial ASV Finance tenant with a branch and demo logins.
 * Runs with the OWNER connection (BYPASSRLS) so it can bootstrap the first tenant.
 *
 *   npm run seed
 *
 * Demo credentials created (CHANGE in production):
 *   Employee portal (FDO):  login "kannan"   password "Passw0rd!"
 *   Admin portal    (BM):   login "bm-natham" password "Passw0rd!"
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL,
    },
  },
});

async function main() {
  const password = await argon2.hash('Passw0rd!');

  const tenant = await prisma.tenant.upsert({
    where: { code: 'ASV' },
    update: {},
    create: { code: 'ASV', name: 'ASV Finance' },
  });

  const branch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: '005' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: '005',
      name: 'NATHAM',
      workingDate: new Date(),
    },
  });

  await prisma.employee.upsert({
    where: { login: 'kannan' },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      code: '45',
      name: 'Kannan',
      login: 'kannan',
      passwordHash: password,
      role: 'FDO',
    },
  });

  await prisma.employee.upsert({
    where: { login: 'bm-natham' },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      code: 'BM-NATHAM',
      name: 'Branch Manager - Natham',
      login: 'bm-natham',
      passwordHash: password,
      role: 'BM',
    },
  });

  // eslint-disable-next-line no-console
  console.log('Seeded tenant ASV Finance, branch 005-NATHAM, logins: kannan (FDO), bm-natham (BM).');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
