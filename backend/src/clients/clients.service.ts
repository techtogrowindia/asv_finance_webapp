import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth-user';
import { centerScope, clientCenterScope } from '../common/scope';
import { stripLeadingZeros } from '../common/format.util';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { KycDto } from './dto/kyc.dto';

const GROUP_CAPACITY = 5;
const KYC_FIELDS = ['voterId', 'otherId', 'pan', 'smartCard', 'rationCard', 'uid'] as const;

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.withTenant(user, async (tx) => {
      const c = await tx.client.findFirst({
        where: { id, ...clientCenterScope(user) },
        include: {
          center: { select: { code: true, name: true, branch: { select: { code: true } } } },
          group: { select: { groupNo: true } },
          kyc: true,
          coApplicant: true,
        },
      });
      if (!c) throw new NotFoundException('Member not found');
      return this.serialize(c, true);
    });
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
          status: 'ACTIVE',
          ...(dto.kyc
            ? {
                kyc: {
                  create: {
                    tenantId: user.tenantId,
                    voterId: dto.kyc.voterId,
                    otherId: dto.kyc.otherId,
                    pan: dto.kyc.pan,
                    smartCard: dto.kyc.smartCard,
                    rationCard: dto.kyc.rationCard,
                    uid: dto.kyc.uid,
                  },
                },
              }
            : {}),
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
                    voterId: dto.coApplicant.voterId,
                    otherId: dto.coApplicant.otherId,
                    pan: dto.coApplicant.pan,
                  },
                },
              }
            : {}),
        },
        include: {
          center: { select: { code: true, name: true, branch: { select: { code: true } } } },
          group: { select: { groupNo: true } },
          kyc: true,
          coApplicant: true,
        },
      });
      return this.serialize(created, true);
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateClientDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const existing = await tx.client.findFirst({
        where: { id, ...clientCenterScope(user) },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Member not found');

      const updated = await tx.client.update({
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
        include: {
          center: { select: { code: true, name: true, branch: { select: { code: true } } } },
          group: { select: { groupNo: true } },
        },
      });
      return this.serialize(updated, true);
    });
  }

  /** Add or edit a member's government ID numbers (upsert their KYC row). */
  async updateKyc(user: AuthUser, clientId: string, dto: KycDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: clientId, ...clientCenterScope(user) },
        select: { id: true },
      });
      if (!client) throw new NotFoundException('Member not found');

      // Only touch fields the caller actually sent (empty string clears a value).
      const data: Record<string, string | null> = {};
      for (const f of KYC_FIELDS) {
        if (dto[f] !== undefined) data[f] = dto[f] === '' ? null : (dto[f] as string);
      }

      const kyc = await tx.kyc.upsert({
        where: { clientId },
        update: data,
        create: { tenantId: user.tenantId, clientId, ...data },
      });

      return {
        voterId: kyc.voterId,
        otherId: kyc.otherId,
        pan: kyc.pan,
        smartCard: kyc.smartCard,
        rationCard: kyc.rationCard,
        uid: maskUid(kyc.uid),
      };
    });
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
      kyc: c.kyc
        ? {
            voterId: c.kyc.voterId,
            otherId: c.kyc.otherId,
            pan: c.kyc.pan,
            smartCard: c.kyc.smartCard,
            rationCard: c.kyc.rationCard,
            uid: maskUid(c.kyc.uid),
          }
        : null,
      coApplicant: c.coApplicant
        ? {
            name: c.coApplicant.name,
            gender: c.coApplicant.gender,
            dob: c.coApplicant.dob,
            relation: c.coApplicant.relation,
            mobile: c.coApplicant.mobile,
            voterId: c.coApplicant.voterId,
            otherId: c.coApplicant.otherId,
            pan: c.coApplicant.pan,
          }
        : null,
    };
  }
}

/** Aadhaar-style masking: keep only the last 4 characters visible, e.g. "XXXX XXXX 3250". */
function maskUid(uid: string | null | undefined): string | null {
  if (!uid) return null;
  const digits = uid.replace(/\s+/g, '');
  const last4 = digits.slice(-4);
  return `XXXX XXXX ${last4}`;
}
