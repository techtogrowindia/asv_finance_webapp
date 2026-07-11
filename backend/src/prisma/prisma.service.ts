import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { TenantContext } from '../common/types/auth-user';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Run `cb` inside a transaction with the tenant/branch/role/employee context
   * set as transaction-local GUCs. PostgreSQL Row-Level Security reads these
   * (`app.tenant_id`, ...) to isolate rows. Because the settings are LOCAL, they
   * are scoped to this single transaction/connection and cleared on commit —
   * safe under connection pooling. The app connects as the RLS-governed role, so
   * any query that forgets a filter is still blocked by the database.
   */
  async withTenant<T>(
    ctx: TenantContext,
    cb: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.branch_id', ${ctx.branchId ?? ''}, true)`;
      await tx.$executeRaw`SELECT set_config('app.role', ${ctx.role}, true)`;
      await tx.$executeRaw`SELECT set_config('app.employee_id', ${ctx.employeeId}, true)`;
      return cb(tx);
    });
  }
}
