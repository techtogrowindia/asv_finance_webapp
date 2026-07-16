import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/types/auth-user';
import { centerScope, clientCenterScope } from '../common/scope';
import { stripLeadingZeros } from '../common/format.util';
import { generateSchedule, round2 } from './schedule.util';
import { CreateLoanApplicationDto } from './dto/create-loan-application.dto';
import { DisburseLoanDto } from './dto/disburse-loan.dto';
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

  /** All loans in one center (Client Loan Schedule list), filtered by loan type. */
  async loansByCenter(user: AuthUser, centerId: string, type: 'OPEN' | 'CLOSED' | 'ALL') {
    return this.prisma.withTenant(user, async (tx) => {
      const center = await tx.center.findFirst({
        where: { id: centerId, ...centerScope(user) },
        include: { branch: { select: { code: true } } },
      });
      if (!center) throw new ForbiddenException('Center not assigned to you');

      const loans = await tx.loan.findMany({
        where: {
          client: { centerId },
          ...(type === 'ALL' ? {} : { loanType: type }),
        },
        orderBy: [{ client: { group: { groupNo: 'asc' } } }, { client: { memberNo: 'asc' } }, { disbursalDate: 'desc' }],
        include: {
          client: { select: { name: true, memberNo: true, group: { select: { groupNo: true } } } },
        },
      });

      return loans.map((loan) => ({
        id: loan.id,
        loanAccount: loan.loanAccount,
        displayId: `${stripLeadingZeros(center.branch.code)}.${stripLeadingZeros(center.code)}.${loan.client.group.groupNo}.${loan.client.memberNo}`,
        clientName: loan.client.name,
        disbursalDate: loan.disbursalDate,
        loanAmount: loan.loanAmount,
        loanType: loan.loanType,
      }));
    });
  }

  /** Eligibility warnings + implied sanctioned amount for a client + product. */
  async eligibility(user: AuthUser, clientId: string, productId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: clientId, ...clientCenterScope(user) },
        include: { coApplicant: true },
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
        include: { coApplicant: true },
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
          appNo: await this.nextAppNo(tx, user.tenantId),
          productId: product.id,
          purposeId: purpose.id,
          requestedAmount: product.loanAmount,
          status: 'PENDING',
          warnings: warnings as unknown as Prisma.InputJsonValue,
          notes: dto.notes?.trim() || null,
          createdBy: user.employeeId,
        },
      });

      return { id: application.id, appNo: application.appNo, status: application.status, warnings, requestedAmount: product.loanAmount };
    });
  }

  /** Next tenant-scoped application number, e.g. APP000123. */
  private async nextAppNo(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
    const n = (await tx.loanApplication.count({ where: { tenantId } })) + 1;
    return `APP${String(n).padStart(6, '0')}`;
  }

  /** Reviewer (BM/HO) note, added on the Loan Verification screen. Separate from
   *  the FDO's employee note (edited via updateApplication). */
  async updateApproverNotes(user: AuthUser, applicationId: string, approverNotes: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const application = await tx.loanApplication.findFirst({
        where: { id: applicationId, client: clientCenterScope(user) },
      });
      if (!application) throw new NotFoundException('Loan application not found');

      const updated = await tx.loanApplication.update({
        where: { id: applicationId },
        data: { approverNotes: approverNotes.trim() || null },
      });
      return { id: updated.id, approverNotes: updated.approverNotes };
    });
  }

  /** Edit a still-pending application (mistaken submission): the FDO may change
   *  member, product, purpose and the employee note. Re-runs eligibility and
   *  re-syncs the requested amount from the (possibly new) product. Blocked once
   *  the application has been approved or rejected. */
  async updateApplication(user: AuthUser, applicationId: string, dto: CreateLoanApplicationDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const application = await tx.loanApplication.findFirst({
        where: { id: applicationId, client: clientCenterScope(user) },
      });
      if (!application) throw new NotFoundException('Loan application not found');
      // A pending application can be corrected; a rejected one can be edited and
      // resubmitted (goes back to PENDING). An approved (disbursed) one is locked.
      if (application.status === 'APPROVED') {
        throw new BadRequestException('An approved application can no longer be edited');
      }

      const client = await tx.client.findFirst({
        where: { id: dto.clientId, ...clientCenterScope(user) },
        include: { coApplicant: true },
      });
      if (!client) throw new ForbiddenException('Member not in your assigned centers');

      const product = await tx.loanProduct.findFirst({ where: { id: dto.productId, isActive: true } });
      if (!product) throw new BadRequestException('Loan product not found');

      const purpose = await tx.purpose.findFirst({ where: { id: dto.purposeId, isActive: true } });
      if (!purpose) throw new BadRequestException('Purpose not found');

      const warnings = await this.computeWarnings(tx, client, user.tenantId);
      const resubmitted = application.status === 'REJECTED';

      const updated = await tx.loanApplication.update({
        where: { id: applicationId },
        data: {
          clientId: client.id,
          productId: product.id,
          purposeId: purpose.id,
          requestedAmount: product.loanAmount,
          warnings: warnings as unknown as Prisma.InputJsonValue,
          notes: dto.notes?.trim() || null,
          // Editing a rejected application resubmits it for review; clear the
          // reviewer's rejection note so the new reviewer starts fresh.
          ...(resubmitted ? { status: 'PENDING' as const, approverNotes: null } : {}),
        },
      });
      return { id: updated.id, appNo: updated.appNo, status: updated.status, resubmitted, warnings, requestedAmount: product.loanAmount };
    });
  }

  /** A member's loan applications (for the Loan Application screen: view/edit
   *  pending ones). FDO-accessible, scoped to the caller's centers. */
  async applicationsForClient(user: AuthUser, clientId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const client = await tx.client.findFirst({ where: { id: clientId, ...clientCenterScope(user) } });
      if (!client) throw new NotFoundException('Member not found');

      const apps = await tx.loanApplication.findMany({
        where: { clientId },
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { id: true, name: true, loanAmount: true } },
          purpose: { select: { id: true, name: true } },
        },
      });
      return apps.map((a) => ({
        id: a.id,
        appNo: a.appNo,
        productId: a.productId,
        productName: a.product.name,
        purposeId: a.purposeId,
        purposeName: a.purpose.name,
        requestedAmount: a.requestedAmount,
        notes: a.notes,
        approverNotes: a.approverNotes,
        status: a.status,
        createdAt: a.createdAt,
      }));
    });
  }

  /** Resolve an application number (e.g. APP000123) to its member + the
   *  application id, so the Loan Application screen can open it for editing. */
  async findApplicationByNo(user: AuthUser, appNo: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const app = await tx.loanApplication.findFirst({
        where: { appNo: { equals: appNo.trim(), mode: 'insensitive' }, client: clientCenterScope(user) },
        include: { client: { select: { id: true, name: true, centerId: true } } },
      });
      if (!app) throw new NotFoundException('Application not found');
      return {
        applicationId: app.id,
        appNo: app.appNo,
        clientId: app.client.id,
        clientName: app.client.name,
        centerId: app.client.centerId,
        status: app.status,
      };
    });
  }

  /** Resolve a loan account number to its member (Loan Application screen search
   *  box — jump straight to a member without the center→member cascade). */
  async findLoanByAccount(user: AuthUser, account: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const loan = await tx.loan.findFirst({
        where: {
          loanAccount: { equals: account.trim(), mode: 'insensitive' },
          client: clientCenterScope(user),
        },
        include: { client: { select: { id: true, name: true, centerId: true } } },
      });
      if (!loan) throw new NotFoundException('No loan found with that account number in your centers');
      return { clientId: loan.client.id, clientName: loan.client.name, centerId: loan.client.centerId, loanAccount: loan.loanAccount };
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
          client: {
            select: {
              id: true,
              clientCode: true,
              name: true,
              memberNo: true,
              group: { select: { groupNo: true } },
              center: { select: { code: true, name: true, branch: { select: { code: true } } } },
            },
          },
          product: { select: { name: true, loanAmount: true, totalDues: true } },
          purpose: { select: { name: true } },
          loan: { select: { loanAccount: true } },
        },
      });
      return applications.map((a) => ({
        id: a.id,
        appNo: a.appNo,
        clientId: a.client.id,
        clientCode: a.client.clientCode,
        clientName: a.client.name,
        displayId: `${stripLeadingZeros(a.client.center.branch.code)}.${stripLeadingZeros(a.client.center.code)}.${a.client.group.groupNo}.${a.client.memberNo}`,
        centerName: `${a.client.center.code} — ${a.client.center.name}`,
        productName: a.product.name,
        loanAmount: a.product.loanAmount,
        totalDues: a.product.totalDues,
        purposeName: a.purpose.name,
        requestedAmount: a.requestedAmount,
        loanAccount: a.loan?.loanAccount ?? null,
        status: a.status,
        warnings: (a.warnings as string[] | null) ?? [],
        notes: a.notes,
        approverNotes: a.approverNotes,
        createdAt: a.createdAt,
      }));
    });
  }

  /**
   * Approve a pending application: creates the Loan + full RepaymentSchedule.
   * Disbursal date and due-start date both default to the branch's working
   * date but can be overridden (e.g. backdating a disbursal that happened in
   * the field a few days ago, or scheduling the first due for the center's
   * next meeting rather than today) — never system now(), still bounded by
   * the working date so nothing can be disbursed "in the future".
   */
  async disburse(user: AuthUser, applicationId: string, dto: DisburseLoanDto = {}) {
    return this.prisma.withTenant(user, async (tx) => {
      const application = await tx.loanApplication.findFirst({
        where: { id: applicationId, client: clientCenterScope(user) },
        include: {
          client: { select: { id: true, clientCode: true, status: true, center: { select: { branchId: true } } } },
          product: { include: { frequency: true } },
        },
      });
      if (!application) throw new NotFoundException('Loan application not found');
      if (application.status !== 'PENDING') {
        throw new BadRequestException(`Application is already ${application.status}`);
      }
      if (application.client.status !== 'ACTIVE') {
        throw new BadRequestException(
          'Member is not KYC-active yet — approve all mandatory documents before disbursing',
        );
      }

      const branch = await tx.branch.findUnique({ where: { id: application.client.center.branchId } });
      const workingDate = branch?.workingDate ?? new Date();

      const disbursalDate = dto.disbursalDate ? new Date(dto.disbursalDate) : workingDate;
      const dueStartDate = dto.dueStartDate ? new Date(dto.dueStartDate) : workingDate;
      if (disbursalDate > workingDate) {
        throw new BadRequestException("Disbursal date can't be after the branch's working date");
      }
      if (dueStartDate < disbursalDate) {
        throw new BadRequestException("Due start date can't be before the disbursal date");
      }

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
        dueStartDate,
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
          disbursalDate,
          dueStartDate,
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
        after: { loanAccount, loanAmount, interestAmount, totalDues, disbursalDate, dueStartDate },
      });

      return { id: loan.id, loanAccount, disbursalDate, dueStartDate, maturityDate };
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
        clientDisplayId: `${stripLeadingZeros(loan.client.center.branch.code)}.${stripLeadingZeros(loan.client.center.code)}.${loan.client.group.groupNo}.${loan.client.memberNo}`,
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

  /** Combined per-loan statement: the loan ledger (with a per-instalment savings
   *  column) plus the loan's savings passbook and its savings account number. */
  async loanStatement(user: AuthUser, loanId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const loan = await tx.loan.findFirst({
        where: { id: loanId, client: clientCenterScope(user) },
        include: {
          client: {
            select: {
              name: true, savingsAccount: true, memberNo: true,
              group: { select: { groupNo: true } },
              center: { select: { code: true, branch: { select: { code: true } } } },
            },
          },
          schedule: { orderBy: { dueNo: 'asc' } },
        },
      });
      if (!loan) throw new NotFoundException('Loan not found');
      const c = loan.client;

      const txns = await tx.savingsTxn.findMany({
        where: { loanId },
        orderBy: [{ collectedOn: 'asc' }, { createdAt: 'asc' }],
      });

      // Attribute each deposit to the instalment collected that day (per-row column).
      const depQueue = new Map<string, number[]>();
      for (const t of txns) {
        if (t.kind !== 'DEPOSIT') continue;
        const key = t.collectedOn.toISOString().slice(0, 10);
        const list = depQueue.get(key) ?? [];
        list.push(Number(t.amount));
        depQueue.set(key, list);
      }

      // Passbook with running balance.
      let bal = 0;
      const savings = txns.map((t) => {
        const deposit = t.kind === 'DEPOSIT' ? Number(t.amount) : 0;
        const refund = t.kind === 'REFUND' ? Number(t.amount) : 0;
        bal = round2(bal + deposit - refund);
        return { date: t.collectedOn, kind: t.kind, deposit, refund, balance: bal };
      });

      return {
        loanAccount: loan.loanAccount,
        savingsAccount: `${c.savingsAccount}_${loan.loanAccount}`,
        clientDisplayId: `${stripLeadingZeros(c.center.branch.code)}.${stripLeadingZeros(c.center.code)}.${c.group.groupNo}.${c.memberNo}`,
        clientName: c.name,
        disbursalDate: loan.disbursalDate,
        loanAmount: loan.loanAmount,
        interestAmount: loan.interestAmount,
        totalAmount: loan.totalAmount,
        totalDues: loan.totalDues,
        loanType: loan.loanType,
        closedDate: loan.closedDate,
        schedule: loan.schedule.map((s) => {
          let rowSavings = 0;
          if (s.collDate) {
            const list = depQueue.get(s.collDate.toISOString().slice(0, 10));
            if (list && list.length) rowSavings = list.shift()!;
          }
          return {
            dueNo: s.dueNo, dueDate: s.dueDate, collDate: s.collDate,
            duePri: s.duePri, dueInt: s.dueInt, dueAmt: s.dueAmt,
            collPri: s.collPri, collInt: s.collInt, collAmt: s.collAmt,
            savings: rowSavings, dueBalance: s.dueBalance,
          };
        }),
        savings,
      };
    });
  }

  /** Per-loan savings account = `‹member savings no›_‹loan a/c›`. Each loan has
   *  its own savings sub-account; this returns its passbook (deposits/refunds +
   *  running balance). */
  async loanSavingsLedger(user: AuthUser, loanId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const loan = await tx.loan.findFirst({
        where: { id: loanId, client: clientCenterScope(user) },
        include: {
          client: {
            select: {
              name: true, savingsAccount: true, memberNo: true,
              group: { select: { groupNo: true } },
              center: { select: { code: true, branch: { select: { code: true } } } },
            },
          },
        },
      });
      if (!loan) throw new NotFoundException('Loan not found');

      const txns = await tx.savingsTxn.findMany({
        where: { loanId },
        orderBy: [{ collectedOn: 'asc' }, { createdAt: 'asc' }],
      });
      let balance = 0;
      const rows = txns.map((t) => {
        const deposit = t.kind === 'DEPOSIT' ? Number(t.amount) : 0;
        const refund = t.kind === 'REFUND' ? Number(t.amount) : 0;
        balance = round2(balance + deposit - refund);
        return { date: t.collectedOn, kind: t.kind, deposit, refund, balance };
      });
      const c = loan.client;
      return {
        loanId: loan.id,
        loanAccount: loan.loanAccount,
        savingsAccount: `${c.savingsAccount}_${loan.loanAccount}`,
        clientName: c.name,
        displayId: `${stripLeadingZeros(c.center.branch.code)}.${stripLeadingZeros(c.center.code)}.${c.group.groupNo}.${c.memberNo}`,
        balance,
        rows,
      };
    });
  }

  /** One savings account per loan in a center (Savings report list). */
  async centerSavingsAccounts(user: AuthUser, centerId: string) {
    return this.prisma.withTenant(user, async (tx) => {
      const center = await tx.center.findFirst({
        where: { id: centerId, ...centerScope(user) },
        include: { branch: { select: { code: true } } },
      });
      if (!center) throw new ForbiddenException('Center not assigned to you');

      const loans = await tx.loan.findMany({
        where: { client: { centerId } },
        orderBy: [{ client: { group: { groupNo: 'asc' } } }, { client: { memberNo: 'asc' } }, { disbursalDate: 'desc' }],
        include: {
          client: { select: { name: true, savingsAccount: true, memberNo: true, group: { select: { groupNo: true } } } },
        },
      });

      const balances = await tx.savingsTxn.groupBy({
        by: ['loanId', 'kind'],
        where: { loanId: { in: loans.map((l) => l.id) } },
        _sum: { amount: true },
      });
      const net = new Map<string, number>();
      for (const b of balances) {
        if (!b.loanId) continue;
        const delta = (b.kind === 'DEPOSIT' ? 1 : -1) * Number(b._sum.amount ?? 0);
        net.set(b.loanId, round2((net.get(b.loanId) ?? 0) + delta));
      }

      return loans.map((l) => ({
        loanId: l.id,
        loanAccount: l.loanAccount,
        savingsAccount: `${l.client.savingsAccount}_${l.loanAccount}`,
        clientName: l.client.name,
        displayId: `${stripLeadingZeros(center.branch.code)}.${stripLeadingZeros(center.code)}.${l.client.group.groupNo}.${l.client.memberNo}`,
        disbursalDate: l.disbursalDate,
        closedDate: l.closedDate,
        loanType: l.loanType,
        balance: net.get(l.id) ?? 0,
      }));
    });
  }

  /** Loan-balance / arrear / missing-document warnings, matching the reference's yellow list. */
  private async computeWarnings(
    tx: Prisma.TransactionClient,
    client: { id: string; status: string; coApplicant: unknown },
    tenantId: string,
  ): Promise<string[]> {
    const warnings: string[] = [];

    // Advisory only — disbursement is the hard gate (see disburse()); this just
    // surfaces it early so the FDO/BM see it before submitting.
    if (client.status !== 'ACTIVE') {
      warnings.push('Member KYC Not Yet Fully Approved — Required Before Disbursement');
    }

    const openLoan = await tx.loan.findFirst({ where: { clientId: client.id, loanType: 'OPEN' } });
    if (openLoan) {
      warnings.push('Loan Balance Exists For This Client');

      const branch = await tx.branch.findFirst({ where: { tenantId } });
      const workingDate = branch?.workingDate ?? new Date();
      const schedule = await tx.repaymentSchedule.findMany({ where: { loanId: openLoan.id } });
      const hasArrear = schedule.some((s) => s.dueDate <= workingDate && Number(s.collAmt) < Number(s.dueAmt));
      if (hasArrear) warnings.push('Arrear Exists For This Client');
    }

    // DocumentType is the single admin-managed source of truth for both the
    // photo requirement (KycDocument) and the number requirement (KycNumber).
    const requiredTypes = await tx.documentType.findMany({ where: { tenantId, isMandatory: true, isActive: true } });
    const uploadedDocs = await tx.kycDocument.findMany({ where: { clientId: client.id } });
    const enteredNumbers = await tx.kycNumber.findMany({ where: { clientId: client.id } });
    const docKey = new Set(uploadedDocs.map((d) => `${d.documentTypeId}:${d.party}`));
    const numberKey = new Set(enteredNumbers.map((n) => `${n.documentTypeId}:${n.party}`));
    const hasNominee = !!client.coApplicant;

    const missingPhotos: string[] = [];
    const missingNumbers: string[] = [];

    for (const dt of requiredTypes) {
      if (dt.appliesTo === 'NOMINEE' && !hasNominee) continue;
      const parties: Array<'CLIENT' | 'NOMINEE'> =
        dt.appliesTo === 'BOTH' ? (hasNominee ? ['CLIENT', 'NOMINEE'] : ['CLIENT']) : [dt.appliesTo];

      for (const party of parties) {
        // Only disambiguate the label when one type serves both parties.
        const label = dt.appliesTo === 'BOTH' ? `${party === 'NOMINEE' ? 'Nominee' : 'Client'} ${dt.name}` : dt.name;
        if (dt.requiresPhoto && !docKey.has(`${dt.id}:${party}`)) {
          missingPhotos.push(`\`${label}\` Image Not Uploaded.`);
        }
        if (dt.requiresNumber && !numberKey.has(`${dt.id}:${party}`)) {
          missingNumbers.push(`\`${label}\` Number Not Entered.`);
        }
      }
    }

    if (missingPhotos.length > 0) {
      warnings.push('KYC Documents Not Uploaded');
      warnings.push(...missingPhotos);
    }
    if (missingNumbers.length > 0) {
      warnings.push('KYC Numbers Not Entered');
      warnings.push(...missingNumbers);
    }

    return warnings;
  }
}
