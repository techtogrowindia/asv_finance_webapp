import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/types/auth-user';
import { round2 } from '../loans/schedule.util';
import { CloseEodDto } from './dto/close-eod.dto';

@Injectable()
export class EodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Live figures for the branch's current working_date, without closing it. */
  async preview(user: AuthUser, branchId?: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const branch = await this.resolveBranch(tx, user, branchId);
      const figures = await this.computeFigures(tx, branch.id, branch.workingDate);
      const existing = await tx.eodClosing.findUnique({
        where: { branchId_eodDate: { branchId: branch.id, eodDate: branch.workingDate } },
      });
      return {
        branchId: branch.id,
        branchName: `${branch.code} - ${branch.name}`,
        workingDate: branch.workingDate,
        alreadyClosed: !!existing,
        ...figures,
      };
    });
  }

  /** History of past closings for a branch (BM: own branch; HO: any branch in tenant). */
  async history(user: AuthUser, branchId?: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const branch = await this.resolveBranch(tx, user, branchId);
      const rows = await tx.eodClosing.findMany({
        where: { branchId: branch.id },
        orderBy: { eodDate: 'desc' },
        take: 90,
      });
      return rows.map((r) => ({
        id: r.id,
        eodDate: r.eodDate,
        openingBalance: r.openingBalance,
        totalReceipts: r.totalReceipts,
        totalPayments: r.totalPayments,
        closingBalance: r.closingBalance,
        doneAt: r.doneAt,
      }));
    });
  }

  /** Closes the branch's current working day and advances working_date to the next day. */
  async close(user: AuthUser, dto: CloseEodDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const branch = await this.resolveBranch(tx, user, dto.branchId);

      const existing = await tx.eodClosing.findUnique({
        where: { branchId_eodDate: { branchId: branch.id, eodDate: branch.workingDate } },
      });
      if (existing) throw new BadRequestException('This day has already been closed');

      const figures = await this.computeFigures(tx, branch.id, branch.workingDate);

      const created = await tx.eodClosing.create({
        data: {
          tenantId: user.tenantId,
          branchId: branch.id,
          eodDate: branch.workingDate,
          openingBalance: figures.openingBalance,
          totalReceipts: figures.totalReceipts,
          totalPayments: figures.totalPayments,
          closingBalance: figures.closingBalance,
          doneBy: user.employeeId,
        },
      });

      const nextDate = new Date(branch.workingDate);
      nextDate.setDate(nextDate.getDate() + 1);
      await tx.branch.update({ where: { id: branch.id }, data: { workingDate: nextDate } });

      await this.audit.record(tx, {
        tenantId: user.tenantId,
        entity: 'EodClosing',
        entityId: created.id,
        action: 'CLOSE',
        employeeId: user.employeeId,
        after: { ...figures, eodDate: branch.workingDate, nextWorkingDate: nextDate },
      });

      return {
        id: created.id,
        eodDate: created.eodDate,
        openingBalance: created.openingBalance,
        totalReceipts: created.totalReceipts,
        totalPayments: created.totalPayments,
        closingBalance: created.closingBalance,
        nextWorkingDate: nextDate,
      };
    });
  }

  private async computeFigures(tx: Prisma.TransactionClient, branchId: string, workingDate: Date) {
    const previous = await tx.eodClosing.findFirst({
      where: { branchId, eodDate: { lt: workingDate } },
      orderBy: { eodDate: 'desc' },
    });
    const openingBalance = previous ? Number(previous.closingBalance) : 0;

    const receipts = await tx.collection.aggregate({
      where: { collectedOn: workingDate, loan: { client: { center: { branchId } } } },
      _sum: { amount: true },
    });
    // Savings collected is cash received too; refunds are cash paid out.
    const savingsIn = await tx.savingsTxn.aggregate({
      where: { collectedOn: workingDate, kind: 'DEPOSIT', client: { center: { branchId } } },
      _sum: { amount: true },
    });
    const savingsOut = await tx.savingsTxn.aggregate({
      where: { collectedOn: workingDate, kind: 'REFUND', client: { center: { branchId } } },
      _sum: { amount: true },
    });
    const savingsDeposits = round2(Number(savingsIn._sum.amount ?? 0));
    const savingsRefunds = round2(Number(savingsOut._sum.amount ?? 0));
    const totalReceipts = round2(Number(receipts._sum.amount ?? 0) + savingsDeposits);

    const payments = await tx.loan.aggregate({
      where: { disbursalDate: workingDate, client: { center: { branchId } } },
      _sum: { loanAmount: true },
    });
    const totalPayments = round2(Number(payments._sum.loanAmount ?? 0) + savingsRefunds);

    const closingBalance = round2(openingBalance + totalReceipts - totalPayments);

    return { openingBalance, totalReceipts, totalPayments, closingBalance, savingsDeposits, savingsRefunds };
  }

  /** BM is pinned to their own branch; HO must name a real branch in the tenant. */
  private async resolveBranch(tx: Prisma.TransactionClient, user: AuthUser, requestedBranchId: string | undefined) {
    if (user.role === 'BM') {
      if (!user.branchId) throw new ForbiddenException('Your account has no branch assigned');
      const branch = await tx.branch.findFirst({ where: { id: user.branchId } });
      if (!branch) throw new NotFoundException('Branch not found');
      return branch;
    }
    if (!requestedBranchId) throw new BadRequestException('branchId is required');
    const branch = await tx.branch.findFirst({ where: { id: requestedBranchId } });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }
}
