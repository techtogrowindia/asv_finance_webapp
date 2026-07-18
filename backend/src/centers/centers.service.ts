import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth-user';
import { centerScope } from '../common/scope';
import { CreateCenterDto, UpdateCenterDto } from './dto/center.dto';

const GROUPS_PER_CENTER = 5;

@Injectable()
export class CentersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Centers visible to the caller, with client counts. */
  async list(user: AuthUser, branchId?: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const centers = await tx.center.findMany({
        where: centerScope(user, branchId),
        orderBy: { code: 'asc' },
        include: {
          branch: { select: { code: true } },
          _count: { select: { clients: true } },
        },
      });
      return centers.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        branchCode: c.branch.code,
        meetingDay: c.meetingDay,
        status: c.status,
        clientCount: c._count.clients,
      }));
    });
  }

  /** The (up to 5) groups of a center with member counts + free slots. */
  async groups(user: AuthUser, centerId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const groups = await tx.groupUnit.findMany({
        where: { centerId, center: centerScope(user) },
        orderBy: { groupNo: 'asc' },
        include: { _count: { select: { clients: true } } },
      });
      return groups.map((g) => ({
        id: g.id,
        groupNo: g.groupNo,
        memberCount: g._count.clients,
        slotsLeft: Math.max(0, 5 - g._count.clients),
      }));
    });
  }

  // ---- Admin (BM/HO) management --------------------------------------------

  /** All centers in scope (incl. inactive), with FDO + member counts. */
  async adminList(user: AuthUser, branchId?: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const centers = await tx.center.findMany({
        where: centerScope(user, branchId),
        orderBy: { code: 'asc' },
        include: {
          branch: { select: { code: true, name: true } },
          fdo: { select: { id: true, code: true, name: true } },
          _count: { select: { clients: true } },
        },
      });
      return centers.map((c) => this.serializeAdmin(c));
    });
  }

  async create(user: AuthUser, dto: CreateCenterDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const branchId = dto.branchId ?? user.branchId;
      if (!branchId) throw new BadRequestException('A branch is required to create a center');

      const branch = await tx.branch.findFirst({ where: { id: branchId } });
      if (!branch) throw new BadRequestException('Branch not found');

      const dup = await tx.center.findFirst({ where: { code: dto.code } });
      if (dup) throw new BadRequestException(`Center code ${dto.code} already exists`);

      await this.assertFdo(tx, dto.fdoId, branchId);

      const center = await tx.center.create({
        data: {
          tenantId: user.tenantId,
          branchId,
          fdoId: dto.fdoId ?? null,
          code: dto.code,
          name: dto.name,
          address: dto.address,
          meetingDay: dto.meetingDay,
          meetingTime: dto.meetingTime,
          meetingPlace: dto.meetingPlace,
          mobile: dto.mobile,
          formationDate: dto.formationDate ? new Date(dto.formationDate) : new Date(),
          nextMeeting: dto.nextMeeting ? new Date(dto.nextMeeting) : null,
          latitude: dto.latitude,
          longitude: dto.longitude,
          status: 'ACTIVE',
          // A center always holds up to 5 groups — create them upfront.
          groups: {
            create: Array.from({ length: GROUPS_PER_CENTER }, (_, i) => ({
              tenantId: user.tenantId,
              groupNo: i + 1,
            })),
          },
        },
        include: {
          branch: { select: { code: true, name: true } },
          fdo: { select: { id: true, code: true, name: true } },
          _count: { select: { clients: true } },
        },
      });
      return this.serializeAdmin(center);
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateCenterDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const existing = await tx.center.findFirst({ where: { id, ...centerScope(user) } });
      if (!existing) throw new NotFoundException('Center not found');

      if (dto.code && dto.code !== existing.code) {
        const dup = await tx.center.findFirst({ where: { code: dto.code, id: { not: id } } });
        if (dup) throw new BadRequestException(`Center code ${dto.code} already exists`);
      }
      if (dto.fdoId !== undefined) await this.assertFdo(tx, dto.fdoId ?? undefined, existing.branchId);

      const center = await tx.center.update({
        where: { id },
        data: {
          ...('code' in dto ? { code: dto.code } : {}),
          ...('name' in dto ? { name: dto.name } : {}),
          ...('fdoId' in dto ? { fdoId: dto.fdoId ?? null } : {}),
          ...('address' in dto ? { address: dto.address } : {}),
          ...('meetingDay' in dto ? { meetingDay: dto.meetingDay } : {}),
          ...('meetingTime' in dto ? { meetingTime: dto.meetingTime } : {}),
          ...('meetingPlace' in dto ? { meetingPlace: dto.meetingPlace } : {}),
          ...('mobile' in dto ? { mobile: dto.mobile } : {}),
          ...('formationDate' in dto ? { formationDate: dto.formationDate ? new Date(dto.formationDate) : null } : {}),
          ...('nextMeeting' in dto ? { nextMeeting: dto.nextMeeting ? new Date(dto.nextMeeting) : null } : {}),
          ...('latitude' in dto ? { latitude: dto.latitude } : {}),
          ...('longitude' in dto ? { longitude: dto.longitude } : {}),
          ...('status' in dto ? { status: dto.status } : {}),
        },
        include: {
          branch: { select: { code: true, name: true } },
          fdo: { select: { id: true, code: true, name: true } },
          _count: { select: { clients: true } },
        },
      });
      return this.serializeAdmin(center);
    });
  }

  /** Hard-delete a center only if it has no members; otherwise instruct to deactivate. */
  async remove(user: AuthUser, id: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const center = await tx.center.findFirst({
        where: { id, ...centerScope(user) },
        include: { _count: { select: { clients: true } } },
      });
      if (!center) throw new NotFoundException('Center not found');
      if (center._count.clients > 0) {
        throw new BadRequestException(
          'This center has members and cannot be deleted. Deactivate it instead.',
        );
      }
      await tx.groupUnit.deleteMany({ where: { centerId: id } });
      await tx.center.delete({ where: { id } });
      return { deleted: true };
    });
  }

  private async assertFdo(tx: Prisma.TransactionClient, fdoId: string | undefined, branchId: string) {
    if (!fdoId) return;
    const emp = await tx.employee.findFirst({ where: { id: fdoId } });
    if (!emp) throw new BadRequestException('Assigned field officer not found');
    if (emp.role !== 'FDO') throw new BadRequestException('Assigned employee is not a field officer');
    if (emp.branchId && emp.branchId !== branchId) {
      throw new ForbiddenException('Field officer belongs to a different branch');
    }
  }

  private serializeAdmin(c: {
    id: string;
    code: string;
    name: string;
    address: string | null;
    branch: { code: string; name: string };
    fdo: { id: string; code: string; name: string } | null;
    meetingDay: string | null;
    meetingTime: string | null;
    meetingPlace: string | null;
    mobile: string | null;
    formationDate: Date | null;
    nextMeeting: Date | null;
    latitude: unknown;
    longitude: unknown;
    status: string;
    _count: { clients: number };
  }) {
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      address: c.address,
      branchCode: c.branch.code,
      branchName: c.branch.name,
      fdoId: c.fdo?.id ?? null,
      fdoName: c.fdo ? `${c.fdo.code} - ${c.fdo.name}` : null,
      meetingDay: c.meetingDay,
      meetingTime: c.meetingTime,
      meetingPlace: c.meetingPlace,
      mobile: c.mobile,
      formationDate: c.formationDate,
      nextMeeting: c.nextMeeting,
      latitude: c.latitude,
      longitude: c.longitude,
      status: c.status,
      clientCount: c._count.clients,
    };
  }
}
