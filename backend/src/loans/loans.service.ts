import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/types/auth-user';
import { clientCenterScope } from '../common/scope';
import { generateSchedule, round2 } from './schedule.util';
import { CreateLoanApplicationDto } from './dto/create-loan-application.dto';
import { RejectApplicationDto } from './dto/reject-application.dto';

@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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

  // ---- Verification & Disbursement (BM/HO) ---------------------------------

  /** Applications awaiting a decision, scoped to the caller's branch/tenant. */
  async listApplications(user: AuthUser, status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    return this.prisma.withTenant(user, async (tx) => {
      const applications = await tx.loanApplication.findMany({
        where: { client: clientCenterScope(user), ...(status ? { status } : {}) },
        orderBy: { createdAt: 'desc' },
        include: {
          client: { select: { id: true, clientCode: true, name: true } },
          product: { select: { name: true, loanAmount: true, totalDues: true } },
          purpose: { select: { name: true } },
        },
      });
      return applications.map((a) => ({
        id: a.id,
        clientId: a.client.id,
        clientCode: a.client.clientCode,
        clientName: a.client.name,
        productName: a.product.name,
        loanAmount: a.product.loanAmount,
        totalDues: a.product.totalDues,
        purposeName: a.purpose.name,
        requestedAmount: a.requestedAmount,
        status: a.status,
        warnings: (a.warnings as string[] | null) ?? [],
        createdAt: a.createdAt,
      }));
    });
  }

  /** Approve a pending application: creates the Loan + full RepaymentSchedule. */
  async disburse(user: AuthUser, applicationId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const application = await tx.loanApplication.findFirst({
        where: { id: applicationId, client: clientCenterScope(user) },
        include: {
          client: { select: { id: true, clientCode: true, center: { select: { branchId: true } } } },
          product: { include: { frequency: true } },
        },
      });
      if (!application) throw new NotFoundException('Loan application not found');
      if (application.status !== 'PENDING') {
        throw new BadRequestException(`Application is already ${application.status}`);
      }

      const branch = await tx.branch.findUnique({ where: { id: application.client.center.branchId } });
      const workingDate = branch?.workingDate ?? new Date();

      const cycleNo = (await tx.loan.count({ where: { clientId: application.client.id } })) + 1;
      const loanAccount = `${application.client.clientCode}/${cycleNo}`;

      const loanAmount = Number(application.product.loanAmount);
      const interestAmount = Number(application.product.interestAmount);
      const totalDues = application.product.totalDues;
      const rows = generateSchedule({
        loanAmount,
        interestAmount,
        totalDues,
        daysBetween: application.product.frequency.daysBetween,
        dueStartDate: workingDate,
      });
      const maturityDate = rows[rows.length - 1].dueDate;

      const loan = await tx.loan.create({
        data: {
          tenantId: user.tenantId,
          clientId: application.client.id,
          applicationId: application.id,
          productId: application.productId,
          loanAccount,
          cycleNo,
          loanAmount,
          interestAmount,
          totalAmount: round2(loanAmount + interestAmount),
          totalDues,
          disbursalDate: workingDate,
          dueStartDate: workingDate,
          maturityDate,
          loanType: 'OPEN',
          schedule: {
            create: rows.map((r) => ({
              tenantId: user.tenantId,
              dueNo: r.dueNo,
              dueDate: r.dueDate,
              duePri: r.duePri,
              dueInt: r.dueInt,
              dueAmt: r.dueAmt,
              dueBalance: r.dueAmt, // nothing collected yet
            })),
          },
        },
      });

      await tx.loanApplication.update({
        where: { id: application.id },
        data: { status: 'APPROVED', sanctionedAmount: loanAmount },
      });

      await this.audit.record(tx, {
        tenantId: user.tenantId,
        entity: 'Loan',
        entityId: loan.id,
        action: 'DISBURSE',
        employeeId: user.employeeId,
        after: { loanAccount, loanAmount, interestAmount, totalDues, disbursalDate: workingDate },
      });

      return { id: loan.id, loanAccount, disbursalDate: workingDate, maturityDate };
    });
  }

  async reject(user: AuthUser, applicationId: string, dto: RejectApplicationDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const application = await tx.loanApplication.findFirst({
        where: { id: applicationId, client: clientCenterScope(user) },
      });
      if (!application) throw new NotFoundException('Loan application not found');
      if (application.status !== 'PENDING') {
        throw new BadRequestException(`Application is already ${application.status}`);
      }

      await tx.loanApplication.update({ where: { id: application.id }, data: { status: 'REJECTED' } });
      await this.audit.record(tx, {
        tenantId: user.tenantId,
        entity: 'LoanApplication',
        entityId: application.id,
        action: 'REJECT',
        employeeId: user.employeeId,
        after: { reason: dto.reason ?? null },
      });

      return { id: application.id, status: 'REJECTED' };
    });
  }

  /** Full printable ledger for one loan: header + every due/collected row. */
  async ledger(user: AuthUser, loanId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const loan = await tx.loan.findFirst({
        where: { id: loanId, client: clientCenterScope(user) },
        include: {
          client: {
            select: {
              name: true,
              clientCode: true,
              memberNo: true,
              group: { select: { groupNo: true } },
              center: { select: { code: true, branch: { select: { code: true } } } },
            },
          },
          schedule: { orderBy: { dueNo: 'asc' } },
        },
      });
      if (!loan) throw new NotFoundException('Loan not found');

      return {
        loanAccount: loan.loanAccount,
        clientDisplayId: `${loan.client.center.branch.code}.${loan.client.center.code}.${loan.client.group.groupNo}.${loan.client.memberNo}`,
        clientName: loan.client.name,
        disbursalDate: loan.disbursalDate,
        loanAmount: loan.loanAmount,
        interestAmount: loan.interestAmount,
        totalAmount: loan.totalAmount,
        totalDues: loan.totalDues,
        loanType: loan.loanType,
        closedDate: loan.closedDate,
        schedule: loan.schedule.map((s) => ({
          dueNo: s.dueNo,
          dueDate: s.dueDate,
          collDate: s.collDate,
          duePri: s.duePri,
          dueInt: s.dueInt,
          dueAmt: s.dueAmt,
          collPri: s.collPri,
          collInt: s.collInt,
          collAmt: s.collAmt,
          dueBalance: s.dueBalance,
        })),
      };
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
