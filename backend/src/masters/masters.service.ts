import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth-user';

@Injectable()
export class MastersService {
  constructor(private readonly prisma: PrismaService) {}

  frequencies(user: AuthUser) {
    return this.prisma.withTenant(user, (tx) =>
      tx.frequency.findMany({ where: { isActive: true }, orderBy: { daysBetween: 'asc' } }),
    );
  }

  purposes(user: AuthUser, q?: string) {
    return this.prisma.withTenant(user, (tx) =>
      tx.purpose.findMany({
        where: { isActive: true, ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}) },
        orderBy: { name: 'asc' },
        take: 100,
      }),
    );
  }

  async loanProducts(user: AuthUser) {
    return this.prisma.withTenant(user, async (tx) => {
      const products = await tx.loanProduct.findMany({
        where: { isActive: true },
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
      }));
    });
  }
}
