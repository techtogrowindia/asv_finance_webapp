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

const GROUP_CAPACITY = 5;

const FULL_INCLUDE = {
  center: { select: { code: true, name: true, branch: { select: { code: true } } } },
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

  async list(user: AuthUser, opts: { centerId?: string; q?: string }) {
    return this.prisma.withTenant(user, async (tx) => {
      const where: Prisma.ClientWhereInput = {
        isActive: true,
        ...clientCenterScope(user),
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
          center: { select: { code: true, name: true, branch: { select: { code: true } } } },
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

      const created = await tx.client.create({
        data: {
          tenantId: user.tenantId,
          centerId: center.id,
          groupId: group.id,
          memberNo: memberCount + 1,
          clientCode,
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
  async kycPending(user: AuthUser) {
    return this.prisma.withTenant(user, async (tx) => {
      const clients = await tx.client.findMany({
        where: { isActive: true, status: { not: 'ACTIVE' }, ...clientCenterScope(user) },
        orderBy: { createdAt: 'desc' },
        include: {
          center: { select: { code: true, name: true, branch: { select: { code: true } } } },
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

  /** Next PMF code = highest existing + 1, starting at PMF005500. */
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
    return `PMF${String(n).padStart(6, '0')}`;
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
      centerCode: c.center.code,
      centerName: c.center.name,
      groupNo: c.group.groupNo,
      memberNo: c.memberNo,
      mobile: c.mobile,
      status: c.status,
      dateOfJoining: c.dateOfJoining,
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
