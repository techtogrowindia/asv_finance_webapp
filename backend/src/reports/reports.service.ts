import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth-user';
import { centerScope } from '../common/scope';
import { stripLeadingZeros } from '../common/format.util';
import { round2 } from '../loans/schedule.util';

type MetricsLoan = {
  loanAmount: unknown;
  disbursalDate: Date;
  schedule: { dueDate: Date; dueAmt: unknown; duePri: unknown; dueInt: unknown; collAmt: unknown }[];
};

/**
 * Window-aware per-loan metrics:
 *  - disbursed  = loan amount, but only if the loan was disbursed within [from, to]
 *  - collected  = amount collected against installments falling due within [from, to]
 *  - outstanding/arrear = position as of the window's end date (`to`)
 * (installments due after `to` are treated as not-yet-due, matching the dated
 *  activity reports' convention of scoping by installment due-date.)
 */
function loanMetricsWindow(loan: MetricsLoan, from: Date, to: Date) {
  const disbursed = loan.disbursalDate >= from && loan.disbursalDate <= to ? Number(loan.loanAmount) : 0;
  const collected = loan.schedule
    .filter((s) => s.dueDate >= from && s.dueDate <= to)
    .reduce((sum, s) => sum + Number(s.collAmt), 0);
  const unpaid = loan.schedule.filter((s) => Number(s.collAmt) < Number(s.dueAmt));
  const outstanding = unpaid.reduce((sum, s) => sum + Number(s.duePri) + Number(s.dueInt), 0);
  const arrear = unpaid
    .filter((s) => s.dueDate <= to)
    .reduce((sum, s) => sum + (Number(s.dueAmt) - Number(s.collAmt)), 0);
  return { disbursed, outstanding: round2(outstanding), arrear: round2(arrear), collected: round2(collected) };
}

