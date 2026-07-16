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
import { ALL_PERMISSIONS, FIELD_OFFICER_PERMISSIONS } from '../src/common/auth/permissions';

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

  // ---- Built-in roles (permission sets) ------------------------------------
  // Two system roles per tenant so existing logins keep working. Permissions are
  // refreshed on every seed so they stay in sync with the catalog.
  const adminRole = await prisma.accessRole.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Administrator' } },
    update: { permissions: ALL_PERMISSIONS, isSystem: true, isActive: true },
    create: { tenantId: tenant.id, name: 'Administrator', permissions: ALL_PERMISSIONS, isSystem: true },
  });
  const fieldOfficerRole = await prisma.accessRole.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Field Officer' } },
    update: { permissions: FIELD_OFFICER_PERMISSIONS, isSystem: true, isActive: true },
    create: { tenantId: tenant.id, name: 'Field Officer', permissions: FIELD_OFFICER_PERMISSIONS, isSystem: true },
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

  const fdo = await prisma.employee.upsert({
    where: { login: 'kannan' },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      code: 'ASVEMP001',
      name: 'Kannan',
      login: 'kannan',
      passwordHash: password,
      role: 'FDO',
    },
  });

  // A few centers assigned to the demo FDO, each with 5 empty groups, so the
  // employee portal has real data to enroll members into.
  const centers = [
    { code: '029', name: 'NALLAKULAM' },
    { code: '062', name: 'KUTTUR' },
    { code: '065', name: 'CHOKKALINGAPURAM' },
  ];
  for (const c of centers) {
    const center = await prisma.center.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: c.code } },
      update: { fdoId: fdo.id },
      create: {
        tenantId: tenant.id,
        branchId: branch.id,
        fdoId: fdo.id,
        code: c.code,
        name: c.name,
        meetingDay: 'TUE',
        formationDate: new Date(),
        status: 'ACTIVE',
      },
    });
    for (let g = 1; g <= 5; g++) {
      await prisma.groupUnit.upsert({
        where: { centerId_groupNo: { centerId: center.id, groupNo: g } },
        update: {},
        create: { tenantId: tenant.id, centerId: center.id, groupNo: g },
      });
    }
  }

  // ---- Loan module masters -------------------------------------------------
  const frequencies = [
    { code: 'DLY', name: 'Daily', daysBetween: 1 },
    { code: 'WKS', name: 'Weekly', daysBetween: 7 },
    { code: 'MNS', name: 'Monthly (Short)', daysBetween: 30 },
    { code: 'MON', name: 'Monthly', daysBetween: 30 },
  ];
  const freqByCode: Record<string, { id: string }> = {};
  for (const f of frequencies) {
    freqByCode[f.code] = await prisma.frequency.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: f.code } },
      update: {},
      create: { tenantId: tenant.id, ...f },
    });
  }

  const purposes = [
    'Petty Shop', 'Tailoring', 'Agri Products', 'Agripurpose', 'Agency',
    'Agarbathi Sales', 'Air Condition Repair', 'Dairy / Milch Animal',
    'Vegetable Vending', 'Provision Store',
  ];
  for (const name of purposes) {
    await prisma.purpose.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name } },
      update: {},
      create: { tenantId: tenant.id, name },
    });
  }

  // Fixed-tier products (name mirrors amount+dues, matching how the reference
  // labels them). Interest is a fixed amount per tier, not a % rate — confirmed
  // with the client (see CLAUDE.md loan-math section).
  const products = [
    { name: '50000 LOAN 62 DUE', loanAmount: 50000, totalDues: 62, interestAmount: 12000, freq: 'WKS' },
    { name: '100000 LOAN 102 DUE', loanAmount: 100000, totalDues: 102, interestAmount: 42800, freq: 'WKS' },
    { name: '30000 LOAN 40 DUE', loanAmount: 30000, totalDues: 40, interestAmount: 7200, freq: 'WKS' },
    { name: '20000 LOAN 28 DUE', loanAmount: 20000, totalDues: 28, interestAmount: 4800, freq: 'WKS' },
  ];
  for (const p of products) {
    await prisma.loanProduct.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: p.name } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: p.name,
        loanAmount: p.loanAmount,
        totalDues: p.totalDues,
        interestAmount: p.interestAmount,
        frequencyId: freqByCode[p.freq].id,
      },
    });
  }

  // Admin-managed ID proof types: single source of truth for both the number
  // field (Enroll form / KYC editor) and the photo requirement (KYC image grid).
  const documentTypes: {
    name: string;
    appliesTo: 'CLIENT' | 'NOMINEE' | 'BOTH';
    requiresNumber?: boolean;
    requiresPhoto?: boolean;
    maskValue?: boolean;
    isMandatory?: boolean;
  }[] = [
    { name: 'CLIENT PHOTO', appliesTo: 'CLIENT', requiresNumber: false, requiresPhoto: true },
    { name: 'NOMINEE PHOTO', appliesTo: 'NOMINEE', requiresNumber: false, requiresPhoto: true },
    { name: 'CLIENT UID FRONT', appliesTo: 'CLIENT', requiresNumber: true, requiresPhoto: true, maskValue: true },
    { name: 'CLIENT VID FRONT', appliesTo: 'CLIENT', requiresNumber: true, requiresPhoto: true },
    { name: 'NOMINEE UID FRONT', appliesTo: 'NOMINEE', requiresNumber: true, requiresPhoto: true, maskValue: true },
    { name: 'NOMINEE VID FRONT', appliesTo: 'NOMINEE', requiresNumber: true, requiresPhoto: true },
    { name: 'SMART CARD', appliesTo: 'CLIENT', requiresNumber: true, requiresPhoto: true },
    { name: 'PASSBOOK', appliesTo: 'CLIENT', requiresNumber: false, requiresPhoto: true },
    // Number-only proofs (no photo requirement) — admin can flip requiresPhoto
    // on later if they want an image too. appliesTo BOTH: shown for client and,
    // when present, the nominee too (one master row, two KycNumber entries).
    { name: 'PAN CARD', appliesTo: 'BOTH', requiresNumber: true, requiresPhoto: false, isMandatory: false },
    { name: 'RATION CARD', appliesTo: 'BOTH', requiresNumber: true, requiresPhoto: false, isMandatory: false },
    { name: 'OTHER ID', appliesTo: 'BOTH', requiresNumber: true, requiresPhoto: false, isMandatory: false },
  ];
  for (const dt of documentTypes) {
    await prisma.documentType.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: dt.name } },
      update: {
        requiresNumber: dt.requiresNumber ?? true,
        requiresPhoto: dt.requiresPhoto ?? true,
        maskValue: dt.maskValue ?? false,
        ...(dt.isMandatory !== undefined ? { isMandatory: dt.isMandatory } : {}),
      },
      create: {
        tenantId: tenant.id,
        name: dt.name,
        appliesTo: dt.appliesTo,
        requiresNumber: dt.requiresNumber ?? true,
        requiresPhoto: dt.requiresPhoto ?? true,
        maskValue: dt.maskValue ?? false,
        isMandatory: dt.isMandatory ?? true,
      },
    });
  }

  await prisma.employee.upsert({
    where: { login: 'bm-natham' },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      code: 'ASVADM001',
      name: 'Branch Manager - Natham',
      login: 'bm-natham',
      passwordHash: password,
      role: 'BM',
    },
  });

  // Assign default roles to any employee that has none yet (idempotent backfill,
  // covers both freshly-seeded and pre-existing production employees).
  await prisma.employee.updateMany({
    where: { tenantId: tenant.id, accessRoleId: null, role: 'FDO' },
    data: { accessRoleId: fieldOfficerRole.id },
  });
  await prisma.employee.updateMany({
    where: { tenantId: tenant.id, accessRoleId: null, role: { in: ['BM', 'HO'] } },
    data: { accessRoleId: adminRole.id },
  });

  // Backfill for the KYC-approval feature: every KycDocument uploaded before
  // per-document review existed (this feature ships 2026-07-15) was implicitly
  // trusted, so mark them APPROVED — otherwise every already-active client's
  // photos would appear as an unreviewed backlog. Bounded by uploaded_at (not
  // just "reviewed_at IS NULL") so re-running seed later can NEVER sweep up a
  // genuinely new PENDING upload made after rollout — the upload path always
  // sets status:'PENDING' explicitly, and this cutoff must never touch that.
  await prisma.$executeRaw`
    UPDATE kyc_document SET status = 'APPROVED', reviewed_at = uploaded_at
    WHERE reviewed_at IS NULL AND uploaded_at < '2026-07-15 00:00:00+00'
  `;

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
