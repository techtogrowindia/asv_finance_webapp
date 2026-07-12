import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Writes an audit_log row for a money-affecting action. Call inside the same
 * `withTenant` transaction as the change it records (see invariant #5 in
 * CLAUDE.md). Kept as plain functions (not a Nest provider needing its own
 * connection) since it must run on the caller's transaction client.
 */
@Injectable()
export class AuditService {
  record(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      entity: string;
      entityId: string;
      action: string;
      employeeId: string;
      before?: unknown;
      after?: unknown;
    },
  ) {
    return tx.auditLog.create({
      data: {
        tenantId: params.tenantId,
        entity: params.entity,
        entityId: params.entityId,
        action: params.action,
        employeeId: params.employeeId,
        before: (params.before ?? undefined) as Prisma.InputJsonValue,
        after: (params.after ?? undefined) as Prisma.InputJsonValue,
      },
    });
  }
}
