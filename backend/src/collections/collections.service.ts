import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/types/auth-user';
import { centerScope, clientCenterScope } from '../common/scope';
import { stripLeadingZeros } from '../common/format.util';
import { round2 } from '../loans/schedule.util';
import { PostCollectionDto } from './dto/post-collection.dto';

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

  /** Per-member collectable amount for one center, as of a date (defaults to working date). */
  async due(user: AuthUser, centerId: string, date?: string) {
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
            // Split the demand into overdue (before today) vs the current period's
            // instalment (due exactly as of today) for the field-collection view.
            const arrear = unpaid
              .filter((s) => s.dueDate < asOf)
              .reduce((sum, s) => sum + (Number(s.dueAmt) - Number(s.collAmt)), 0);
            return {
              clientId: c.id,
              clientName: c.name,
              displayId: `${stripLeadingZeros(center.branch.code)}.${stripLeadingZeros(center.code)}.${c.group.groupNo}.${c.memberNo}`,
              loanId: loan.id,
              loanAccount: loan.loanAccount,
              dueCount: unpaid.length,
              totalDue: round2(totalDue),
              arrear: round2(arrear),
              currentDue: round2(totalDue - arrear),
              advanceBalance: round2(Number(loan.advanceBalance)),
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
  async advanceLoans(user: AuthUser) {
    return this.prisma.withTenant(user, async (tx) => {
      const loans = await tx.loan.findMany({
        where: { loanType: 'OPEN', advanceBalance: { gt: 0 }, client: clientCenterScope(user) },
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
        orderBy: { loanAccount: 'asc' },
      });
      return loans.map((l) => ({
        loanId: l.id,
        loanAccount: l.loanAccount,
        clientName: l.client.name,
        displayId: `${stripLeadingZeros(l.client.center.branch.code)}.${stripLeadingZeros(l.client.center.code)}.${l.client.group.groupNo}.${l.client.memberNo}`,
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

      // Foreclosing closes the loan immediately, so its own savings refund
      // right away too — same as a normal full repayment closure.
      const savingsRefunded = await this.refundLoanSavings(tx, user, { id: loan.id, clientId: loan.clientId }, workingDate);

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
          loans: { where: { loanType: 'OPEN' }, select: { id: true } },
        },
      });
      return clients.map((c) => ({
        clientId: c.id,
        clientName: c.name,
        displayId: `${stripLeadingZeros(c.center.branch.code)}.${stripLeadingZeros(c.center.code)}.${c.group.groupNo}.${c.memberNo}`,
        branchCode: c.center.branch.code,
        branchName: c.center.branch.name,
        centerName: `${c.center.code} — ${c.center.name}`,
        savingsBalance: round2(Number(c.savingsBalance)),
        hasOpenLoan: c.loans.length > 0,
      }));
    });
  }

  /** Refund a client's held savings once all their loans are closed. */
  async refundSavings(user: AuthUser, clientId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: clientId, ...clientCenterScope(user) },
        include: {
          loans: { where: { loanType: 'OPEN' }, select: { id: true } },
          center: { select: { branchId: true } },
        },
      });
      if (!client) throw new NotFoundException('Member not found');

      const balance = round2(Number(client.savingsBalance));
      if (balance <= 0) throw new BadRequestException('No savings balance to refund');
      if (client.loans.length > 0) throw new BadRequestException('Client still has an open loan — refund after all loans close');

      const workingDate = await this.resolveWorkingDate(tx, client.center.branchId);
      await tx.savingsTxn.create({
        data: {
          tenantId: user.tenantId,
          clientId,
          loanId: null,
          amount: balance,
          kind: 'REFUND',
          collectedOn: workingDate,
          enteredBy: user.employeeId,
        },
      });
      await tx.client.update({ where: { id: clientId }, data: { savingsBalance: 0 } });

      await this.audit.record(tx, {
        tenantId: user.tenantId,
        entity: 'Client',
        entityId: clientId,
        action: 'SAVINGS_REFUND',
        employeeId: user.employeeId,
        after: { refunded: balance, eodDate: workingDate },
      });

      return { clientId, refunded: balance };
    });
  }

  // ---- internals -----------------------------------------------------------

  /** Net savings tied to one loan: deposits collected against it, minus any
   *  refund already made for it. */
  private async loanSavingsBalance(tx: Prisma.TransactionClient, loanId: string): Promise<number> {
    const [deposits, refunds] = await Promise.all([
      tx.savingsTxn.aggregate({ where: { loanId, kind: 'DEPOSIT' }, _sum: { amount: true } }),
      tx.savingsTxn.aggregate({ where: { loanId, kind: 'REFUND' }, _sum: { amount: true } }),
    ]);
    return round2(Number(deposits._sum.amount ?? 0) - Number(refunds._sum.amount ?? 0));
  }

  /**
   * Refund the savings tied to one loan automatically the moment it closes —
   * foreclosed or fully repaid — rather than making the client wait for every
   * loan of theirs to close. Returns the amount refunded (0 if none held).
   */
  private async refundLoanSavings(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    loan: { id: string; clientId: string },
    workingDate: Date,
  ): Promise<number> {
    const balance = await this.loanSavingsBalance(tx, loan.id);
    if (balance <= 0) return 0;

    await tx.savingsTxn.create({
      data: {
        tenantId: user.tenantId,
        clientId: loan.clientId,
        loanId: loan.id,
        amount: balance,
        kind: 'REFUND',
        collectedOn: workingDate,
        enteredBy: user.employeeId,
      },
    });
    await tx.client.update({ where: { id: loan.clientId }, data: { savingsBalance: { decrement: balance } } });

    await this.audit.record(tx, {
      tenantId: user.tenantId,
      entity: 'Loan',
      entityId: loan.id,
      action: 'SAVINGS_REFUND',
      employeeId: user.employeeId,
      after: { refunded: balance, eodDate: workingDate },
    });
    return balance;
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
    let savingsRefunded = 0;
    if (!stillOpen) {
      await tx.loan.update({ where: { id: loanId }, data: { loanType: 'CLOSED', closedDate: workingDate } });
      loanClosed = true;
      // A normally-closed loan (fully repaid) refunds its own savings right
      // away too — same as foreclosure — instead of waiting for every other
      // loan of the client to close.
      savingsRefunded = await this.refundLoanSavings(tx, user, { id: loanId, clientId }, workingDate);
    }
    return { applied, remaining, loanClosed, savingsCollected, savingsRefunded };
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
