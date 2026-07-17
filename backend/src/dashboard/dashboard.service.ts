import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth-user';
import { stripLeadingZeros } from '../common/format.util';
import { round2 } from '../loans/schedule.util';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Summary cards + center-wise today snapshot, scoped to the caller:
   *   FDO → only centers/clients they own; BM/HO → their branch/tenant.
   * Tenant isolation is enforced by RLS; this adds the finer branch/center scope.
   * All "today" figures use each branch's working_date, never now() (invariant #4).
   */
  async summary(user: AuthUser) {
    return this.prisma.withTenant(user, async (tx) => {
      const centerWhere = this.centerScope(user);

      const [totalCenters, totalClients, centers] = await Promise.all([
        tx.center.count({ where: centerWhere }),
        tx.client.count({ where: { isActive: true, center: centerWhere } }),
        tx.center.findMany({ where: centerWhere, orderBy: { code: 'asc' } }),
      ]);

      const branchIds = [...new Set(centers.map((c) => c.branchId))];
      const branches = await tx.branch.findMany({ where: { id: { in: branchIds } } });
      const workingDateByBranch = new Map(branches.map((b) => [b.id, b.workingDate]));
      const workingDateByCenterId = new Map(centers.map((c) => [c.id, workingDateByBranch.get(c.branchId)]));

      // One query for every open loan in scope (with its schedule) — avoids
      // per-center N+1 queries; everything below is grouped from this in JS.
      const openLoans = await tx.loan.findMany({
        where: { loanType: 'OPEN', client: { center: centerWhere } },
        select: {
          loanAmount: true,
          clientId: true,
          client: { select: { centerId: true } },
          schedule: { select: { dueDate: true, dueAmt: true, duePri: true, dueInt: true, collAmt: true } },
        },
      });

      // Today's collections in scope, one query, grouped by center in JS.
      const collectionsToday = await tx.collection.findMany({
        where: {
          OR: branches.map((b) => ({
            collectedOn: workingDateByBranch.get(b.id),
            loan: { client: { center: { ...centerWhere, branchId: b.id } } },
          })),
        },
        select: { amount: true, loan: { select: { client: { select: { centerId: true } } } } },
      });
      const collectedByCenterId = new Map<string, number>();
      for (const c of collectionsToday) {
        const centerId = c.loan.client.centerId;
        collectedByCenterId.set(centerId, round2((collectedByCenterId.get(centerId) ?? 0) + Number(c.amount)));
      }

      let loanDisbursement = 0;
      let portfolioOutstanding = 0;
      const perCenter = new Map<string, { clientsWithDue: Set<string>; demand: number }>();

      for (const loan of openLoans) {
        loanDisbursement += Number(loan.loanAmount);
        const centerId = loan.client.centerId;
        const workingDate = workingDateByCenterId.get(centerId);

        const unpaid = loan.schedule.filter((s) => Number(s.collAmt) < Number(s.dueAmt));
        portfolioOutstanding += unpaid.reduce((sum, s) => sum + Number(s.duePri) + Number(s.dueInt), 0);

        const dueToday = unpaid.filter((s) => !workingDate || s.dueDate <= workingDate);
        const demand = dueToday.reduce((sum, s) => sum + (Number(s.dueAmt) - Number(s.collAmt)), 0);
        if (demand > 0) {
          const entry = perCenter.get(centerId) ?? { clientsWithDue: new Set<string>(), demand: 0 };
          entry.clientsWithDue.add(loan.clientId);
          entry.demand = round2(entry.demand + demand);
          perCenter.set(centerId, entry);
        }
      }

      const report = centers.map((center) => {
        const entry = perCenter.get(center.id);
        const demand = entry?.demand ?? 0;
        const collected = collectedByCenterId.get(center.id) ?? 0;
        const outstanding = Math.max(0, round2(demand - collected));
        const status =
          demand === 0 ? 'No dues today' : outstanding === 0 ? 'Collected' : collected > 0 ? 'Partial' : 'Pending';
        return {
          centerId: center.id,
          centerCode: center.code,
          centerName: center.name,
          clientsWithDue: entry?.clientsWithDue.size ?? 0,
          demand,
          collected,
          outstanding,
          status,
        };
      });

      return {
        cards: {
          totalCenters,
          totalClients,
          loanDisbursement: round2(loanDisbursement),
          portfolioOutstanding: round2(portfolioOutstanding),
        },
        report,
      };
    });
  }

  /**
   * Last N loans closed in scope — the "just happened" feed for the dashboard
   * notification widget (a loan closes -> its savings auto-refunds -> this
   * shows up here so BM/HO/FDO see it without hunting through Reports).
   */
  async recentClosures(user: AuthUser, limit = 8) {
    return this.prisma.withTenant(user, async (tx) => {
      const loans = await tx.loan.findMany({
        where: { loanType: 'CLOSED', client: { center: this.centerScope(user) } },
        orderBy: { closedDate: 'desc' },
        take: limit,
        include: {
          client: {
            select: {
              name: true,
              memberNo: true,
              group: { select: { groupNo: true } },
              center: { select: { code: true, name: true, branch: { select: { code: true } } } },
            },
          },
        },
      });
      if (loans.length === 0) return [];

      const [audits, refunds] = await Promise.all([
        tx.auditLog.findMany({
          where: { entity: 'Loan', action: 'FORECLOSE', entityId: { in: loans.map((l) => l.id) } },
          select: { entityId: true },
        }),
        tx.savingsTxn.groupBy({
          by: ['loanId'],
          where: { loanId: { in: loans.map((l) => l.id) }, kind: 'REFUND' },
          _sum: { amount: true },
        }),
      ]);
      const foreclosed = new Set(audits.map((a) => a.entityId));
      const refundByLoan = new Map(refunds.map((r) => [r.loanId, Number(r._sum.amount ?? 0)]));

      return loans.map((l) => {
        const c = l.client;
        return {
          loanId: l.id,
          loanAccount: l.loanAccount,
          displayId: `${stripLeadingZeros(c.center.branch.code)}.${stripLeadingZeros(c.center.code)}.${c.group.groupNo}.${c.memberNo}`,
          clientName: c.name,
          centerName: `${c.center.code} — ${c.center.name}`,
          closedDate: l.closedDate,
          foreclosed: foreclosed.has(l.id),
          totalAmount: round2(Number(l.totalAmount)),
          savingsRefunded: round2(refundByLoan.get(l.id) ?? 0),
        };
      });
    });
  }

  private centerScope(user: AuthUser): Prisma.CenterWhereInput {
    if (user.role === 'FDO') return { fdoId: user.employeeId };
    if (user.role === 'BM') return { branchId: user.branchId ?? undefined };
    return {}; // HO: whole tenant (still RLS-bounded)
  }
}
