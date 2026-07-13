import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth-user';
import { centerScope } from '../common/scope';
import { stripLeadingZeros } from '../common/format.util';
import { round2 } from '../loans/schedule.util';

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
}
