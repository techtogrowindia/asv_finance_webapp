import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth-user';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every branch in the tenant (HO-only — branches are the top of the hierarchy). */
  async list(user: AuthUser) {
    return this.prisma.withTenant(user, async (tx) => {
      const branches = await tx.branch.findMany({
        orderBy: { code: 'asc' },
        include: { _count: { select: { centers: true, employees: true } } },
      });
      return branches.map((b) => this.serialize(b));
    });
  }

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
