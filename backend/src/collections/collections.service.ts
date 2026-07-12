import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/types/auth-user';
import { centerScope, clientCenterScope } from '../common/scope';
import { round2 } from '../loans/schedule.util';
import { PostCollectionDto } from './dto/post-collection.dto';

@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Per-member collectable amount for one center, as of a date (defaults to working date). */
  async due(user: AuthUser, centerId: string, date?: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const center = await tx.center.findFirst({ where: { id: centerId, ...centerScope(user) } });
      if (!center) throw new ForbiddenException('Center not assigned to you');

      const asOf = date ? new Date(date) : await this.resolveWorkingDate(tx, center.branchId);

      const clients = await tx.client.findMany({
        where: { centerId, isActive: true },
        orderBy: [{ group: { groupNo: 'asc' } }, { memberNo: 'asc' }],
        include: {
          group: { select: { groupNo: true } },
          loans: {
            where: { loanType: 'OPEN' },
            include: { schedule: { where: { dueDate: { lte: asOf } } } },
          },
        },
      });

      return clients.flatMap((c) =>
        c.loans
          .map((loan) => {
            const unpaid = loan.schedule.filter((s) => Number(s.collAmt) < Number(s.dueAmt));
            const totalDue = unpaid.reduce((sum, s) => sum + (Number(s.dueAmt) - Number(s.collAmt)), 0);
            if (totalDue <= 0) return null;
            return {
              clientId: c.id,
              clientName: c.name,
              displayId: `${center.code}.${c.group.groupNo}.${c.memberNo}`,
              loanId: loan.id,
              loanAccount: loan.loanAccount,
              dueCount: unpaid.length,
              totalDue: round2(totalDue),
            };
          })
          .filter((row): row is NonNullable<typeof row> => row !== null),
      );
    });
  }

  /** Demand Sheet report data: centerwise summary or clientwise detail. */
  async demand(user: AuthUser, opts: { date?: string; type: 'CENTERWISE' | 'CLIENTWISE' }) {
    return this.prisma.withTenant(user, async (tx) => {
      const centers = await tx.center.findMany({ where: centerScope(user), orderBy: { code: 'asc' } });

      const perCenter = await Promise.all(
        centers.map(async (center) => {
          const asOf = opts.date ? new Date(opts.date) : await this.resolveWorkingDate(tx, center.branchId);
          const rows = await this.due(user, center.id, opts.date);
          const total = rows.reduce((sum, r) => sum + r.totalDue, 0);
          return { center, asOf, rows, total };
        }),
      );

      if (opts.type === 'CENTERWISE') {
        return perCenter.map(({ center, total, rows }) => ({
          centerId: center.id,
          centerCode: center.code,
          centerName: center.name,
          clientCount: rows.length,
          totalDemand: round2(total),
        }));
      }

      return perCenter.flatMap(({ center, rows }) =>
        rows.map((r) => ({
          centerCode: center.code,
          centerName: center.name,
          ...r,
        })),
      );
    });
  }

  /**
   * Post a collection against a member's open loan. Applies the amount FIFO
   * across the oldest unpaid installments first (so one entry can clear several
   * weeks of arrears), splitting each installment's share proportionally
   * between its remaining principal and interest. Writes one Collection row
   * per installment touched (the audit trail) and updates the cached totals
   * on RepaymentSchedule. Closes the loan when every installment is paid.
   */
  async post(user: AuthUser, dto: PostCollectionDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const loan = await tx.loan.findFirst({
        where: { id: dto.loanId },
        include: { client: { select: { id: true, center: true } } },
      });
      if (!loan) throw new NotFoundException('Loan not found');
      if (loan.loanType !== 'OPEN') throw new BadRequestException('Loan is already closed');

      // Scope check: the loan's client must be in the caller's assigned centers.
      const inScope = await tx.client.findFirst({
        where: { id: loan.clientId, ...clientCenterScope(user) },
      });
      if (!inScope) throw new ForbiddenException('Member not in your assigned centers');

      const workingDate = await this.resolveWorkingDate(tx, loan.client.center.branchId);

      // Prisma can't compare two columns (collAmt < dueAmt) directly in a filter,
      // so fetch all rows for the loan and filter in JS.
      const allRows = await tx.repaymentSchedule.findMany({ where: { loanId: loan.id }, orderBy: { dueNo: 'asc' } });
      const pending = allRows.filter((s) => Number(s.collAmt) < Number(s.dueAmt));
      if (pending.length === 0) throw new BadRequestException('Nothing outstanding on this loan');

      let remaining = round2(dto.amount);
      const collectionsCreated: string[] = [];

      for (const row of pending) {
        if (remaining <= 0) break;
        const rowRemaining = round2(Number(row.dueAmt) - Number(row.collAmt));
        const pay = Math.min(remaining, rowRemaining);
        const remPri = round2(Number(row.duePri) - Number(row.collPri));
        const remInt = round2(Number(row.dueInt) - Number(row.collInt));
        const payPri = rowRemaining > 0 ? round2((pay * remPri) / rowRemaining) : 0;
        const payInt = round2(pay - payPri);

        const created = await tx.collection.create({
          data: {
            tenantId: user.tenantId,
            loanId: loan.id,
            scheduleId: row.id,
            collectedOn: workingDate,
            amount: pay,
            pri: payPri,
            int: payInt,
            enteredBy: user.employeeId,
          },
        });
        collectionsCreated.push(created.id);

        const newCollAmt = round2(Number(row.collAmt) + pay);
        const newCollPri = round2(Number(row.collPri) + payPri);
        const newCollInt = round2(Number(row.collInt) + payInt);
        await tx.repaymentSchedule.update({
          where: { id: row.id },
          data: {
            collAmt: newCollAmt,
            collPri: newCollPri,
            collInt: newCollInt,
            collDate: workingDate,
            dueBalance: Math.max(0, round2(Number(row.dueAmt) - newCollAmt)),
          },
        });

        remaining = round2(remaining - pay);
      }

      const stillOpen = await tx.repaymentSchedule.findFirst({
        where: { loanId: loan.id, dueBalance: { gt: 0 } },
      });
      if (!stillOpen) {
        await tx.loan.update({ where: { id: loan.id }, data: { loanType: 'CLOSED', closedDate: workingDate } });
      }

      await this.audit.record(tx, {
        tenantId: user.tenantId,
        entity: 'Collection',
        entityId: loan.id,
        action: 'COLLECT',
        employeeId: user.employeeId,
        after: { amount: dto.amount, applied: round2(dto.amount) - remaining, collectionIds: collectionsCreated },
      });

      return {
        applied: round2(dto.amount - remaining),
        unallocated: remaining,
        loanClosed: !stillOpen,
      };
    });
  }

  private async resolveWorkingDate(tx: Prisma.TransactionClient, branchId: string): Promise<Date> {
    const branch = await tx.branch.findUnique({ where: { id: branchId } });
    return branch?.workingDate ?? new Date();
  }
}
