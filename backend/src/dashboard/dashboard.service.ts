import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth-user';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Summary cards scoped to the caller:
   *   FDO → only centers/clients they own; BM/HO → their branch/tenant.
   * Tenant isolation is enforced by RLS; this adds the finer branch/center scope.
   */
  async summary(user: AuthUser) {
    return this.prisma.withTenant(user, async (tx) => {
      const centerWhere = this.centerScope(user);
      const clientWhere: Prisma.ClientWhereInput = {
        isActive: true,
        center: centerWhere,
      };

      const [totalCenters, totalClients] = await Promise.all([
        tx.center.count({ where: centerWhere }),
        tx.client.count({ where: clientWhere }),
      ]);

      return {
        cards: {
          totalCenters,
          totalClients,
          // Loan disbursement & portfolio outstanding arrive with the Loan module.
          loanDisbursement: 0,
          portfolioOutstanding: 0,
        },
        // Center-wise collection report (opening arr → demand → collection →
        // closing arr) is populated once collections land. Empty for now.
        report: [],
      };
    });
  }

  private centerScope(user: AuthUser): Prisma.CenterWhereInput {
    if (user.role === 'FDO') return { fdoId: user.employeeId };
    if (user.role === 'BM') return { branchId: user.branchId ?? undefined };
    return {}; // HO: whole tenant (still RLS-bounded)
  }
}
