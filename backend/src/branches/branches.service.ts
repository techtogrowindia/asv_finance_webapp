import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth-user';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every branch in the tenant for HO; a BM sees only their own branch — a
   *  branch admin manages their own branch, never another one. */
  async list(user: AuthUser) {
    return this.prisma.withTenant(user, async (tx) => {
      const branches = await tx.branch.findMany({
        where: user.role === 'BM' ? { id: user.branchId ?? undefined } : undefined,
        orderBy: { code: 'asc' },
        include: { _count: { select: { centers: true, employees: true } } },
      });
      return branches.map((b) => this.serialize(b));
    });
  }

  /** Creating a new branch is HO-only (also enforced by @Roles at the route). */
  async create(user: AuthUser, dto: CreateBranchDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const dup = await tx.branch.findFirst({ where: { tenantId: user.tenantId, code: dto.code } });
      if (dup) throw new BadRequestException(`Branch code ${dto.code} already exists`);

      const branch = await tx.branch.create({
        data: {
          tenantId: user.tenantId,
          code: dto.code,
          name: dto.name,
          workingDate: dto.workingDate ? new Date(dto.workingDate) : new Date(),
        },
        include: { _count: { select: { centers: true, employees: true } } },
      });
      return this.serialize(branch);
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateBranchDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const existing = await tx.branch.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!existing) throw new NotFoundException('Branch not found');

      if (user.role === 'BM') {
        if (existing.id !== user.branchId) {
          throw new ForbiddenException('Branch managers can only edit their own branch');
        }
        // A branch admin may rename their own branch, but not change its code
        // or activate/deactivate it — that stays HO-only.
        if (dto.code !== undefined || dto.isActive !== undefined) {
          throw new ForbiddenException('Branch managers cannot change the branch code or status');
        }
      }

      if (dto.code && dto.code !== existing.code) {
        const dup = await tx.branch.findFirst({ where: { tenantId: user.tenantId, code: dto.code, id: { not: id } } });
        if (dup) throw new BadRequestException(`Branch code ${dto.code} already exists`);
      }

      const branch = await tx.branch.update({
        where: { id },
        data: {
          ...('code' in dto ? { code: dto.code } : {}),
          ...('name' in dto ? { name: dto.name } : {}),
          ...('isActive' in dto ? { isActive: dto.isActive } : {}),
        },
        include: { _count: { select: { centers: true, employees: true } } },
      });
      return this.serialize(branch);
    });
  }

  private serialize(b: {
    id: string;
    code: string;
    name: string;
    workingDate: Date;
    isActive: boolean;
    _count: { centers: number; employees: number };
  }) {
    return {
      id: b.id,
      code: b.code,
      name: b.name,
      workingDate: b.workingDate,
      isActive: b.isActive,
      centerCount: b._count.centers,
      employeeCount: b._count.employees,
    };
  }
}
