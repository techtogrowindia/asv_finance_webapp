import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/types/auth-user';
import { centerScope, clientCenterScope } from '../common/scope';
import { stripLeadingZeros } from '../common/format.util';
import { round2 } from '../loans/schedule.util';
import { PostCollectionDto } from './dto/post-collection.dto';
import { BulkImportCollectionDto } from './dto/bulk-import-collection.dto';
import { RequestCorrectionDto } from './dto/request-correction.dto';
import { ApproveCorrectionDto } from './dto/review-correction.dto';

type ScheduleRow = {
  id: string;
  dueNo: number;
  dueDate: Date;
  duePri: Prisma.Decimal;
  dueInt: Prisma.Decimal;
  dueAmt: Prisma.Decimal;
  collPri: Prisma.Decimal;
  collInt: Prisma.Decimal;
  collAmt: Prisma.Decimal;
};

@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Per-member collectable amount for one center, as of a date (defaults to
   *  working date). `includeAll` keeps every open loan even if nothing is
   *  due today (totalDue 0), instead of just "who owes right now". */
  async due(user: AuthUser, centerId: string, date?: string, includeAll = false) {
    return this.prisma.withTenant(user, async (tx) => {
      const center = await tx.center.findFirst({
        where: { id: centerId, ...centerScope(user) },
        include: { branch: { select: { code: true } } },
      });
      if (!center) throw new ForbiddenException('Center not assigned to you');

      const asOf = date ? new Date(date) : await this.resolveWorkingDate(tx, center.branchId);

      const clients = await tx.client.findMany({
        where: { centerId, isActive: true },
        orderBy: [{ group: { groupNo: 'asc' } }, { memberNo: 'asc' }],
        include: {
          group: { select: { groupNo: true } },
          loans: {
            where: { loanType: 'OPEN' },
            include: { schedule: { orderBy: { dueNo: 'asc' } } },
          },
        },
      });

      return clients.flatMap((c) =>
        c.loans
          .map((loan) => {
            // Demand is only installments due on/before the as-of date.
            const dueSoFar = loan.schedule.filter((s) => s.dueDate <= asOf);
            const unpaid = dueSoFar.filter((s) => Number(s.collAmt) < Number(s.dueAmt));
            const totalDue = unpaid.reduce((sum, s) => sum + (Number(s.dueAmt) - Number(s.collAmt)), 0);
            if (totalDue <= 0 && !includeAll) return null;
            // Split the demand into overdue (before today) vs the current period's
            // instalment (due exactly as of today) for the field-collection view.
            const arrear = unpaid
              .filter((s) => s.dueDate < asOf)
              .reduce((sum, s) => sum + (Number(s.dueAmt) - Number(s.collAmt)), 0);
            // Dates spanning the whole schedule, for the field-collection view.
            const lastPaid = [...loan.schedule].reverse().find((s) => Number(s.collAmt) > 0 && s.collDate);
            const nextDue = loan.schedule.find((s) => Number(s.collAmt) < Number(s.dueAmt));
            return {
              clientId: c.id,
              clientName: c.name,
              displayId: `${stripLeadingZeros(center.branch.code)}.${stripLeadingZeros(center.code)}.${c.group.groupNo}.${c.memberNo}`,
              groupNo: c.group.groupNo,
              loanId: loan.id,
              loanAccount: loan.loanAccount,
              dueCount: unpaid.length,
              totalDue: round2(totalDue),
              arrear: round2(arrear),
              currentDue: round2(totalDue - arrear),
              advanceBalance: round2(Number(loan.advanceBalance)),
              disbursalDate: loan.disbursalDate,
              totalDues: loan.totalDues,
              lastPaidDate: lastPaid?.collDate ?? null,
              nextDueDate: nextDue?.dueDate ?? null,
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

  /** Center-level cash summary for Demand / Arrear Collection screens. */
  async centerSummary(user: AuthUser, centerId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const center = await this.getScopedCenter(tx, user, centerId);
      const workingDate = await this.resolveWorkingDate(tx, center.branchId);

      const loans = await tx.loan.findMany({
        where: { loanType: 'OPEN', client: { centerId } },
        include: { schedule: true },
      });

      let loanOutstanding = 0;
      let openingArrears = 0;
      let demand = 0;
      let collectedToday = 0;
      const memberIds = new Set<string>();

      for (const loan of loans) {
        const unpaid = loan.schedule.filter((s) => Number(s.collAmt) < Number(s.dueAmt));
        loanOutstanding += unpaid.reduce((sum, s) => sum + (Number(s.duePri) + Number(s.dueInt)), 0);
        const overdue = unpaid.filter((s) => s.dueDate <= workingDate);
        const arrear = overdue.reduce((sum, s) => sum + (Number(s.dueAmt) - Number(s.collAmt)), 0);
        openingArrears += arrear;
        demand += arrear; // demand today = everything due up to and including today
        if (arrear > 0) memberIds.add(loan.clientId);
      }

      const receipts = await tx.collection.aggregate({
        where: { collectedOn: workingDate, loan: { client: { centerId } } },
        _sum: { amount: true },
      });
      collectedToday = Number(receipts._sum.amount ?? 0);

      return {
        centerId: center.id,
        centerCode: center.code,
        centerName: center.name,
        workingDate,
        memberCount: memberIds.size,
        loanOutstanding: round2(loanOutstanding),
        openingArrears: round2(openingArrears),
        demand: round2(demand),
        collectedToday: round2(collectedToday),
        closingArrears: round2(Math.max(0, openingArrears - collectedToday)),
      };
    });
  }

  /** Members of a center with an overdue balance (Arrear Collection list). */
  async arrears(user: AuthUser, centerId: string) {
    // Reuse due() — "due as of working date" is exactly the arrears (nothing future).
    return this.due(user, centerId);
  }

  /** The most recent money-in collections for a center (optionally one group) —
   *  the "Last N Collections" panel on the collection screens. */
  async recentCollections(user: AuthUser, centerId: string, groupNo?: number, limit = 10) {
    return this.prisma.withTenant(user, async (tx) => {
      const center = await this.getScopedCenter(tx, user, centerId);
      const rows = await tx.collection.findMany({
        where: {
          amount: { gt: 0 },
          loan: { client: { centerId, ...(groupNo ? { group: { groupNo } } : {}) } },
        },
        orderBy: [{ collectedOn: 'desc' }, { createdAt: 'desc' }],
        take: Math.min(Math.max(1, limit), 50),
        include: {
          loan: {
            select: {
              loanAccount: true,
              client: {
                select: {
                  name: true, memberNo: true,
                  group: { select: { groupNo: true } },
                  center: { select: { code: true, branch: { select: { code: true } } } },
                },
              },
            },
          },
        },
      });
      return rows.map((r) => {
        const cl = r.loan.client;
        return {
          id: r.id,
          loanId: r.loanId,
          collectedOn: r.collectedOn,
          clientName: cl.name,
          displayId: `${stripLeadingZeros(cl.center.branch.code)}.${stripLeadingZeros(cl.center.code)}.${cl.group.groupNo}.${cl.memberNo}`,
          loanAccount: r.loan.loanAccount,
          amount: round2(Number(r.amount)),
          kind: r.kind,
        };
      });
    });
  }

  /** Bulk "everyone paid their demand" for a center — posts each member's current due. */
  async bulkCollectDemand(user: AuthUser, centerId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const center = await this.getScopedCenter(tx, user, centerId);
      const workingDate = await this.resolveWorkingDate(tx, center.branchId);

      const loans = await tx.loan.findMany({
        where: { loanType: 'OPEN', client: { centerId } },
      });

      let loansCollected = 0;
      let totalCollected = 0;
      let totalSavings = 0;
      let totalSavingsRefunded = 0;
      for (const loan of loans) {
        const rows = await this.pendingRows(tx, loan.id, workingDate);
        const demand = rows.reduce((sum, s) => sum + (Number(s.dueAmt) - Number(s.collAmt)), 0);
        if (demand <= 0) continue;
        const { applied, savingsCollected, savingsRefunded } = await this.applyFifo(
          tx, user, loan.id, loan.clientId, round2(demand), 'REGULAR', workingDate, true,
        );
        if (applied > 0) {
          loansCollected += 1;
          totalCollected += applied;
          totalSavings += savingsCollected;
          totalSavingsRefunded += savingsRefunded;
        }
      }

      await this.audit.record(tx, {
        tenantId: user.tenantId,
        entity: 'Center',
        entityId: centerId,
        action: 'BULK_COLLECT',
        employeeId: user.employeeId,
        after: {
          loansCollected, totalCollected: round2(totalCollected), totalSavings: round2(totalSavings),
          totalSavingsRefunded: round2(totalSavingsRefunded), eodDate: workingDate,
        },
      });

      return {
        loansCollected, totalCollected: round2(totalCollected), totalSavings: round2(totalSavings),
        totalSavingsRefunded: round2(totalSavingsRefunded),
      };
    });
  }

  /**
   * Bulk-post a center's collections from an uploaded Excel sheet, matched by
   * loan account. Each row is applied independently (same FIFO/advance/savings
   * logic as `post()`) so one bad row doesn't block the rest — failures are
   * reported back per row instead of aborting the whole import.
   */
  async bulkImport(user: AuthUser, dto: BulkImportCollectionDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const center = await this.getScopedCenter(tx, user, dto.centerId);
      const workingDate = await this.resolveWorkingDate(tx, center.branchId);

      const results: {
        loanAccount: string;
        clientName: string | null;
        status: 'OK' | 'ERROR';
        message: string | null;
        applied: number;
        advanceBanked: number;
        savingsCollected: number;
        loanClosed: boolean;
      }[] = [];

      let totalCollected = 0;
      let totalSavings = 0;
      let successCount = 0;

      for (const row of dto.rows) {
        const loanAccount = row.loanAccount.trim();
        try {
          const loan = await tx.loan.findFirst({
            where: { loanAccount, client: { centerId: dto.centerId } },
            include: { client: { select: { id: true, name: true } } },
          });
          if (!loan) throw new NotFoundException(`Loan account ${loanAccount} not found in this center`);
          if (loan.loanType !== 'OPEN') throw new BadRequestException(`${loanAccount} is already closed`);

          const { applied, remaining, loanClosed, savingsCollected } = await this.applyFifo(
            tx, user, loan.id, loan.clientId, round2(row.amount), 'REGULAR', workingDate, true, row.savings,
          );

          let advanceBanked = 0;
          if (remaining > 0 && !loanClosed) {
            advanceBanked = remaining;
            await tx.loan.update({ where: { id: loan.id }, data: { advanceBalance: { increment: advanceBanked } } });
          }

          totalCollected = round2(totalCollected + applied);
          totalSavings = round2(totalSavings + savingsCollected);
          successCount += 1;

          results.push({
            loanAccount, clientName: loan.client.name, status: 'OK', message: null,
            applied, advanceBanked, savingsCollected, loanClosed,
          });
        } catch (e) {
          results.push({
            loanAccount, clientName: null, status: 'ERROR',
            message: e instanceof Error ? e.message : 'Failed to post this row',
            applied: 0, advanceBanked: 0, savingsCollected: 0, loanClosed: false,
          });
        }
      }

      await this.audit.record(tx, {
        tenantId: user.tenantId,
        entity: 'Center',
        entityId: dto.centerId,
        action: 'BULK_IMPORT_COLLECT',
        employeeId: user.employeeId,
        after: {
          rows: dto.rows.length, successCount, totalCollected: round2(totalCollected),
          totalSavings: round2(totalSavings), eodDate: workingDate,
        },
      });

      return {
        successCount,
        failCount: dto.rows.length - successCount,
        totalCollected: round2(totalCollected),
        totalSavings: round2(totalSavings),
        results,
      };
    });
  }

  /**
   * Post a collection against a member's open loan. Applies FIFO across the
   * oldest unpaid installments; any surplus beyond what's owed is banked on
   * loan.advanceBalance (apply it later via applyAdvance).
   */
  async post(user: AuthUser, dto: PostCollectionDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const loan = await this.getScopedOpenLoan(tx, user, dto.loanId);
      const workingDate = await this.resolveWorkingDate(tx, loan.client.center.branchId);

      // A regular collection settles only what's due up to today; anything more
      // is banked as advance (apply it later on the Loan Advance screen).
      const { applied, remaining, loanClosed, savingsCollected, savingsRefunded } = await this.applyFifo(
        tx,
        user,
        loan.id,
        loan.clientId,
        round2(dto.amount),
        'REGULAR',
        workingDate,
        true,
        dto.savings,
      );

      let advanceBanked = 0;
      if (remaining > 0 && !loanClosed) {
        advanceBanked = remaining;
        await tx.loan.update({
          where: { id: loan.id },
          data: { advanceBalance: { increment: advanceBanked } },
        });
      }

      await this.audit.record(tx, {
        tenantId: user.tenantId,
        entity: 'Collection',
        entityId: loan.id,
        action: 'COLLECT',
        employeeId: user.employeeId,
        after: { amount: round2(dto.amount), applied, advanceBanked, savingsCollected, savingsRefunded, loanClosed },
      });

      return { applied, advanceBanked, unallocated: advanceBanked, savingsCollected, savingsRefunded, loanClosed };
    });
  }

  /** Loans (in scope) that carry an unapplied advance balance. */
  async advanceLoans(user: AuthUser, branchId?: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const loans = await tx.loan.findMany({
        where: { loanType: 'OPEN', advanceBalance: { gt: 0 }, client: clientCenterScope(user, branchId) },
        include: {
          client: {
            select: {
              name: true,
              memberNo: true,
              group: { select: { groupNo: true } },
              center: { select: { code: true, name: true, branch: { select: { code: true, name: true } } } },
            },
          },
        },
        orderBy: { loanAccount: 'asc' },
      });
      return loans.map((l) => ({
        loanId: l.id,
        loanAccount: l.loanAccount,
        clientName: l.client.name,
        displayId: `${stripLeadingZeros(l.client.center.branch.code)}.${stripLeadingZeros(l.client.center.code)}.${l.client.group.groupNo}.${l.client.memberNo}`,
        branchCode: l.client.center.branch.code,
        branchName: l.client.center.branch.name,
        centerName: `${l.client.center.code} — ${l.client.center.name}`,
        advanceBalance: round2(Number(l.advanceBalance)),
      }));
    });
  }

  /** Spend a loan's banked advance FIFO across its upcoming installments. */
  async applyAdvance(user: AuthUser, loanId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const loan = await this.getScopedOpenLoan(tx, user, loanId);
      const advance = round2(Number(loan.advanceBalance));
      if (advance <= 0) throw new BadRequestException('No advance balance to apply');

      const workingDate = await this.resolveWorkingDate(tx, loan.client.center.branchId);
      // Advance is spent across ALL upcoming installments (not just today's demand).
      const { applied, remaining, loanClosed, savingsRefunded } = await this.applyFifo(
        tx, user, loan.id, loan.clientId, advance, 'ADVANCE', workingDate, false,
      );

      await tx.loan.update({ where: { id: loan.id }, data: { advanceBalance: remaining } });

      await this.audit.record(tx, {
        tenantId: user.tenantId,
        entity: 'Loan',
        entityId: loan.id,
        action: 'APPLY_ADVANCE',
        employeeId: user.employeeId,
        after: { applied, advanceRemaining: remaining, loanClosed, savingsRefunded },
      });

      return { applied, advanceRemaining: remaining, loanClosed, savingsRefunded };
    });
  }

  /** What a borrower would owe to foreclose this loan today, per the tenant policy. */
  async foreclosureQuote(user: AuthUser, loanId: string, waiveInterest?: number) {
    return this.prisma.withTenant(user, async (tx) => {
      const loan = await this.getScopedOpenLoan(tx, user, loanId);
      const workingDate = await this.resolveWorkingDate(tx, loan.client.center.branchId);
      const cfg = await this.foreclosureConfig(tx, user.tenantId);
      const rows = await this.pendingRows(tx, loan.id, undefined);
      const canWaive = user.permissions.includes('collection.waive');
      const q = this.computeForeclosure(rows, cfg.policy, workingDate, {
        chargePercent: cfg.chargePercent,
        chargeFlat: cfg.chargeFlat,
        manualWaiveInt: canWaive ? waiveInterest : 0,
      });
      return {
        loanId: loan.id,
        loanAccount: loan.loanAccount,
        policy: cfg.policy,
        remainingPrincipal: q.principal,
        interestCharged: q.interest,
        interestWaived: q.waived,
        manualWaived: q.manualWaived,
        foreclosureCharge: q.charge,
        chargePercent: cfg.chargePercent,
        chargeFlat: cfg.chargeFlat,
        canWaive,
        payoffTotal: q.total,
        advanceBalance: round2(Number(loan.advanceBalance)),
        savingsToRefund: await this.loanSavingsBalance(tx, loan.id),
      };
    });
  }

  /** Foreclose (early-close) a loan: settle per policy + charge, mark CLOSED. */
  async foreclose(user: AuthUser, loanId: string, waiveInterest?: number) {
    const requestedWaive = round2(Math.max(0, waiveInterest ?? 0));
    if (requestedWaive > 0 && !user.permissions.includes('collection.waive')) {
      throw new ForbiddenException('You do not have permission to waive interest on foreclosure');
    }
    return this.prisma.withTenant(user, async (tx) => {
      const loan = await this.getScopedOpenLoan(tx, user, loanId);
      const workingDate = await this.resolveWorkingDate(tx, loan.client.center.branchId);
      const cfg = await this.foreclosureConfig(tx, user.tenantId);
      const rows = await this.pendingRows(tx, loan.id, undefined);
      const q = this.computeForeclosure(rows, cfg.policy, workingDate, {
        chargePercent: cfg.chargePercent,
        chargeFlat: cfg.chargeFlat,
        manualWaiveInt: requestedWaive,
      });

      for (const line of q.lines) {
        if (line.pay <= 0 && line.newDueBalance === Number(line.row.dueAmt) - Number(line.row.collAmt)) continue;
        if (line.pay > 0) {
          await tx.collection.create({
            data: {
              tenantId: user.tenantId,
              loanId: loan.id,
              scheduleId: line.row.id,
              collectedOn: workingDate,
              amount: line.pay,
              pri: line.payPri,
              int: line.payInt,
              kind: 'FORECLOSURE',
              enteredBy: user.employeeId,
            },
          });
        }
        await tx.repaymentSchedule.update({
          where: { id: line.row.id },
          data: {
            collPri: round2(Number(line.row.collPri) + line.payPri),
            collInt: round2(Number(line.row.collInt) + line.payInt),
            collAmt: round2(Number(line.row.collAmt) + line.pay),
            collDate: workingDate,
            dueBalance: line.newDueBalance, // 0 — nothing more owed after foreclosure
          },
        });
      }

      // Foreclosure charge — a loan-level receipt, not tied to any installment.
      if (q.charge > 0) {
        await tx.collection.create({
          data: {
            tenantId: user.tenantId,
            loanId: loan.id,
            scheduleId: null,
            collectedOn: workingDate,
            amount: q.charge,
            pri: 0,
            int: 0,
            kind: 'FORECLOSURE_CHARGE',
            enteredBy: user.employeeId,
          },
        });
      }

      await tx.loan.update({
        where: { id: loan.id },
        data: { loanType: 'CLOSED', closedDate: workingDate },
      });

      // Savings is NOT auto-refunded on foreclosure any more — it's handled
      // separately via the savings refund workflow (initiate → approve → settle).
      const savingsRefunded = 0;

      await this.audit.record(tx, {
        tenantId: user.tenantId,
        entity: 'Loan',
        entityId: loan.id,
        action: 'FORECLOSE',
        employeeId: user.employeeId,
        after: {
          policy: cfg.policy,
          principal: q.principal,
          interestCharged: q.interest,
          interestWaived: q.waived,
          policyWaived: q.policyWaived,
          manualWaived: q.manualWaived,
          foreclosureCharge: q.charge,
          payoffTotal: q.total,
          savingsRefunded,
          eodDate: workingDate,
        },
      });

      return {
        loanId: loan.id,
        closed: true,
        payoffTotal: q.total,
        interestWaived: q.waived,
        manualWaived: q.manualWaived,
        foreclosureCharge: q.charge,
        savingsRefunded,
      };
    });
  }

  /** Clients holding a savings balance (Savings report + refund list). */
  async savingsBalances(user: AuthUser, branchId?: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const clients = await tx.client.findMany({
        where: { savingsBalance: { gt: 0 }, ...clientCenterScope(user, branchId) },
        orderBy: [{ center: { code: 'asc' } }, { name: 'asc' }],
        include: {
          group: { select: { groupNo: true } },
          center: { select: { code: true, name: true, branch: { select: { code: true, name: true } } } },
          loans: {
            where: { loanType: 'OPEN' },
            select: { id: true, loanAccount: true, disbursalDate: true, totalDues: true },
          },
        },
      });
      return clients.map((c) => {
        const openLoan = c.loans[0];
        return {
          clientId: c.id,
          clientName: c.name,
          displayId: `${stripLeadingZeros(c.center.branch.code)}.${stripLeadingZeros(c.center.code)}.${c.group.groupNo}.${c.memberNo}`,
          branchCode: c.center.branch.code,
          branchName: c.center.branch.name,
          centerName: `${c.center.code} — ${c.center.name}`,
          savingsBalance: round2(Number(c.savingsBalance)),
          hasOpenLoan: c.loans.length > 0,
          loanAccount: openLoan?.loanAccount ?? null,
          disbursalDate: openLoan?.disbursalDate ?? null,
          totalDues: openLoan?.totalDues ?? null,
        };
      });
    });
  }

  // ---- Savings refund workflow (FDO initiate → BM/HO approve → FDO settle) ----

  /** Per-loan savings sub-accounts that still hold a balance or have a refund in
   *  progress — the working list for the whole refund workflow (all roles). */
  async savingsRefundList(user: AuthUser, branchId?: string) {
    return this.prisma.withTenant(user, async (tx) => {
      // Loans whose savings could be refunded: closed loans (savings held past
      // closure now that it's no longer auto-refunded), plus any loan that
      // already has an in-progress request.
      const requests = await tx.savingsRefundRequest.findMany({
        where: { status: { in: ['INITIATED', 'APPROVED'] }, loan: { client: clientCenterScope(user, branchId) } },
      });
      const reqByLoan = new Map(requests.map((r) => [r.loanId, r]));

      const loans = await tx.loan.findMany({
        where: {
          client: clientCenterScope(user, branchId),
          OR: [{ loanType: 'CLOSED' }, { id: { in: [...reqByLoan.keys()] } }],
        },
        include: {
          client: {
            select: {
              name: true, savingsAccount: true, memberNo: true,
              group: { select: { groupNo: true } },
              center: { select: { code: true, name: true, branch: { select: { code: true, name: true } } } },
            },
          },
        },
        orderBy: { closedDate: 'desc' },
      });

      const empIds = [...new Set(requests.flatMap((r) => [r.initiatedBy, r.approvedBy]).filter((x): x is string => !!x))];
      const emps = empIds.length ? await tx.employee.findMany({ where: { id: { in: empIds } }, select: { id: true, name: true } }) : [];
      const empName = new Map(emps.map((e) => [e.id, e.name]));

      const rows = await Promise.all(
        loans.map(async (l) => {
          const balance = await this.loanSavingsBalance(tx, l.id);
          const req = reqByLoan.get(l.id);
          const c = l.client;
          return {
            loanId: l.id,
            loanAccount: l.loanAccount,
            savingsAccount: `${c.savingsAccount}_${l.loanAccount}`,
            clientName: c.name,
            displayId: `${stripLeadingZeros(c.center.branch.code)}.${stripLeadingZeros(c.center.code)}.${c.group.groupNo}.${c.memberNo}`,
            branchCode: c.center.branch.code,
            branchName: c.center.branch.name,
            centerName: `${c.center.code} — ${c.center.name}`,
            loanType: l.loanType,
            balance,
            requestId: req?.id ?? null,
            requestStatus: req?.status ?? null,
            requestAmount: req ? round2(Number(req.amount)) : null,
            initiatedByName: req ? empName.get(req.initiatedBy) ?? null : null,
            approvedByName: req?.approvedBy ? empName.get(req.approvedBy) ?? null : null,
          };
        }),
      );
      // Only rows that need attention: a live balance to refund, or a request in flight.
      return rows.filter((r) => r.balance > 0 || r.requestId);
    });
  }

  /** FDO asks to refund a loan's savings sub-account. Snapshots the balance. */
  async initiateSavingsRefund(user: AuthUser, loanId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const loan = await tx.loan.findFirst({
        where: { id: loanId, client: clientCenterScope(user) },
        include: { client: { select: { id: true, name: true } } },
      });
      if (!loan) throw new NotFoundException('Loan not found');

      const active = await tx.savingsRefundRequest.findFirst({
        where: { loanId, status: { in: ['INITIATED', 'APPROVED'] } },
      });
      if (active) throw new ConflictException('A savings refund is already in progress for this account.');

      const balance = await this.loanSavingsBalance(tx, loanId);
      if (balance <= 0) throw new BadRequestException('No savings balance to refund on this account.');

      const created = await tx.savingsRefundRequest.create({
        data: {
          tenantId: user.tenantId,
          loanId,
          clientId: loan.clientId,
          amount: balance,
          status: 'INITIATED',
          initiatedBy: user.employeeId,
        },
      });
      await this.audit.record(tx, {
        tenantId: user.tenantId,
        entity: 'SavingsRefundRequest',
        entityId: created.id,
        action: 'SAVINGS_REFUND_INITIATE',
        employeeId: user.employeeId,
        after: { loanId, amount: balance },
      });
      return { id: created.id, status: created.status, amount: balance };
    });
  }

  /** BM/HO approves a savings refund (must be someone other than the initiator). */
  async approveSavingsRefund(user: AuthUser, id: string, notes?: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const req = await tx.savingsRefundRequest.findFirst({ where: { id, loan: { client: clientCenterScope(user) } } });
      if (!req) throw new NotFoundException('Refund request not found');
      if (req.status !== 'INITIATED') throw new BadRequestException('This refund has already been reviewed.');
      if (req.initiatedBy === user.employeeId) {
        throw new ForbiddenException('You cannot approve your own refund request — ask another approver.');
      }
      await tx.savingsRefundRequest.update({
        where: { id },
        data: { status: 'APPROVED', approvedBy: user.employeeId, approvedAt: new Date(), notes: notes ?? null },
      });
      await this.audit.record(tx, {
        tenantId: user.tenantId, entity: 'SavingsRefundRequest', entityId: id,
        action: 'SAVINGS_REFUND_APPROVE', employeeId: user.employeeId, after: { notes: notes ?? null },
      });
      return { id, status: 'APPROVED' };
    });
  }

  /** BM/HO rejects a savings refund request — no money moves. */
  async rejectSavingsRefund(user: AuthUser, id: string, notes?: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const req = await tx.savingsRefundRequest.findFirst({ where: { id, loan: { client: clientCenterScope(user) } } });
      if (!req) throw new NotFoundException('Refund request not found');
      if (req.status !== 'INITIATED') throw new BadRequestException('This refund has already been reviewed.');
      await tx.savingsRefundRequest.update({
        where: { id },
        data: { status: 'REJECTED', approvedBy: user.employeeId, approvedAt: new Date(), notes: notes ?? null },
      });
      await this.audit.record(tx, {
        tenantId: user.tenantId, entity: 'SavingsRefundRequest', entityId: id,
        action: 'SAVINGS_REFUND_REJECT', employeeId: user.employeeId, after: { notes: notes ?? null },
      });
      return { id, status: 'REJECTED' };
    });
  }

  /** FDO settles an approved refund — this is when the money actually moves:
   *  a REFUND SavingsTxn is written for the account's current balance. */
  async settleSavingsRefund(user: AuthUser, id: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const req = await tx.savingsRefundRequest.findFirst({
        where: { id, loan: { client: clientCenterScope(user) } },
        include: { loan: { select: { clientId: true, client: { select: { center: { select: { branchId: true } } } } } } },
      });
      if (!req) throw new NotFoundException('Refund request not found');
      if (req.status !== 'APPROVED') throw new BadRequestException('This refund is not approved yet.');

      const workingDate = await this.resolveWorkingDate(tx, req.loan.client.center.branchId);
      const balance = await this.loanSavingsBalance(tx, req.loanId);
      const refund = round2(Math.min(Number(req.amount), balance));

      if (refund > 0) {
        await tx.savingsTxn.create({
          data: {
            tenantId: user.tenantId,
            clientId: req.loan.clientId,
            loanId: req.loanId,
            amount: refund,
            kind: 'REFUND',
            collectedOn: workingDate,
            enteredBy: user.employeeId,
          },
        });
        await tx.client.update({ where: { id: req.loan.clientId }, data: { savingsBalance: { decrement: refund } } });
      }
      await tx.savingsRefundRequest.update({
        where: { id },
        data: { status: 'SETTLED', settledBy: user.employeeId, settledAt: new Date() },
      });
      await this.audit.record(tx, {
        tenantId: user.tenantId, entity: 'SavingsRefundRequest', entityId: id,
        action: 'SAVINGS_REFUND_SETTLE', employeeId: user.employeeId, after: { refunded: refund, eodDate: workingDate },
      });
      return { id, status: 'SETTLED', refunded: refund };
    });
  }

  // ---- internals -----------------------------------------------------------

  /** Net savings tied to one loan: deposits collected against it, minus any
   *  refund already made, plus any signed correction-reversal adjustments. */
  private async loanSavingsBalance(tx: Prisma.TransactionClient, loanId: string): Promise<number> {
    const [deposits, refunds, corrections] = await Promise.all([
      tx.savingsTxn.aggregate({ where: { loanId, kind: 'DEPOSIT' }, _sum: { amount: true } }),
      tx.savingsTxn.aggregate({ where: { loanId, kind: 'REFUND' }, _sum: { amount: true } }),
      tx.savingsTxn.aggregate({ where: { loanId, kind: 'CORRECTION_REVERSAL' }, _sum: { amount: true } }),
    ]);
    return round2(
      Number(deposits._sum.amount ?? 0) - Number(refunds._sum.amount ?? 0) + Number(corrections._sum.amount ?? 0),
    );
  }

  /** Bank a savings deposit for one collection event; returns the amount
   *  deposited. Uses `override` when the field officer set a specific amount
   *  (including 0 to skip it), otherwise the tenant's fixed default. */
  private async depositSavings(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    loanId: string,
    clientId: string,
    workingDate: Date,
    override?: number,
  ): Promise<number> {
    let amount: number;
    if (override !== undefined) {
      amount = round2(Math.max(0, override));
    } else {
      const tenant = await tx.tenant.findFirst({
        where: { id: user.tenantId },
        select: { savingsPerCollection: true },
      });
      amount = round2(Number(tenant?.savingsPerCollection ?? 0));
    }
    if (amount <= 0) return 0;
    await tx.savingsTxn.create({
      data: {
        tenantId: user.tenantId,
        clientId,
        loanId,
        amount,
        kind: 'DEPOSIT',
        collectedOn: workingDate,
        enteredBy: user.employeeId,
      },
    });
    await tx.client.update({ where: { id: clientId }, data: { savingsBalance: { increment: amount } } });
    return amount;
  }

  /**
   * FIFO-apply `amount` across the loan's unpaid rows, oldest first; closes the
   * loan if everything is cleared. When `onlyDue`, only installments due on or
   * before the working date are eligible (a regular collection settles today's
   * demand; surplus is returned for the caller to bank as advance). When false,
   * any pending installment can be paid (used when applying a banked advance).
   */
  private async applyFifo(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    loanId: string,
    clientId: string,
    amount: number,
    kind: 'REGULAR' | 'ADVANCE',
    workingDate: Date,
    onlyDue: boolean,
    savingsOverride?: number,
  ): Promise<{ applied: number; remaining: number; loanClosed: boolean; savingsCollected: number; savingsRefunded: number }> {
    const pending = await this.pendingRows(tx, loanId, onlyDue ? workingDate : undefined);
    let remaining = round2(amount);

    for (const row of pending) {
      if (remaining <= 0) break;
      const rowRemaining = round2(Number(row.dueAmt) - Number(row.collAmt));
      const pay = Math.min(remaining, rowRemaining);
      const remPri = round2(Number(row.duePri) - Number(row.collPri));
      const rowRemainingForSplit = rowRemaining;
      const payPri = rowRemainingForSplit > 0 ? round2((pay * remPri) / rowRemainingForSplit) : 0;
      const payInt = round2(pay - payPri);

      await tx.collection.create({
        data: {
          tenantId: user.tenantId,
          loanId,
          scheduleId: row.id,
          collectedOn: workingDate,
          amount: pay,
          pri: payPri,
          int: payInt,
          kind,
          enteredBy: user.employeeId,
        },
      });

      const newCollAmt = round2(Number(row.collAmt) + pay);
      await tx.repaymentSchedule.update({
        where: { id: row.id },
        data: {
          collAmt: newCollAmt,
          collPri: round2(Number(row.collPri) + payPri),
          collInt: round2(Number(row.collInt) + payInt),
          collDate: workingDate,
          dueBalance: Math.max(0, round2(Number(row.dueAmt) - newCollAmt)),
        },
      });

      remaining = round2(remaining - pay);
    }

    const applied = round2(amount - remaining);

    // A regular collection event also banks the fixed savings deposit (if
    // configured) — this must happen BEFORE the closure check below, so a
    // loan's very last installment payment still gets its own savings
    // refunded immediately rather than stranded after closing.
    const savingsCollected =
      kind === 'REGULAR' && applied > 0
        ? await this.depositSavings(tx, user, loanId, clientId, workingDate, savingsOverride)
        : 0;

    const stillOpen = await tx.repaymentSchedule.findFirst({ where: { loanId, dueBalance: { gt: 0 } } });
    let loanClosed = false;
    if (!stillOpen) {
      await tx.loan.update({ where: { id: loanId }, data: { loanType: 'CLOSED', closedDate: workingDate } });
      loanClosed = true;
      // Savings is NOT auto-refunded at closure any more — it's managed
      // separately through the FDO-initiate → BM/HO-approve → FDO-settle
      // refund workflow (see savings refund requests). The balance simply
      // stays on the loan's savings sub-account until refunded.
    }
    // savingsRefunded is retained in the return shape (always 0 now) so callers
    // and their success messages don't need to change.
    return { applied, remaining, loanClosed, savingsCollected, savingsRefunded: 0 };
  }

  /** Rows with an outstanding balance (collAmt < dueAmt), oldest first; if `asOf`
   *  is given, only installments due on or before that date. */
  private async pendingRows(tx: Prisma.TransactionClient, loanId: string, asOf?: Date): Promise<ScheduleRow[]> {
    const all = await tx.repaymentSchedule.findMany({ where: { loanId }, orderBy: { dueNo: 'asc' } });
    return all.filter((s) => Number(s.collAmt) < Number(s.dueAmt) && (!asOf || s.dueDate <= asOf));
  }

  /**
   * Foreclosure math: per-row principal is always due; interest depends on the
   * tenant policy. A discretionary `manualWaiveInt` (BM/HO, gated by
   * collection.waive) reduces the charged interest further, spread across rows
   * proportionally so each schedule row still settles to zero. A foreclosure
   * charge (percent of principal + flat fee) is added on top of the payoff.
   */
  private computeForeclosure(
    rows: ScheduleRow[],
    policy: string,
    workingDate: Date,
    opts: { chargePercent?: number; chargeFlat?: number; manualWaiveInt?: number } = {},
  ) {
    let principal = 0;
    let policyInterest = 0;
    let policyWaived = 0;
    const lines = rows.map((row) => {
      const remPri = round2(Number(row.duePri) - Number(row.collPri));
      const remInt = round2(Number(row.dueInt) - Number(row.collInt));
      const isDue = row.dueDate <= workingDate;
      let chargeInt: number;
      if (policy === 'PRINCIPAL_ONLY') chargeInt = 0;
      else if (policy === 'INTEREST_TO_DATE') chargeInt = isDue ? remInt : 0;
      else chargeInt = remInt; // FULL
      principal += remPri;
      policyInterest += chargeInt;
      policyWaived += round2(remInt - chargeInt);
      return { row, remPri, chargeInt };
    });
    principal = round2(principal);
    policyInterest = round2(policyInterest);

    // Apply the manual waiver against the policy-charged interest, spread across
    // rows in proportion to each row's charged interest (largest-remainder safe).
    const manualWaive = round2(Math.min(Math.max(0, opts.manualWaiveInt ?? 0), policyInterest));
    let waiveLeft = manualWaive;
    const finalLines = lines.map((l, i) => {
      let payInt = l.chargeInt;
      if (manualWaive > 0 && policyInterest > 0) {
        // Last row absorbs the rounding remainder so the totals reconcile exactly.
        const share = i === lines.length - 1 ? waiveLeft : round2((manualWaive * l.chargeInt) / policyInterest);
        const cut = Math.min(payInt, round2(share));
        payInt = round2(payInt - cut);
        waiveLeft = round2(waiveLeft - cut);
      }
      return { row: l.row, pay: round2(l.remPri + payInt), payPri: l.remPri, payInt, newDueBalance: 0 };
    });

    const interest = round2(policyInterest - manualWaive);
    const charge = round2(round2((principal * (opts.chargePercent ?? 0)) / 100) + (opts.chargeFlat ?? 0));
    return {
      principal,
      interest,
      waived: round2(policyWaived + manualWaive),
      policyWaived: round2(policyWaived),
      manualWaived: manualWaive,
      charge,
      total: round2(principal + interest + charge),
      lines: finalLines,
    };
  }

  private async foreclosureConfig(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<{ policy: string; chargePercent: number; chargeFlat: number }> {
    const tenant = await tx.tenant.findFirst({ where: { id: tenantId } });
    return {
      policy: tenant?.foreclosureInterestPolicy ?? 'FULL',
      chargePercent: Number(tenant?.foreclosureChargePercent ?? 0),
      chargeFlat: Number(tenant?.foreclosureChargeFlat ?? 0),
    };
  }

  // ==== Collection corrections (maker-checker) ==============================

  /** Days on which this loan has a live REGULAR field collection the FDO could
   *  ask to correct (excludes days already pending/approved for correction). */
  async loanCollectionDays(user: AuthUser, loanId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const loan = await tx.loan.findFirst({ where: { id: loanId, client: clientCenterScope(user) } });
      if (!loan) throw new NotFoundException('Loan not found');

      const rows = await tx.collection.findMany({
        where: { loanId, kind: 'REGULAR' },
        orderBy: { collectedOn: 'desc' },
      });
      const savingsRows = await tx.savingsTxn.findMany({ where: { loanId, kind: 'DEPOSIT' } });
      const corrs = await tx.collectionCorrection.findMany({
        where: { loanId, status: { in: ['PENDING', 'APPROVED'] } },
        select: { collectedOn: true },
      });
      const blocked = new Set(corrs.map((c) => c.collectedOn.toISOString().slice(0, 10)));

      const byDay = new Map<string, number>();
      for (const r of rows) {
        const key = r.collectedOn.toISOString().slice(0, 10);
        byDay.set(key, round2((byDay.get(key) ?? 0) + Number(r.amount)));
      }
      const savingsByDay = new Map<string, number>();
      for (const s of savingsRows) {
        const key = s.collectedOn.toISOString().slice(0, 10);
        savingsByDay.set(key, round2((savingsByDay.get(key) ?? 0) + Number(s.amount)));
      }
      return [...byDay.entries()]
        .filter(([day, amt]) => amt > 0 && !blocked.has(day))
        .map(([collectedOn, amount]) => ({ collectedOn, amount, savings: savingsByDay.get(collectedOn) ?? 0 }));
    });
  }

  /** Snapshot the numbers a correction turns on: what the day actually applied
   *  (loan + savings), the loan's outstanding now, and the resulting
   *  closure-state change. */
  private async correctionContext(tx: Prisma.TransactionClient, loanId: string, collectedOn: Date) {
    const origRows = await tx.collection.findMany({ where: { loanId, collectedOn, kind: 'REGULAR' } });
    const originalApplied = round2(origRows.reduce((s, r) => s + Number(r.amount), 0));
    const origSavingsRows = await tx.savingsTxn.findMany({ where: { loanId, collectedOn, kind: 'DEPOSIT' } });
    const originalSavings = round2(origSavingsRows.reduce((s, r) => s + Number(r.amount), 0));
    const sched = await tx.repaymentSchedule.findMany({ where: { loanId } });
    const outstandingNow = round2(sched.reduce((s, r) => s + Number(r.dueBalance), 0));
    return { origRows, originalApplied, origSavingsRows, originalSavings, outstandingNow };
  }

  private closureFlags(wasClosed: boolean, correctedAmount: number, outstandingAfterReversal: number) {
    const wouldReopen = wasClosed && correctedAmount < outstandingAfterReversal;
    const wouldClose = !wasClosed && outstandingAfterReversal > 0 && correctedAmount >= outstandingAfterReversal;
    return { wouldReopen, wouldClose, needsConfirm: wouldReopen || wouldClose || wasClosed };
  }

  /** True if this loan was ever foreclosed — its closure isn't a plain
   *  full-repayment, so a regular-collection correction can't safely touch it. */
  private async hasForeclosure(tx: Prisma.TransactionClient, loanId: string): Promise<boolean> {
    const row = await tx.collection.findFirst({ where: { loanId, kind: { in: ['FORECLOSURE', 'FORECLOSURE_CHARGE'] } } });
    return !!row;
  }

  /** FDO requests a correction to a past REGULAR field collection (→ approval queue). */
  async requestCorrection(user: AuthUser, dto: RequestCorrectionDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const loan = await tx.loan.findFirst({
        where: { id: dto.loanId, client: clientCenterScope(user) },
      });
      if (!loan) throw new NotFoundException('Loan not found');

      const collectedOn = new Date(dto.collectedOn);
      const dup = await tx.collectionCorrection.findFirst({
        where: { loanId: dto.loanId, collectedOn, status: { in: ['PENDING', 'APPROVED'] } },
      });
      if (dup) {
        throw new ConflictException(
          dup.status === 'PENDING'
            ? 'A correction for this loan and date is already awaiting approval.'
            : "This day's collection was already corrected.",
        );
      }
      const nonRegular = await tx.collection.findFirst({
        where: { loanId: dto.loanId, collectedOn, kind: { notIn: ['REGULAR', 'CORRECTION_REVERSAL'] } },
      });
      if (nonRegular) {
        throw new BadRequestException(
          'That day had an advance or foreclosure entry — corrections cover regular field collections only.',
        );
      }
      // A foreclosed loan's closure involved waived interest and a foreclosure
      // charge computed against the (then-uncorrected) balance — a plain reversal
      // of one day's regular collection can't safely unwind that, so block it.
      if (await this.hasForeclosure(tx, dto.loanId)) {
        throw new BadRequestException(
          'This loan was foreclosed — its closure involved waived interest and charges that a simple correction ' +
            "can't safely unwind. Contact support for a manual adjustment.",
        );
      }

      const { origRows, originalApplied, originalSavings, outstandingNow } = await this.correctionContext(tx, dto.loanId, collectedOn);
      if (origRows.length === 0) throw new BadRequestException('No field collection was posted for this loan on that date.');
      const correctedAmount = round2(dto.correctedAmount);
      const correctedSavings = dto.correctedSavings !== undefined ? round2(dto.correctedSavings) : undefined;
      const amountChanged = correctedAmount !== originalApplied;
      const savingsChanged = correctedSavings !== undefined && correctedSavings !== originalSavings;
      if (!amountChanged && !savingsChanged) {
        throw new BadRequestException('Nothing to correct — the amount (and savings, if entered) match what was already recorded.');
      }

      const wasClosed = loan.loanType === 'CLOSED';
      const outstandingAfterReversal = round2(outstandingNow + originalApplied);
      const { wouldReopen, wouldClose } = this.closureFlags(wasClosed, correctedAmount, outstandingAfterReversal);

      const created = await tx.collectionCorrection.create({
        data: {
          tenantId: user.tenantId,
          loanId: dto.loanId,
          clientId: loan.clientId,
          collectedOn,
          originalAmount: originalApplied,
          correctedAmount,
          originalSavings: correctedSavings !== undefined ? originalSavings : null,
          correctedSavings: correctedSavings ?? null,
          reason: dto.reason,
          status: 'PENDING',
          wouldReopen,
          wouldClose,
          requestedBy: user.employeeId,
        },
      });
      await this.audit.record(tx, {
        tenantId: user.tenantId,
        entity: 'CollectionCorrection',
        entityId: created.id,
        action: 'CORRECTION_REQUEST',
        employeeId: user.employeeId,
        after: {
          loanId: dto.loanId, collectedOn: dto.collectedOn, originalApplied, correctedAmount,
          originalSavings: correctedSavings !== undefined ? originalSavings : undefined, correctedSavings, reason: dto.reason,
        },
      });
      return {
        id: created.id, status: created.status, originalAmount: originalApplied, correctedAmount,
        originalSavings: correctedSavings !== undefined ? originalSavings : null, correctedSavings: correctedSavings ?? null,
        wouldReopen, wouldClose,
      };
    });
  }

  /** BM/HO: list correction requests (optionally by status), scoped to their reach. */
  async listCorrections(user: AuthUser, status?: 'PENDING' | 'APPROVED' | 'REJECTED', branchId?: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const rows = await tx.collectionCorrection.findMany({
        where: { ...(status ? { status } : {}), loan: { client: clientCenterScope(user, branchId) } },
        orderBy: { createdAt: 'desc' },
        include: {
          loan: {
            include: {
              client: {
                include: {
                  group: { select: { groupNo: true } },
                  center: { include: { branch: { select: { code: true, name: true } } } },
                },
              },
            },
          },
        },
      });
      const empIds = [...new Set(rows.flatMap((r) => [r.requestedBy, r.reviewedBy]).filter((x): x is string => !!x))];
      const emps = empIds.length
        ? await tx.employee.findMany({ where: { id: { in: empIds } }, select: { id: true, name: true } })
        : [];
      const empName = new Map(emps.map((e) => [e.id, e.name]));

      return rows.map((r) => {
        const c = r.loan.client;
        return {
          id: r.id,
          loanId: r.loanId,
          loanAccount: r.loan.loanAccount,
          loanType: r.loan.loanType,
          clientName: c.name,
          displayId: `${stripLeadingZeros(c.center.branch.code)}.${stripLeadingZeros(c.center.code)}.${c.group.groupNo}.${c.memberNo}`,
          branchCode: c.center.branch.code,
          branchName: c.center.branch.name,
          centerName: `${c.center.code} — ${c.center.name}`,
          collectedOn: r.collectedOn,
          originalAmount: Number(r.originalAmount),
          correctedAmount: Number(r.correctedAmount),
          originalSavings: r.originalSavings !== null ? Number(r.originalSavings) : null,
          correctedSavings: r.correctedSavings !== null ? Number(r.correctedSavings) : null,
          reason: r.reason,
          status: r.status,
          wouldReopen: r.wouldReopen,
          wouldClose: r.wouldClose,
          approverNotes: r.approverNotes,
          requestedByName: empName.get(r.requestedBy) ?? null,
          reviewedByName: r.reviewedBy ? empName.get(r.reviewedBy) ?? null : null,
          createdAt: r.createdAt,
          reviewedAt: r.reviewedAt,
        };
      });
    });
  }

  /** BM/HO approves: reverse the original day's collection and re-apply the
   *  corrected amount, both dated today (never rewriting a reconciled EOD day). */
  async approveCorrection(user: AuthUser, id: string, dto: ApproveCorrectionDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const corr = await tx.collectionCorrection.findFirst({
        where: { id, loan: { client: clientCenterScope(user) } },
      });
      if (!corr) throw new NotFoundException('Correction not found');
      if (corr.status !== 'PENDING') throw new BadRequestException('This correction has already been reviewed.');
      if (corr.requestedBy === user.employeeId) {
        throw new ForbiddenException('You cannot approve your own correction request — ask another approver to review it.');
      }

      const loan = await tx.loan.findFirst({
        where: { id: corr.loanId },
        include: { client: { select: { id: true, center: { select: { branchId: true } } } } },
      });
      if (!loan) throw new NotFoundException('Loan not found');
      const today = await this.resolveWorkingDate(tx, loan.client.center.branchId);

      // Re-check: the loan may have been foreclosed after this correction was
      // requested but before it was approved (see requestCorrection).
      if (await this.hasForeclosure(tx, corr.loanId)) {
        throw new BadRequestException(
          'This loan has since been foreclosed — this correction can no longer be safely applied. Reject it instead.',
        );
      }

      const { origRows, originalApplied, originalSavings, outstandingNow } =
        await this.correctionContext(tx, corr.loanId, corr.collectedOn);
      if (origRows.length === 0) throw new BadRequestException('The original collection is no longer present (already corrected?).');
      const correctingSavings = corr.correctedSavings !== null;
      const correctedSavings = correctingSavings ? round2(Number(corr.correctedSavings)) : 0;

      const correctedAmount = round2(Number(corr.correctedAmount));
      const wasClosed = loan.loanType === 'CLOSED';
      const outstandingAfterReversal = round2(outstandingNow + originalApplied);
      const { wouldReopen, wouldClose, needsConfirm } = this.closureFlags(wasClosed, correctedAmount, outstandingAfterReversal);
      if (needsConfirm && !dto.confirmClosure) {
        throw new ConflictException({
          message: "This correction changes the loan's closure state — please double-check and confirm.",
          code: 'CONFIRM_CLOSURE_REQUIRED',
          wouldReopen,
          wouldClose,
          wasClosed,
        });
      }

      // 1. Reverse the original day's REGULAR collections (adjusting entries, dated today).
      for (const r of origRows) {
        if (r.scheduleId) {
          const sched = await tx.repaymentSchedule.findUnique({ where: { id: r.scheduleId } });
          if (sched) {
            const newCollAmt = round2(Number(sched.collAmt) - Number(r.amount));
            await tx.repaymentSchedule.update({
              where: { id: sched.id },
              data: {
                collAmt: newCollAmt,
                collPri: round2(Number(sched.collPri) - Number(r.pri)),
                collInt: round2(Number(sched.collInt) - Number(r.int)),
                dueBalance: Math.max(0, round2(Number(sched.dueAmt) - newCollAmt)),
                collDate: newCollAmt <= 0 ? null : sched.collDate,
              },
            });
          }
        }
        await tx.collection.create({
          data: {
            tenantId: user.tenantId,
            loanId: corr.loanId,
            scheduleId: r.scheduleId,
            collectedOn: today,
            amount: round2(-Number(r.amount)),
            pri: round2(-Number(r.pri)),
            int: round2(-Number(r.int)),
            kind: 'CORRECTION_REVERSAL',
            enteredBy: user.employeeId,
          },
        });
      }

      // 2. Reverse that day's savings deposit, if it's part of this correction
      //    (independent of loan closure — a signed CORRECTION_REVERSAL entry,
      //    since SavingsTxn's DEPOSIT/REFUND kinds are always-positive by convention).
      if (correctingSavings && originalSavings > 0) {
        await tx.savingsTxn.create({
          data: {
            tenantId: user.tenantId,
            clientId: loan.clientId,
            loanId: corr.loanId,
            amount: round2(-originalSavings),
            kind: 'CORRECTION_REVERSAL',
            collectedOn: today,
            enteredBy: user.employeeId,
          },
        });
        await tx.client.update({ where: { id: loan.clientId }, data: { savingsBalance: { decrement: originalSavings } } });
      }

      // 3. If that day had closed the loan, just re-open it. Savings is no longer
      //    auto-refunded at closure, so there's nothing to claw back here.
      const refundRestored = 0;
      if (wasClosed) {
        await tx.loan.update({ where: { id: corr.loanId }, data: { loanType: 'OPEN', closedDate: null } });
      }

      // 4. Deposit the corrected savings amount, if this correction includes one.
      if (correctingSavings && correctedSavings > 0) {
        await tx.savingsTxn.create({
          data: {
            tenantId: user.tenantId,
            clientId: loan.clientId,
            loanId: corr.loanId,
            amount: correctedSavings,
            kind: 'DEPOSIT',
            collectedOn: today,
            enteredBy: user.employeeId,
          },
        });
        await tx.client.update({ where: { id: loan.clientId }, data: { savingsBalance: { increment: correctedSavings } } });
      }

      // 5. Re-apply the corrected loan amount (no new default savings deposit
      //    here — savings was already handled in steps 2 & 4; may re-close + refund).
      let applied = 0;
      let advanceBanked = 0;
      let loanClosed = false;
      let savingsRefunded = 0;
      if (correctedAmount > 0) {
        const res = await this.applyFifo(tx, user, corr.loanId, loan.clientId, correctedAmount, 'REGULAR', today, false, 0);
        applied = res.applied;
        loanClosed = res.loanClosed;
        savingsRefunded = res.savingsRefunded;
        if (res.remaining > 0 && !res.loanClosed) {
          advanceBanked = res.remaining;
          await tx.loan.update({ where: { id: corr.loanId }, data: { advanceBalance: { increment: advanceBanked } } });
        }
      } else {
        const stillOwing = await tx.repaymentSchedule.findFirst({ where: { loanId: corr.loanId, dueBalance: { gt: 0 } } });
        loanClosed = !stillOwing;
      }

      await tx.collectionCorrection.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approverNotes: dto.notes ?? null,
          reviewedBy: user.employeeId,
          reviewedAt: new Date(),
          wouldReopen,
          wouldClose,
        },
      });
      await this.audit.record(tx, {
        tenantId: user.tenantId,
        entity: 'CollectionCorrection',
        entityId: id,
        action: 'CORRECTION_APPROVE',
        employeeId: user.employeeId,
        before: { originalApplied, originalSavings: correctingSavings ? originalSavings : undefined, wasClosed },
        after: {
          correctedAmount, applied, advanceBanked, loanClosed, reopened: wasClosed && !loanClosed, refundRestored, savingsRefunded,
          correctedSavings: correctingSavings ? correctedSavings : undefined, eodDate: today,
        },
      });
      return {
        id, status: 'APPROVED', applied, advanceBanked, loanClosed, reopened: wasClosed && !loanClosed,
        savingsCorrected: correctingSavings ? correctedSavings : null,
      };
    });
  }

  /** BM/HO rejects a pending correction (no money moves). */
  async rejectCorrection(user: AuthUser, id: string, notes?: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const corr = await tx.collectionCorrection.findFirst({
        where: { id, loan: { client: clientCenterScope(user) } },
      });
      if (!corr) throw new NotFoundException('Correction not found');
      if (corr.status !== 'PENDING') throw new BadRequestException('This correction has already been reviewed.');
      await tx.collectionCorrection.update({
        where: { id },
        data: { status: 'REJECTED', approverNotes: notes ?? null, reviewedBy: user.employeeId, reviewedAt: new Date() },
      });
      await this.audit.record(tx, {
        tenantId: user.tenantId,
        entity: 'CollectionCorrection',
        entityId: id,
        action: 'CORRECTION_REJECT',
        employeeId: user.employeeId,
        after: { notes: notes ?? null },
      });
      return { id, status: 'REJECTED' };
    });
  }

  private async getScopedCenter(tx: Prisma.TransactionClient, user: AuthUser, centerId: string) {
    const center = await tx.center.findFirst({ where: { id: centerId, ...centerScope(user) } });
    if (!center) throw new ForbiddenException('Center not assigned to you');
    return center;
  }

  private async getScopedOpenLoan(tx: Prisma.TransactionClient, user: AuthUser, loanId: string) {
    const loan = await tx.loan.findFirst({
      where: { id: loanId, client: clientCenterScope(user) },
      include: { client: { select: { id: true, center: { select: { branchId: true } } } } },
    });
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.loanType !== 'OPEN') throw new BadRequestException('Loan is already closed');
    return loan;
  }

  private async resolveWorkingDate(tx: Prisma.TransactionClient, branchId: string): Promise<Date> {
    const branch = await tx.branch.findUnique({ where: { id: branchId } });
    return branch?.workingDate ?? new Date();
  }
}
