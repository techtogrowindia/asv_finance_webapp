import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth-user';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Field officers the admin can assign — scoped to their branch (BM) or tenant (HO). */
  async fieldOfficers(user: AuthUser) {
    return this.prisma.withTenant(user, async (tx) => {
      const where: Prisma.EmployeeWhereInput = {
        role: 'FDO',
        status: 'ACTIVE',
        ...(user.role === 'BM' && user.branchId ? { branchId: user.branchId } : {}),
      };
      const fdos = await tx.employee.findMany({ where, orderBy: { name: 'asc' } });
      return fdos.map((e) => ({ id: e.id, code: e.code, name: e.name }));
    });
  }
}