const LOAN_INCLUDE = {
  client: {
    include: {
      center: { include: { branch: { select: { code: true } }, fdo: { select: { name: true } } } },
      group: { select: { groupNo: true } },
      coApplicant: { select: { mobile: true } },
    },
  },
  schedule: { orderBy: { dueNo: 'asc' as const } },
  product: { include: { frequency: { select: { code: true } } } },
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Centerwise Demand Register (printable, one row per center + a Grand Total
   * row) as of a single date — clients, pending loan applications, average
   * installment number reached, loan O/s, arrear, demand and same-day
   * collection, plus a blank signature column for the center's meeting.
   */
  async demandRegister(user: AuthUser, asOf: Date) {
    return this.prisma.withTenant(user, async (tx) => {
      const centers = await tx.center.findMany({
        where: centerScope(user),
        orderBy: { code: 'asc' },
        select: {
          id: true, code: true, name: true, mobile: true, meetingTime: true,
          clients: {
            where: { isActive: true },
            select: {
              loans: {
                where: { loanType: 'OPEN' },
                select: { totalDues: true, schedule: { select: { dueDate: true, dueAmt: true, collAmt: true } } },
              },
              applications: { where: { status: 'PENDING' }, select: { id: true } },
            },
          },
        },
      });

      const rows = await Promise.all(
        centers.map(async (center) => {
          let loanOS = 0;
          let arrear = 0;
          let pendingApplications = 0;
          const dueNos: number[] = [];

          for (const client of center.clients) {
            pendingApplications += client.applications.length;
            for (const loan of client.loans) {
              const unpaid = loan.schedule.filter((s) => Number(s.collAmt) < Number(s.dueAmt));
              loanOS += unpaid.reduce((sum, s) => sum + Number(s.dueAmt), 0);
              arrear += unpaid
                .filter((s) => s.dueDate <= asOf)
                .reduce((sum, s) => sum + (Number(s.dueAmt) - Number(s.collAmt)), 0);
              // Current installment number reached (dues completed + 1, capped
              // at the schedule length) — how far along this loan's cycle is.
              const compDues = loan.schedule.length - unpaid.length;
              dueNos.push(Math.min(compDues + 1, loan.totalDues));
            }
          }

          const collected = await tx.collection.aggregate({
            where: { collectedOn: asOf, loan: { client: { centerId: center.id } } },
            _sum: { amount: true },
          });

          return {
            centerId: center.id,
            centerCode: center.code,
            centerName: center.name,
            phone: center.mobile,
            clientCount: center.clients.length,
            pendingApplications,
            avgDueNo: dueNos.length ? Math.round(dueNos.reduce((a, b) => a + b, 0) / dueNos.length) : 0,
            meetingTime: center.meetingTime,
            loanOS: round2(loanOS),
            arrear: round2(arrear),
            // Demand for the day = everything due up to and including `asOf`
            // (same convention as CollectionsService.centerSummary).
            demand: round2(arrear),
            collected: round2(Number(collected._sum.amount ?? 0)),
          };
        }),
      );
      return rows;
    });
  }

  /**
   * Members who paid nothing on a due installment within [from, to] — for
   * follow-up calling. One row per uncollected due, with opening arrear
   * (unpaid balance from before the window) and both phone numbers.
   */
  async zeroCollection(user: AuthUser, from: Date, to: Date) {
    return this.prisma.withTenant(user, async (tx) => {
      const loans = await tx.loan.findMany({
        where: { loanType: 'OPEN', client: { center: centerScope(user) } },
        include: LOAN_INCLUDE,
      });

      const rows: unknown[] = [];
      for (const loan of loans) {
        const zeroInRange = loan.schedule.filter(
          (s) => s.dueDate >= from && s.dueDate <= to && Number(s.collAmt) === 0,
        );
        if (zeroInRange.length === 0) continue;

        const openingArrear = loan.schedule
          .filter((s) => s.dueDate < from && Number(s.collAmt) < Number(s.dueAmt))
          .reduce((sum, s) => sum + (Number(s.dueAmt) - Number(s.collAmt)), 0);
        const demand = zeroInRange.reduce((sum, s) => sum + Number(s.dueAmt), 0);
        const c = loan.client;

        rows.push({
          branchCode: c.center.branch.code,
          centerCode: c.center.code,
          centerName: c.center.name,
          displayId: `${stripLeadingZeros(c.center.branch.code)}.${stripLeadingZeros(c.center.code)}.${c.group.groupNo}.${c.memberNo}`,
          memberName: c.name,
          loanAccount: loan.loanAccount,
          disbursalDate: loan.disbursalDate,
          loanAmount: loan.loanAmount,
          dueDate: zeroInRange[zeroInRange.length - 1].dueDate,
          frequency: loan.product.frequency.code,
          openingArrear: round2(openingArrear),
          dueCount: zeroInRange.length,
          demand: round2(demand),
          balance: round2(openingArrear + demand),
          phone: c.mobile,
          nomineePhone: c.coApplicant?.mobile ?? null,
          fdoName: c.center.fdo?.name ?? null,
        });
      }
      return rows;
    });
  }

  /** Per-loan arrears summary for dues within [from, to]: opening → demand → collected → closing arrear. */
  async collectionFollowup(user: AuthUser, from: Date, to: Date) {
    return this.prisma.withTenant(user, async (tx) => {
      const loans = await tx.loan.findMany({
        where: { client: { center: centerScope(user) } },
        include: LOAN_INCLUDE,
      });

      const rows: unknown[] = [];
      for (const loan of loans) {
        const dueInRange = loan.schedule.filter((s) => s.dueDate >= from && s.dueDate <= to);
        if (dueInRange.length === 0) continue;

        const openingArrear = loan.schedule
          .filter((s) => s.dueDate < from && Number(s.collAmt) < Number(s.dueAmt))
          .reduce((sum, s) => sum + (Number(s.dueAmt) - Number(s.collAmt)), 0);
        const dueAmount = dueInRange.reduce((sum, s) => sum + Number(s.dueAmt), 0);
        const collAmount = dueInRange.reduce((sum, s) => sum + Number(s.collAmt), 0);
        const compDues = loan.schedule.filter((s) => Number(s.collAmt) >= Number(s.dueAmt)).length;
        const collDues = loan.schedule.filter((s) => Number(s.collAmt) > 0).length;
        const c = loan.client;

        rows.push({
          branchCode: c.center.branch.code,
          centerCode: c.center.code,
          centerName: c.center.name,
          memberName: c.name,
          loanAccount: loan.loanAccount,
          disbursalDate: loan.disbursalDate,
          loanAmount: loan.loanAmount,
          openingArrear: round2(openingArrear),
          dueAmount: round2(dueAmount),
          collAmount: round2(collAmount),
          closingArrear: round2(openingArrear + dueAmount - collAmount),
          compDues,
          collDues,
          totalDues: loan.totalDues,
          loanType: loan.loanType,
        });
      }
      return rows;
    });
  }

  /** Upcoming (not-yet-due) installments within [from, to], so FDOs can plan ahead. */
  async advanceCollection(user: AuthUser, from: Date, to: Date) {
    return this.prisma.withTenant(user, async (tx) => {
      const loans = await tx.loan.findMany({
        where: { loanType: 'OPEN', client: { center: centerScope(user) } },
        include: LOAN_INCLUDE,
      });

      const rows: unknown[] = [];
      for (const loan of loans) {
        const future = loan.schedule.filter((s) => s.dueDate >= from && s.dueDate <= to);
        if (future.length === 0) continue;

        const unpaid = loan.schedule.filter((s) => Number(s.collAmt) < Number(s.dueAmt));
        const arrear = unpaid
          .filter((s) => s.dueDate < from)
          .reduce((sum, s) => sum + (Number(s.dueAmt) - Number(s.collAmt)), 0);
        const loanOS = unpaid.reduce((sum, s) => sum + (Number(s.dueAmt) - Number(s.collAmt)), 0);
        const c = loan.client;

        for (const s of future) {
          rows.push({
            branchCode: c.center.branch.code,
            centerCode: c.center.code,
            centerName: c.center.name,
            memberName: c.name,
            loanAccount: loan.loanAccount,
            dueAmount: s.dueAmt,
            collAmount: s.collAmt,
            toBeCollected: round2(Number(s.dueAmt) - Number(s.collAmt)),
            dueDate: s.dueDate,
            paidDate: s.collDate,
            status: Number(s.collAmt) >= Number(s.dueAmt) ? 'PAID' : 'PENDING',
            arrear: round2(arrear),
            loanOS: round2(loanOS),
            meetingDay: c.center.meetingDay,
          });
        }
      }
      return rows;
    });
  }

  // ---- Portfolio summary reports (disbursement/collection within [from, to],
  //      outstanding/arrear as of the window's end date) ----------------------

  private async portfolioLoans(tx: Prisma.TransactionClient, user: AuthUser) {
    return tx.loan.findMany({
      where: { client: { center: centerScope(user) } },
      select: {
        loanType: true,
        loanAmount: true,
        loanAccount: true,
        disbursalDate: true,
        totalDues: true,
        schedule: {
          select: { dueDate: true, dueAmt: true, duePri: true, dueInt: true, collAmt: true },
        },
        client: {
          select: {
            id: true,
            name: true,
            clientCode: true,
            memberNo: true,
            group: { select: { id: true, groupNo: true } },
            center: {
              select: {
                id: true,
                code: true,
                name: true,
                branchId: true,
                branch: { select: { id: true, code: true, name: true, workingDate: true } },
                fdo: { select: { id: true, code: true, name: true } },
              },
            },
          },
        },
      },
    });
  }

  /** Branch-wise portfolio (mainly useful for HO; BM sees their one branch). */
  async branchWise(user: AuthUser, from: Date, to: Date) {
    return this.prisma.withTenant(user, async (tx) => {
      const branchWhere: Prisma.BranchWhereInput = user.role === 'BM' ? { id: user.branchId ?? undefined } : {};
      const [branches, centers, clients, allLoans] = await Promise.all([
        tx.branch.findMany({ where: branchWhere, orderBy: { code: 'asc' } }),
        tx.center.findMany({ where: centerScope(user), select: { id: true, branchId: true } }),
        tx.client.findMany({
          where: { isActive: true, center: centerScope(user) },
          select: { id: true, center: { select: { branchId: true } } },
        }),
        this.portfolioLoans(tx, user),
      ]);
      const loans = allLoans.filter((l) => l.disbursalDate <= to);

      return branches.map((b) => {
        const branchLoans = loans.filter((l) => l.client.center.branchId === b.id && l.loanType === 'OPEN');
        const agg = branchLoans.reduce(
          (acc, l) => {
            const m = loanMetricsWindow(l, from, to);
            acc.disbursed += m.disbursed;
            acc.outstanding += m.outstanding;
            acc.arrear += m.arrear;
            acc.collected += m.collected;
            return acc;
          },
          { disbursed: 0, outstanding: 0, arrear: 0, collected: 0 },
        );
        return {
          branchCode: b.code,
          branchName: b.name,
          centers: centers.filter((c) => c.branchId === b.id).length,
          clients: clients.filter((c) => c.center.branchId === b.id).length,
          openLoans: branchLoans.length,
          loanDisbursement: round2(agg.disbursed),
          portfolioOutstanding: round2(agg.outstanding),
          totalCollected: round2(agg.collected),
          arrear: round2(agg.arrear),
        };
      });
    });
  }

  /** Center-wise portfolio, scoped like everything else (FDO/BM/HO). */
  async centerWise(user: AuthUser, from: Date, to: Date) {
    return this.prisma.withTenant(user, async (tx) => {
      const [centers, allLoans] = await Promise.all([
        tx.center.findMany({
          where: centerScope(user),
          orderBy: { code: 'asc' },
          include: {
            branch: { select: { code: true, workingDate: true } },
            fdo: { select: { name: true } },
            _count: { select: { clients: true, groups: true } },
          },
        }),
        this.portfolioLoans(tx, user),
      ]);
      const loans = allLoans.filter((l) => l.disbursalDate <= to);

      return centers.map((center) => {
        const centerLoans = loans.filter((l) => l.client.center.id === center.id && l.loanType === 'OPEN');
        const agg = centerLoans.reduce(
          (acc, l) => {
            const m = loanMetricsWindow(l, from, to);
            acc.disbursed += m.disbursed;
            acc.outstanding += m.outstanding;
            acc.arrear += m.arrear;
            acc.collected += m.collected;
            return acc;
          },
          { disbursed: 0, outstanding: 0, arrear: 0, collected: 0 },
        );
        return {
          branchCode: center.branch.code,
          centerCode: center.code,
          centerName: center.name,
          fdoName: center.fdo?.name ?? null,
          groups: center._count.groups,
          clients: center._count.clients,
          openLoans: centerLoans.length,
          loanDisbursement: round2(agg.disbursed),
          portfolioOutstanding: round2(agg.outstanding),
          totalCollected: round2(agg.collected),
          arrear: round2(agg.arrear),
        };
      });
    });
  }

  /** Group-wise portfolio (JLG joint-liability unit — 5 members). */
  async groupWise(user: AuthUser, from: Date, to: Date) {
    return this.prisma.withTenant(user, async (tx) => {
      const [groups, allLoans] = await Promise.all([
        tx.groupUnit.findMany({
          where: { center: centerScope(user) },
          orderBy: [{ center: { code: 'asc' } }, { groupNo: 'asc' }],
          include: {
            center: { select: { code: true, name: true, branch: { select: { workingDate: true } } } },
            _count: { select: { clients: true } },
          },
        }),
        this.portfolioLoans(tx, user),
      ]);
      const loans = allLoans.filter((l) => l.disbursalDate <= to);

      return groups.map((group) => {
        const groupLoans = loans.filter((l) => l.client.group.id === group.id && l.loanType === 'OPEN');
        const agg = groupLoans.reduce(
          (acc, l) => {
            const m = loanMetricsWindow(l, from, to);
            acc.disbursed += m.disbursed;
            acc.outstanding += m.outstanding;
            acc.arrear += m.arrear;
            return acc;
          },
          { disbursed: 0, outstanding: 0, arrear: 0 },
        );
        return {
          centerCode: group.center.code,
          centerName: group.center.name,
          groupNo: group.groupNo,
          members: group._count.clients,
          openLoans: groupLoans.length,
          loanDisbursement: round2(agg.disbursed),
          portfolioOutstanding: round2(agg.outstanding),
          arrear: round2(agg.arrear),
        };
      });
    });
  }

  /** Client-wise loan book: one row per loan (disbursed on/before `to`), optionally filtered by search text. */
  async clientWise(user: AuthUser, from: Date, to: Date, q?: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const allLoans = await this.portfolioLoans(tx, user);
      const loans = allLoans.filter((l) => l.disbursalDate <= to);
      const needle = q?.trim().toLowerCase();

      return loans
        .filter((l) => {
          if (!needle) return true;
          return (
            l.client.name.toLowerCase().includes(needle) ||
            l.client.clientCode.toLowerCase().includes(needle) ||
            l.loanAccount.toLowerCase().includes(needle)
          );
        })
        .map((l) => {
          const m = loanMetricsWindow(l, from, to);
          const c = l.client;
          return {
            branchCode: c.center.branch.code,
            centerCode: c.center.code,
            centerName: c.center.name,
            displayId: `${stripLeadingZeros(c.center.branch.code)}.${stripLeadingZeros(c.center.code)}.${c.group.groupNo}.${c.memberNo}`,
            clientCode: c.clientCode,
            memberName: c.name,
            loanAccount: l.loanAccount,
            disbursalDate: l.disbursalDate,
            loanAmount: l.loanAmount,
            totalDues: l.totalDues,
            portfolioOutstanding: m.outstanding,
            arrear: m.arrear,
            collected: m.collected,
            loanType: l.loanType,
          };
        });
    });
  }

  /** Field-officer performance: portfolio managed + collection efficiency within [from, to]. */
  async employeePerformance(user: AuthUser, from: Date, to: Date) {
    return this.prisma.withTenant(user, async (tx) => {
      const fdoWhere: Prisma.EmployeeWhereInput = {
        role: 'FDO',
        ...(user.role === 'BM' && user.branchId ? { branchId: user.branchId } : {}),
      };
      const [fdos, allLoans] = await Promise.all([
        tx.employee.findMany({
          where: fdoWhere,
          orderBy: { name: 'asc' },
          include: {
            branch: { select: { code: true, workingDate: true } },
            managing: { select: { id: true } },
          },
        }),
        this.portfolioLoans(tx, user),
      ]);
      const loans = allLoans.filter((l) => l.disbursalDate <= to);

      return fdos.map((fdo) => {
        const managedCenterIds = new Set(fdo.managing.map((c) => c.id));
        const fdoLoans = loans.filter((l) => managedCenterIds.has(l.client.center.id));
        const openLoans = fdoLoans.filter((l) => l.loanType === 'OPEN');

        const agg = openLoans.reduce(
          (acc, l) => {
            const m = loanMetricsWindow(l, from, to);
            acc.disbursed += m.disbursed;
            acc.outstanding += m.outstanding;
            acc.arrear += m.arrear;
            return acc;
          },
          { disbursed: 0, outstanding: 0, arrear: 0 },
        );

        let demand = 0;
        let collected = 0;
        for (const l of fdoLoans) {
          for (const s of l.schedule) {
            if (s.dueDate < from || s.dueDate > to) continue;
            demand += Number(s.dueAmt);
            collected += Number(s.collAmt);
          }
        }

        const clientIds = new Set(fdoLoans.map((l) => l.client.id));
        return {
          fdoCode: fdo.code,
          fdoName: fdo.name,
          branchCode: fdo.branch?.code ?? null,
          centers: managedCenterIds.size,
          clients: clientIds.size,
          openLoans: openLoans.length,
          loanDisbursement: round2(agg.disbursed),
          portfolioOutstanding: round2(agg.outstanding),
          arrear: round2(agg.arrear),
          periodDemand: round2(demand),
          periodCollected: round2(collected),
          collectionEfficiency: demand > 0 ? round2((collected / demand) * 100) : null,
        };
      });
    });
  }

  /** Foreclosed loans closed within [from, to] — closure certificates. Amounts
   *  (principal, interest charged/waived, charge, payoff) come from the FORECLOSE
   *  audit entry written at closure. */
  async foreclosureReport(user: AuthUser, from: Date, to: Date) {
    return this.prisma.withTenant(user, async (tx) => {
      const loans = await tx.loan.findMany({
        where: { loanType: 'CLOSED', closedDate: { gte: from, lte: to }, client: { center: centerScope(user) } },
        orderBy: { closedDate: 'desc' },
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

      // Only loans that were actually foreclosed (have a FORECLOSE audit row).
      const audits = await tx.auditLog.findMany({
        where: { entity: 'Loan', action: 'FORECLOSE', entityId: { in: loans.map((l) => l.id) } },
      });
      const byLoan = new Map(audits.map((a) => [a.entityId, (a.after ?? {}) as Record<string, unknown>]));

      return loans
        .filter((l) => byLoan.has(l.id))
        .map((l) => {
          const a = byLoan.get(l.id)!;
          const c = l.client;
          const num = (k: string) => round2(Number(a[k] ?? 0));
          return {
            loanId: l.id,
            loanAccount: l.loanAccount,
            displayId: `${stripLeadingZeros(c.center.branch.code)}.${stripLeadingZeros(c.center.code)}.${c.group.groupNo}.${c.memberNo}`,
            memberName: c.name,
            centerCode: c.center.code,
            centerName: c.center.name,
            disbursalDate: l.disbursalDate,
            loanAmount: round2(Number(l.loanAmount)),
            closedDate: l.closedDate,
            principalPaid: num('principal'),
            interestCharged: num('interestCharged'),
            interestWaived: num('interestWaived'),
            foreclosureCharge: num('foreclosureCharge'),
            payoffTotal: num('payoffTotal'),
            policy: String(a['policy'] ?? ''),
          };
        });
    });
  }

  /** Loans disbursed within [from, to] — disbursement register. */
  async disbursementRegister(user: AuthUser, from: Date, to: Date) {
    return this.prisma.withTenant(user, async (tx) => {
      const loans = await tx.loan.findMany({
        where: { disbursalDate: { gte: from, lte: to }, client: { center: centerScope(user) } },
        orderBy: { disbursalDate: 'desc' },
        include: LOAN_INCLUDE,
      });
      return loans.map((l) => {
        const c = l.client;
        return {
          branchCode: c.center.branch.code,
          centerCode: c.center.code,
          centerName: c.center.name,
          displayId: `${stripLeadingZeros(c.center.branch.code)}.${stripLeadingZeros(c.center.code)}.${c.group.groupNo}.${c.memberNo}`,
          memberName: c.name,
          loanAccount: l.loanAccount,
          cycleNo: l.cycleNo,
          product: l.product.name,
          disbursalDate: l.disbursalDate,
          loanAmount: round2(Number(l.loanAmount)),
          interestAmount: round2(Number(l.interestAmount)),
          totalAmount: round2(Number(l.totalAmount)),
          totalDues: l.totalDues,
          fdoName: c.center.fdo?.name ?? null,
        };
      });
    });
  }

  /** Portfolio-at-risk: open loans overdue as of the window end (`to`), bucketed
   *  by how long the oldest unpaid installment has been overdue (1–7/8–30/31–90/90+). */
  async parAging(user: AuthUser, _from: Date, to: Date) {
    return this.prisma.withTenant(user, async (tx) => {
      const loans = await this.portfolioLoans(tx, user);
      const rows: unknown[] = [];
      for (const l of loans) {
        if (l.loanType !== 'OPEN') continue;
        const unpaid = l.schedule.filter((s) => Number(s.collAmt) < Number(s.dueAmt));
        const overdue = unpaid.filter((s) => s.dueDate <= to);
        if (overdue.length === 0) continue;

        const arrear = overdue.reduce((sum, s) => sum + (Number(s.dueAmt) - Number(s.collAmt)), 0);
        const loanOS = unpaid.reduce((sum, s) => sum + (Number(s.dueAmt) - Number(s.collAmt)), 0);
        const oldest = overdue.reduce((a, b) => (a.dueDate < b.dueDate ? a : b));
        const daysOverdue = Math.floor((to.getTime() - oldest.dueDate.getTime()) / 86_400_000);
        const bucket = daysOverdue <= 7 ? '1–7' : daysOverdue <= 30 ? '8–30' : daysOverdue <= 90 ? '31–90' : '90+';
        const c = l.client;
        rows.push({
          branchCode: c.center.branch.code,
          centerCode: c.center.code,
          centerName: c.center.name,
          displayId: `${stripLeadingZeros(c.center.branch.code)}.${stripLeadingZeros(c.center.code)}.${c.group.groupNo}.${c.memberNo}`,
          memberName: c.name,
          loanAccount: l.loanAccount,
          loanOS: round2(loanOS),
          overdue: round2(arrear),
          daysOverdue,
          bucket,
          fdoName: c.center.fdo?.name ?? null,
        });
      }
      (rows as { daysOverdue: number }[]).sort((a, b) => b.daysOverdue - a.daysOverdue);
      return rows;
    });
  }

  /** Day-book: every collection posting within [from, to], loan receipts and
   *  savings deposits/refunds interleaved, newest first. */
  async collectionRegister(user: AuthUser, from: Date, to: Date) {
    return this.prisma.withTenant(user, async (tx) => {
      const clientSel = {
        name: true,
        memberNo: true,
        group: { select: { groupNo: true } },
        center: { select: { code: true, name: true, branch: { select: { code: true } } } },
      } as const;

      const [collections, savings] = await Promise.all([
        tx.collection.findMany({
          where: { collectedOn: { gte: from, lte: to }, loan: { client: { center: centerScope(user) } } },
          include: { loan: { select: { loanAccount: true, client: { select: clientSel } } } },
        }),
        tx.savingsTxn.findMany({
          where: { collectedOn: { gte: from, lte: to }, client: { center: centerScope(user) } },
          include: { client: { select: clientSel } },
        }),
      ]);

      const disp = (c: { center: { code: string; name: string; branch: { code: string } }; group: { groupNo: number }; memberNo: number }) =>
        `${stripLeadingZeros(c.center.branch.code)}.${stripLeadingZeros(c.center.code)}.${c.group.groupNo}.${c.memberNo}`;

      const rows = [
        ...collections.map((col) => {
          const c = col.loan.client;
          return {
            date: col.collectedOn,
            centerCode: c.center.code,
            centerName: c.center.name,
            displayId: disp(c),
            memberName: c.name,
            loanAccount: col.loan.loanAccount,
            entryType: 'Loan',
            kind: col.kind,
            principal: round2(Number(col.pri)),
            interest: round2(Number(col.int)),
            amount: round2(Number(col.amount)),
          };
        }),
        ...savings.map((s) => {
          const c = s.client;
          return {
            date: s.collectedOn,
            centerCode: c.center.code,
            centerName: c.center.name,
            displayId: disp(c),
            memberName: c.name,
            loanAccount: '—',
            entryType: 'Savings',
            kind: s.kind,
            principal: 0,
            interest: 0,
            amount: round2(Number(s.amount)),
          };
        }),
      ];
      rows.sort((a, b) => b.date.getTime() - a.date.getTime());
      return rows;
    });
  }

  /** Normally-closed loans (fully repaid, not foreclosed) closed within [from, to]. */
  async closureReport(user: AuthUser, from: Date, to: Date) {
    return this.prisma.withTenant(user, async (tx) => {
      const loans = await tx.loan.findMany({
        where: { loanType: 'CLOSED', closedDate: { gte: from, lte: to }, client: { center: centerScope(user) } },
        orderBy: { closedDate: 'desc' },
        include: LOAN_INCLUDE,
      });
      if (loans.length === 0) return [];

      // Exclude foreclosed loans (they have a FORECLOSE audit) — this is normal closures.
      const audits = await tx.auditLog.findMany({
        where: { entity: 'Loan', action: 'FORECLOSE', entityId: { in: loans.map((l) => l.id) } },
        select: { entityId: true },
      });
      const foreclosed = new Set(audits.map((a) => a.entityId));

      return loans
        .filter((l) => !foreclosed.has(l.id))
        .map((l) => {
          const c = l.client;
          const totalRepaid = l.schedule.reduce((sum, s) => sum + Number(s.collAmt), 0);
          return {
            branchCode: c.center.branch.code,
            centerCode: c.center.code,
            centerName: c.center.name,
            displayId: `${stripLeadingZeros(c.center.branch.code)}.${stripLeadingZeros(c.center.code)}.${c.group.groupNo}.${c.memberNo}`,
            memberName: c.name,
            loanAccount: l.loanAccount,
            cycleNo: l.cycleNo,
            disbursalDate: l.disbursalDate,
            loanAmount: round2(Number(l.loanAmount)),
            totalAmount: round2(Number(l.totalAmount)),
            totalRepaid: round2(totalRepaid),
            closedDate: l.closedDate,
          };
        });
    });
  }

  /** Loan applications submitted within [from, to] across all in-scope branches
   *  & centers (BM: own branch, HO: whole tenant), with the disbursed loan a/c. */
  async loanApplicationsReport(user: AuthUser, from: Date, to: Date, status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    return this.prisma.withTenant(user, async (tx) => {
      const apps = await tx.loanApplication.findMany({
        where: {
          createdAt: { gte: from, lte: to },
          ...(status ? { status } : {}),
          client: { center: centerScope(user) },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          client: {
            select: {
              name: true,
              memberNo: true,
              group: { select: { groupNo: true } },
              center: { select: { code: true, name: true, branch: { select: { code: true } }, fdo: { select: { name: true } } } },
            },
          },
          product: { select: { name: true } },
          purpose: { select: { name: true } },
          loan: { select: { loanAccount: true } },
        },
      });
      return apps.map((a) => {
        const c = a.client;
        return {
          appNo: a.appNo,
          branchCode: c.center.branch.code,
          centerCode: c.center.code,
          centerName: c.center.name,
          displayId: `${stripLeadingZeros(c.center.branch.code)}.${stripLeadingZeros(c.center.code)}.${c.group.groupNo}.${c.memberNo}`,
          memberName: c.name,
          loanAccount: a.loan?.loanAccount ?? null,
          product: a.product.name,
          purpose: a.purpose.name,
          requestedAmount: round2(Number(a.requestedAmount)),
          status: a.status,
          appliedDate: a.createdAt,
          fdoName: c.center.fdo?.name ?? null,
        };
      });
    });
  }

}
