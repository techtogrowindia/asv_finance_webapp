import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth-user';
import { clientCenterScope } from '../common/scope';
import { CreateLoanApplicationDto } from './dto/create-loan-application.dto';

@Injectable()
export class LoansService {
  constructor(private readonly prisma: PrismaService) {}

  /** Existing loans for a client, with balances/arrears derived from the schedule. */
  async existingLoans(user: AuthUser, clientId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: clientId, ...clientCenterScope(user) },
        select: { id: true, center: { select: { branchId: true } } },
      });
      if (!client) throw new NotFoundException('Member not found');

      const branch = await tx.branch.findUnique({ where: { id: client.center.branchId } });
      const workingDate = branch?.workingDate ?? new Date();

      const loans = await tx.loan.findMany({
        where: { clientId },
        orderBy: { disbursalDate: 'desc' },
        include: { schedule: true },
      });

      return loans.map((loan) => {
        const totalDues = loan.schedule.length;
        const compDues = loan.schedule.filter((s) => Number(s.collAmt) >= Number(s.dueAmt)).length;
        const collDues = loan.schedule.filter((s) => Number(s.collAmt) > 0).length;
        const unpaid = loan.schedule.filter((s) => Number(s.collAmt) < Number(s.dueAmt));
        const priBalance = unpaid.reduce((sum, s) => sum + Number(s.duePri), 0);
        const intBalance = unpaid.reduce((sum, s) => sum + Number(s.dueInt), 0);
        const overdue = unpaid.filter((s) => s.dueDate <= workingDate);
        const closingArrPri = overdue.reduce((sum, s) => sum + Number(s.duePri), 0);
        const closingArrInt = overdue.reduce((sum, s) => sum + Number(s.dueInt), 0);

        return {
          id: loan.id,
          loanAccount: loan.loanAccount,
          disbursalDate: loan.disbursalDate,
          loanAmount: loan.loanAmount,
          totalDues,
          compDues,
          collDues,
          dueStartDate: loan.dueStartDate,
          maturityDate: loan.maturityDate,
          closedDate: loan.closedDate,
          loanType: loan.loanType,
          priBalance,
          intBalance,
          closingArrPri,
          closingArrInt,
        };
      });
    });
  }

  /** Eligibility warnings + implied sanctioned amount for a client + product. */
  async eligibility(user: AuthUser, clientId: string, productId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: clientId, ...clientCenterScope(user) },
        include: { kyc: true, coApplicant: true },
      });
      if (!client) throw new NotFoundException('Member not found');

      const product = await tx.loanProduct.findFirst({ where: { id: productId, isActive: true } });
      if (!product) throw new NotFoundException('Loan product not found');

      const warnings = await this.computeWarnings(tx, client, user.tenantId);
      return { warnings, sanctionedAmount: product.loanAmount };
    });
  }

  async createApplication(user: AuthUser, dto: CreateLoanApplicationDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: dto.clientId, ...clientCenterScope(user) },
        include: { kyc: true, coApplicant: true },
      });
      if (!client) throw new ForbiddenException('Member not in your assigned centers');

      const product = await tx.loanProduct.findFirst({ where: { id: dto.productId, isActive: true } });
      if (!product) throw new BadRequestException('Loan product not found');

      const purpose = await tx.purpose.findFirst({ where: { id: dto.purposeId, isActive: true } });
      if (!purpose) throw new BadRequestException('Purpose not found');

      const warnings = await this.computeWarnings(tx, client, user.tenantId);

      const application = await tx.loanApplication.create({
        data: {
          tenantId: user.tenantId,
          clientId: client.id,
          productId: product.id,
          purposeId: purpose.id,
          requestedAmount: product.loanAmount,
          status: 'PENDING',
          warnings: warnings as unknown as Prisma.InputJsonValue,
          createdBy: user.employeeId,
        },
      });

      return { id: application.id, status: application.status, warnings, requestedAmount: product.loanAmount };
    });
  }

  /** Loan-balance / arrear / missing-document warnings, matching the reference's yellow list. */
  private async computeWarnings(
    tx: Prisma.TransactionClient,
    client: { id: string; coApplicant: unknown },
    tenantId: string,
  ): Promise<string[]> {
    const warnings: string[] = [];

    const openLoan = await tx.loan.findFirst({ where: { clientId: client.id, loanType: 'OPEN' } });
    if (openLoan) {
      warnings.push('Loan Balance Exists For This Client');

      const branch = await tx.branch.findFirst({ where: { tenantId } });
      const workingDate = branch?.workingDate ?? new Date();
      const schedule = await tx.repaymentSchedule.findMany({ where: { loanId: openLoan.id } });
      const hasArrear = schedule.some((s) => s.dueDate <= workingDate && Number(s.collAmt) < Number(s.dueAmt));
      if (hasArrear) warnings.push('Arrear Exists For This Client');
    }

    // Document names already encode the party (e.g. "CLIENT PHOTO", "NOMINEE PHOTO"),
    // matching the reference exactly — so no label-building needed, just a lookup.
    const requiredTypes = await tx.documentType.findMany({ where: { tenantId, isMandatory: true, isActive: true } });
    const uploaded = await tx.kycDocument.findMany({ where: { clientId: client.id } });
    const uploadedTypeIds = new Set(uploaded.map((d) => d.documentTypeId));
    const hasNominee = !!client.coApplicant;

    const missing = requiredTypes
      .filter((dt) => !(dt.appliesTo === 'NOMINEE' && !hasNominee))
      .filter((dt) => !uploadedTypeIds.has(dt.id));

    if (missing.length > 0) {
      warnings.push('KYC Documents Not Uploaded');
      warnings.push(...missing.map((dt) => `\`${dt.name}\` Image Not Uploaded.`));
    }

    return warnings;
  }
}
