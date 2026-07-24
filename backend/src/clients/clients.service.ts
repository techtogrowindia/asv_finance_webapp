import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/types/auth-user';
import { centerScope, clientCenterScope } from '../common/scope';
import { stripLeadingZeros } from '../common/format.util';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { KycNumberEntryDto, UpdateKycNumbersDto } from './dto/kyc-number.dto';
import { TransferClientDto } from './dto/transfer-client.dto';
import { BulkImportMembersDto } from './dto/bulk-import-members.dto';

const GROUP_CAPACITY = 5;

const FULL_INCLUDE = {
  center: { select: { code: true, name: true, branch: { select: { code: true, name: true } } } },
  group: { select: { groupNo: true } },
  coApplicant: true,
  requestedProduct: { select: { id: true, name: true } },
  requestedPurpose: { select: { id: true, name: true } },
  kycNumbers: {
    include: { documentType: { select: { id: true, name: true, appliesTo: true, maskValue: true } } },
  },
} satisfies Prisma.ClientInclude;

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, opts: { centerId?: string; q?: string; branchId?: string }) {
    return this.prisma.withTenant(user, async (tx) => {
      const where: Prisma.ClientWhereInput = {
        isActive: true,
        ...clientCenterScope(user, opts.branchId),
        ...(opts.centerId ? { centerId: opts.centerId } : {}),
        ...(opts.q
          ? {
              OR: [
                { name: { contains: opts.q, mode: 'insensitive' } },
                { clientCode: { contains: opts.q, mode: 'insensitive' } },
                { mobile: { contains: opts.q } },
              ],
            }
          : {}),
      };
      const clients = await tx.client.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take: 200,
        include: {
          center: { select: { code: true, name: true, branch: { select: { code: true, name: true } } } },
          group: { select: { groupNo: true } },
        },
      });
      return clients.map((c) => this.serialize(c));
    });
  }

  async get(user: AuthUser, id: string) {
    return this.prisma.withTenant(user, (tx) => this.fetchFull(tx, user, id));
  }

  async create(user: AuthUser, dto: CreateClientDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const center = await tx.center.findFirst({
        where: { id: dto.centerId, ...centerScope(user) },
      });
      if (!center) throw new ForbiddenException('Center not assigned to you');

      const group = await tx.groupUnit.findFirst({
        where: { centerId: center.id, groupNo: dto.groupNo },
      });
      if (!group) throw new BadRequestException(`Group ${dto.groupNo} does not exist in this center`);

      const memberCount = await tx.client.count({
        where: { groupId: group.id, isActive: true },
      });
      if (memberCount >= GROUP_CAPACITY) {
        throw new BadRequestException(`Group ${dto.groupNo} is full (max ${GROUP_CAPACITY} members)`);
      }

      const tenant = await tx.tenant.findFirst({ where: { id: user.tenantId } });
      if (tenant?.requireLoanProductAtEnrollment && (!dto.productId || !dto.purposeId)) {
        throw new BadRequestException('A loan product and purpose are required to enroll this member');
      }
      if (dto.productId) {
        const product = await tx.loanProduct.findFirst({ where: { id: dto.productId, isActive: true } });
        if (!product) throw new BadRequestException('Loan product not found');
      }
      if (dto.purposeId) {
        const purpose = await tx.purpose.findFirst({ where: { id: dto.purposeId, isActive: true } });
        if (!purpose) throw new BadRequestException('Purpose not found');
      }

      const clientCode = await this.nextClientCode(tx);
      const savingsAccount = `ASVS${clientCode.replace(/\D/g, '')}`;

      const created = await tx.client.create({
        data: {
          tenantId: user.tenantId,
          centerId: center.id,
          groupId: group.id,
          memberNo: memberCount + 1,
          clientCode,
          savingsAccount,
          name: dto.name,
          dob: dto.dob ? new Date(dto.dob) : null,
          gender: dto.gender,
          mobile: dto.mobile,
          presentAddress: dto.presentAddress,
          pincode: dto.pincode,
          district: dto.district,
          state: dto.state,
          monthlyIncome: dto.monthlyIncome,
          monthlyExpense: dto.monthlyExpense,
          fatherName: dto.fatherName,
          dateOfJoining: dto.dateOfJoining ? new Date(dto.dateOfJoining) : new Date(),
          requestedProductId: dto.productId,
          requestedPurposeId: dto.purposeId,
          // KYC-active gate: a fresh enrollment has no approved documents yet.
          // recomputeClientStatus() flips this to ACTIVE once all mandatory
          // photos are approved (see documents.service.ts).
          status: 'PENDING',
          ...(dto.coApplicant
            ? {
                coApplicant: {
                  create: {
                    tenantId: user.tenantId,
                    name: dto.coApplicant.name,
                    gender: dto.coApplicant.gender,
                    dob: dto.coApplicant.dob ? new Date(dto.coApplicant.dob) : null,
                    relation: dto.coApplicant.relation,
                    mobile: dto.coApplicant.mobile,
                  },
                },
              }
            : {}),
        },
      });

      if (dto.kycNumbers?.length) {
        await this.upsertKycNumbers(tx, user, created.id, 'CLIENT', dto.kycNumbers);
      }
      if (dto.coApplicant?.kycNumbers?.length) {
        await this.upsertKycNumbers(tx, user, created.id, 'NOMINEE', dto.coApplicant.kycNumbers);
      }

      return this.fetchFull(tx, user, created.id);
    });
  }

  /**
   * Bulk-create members from an uploaded sheet. Each row runs in its own
   * transaction (so one bad row never rolls back the rest), matching the
   * center by code within the importer's scope, assigning the next free
   * member slot in the given group, and mapping KYC number columns to the
   * admin DocumentType masters. Mandatory ID proofs (per Settings) must be
   * present or the row is reported as an error and skipped.
   */
  async bulkImport(user: AuthUser, dto: BulkImportMembersDto) {
    // The mandatory client-side ID proofs configured in Settings — a row must
    // supply a value for every one of these or it's rejected.
    const mandatoryTypes = await this.prisma.withTenant(user, (tx) =>
      tx.documentType.findMany({
        where: {
          tenantId: user.tenantId, isActive: true, isMandatory: true,
          requiresNumber: true, appliesTo: { in: ['CLIENT', 'BOTH'] },
        },
        select: { id: true, name: true },
      }),
    );

    const results: { row: number; name: string; centerCode: string; status: 'OK' | 'ERROR'; message: string | null; displayId: string | null }[] = [];
    let successCount = 0;

    for (let i = 0; i < dto.rows.length; i++) {
      const row = dto.rows[i];
      try {
        const provided = new Set((row.kycNumbers ?? []).filter((k) => k.value.trim() !== '').map((k) => k.documentTypeId));
        const missing = mandatoryTypes.filter((t) => !provided.has(t.id));
        if (missing.length) {
          throw new BadRequestException(`Missing required ID number(s): ${missing.map((m) => m.name).join(', ')}`);
        }

        const created = await this.prisma.withTenant(user, async (tx) => {
          const center = await tx.center.findFirst({
            where: { code: row.centerCode, ...centerScope(user) },
            include: { branch: { select: { code: true } } },
          });
          if (!center) throw new NotFoundException(`Center ${row.centerCode} not found or not in your scope`);

          const group = await tx.groupUnit.findFirst({ where: { centerId: center.id, groupNo: row.groupNo } });
          if (!group) throw new BadRequestException(`Group ${row.groupNo} does not exist in center ${row.centerCode}`);

          const memberCount = await tx.client.count({ where: { groupId: group.id, isActive: true } });
          if (memberCount >= GROUP_CAPACITY) {
            throw new BadRequestException(`Group ${row.groupNo} in center ${row.centerCode} is full (max ${GROUP_CAPACITY})`);
          }

          const clientCode = await this.nextClientCode(tx);
          const savingsAccount = `ASVS${clientCode.replace(/\D/g, '')}`;
          const num = (v?: string) => (v !== undefined && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : null);

          const client = await tx.client.create({
            data: {
              tenantId: user.tenantId,
              centerId: center.id,
              groupId: group.id,
              memberNo: memberCount + 1,
              clientCode,
              savingsAccount,
              name: row.name.trim(),
              dob: row.dob ? new Date(row.dob) : null,
              gender: row.gender,
              mobile: row.mobile,
              presentAddress: row.presentAddress,
              pincode: row.pincode,
              district: row.district,
              state: row.state,
              monthlyIncome: num(row.monthlyIncome),
              monthlyExpense: num(row.monthlyExpense),
              fatherName: row.fatherName,
              dateOfJoining: new Date(),
              status: 'PENDING',
              ...(row.nominee?.name
                ? {
                    coApplicant: {
                      create: {
                        tenantId: user.tenantId,
                        name: row.nominee.name.trim(),
                        relation: row.nominee.relation,
                        mobile: row.nominee.mobile,
                      },
                    },
                  }
                : {}),
            },
          });

          if (row.kycNumbers?.length) await this.upsertKycNumbers(tx, user, client.id, 'CLIENT', row.kycNumbers);
          if (row.nominee?.kycNumbers?.length) await this.upsertKycNumbers(tx, user, client.id, 'NOMINEE', row.nominee.kycNumbers);

          return {
            displayId: `${stripLeadingZeros(center.branch.code)}.${stripLeadingZeros(center.code)}.${group.groupNo}.${memberCount + 1}`,
          };
        });

        successCount += 1;
        results.push({ row: i + 1, name: row.name, centerCode: row.centerCode, status: 'OK', message: null, displayId: created.displayId });
      } catch (e) {
        results.push({
          row: i + 1, name: row.name, centerCode: row.centerCode, status: 'ERROR',
          message: e instanceof Error ? e.message : 'Failed to import this row', displayId: null,
        });
      }
    }

    await this.prisma.withTenant(user, (tx) =>
      this.audit.record(tx, {
        tenantId: user.tenantId, entity: 'Client', entityId: user.tenantId,
        action: 'BULK_IMPORT_MEMBERS', employeeId: user.employeeId,
        after: { rows: dto.rows.length, successCount, failCount: dto.rows.length - successCount },
      }),
    );

    return { successCount, failCount: dto.rows.length - successCount, results };
  }

  async update(user: AuthUser, id: string, dto: UpdateClientDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const existing = await tx.client.findFirst({
        where: { id, ...clientCenterScope(user) },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Member not found');

      await tx.client.update({
        where: { id },
        data: {
          ...('name' in dto ? { name: dto.name } : {}),
          ...('dob' in dto ? { dob: dto.dob ? new Date(dto.dob) : null } : {}),
          ...('gender' in dto ? { gender: dto.gender } : {}),
          ...('mobile' in dto ? { mobile: dto.mobile } : {}),
          ...('presentAddress' in dto ? { presentAddress: dto.presentAddress } : {}),
          ...('pincode' in dto ? { pincode: dto.pincode } : {}),
          ...('district' in dto ? { district: dto.district } : {}),
          ...('state' in dto ? { state: dto.state } : {}),
          ...('monthlyIncome' in dto ? { monthlyIncome: dto.monthlyIncome } : {}),
          ...('monthlyExpense' in dto ? { monthlyExpense: dto.monthlyExpense } : {}),
          ...('fatherName' in dto ? { fatherName: dto.fatherName } : {}),
          ...('dateOfJoining' in dto
            ? { dateOfJoining: dto.dateOfJoining ? new Date(dto.dateOfJoining) : null }
            : {}),
          ...('latitude' in dto ? { latitude: dto.latitude } : {}),
          ...('longitude' in dto ? { longitude: dto.longitude } : {}),
        },
      });
      return this.fetchFull(tx, user, id);
    });
  }

  /** Clients in scope whose KYC isn't fully approved yet (the review queue). */
  async kycPending(user: AuthUser, branchId?: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const clients = await tx.client.findMany({
        where: { isActive: true, status: { not: 'ACTIVE' }, ...clientCenterScope(user, branchId) },
        orderBy: { createdAt: 'desc' },
        include: {
          center: { select: { code: true, name: true, branch: { select: { code: true, name: true } } } },
          group: { select: { groupNo: true } },
        },
      });
      return clients.map((c) => this.serialize(c));
    });
  }

  /**
   * Move a client to a different center/group (BM/HO only — see the @Roles
   * gate on the controller route). Both the source client and the destination
   * center are resolved through the caller's own scope, so a BM is naturally
   * confined to their own branch while HO can move across branches — no extra
   * scoping logic needed. clientCode never changes; displayId is derived live
   * from center/group/memberNo, so it updates for free. Loans/collections/
   * schedules key off clientId only, so nothing else needs to move.
   */
  async transfer(user: AuthUser, clientId: string, dto: TransferClientDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: clientId, ...clientCenterScope(user) },
      });
      if (!client) throw new NotFoundException('Member not found');

      const destCenter = await tx.center.findFirst({
        where: { id: dto.centerId, ...centerScope(user) },
      });
      if (!destCenter) throw new ForbiddenException('Destination center not in your scope');

      const destGroup = await tx.groupUnit.findFirst({
        where: { centerId: destCenter.id, groupNo: dto.groupNo },
      });
      if (!destGroup) throw new BadRequestException(`Group ${dto.groupNo} does not exist in this center`);

      const memberCount = await tx.client.count({
        where: { groupId: destGroup.id, isActive: true },
      });
      if (memberCount >= GROUP_CAPACITY) {
        throw new BadRequestException(`Group ${dto.groupNo} is full (max ${GROUP_CAPACITY} members)`);
      }

      const before = { centerId: client.centerId, groupId: client.groupId, memberNo: client.memberNo };
      const newMemberNo = memberCount + 1;

      await tx.client.update({
        where: { id: clientId },
        data: { centerId: destCenter.id, groupId: destGroup.id, memberNo: newMemberNo },
      });

      await this.audit.record(tx, {
        tenantId: user.tenantId,
        entity: 'Client',
        entityId: clientId,
        action: 'TRANSFER',
        employeeId: user.employeeId,
        before,
        after: { centerId: destCenter.id, groupId: destGroup.id, memberNo: newMemberNo },
      });

      return this.fetchFull(tx, user, clientId);
    });
  }

  /** Add/edit/clear a party's (CLIENT or NOMINEE) admin-defined ID numbers. */
  async updateKycNumbers(user: AuthUser, clientId: string, dto: UpdateKycNumbersDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: clientId, ...clientCenterScope(user) },
        select: { id: true },
      });
      if (!client) throw new NotFoundException('Member not found');

      await this.upsertKycNumbers(tx, user, clientId, dto.party, dto.entries);
      return this.fetchFull(tx, user, clientId);
    });
  }

  /**
   * Upserts (or clears, on blank value) KycNumber rows for a party. Silently
   * skips any documentTypeId that doesn't belong to this tenant or doesn't
   * apply to the given party — defends against a cross-tenant id being sent.
   */
  private async upsertKycNumbers(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    clientId: string,
    party: 'CLIENT' | 'NOMINEE',
    entries: KycNumberEntryDto[],
  ) {
    const ids = entries.map((e) => e.documentTypeId);
    const validTypes = await tx.documentType.findMany({
      where: { id: { in: ids }, tenantId: user.tenantId, appliesTo: { in: [party, 'BOTH'] } },
      select: { id: true },
    });
    const validIds = new Set(validTypes.map((t) => t.id));

    for (const entry of entries) {
      if (!validIds.has(entry.documentTypeId)) continue;
      const value = entry.value.trim();
      if (value === '') {
        await tx.kycNumber.deleteMany({
          where: { clientId, documentTypeId: entry.documentTypeId, party },
        });
      } else {
        await tx.kycNumber.upsert({
          where: { clientId_documentTypeId_party: { clientId, documentTypeId: entry.documentTypeId, party } },
          update: { value },
          create: { tenantId: user.tenantId, clientId, documentTypeId: entry.documentTypeId, party, value },
        });
      }
    }
  }

  private async fetchFull(tx: Prisma.TransactionClient, user: AuthUser, clientId: string) {
    const c = await tx.client.findFirst({
      where: { id: clientId, ...clientCenterScope(user) },
      include: FULL_INCLUDE,
    });
    if (!c) throw new NotFoundException('Member not found');
    return this.serialize(c, true);
  }

  /** A member's savings passbook — the account number, current balance and every
   *  deposit/refund (with the loan it came from) and a running balance. */
  async savingsPassbook(user: AuthUser, clientId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: clientId, ...clientCenterScope(user) },
        select: {
          name: true, clientCode: true, savingsAccount: true, savingsBalance: true, memberNo: true,
          group: { select: { groupNo: true } },
          center: { select: { code: true, name: true, branch: { select: { code: true } } } },
        },
      });
      if (!client) throw new NotFoundException('Member not found');

      const txns = await tx.savingsTxn.findMany({
        where: { clientId },
        orderBy: [{ collectedOn: 'asc' }, { createdAt: 'asc' }],
      });

      // SavingsTxn has no loan relation — map loan accounts separately.
      const loanIds = [...new Set(txns.map((t) => t.loanId).filter((x): x is string => !!x))];
      const loans = loanIds.length
        ? await tx.loan.findMany({ where: { id: { in: loanIds } }, select: { id: true, loanAccount: true } })
        : [];
      const acctById = new Map(loans.map((l) => [l.id, l.loanAccount]));

      let balance = 0;
      const rows = txns.map((t) => {
        const deposit = t.kind === 'DEPOSIT' ? Number(t.amount) : 0;
        const refund = t.kind === 'REFUND' ? Number(t.amount) : 0;
        balance = Math.round((balance + deposit - refund) * 100) / 100;
        return {
          date: t.collectedOn,
          loanAccount: t.loanId ? acctById.get(t.loanId) ?? null : null,
          kind: t.kind,
          deposit,
          refund,
          balance,
        };
      });

      return {
        clientId,
        clientName: client.name,
        displayId: `${stripLeadingZeros(client.center.branch.code)}.${stripLeadingZeros(client.center.code)}.${client.group.groupNo}.${client.memberNo}`,
        savingsAccount: client.savingsAccount,
        savingsBalance: Number(client.savingsBalance),
        rows,
      };
    });
  }

  /** Combined member statement — every loan ledger plus the savings passbook,
   *  for the "loan + savings" report and its PDF. */
  async clientStatement(user: AuthUser, clientId: string) {
    const passbook = await this.savingsPassbook(user, clientId); // enforces scope
    return this.prisma.withTenant(user, async (tx) => {
      const loans = await tx.loan.findMany({
        where: { clientId },
        orderBy: { disbursalDate: 'asc' },
        include: { schedule: { orderBy: { dueNo: 'asc' } } },
      });

      // Savings is banked once per collection event (tied to a loan + date), not
      // per installment. Attribute each deposit to the instalment collected that
      // day so the statement can show a per-row "Savings" column (0 if none).
      const deposits = await tx.savingsTxn.findMany({
        where: { clientId, kind: 'DEPOSIT' },
        orderBy: { collectedOn: 'asc' },
        select: { loanId: true, collectedOn: true, amount: true },
      });
      const depositQueue = new Map<string, number[]>(); // key `${loanId}|${yyyy-mm-dd}` → amounts
      for (const dep of deposits) {
        if (!dep.loanId) continue;
        const key = `${dep.loanId}|${dep.collectedOn.toISOString().slice(0, 10)}`;
        const list = depositQueue.get(key) ?? [];
        list.push(Number(dep.amount));
        depositQueue.set(key, list);
      }

      return {
        clientName: passbook.clientName,
        displayId: passbook.displayId,
        savingsAccount: passbook.savingsAccount,
        savingsBalance: passbook.savingsBalance,
        savings: passbook.rows,
        loans: loans.map((l) => ({
          loanAccount: l.loanAccount,
          disbursalDate: l.disbursalDate,
          loanAmount: l.loanAmount,
          interestAmount: l.interestAmount,
          totalAmount: l.totalAmount,
          totalDues: l.totalDues,
          loanType: l.loanType,
          closedDate: l.closedDate,
          schedule: l.schedule.map((s) => {
            let savings = 0;
            if (s.collDate) {
              const key = `${l.id}|${s.collDate.toISOString().slice(0, 10)}`;
              const list = depositQueue.get(key);
              if (list && list.length) savings = list.shift()!; // consume once
            }
            return {
              dueNo: s.dueNo, dueDate: s.dueDate, collDate: s.collDate,
              duePri: s.duePri, dueInt: s.dueInt, dueAmt: s.dueAmt,
              collPri: s.collPri, collInt: s.collInt, collAmt: s.collAmt,
              savings, dueBalance: s.dueBalance,
            };
          }),
        })),
      };
    });
  }

  /** Next ASVLN code = highest existing + 1, starting at ASVLN005500. */
  private async nextClientCode(tx: Prisma.TransactionClient): Promise<string> {
    const last = await tx.client.findFirst({
      orderBy: { clientCode: 'desc' },
      select: { clientCode: true },
    });
    let n = 5500;
    if (last?.clientCode) {
      const parsed = parseInt(last.clientCode.replace(/\D/g, ''), 10);
      if (!Number.isNaN(parsed)) n = parsed + 1;
    }
    return `ASVLN${String(n).padStart(6, '0')}`;
  }

  private serialize(c: any, full = false) {
    const base = {
      id: c.id,
      clientCode: c.clientCode,
      // Client ID = branch.center.group.member, as plain numbers (no zero-padding)
      // even though branch/center codes are stored padded (e.g. "005", "029").
      displayId: `${stripLeadingZeros(c.center.branch.code)}.${stripLeadingZeros(c.center.code)}.${c.group.groupNo}.${c.memberNo}`,
      name: c.name,
      centerId: c.centerId,
      branchCode: c.center.branch?.code ?? null,
      branchName: c.center.branch?.name ?? null,
      centerCode: c.center.code,
      centerName: c.center.name,
      groupNo: c.group.groupNo,
      memberNo: c.memberNo,
      mobile: c.mobile,
      status: c.status,
      dateOfJoining: c.dateOfJoining,
      savingsAccount: c.savingsAccount ?? null,
      savingsBalance: Number(c.savingsBalance ?? 0),
    };
    if (!full) return base;
    return {
      ...base,
      dob: c.dob,
      gender: c.gender,
      presentAddress: c.presentAddress,
      pincode: c.pincode,
      district: c.district,
      state: c.state,
      monthlyIncome: c.monthlyIncome,
      monthlyExpense: c.monthlyExpense,
      fatherName: c.fatherName,
      latitude: c.latitude,
      longitude: c.longitude,
      requestedProductId: c.requestedProductId ?? null,
      requestedProductName: c.requestedProduct?.name ?? null,
      requestedPurposeId: c.requestedPurposeId ?? null,
      requestedPurposeName: c.requestedPurpose?.name ?? null,
      kycNumbers: ((c.kycNumbers ?? []) as any[]).map((k) => ({
        documentTypeId: k.documentTypeId,
        name: k.documentType.name,
        appliesTo: k.documentType.appliesTo,
        party: k.party,
        value: k.documentType.maskValue ? maskLast4(k.value) : k.value,
      })),
      coApplicant: c.coApplicant
        ? {
            name: c.coApplicant.name,
            gender: c.coApplicant.gender,
            dob: c.coApplicant.dob,
            relation: c.coApplicant.relation,
            mobile: c.coApplicant.mobile,
          }
        : null,
    };
  }
}

/** Keep only the last 4 characters visible, e.g. "XXXX XXXX 3250" (Aadhaar-style). */
function maskLast4(value: string): string {
  const digits = value.replace(/\s+/g, '');
  const last4 = digits.slice(-4);
  return `XXXX XXXX ${last4}`;
}
