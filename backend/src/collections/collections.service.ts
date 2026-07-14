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
            return {
              clientId: c.id,
              clientName: c.name,
              displayId: `${stripLeadingZeros(center.branch.code)}.${stripLeadingZeros(center.code)}.${c.group.groupNo}.${c.memberNo}`,
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
      for (const loan of loans) {
        const rows = await this.pendingRows(tx, loan.id, workingDate);
        const demand = rows.reduce((sum, s) => sum + (Number(s.dueAmt) - Number(s.collAmt)), 0);
        if (demand <= 0) continue;
        const { applied } = await this.applyFifo(tx, user, loan.id, round2(demand), 'REGULAR', workingDate, true);
        if (applied > 0) {
          loansCollected += 1;
          totalCollected += applied;
        }
      }

      await this.audit.record(tx, {
        tenantId: user.tenantId,
        entity: 'Center',
        entityId: centerId,
        action: 'BULK_COLLECT',
        employeeId: user.employeeId,
        after: { loansCollected, totalCollected: round2(totalCollected), eodDate: workingDate },
      });

      return { loansCollected, totalCollected: round2(totalCollected) };
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
      const { applied, remaining, loanClosed } = await this.applyFifo(
        tx,
        user,
        loan.id,
        round2(dto.amount),
        'REGULAR',
        workingDate,
        true,
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
        after: { amount: round2(dto.amount), applied, advanceBanked, loanClosed },
      });

      return { applied, advanceBanked, unallocated: advanceBanked, loanClosed };
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
      const { applied, remaining, loanClosed } = await this.applyFifo(tx, user, loan.id, advance, 'ADVANCE', workingDate, false);

      await tx.loan.update({ where: { id: loan.id }, data: { advanceBalance: remaining } });

      await this.audit.record(tx, {
        tenantId: user.tenantId,
        entity: 'Loan',
        entityId: loan.id,
        action: 'APPLY_ADVANCE',
        employeeId: user.employeeId,
        after: { applied, advanceRemaining: remaining, loanClosed },
      });

      return { applied, advanceRemaining: remaining, loanClosed };
    });
  }

  /** What a borrower would owe to foreclose this loan today, per the tenant policy. */
  async foreclosureQuote(user: AuthUser, loanId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const loan = await this.getScopedOpenLoan(tx, user, loanId);
      const workingDate = await this.resolveWorkingDate(tx, loan.client.center.branchId);
      const policy = await this.foreclosurePolicy(tx, user.tenantId);
      const rows = await this.pendingRows(tx, loan.id, undefined);
      const q = this.computeForeclosure(rows, policy, workingDate);
      return {
        loanId: loan.id,
        loanAccount: loan.loanAccount,
        policy,
        remainingPrincipal: q.principal,
        interestCharged: q.interest,
        interestWaived: q.waived,
        payoffTotal: q.total,
        advanceBalance: round2(Number(loan.advanceBalance)),
      };
    });
  }

  /** Foreclose (early-close) a loan: settle per policy, mark CLOSED. */
  async foreclose(user: AuthUser, loanId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const loan = await this.getScopedOpenLoan(tx, user, loanId);
      const workingDate = await this.resolveWorkingDate(tx, loan.client.center.branchId);
      const policy = await this.foreclosurePolicy(tx, user.tenantId);
      const rows = await this.pendingRows(tx, loan.id, undefined);
      const q = this.computeForeclosure(rows, policy, workingDate);

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

      await tx.loan.update({
        where: { id: loan.id },
        data: { loanType: 'CLOSED', closedDate: workingDate },
      });

      await this.audit.record(tx, {
        tenantId: user.tenantId,
        entity: 'Loan',
        entityId: loan.id,
        action: 'FORECLOSE',
        employeeId: user.employeeId,
        after: {
          policy,
          principal: q.principal,
          interestCharged: q.interest,
          interestWaived: q.waived,
          payoffTotal: q.total,
          eodDate: workingDate,
        },
      });

      return { loanId: loan.id, closed: true, payoffTotal: q.total, interestWaived: q.waived };
    });
  }

  // ---- internals -----------------------------------------------------------

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
    amount: number,
    kind: 'REGULAR' | 'ADVANCE',
    workingDate: Date,
    onlyDue: boolean,
  ): Promise<{ applied: number; remaining: number; loanClosed: boolean }> {
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

    const stillOpen = await tx.repaymentSchedule.findFirst({ where: { loanId, dueBalance: { gt: 0 } } });
    let loanClosed = false;
    if (!stillOpen) {
      await tx.loan.update({ where: { id: loanId }, data: { loanType: 'CLOSED', closedDate: workingDate } });
      loanClosed = true;
    }
    return { applied: round2(amount - remaining), remaining, loanClosed };
  }

  /** Rows with an outstanding balance (collAmt < dueAmt), oldest first; if `asOf`
   *  is given, only installments due on or before that date. */
  private async pendingRows(tx: Prisma.TransactionClient, loanId: string, asOf?: Date): Promise<ScheduleRow[]> {
    const all = await tx.repaymentSchedule.findMany({ where: { loanId }, orderBy: { dueNo: 'asc' } });
    return all.filter((s) => Number(s.collAmt) < Number(s.dueAmt) && (!asOf || s.dueDate <= asOf));
  }

  /** Foreclosure math: per-row principal always due; interest depends on policy. */
  private computeForeclosure(rows: ScheduleRow[], policy: string, workingDate: Date) {
    let principal = 0;
    let interest = 0;
    let waived = 0;
    const lines = rows.map((row) => {
      const remPri = round2(Number(row.duePri) - Number(row.collPri));
      const remInt = round2(Number(row.dueInt) - Number(row.collInt));
      const isDue = row.dueDate <= workingDate;
      let chargeInt: number;
      if (policy === 'PRINCIPAL_ONLY') chargeInt = 0;
      else if (policy === 'INTEREST_TO_DATE') chargeInt = isDue ? remInt : 0;
      else chargeInt = remInt; // FULL
      const waiveInt = round2(remInt - chargeInt);
      principal += remPri;
      interest += chargeInt;
      waived += waiveInt;
      const pay = round2(remPri + chargeInt);
      return { row, pay, payPri: remPri, payInt: chargeInt, newDueBalance: 0 };
    });
    return {
      principal: round2(principal),
      interest: round2(interest),
      waived: round2(waived),
      total: round2(principal + interest),
      lines,
    };
  }

  private async foreclosurePolicy(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
    const tenant = await tx.tenant.findFirst({ where: { id: tenantId } });
    return tenant?.foreclosureInterestPolicy ?? 'FULL';
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
