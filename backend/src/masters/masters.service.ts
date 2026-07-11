import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth-user';
import { CreateFrequencyDto, UpdateFrequencyDto } from './dto/frequency.dto';
import { CreatePurposeDto, UpdatePurposeDto } from './dto/purpose.dto';
import { CreateLoanProductDto, UpdateLoanProductDto } from './dto/loan-product.dto';
import { CreateDocumentTypeDto, UpdateDocumentTypeDto } from './dto/document-type.dto';

/**
 * Masters (Loan Product, Frequency, Purpose, Document Type) are admin-managed
 * data, never hardcoded in the frontend. Every dependent record (LoanApplication,
 * Loan, KycDocument) references these by UUID, so editing a master here is
 * automatically reflected everywhere it's referenced — no denormalized copies.
 * "Delete" is a soft isActive=false toggle, since existing records may still
 * point at the row (preserves history / referential integrity).
 */
@Injectable()
export class MastersService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Frequency ------------------------------------------------------------
  frequencies(user: AuthUser, includeInactive = false) {
    return this.prisma.withTenant(user, (tx) =>
      tx.frequency.findMany({
        where: includeInactive ? {} : { isActive: true },
        orderBy: { daysBetween: 'asc' },
      }),
    );
  }

  createFrequency(user: AuthUser, dto: CreateFrequencyDto) {
    return this.prisma.withTenant(user, (tx) =>
      tx.frequency.create({ data: { tenantId: user.tenantId, ...dto } }),
    );
  }

  async updateFrequency(user: AuthUser, id: string, dto: UpdateFrequencyDto) {
    return this.prisma.withTenant(user, async (tx) => {
      await this.assertExists(tx.frequency, id, 'Frequency');
      return tx.frequency.update({ where: { id }, data: dto });
    });
  }

  // ---- Purpose ----------------------------------------------------------------
  purposes(user: AuthUser, opts: { q?: string; includeInactive?: boolean } = {}) {
    return this.prisma.withTenant(user, (tx) =>
      tx.purpose.findMany({
        where: {
          ...(opts.includeInactive ? {} : { isActive: true }),
          ...(opts.q ? { name: { contains: opts.q, mode: 'insensitive' } } : {}),
        },
        orderBy: { name: 'asc' },
        take: 200,
      }),
    );
  }

  createPurpose(user: AuthUser, dto: CreatePurposeDto) {
    return this.prisma.withTenant(user, (tx) =>
      tx.purpose.create({ data: { tenantId: user.tenantId, ...dto } }),
    );
  }

  async updatePurpose(user: AuthUser, id: string, dto: UpdatePurposeDto) {
    return this.prisma.withTenant(user, async (tx) => {
      await this.assertExists(tx.purpose, id, 'Purpose');
      return tx.purpose.update({ where: { id }, data: dto });
    });
  }

  // ---- Loan Product -----------------------------------------------------------
  async loanProducts(user: AuthUser, includeInactive = false) {
    return this.prisma.withTenant(user, async (tx) => {
      const products = await tx.loanProduct.findMany({
        where: includeInactive ? {} : { isActive: true },
        orderBy: { loanAmount: 'asc' },
        include: { frequency: true },
      });
      return products.map((p) => ({
        id: p.id,
        name: p.name,
        loanAmount: p.loanAmount,
        totalDues: p.totalDues,
        interestAmount: p.interestAmount,
        frequencyId: p.frequencyId,
        frequencyCode: p.frequency.code,
        isActive: p.isActive,
      }));
    });
  }

  createLoanProduct(user: AuthUser, dto: CreateLoanProductDto) {
    return this.prisma.withTenant(user, (tx) =>
      tx.loanProduct.create({ data: { tenantId: user.tenantId, ...dto } }),
    );
  }

  async updateLoanProduct(user: AuthUser, id: string, dto: UpdateLoanProductDto) {
    return this.prisma.withTenant(user, async (tx) => {
      await this.assertExists(tx.loanProduct, id, 'Loan product');
      return tx.loanProduct.update({ where: { id }, data: dto });
    });
  }

  // ---- Document Type ------------------------------------------------------------
  documentTypes(user: AuthUser, includeInactive = false) {
    return this.prisma.withTenant(user, (tx) =>
      tx.documentType.findMany({
        where: includeInactive ? {} : { isActive: true },
        orderBy: { name: 'asc' },
      }),
    );
  }

  createDocumentType(user: AuthUser, dto: CreateDocumentTypeDto) {
    return this.prisma.withTenant(user, (tx) =>
      tx.documentType.create({ data: { tenantId: user.tenantId, ...dto } }),
    );
  }

  async updateDocumentType(user: AuthUser, id: string, dto: UpdateDocumentTypeDto) {
    return this.prisma.withTenant(user, async (tx) => {
      await this.assertExists(tx.documentType, id, 'Document type');
      return tx.documentType.update({ where: { id }, data: dto });
    });
  }

  private async assertExists(
    model: { findUnique: (args: { where: { id: string } }) => Promise<unknown> },
    id: string,
    label: string,
  ) {
    const found = await model.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`${label} not found`);
  }
}
