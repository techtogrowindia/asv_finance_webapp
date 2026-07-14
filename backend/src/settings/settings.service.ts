import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth-user';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: AuthUser) {
    return this.prisma.withTenant(user, async (tx) => {
      const tenant = await tx.tenant.findFirst({ where: { id: user.tenantId } });
      if (!tenant) throw new NotFoundException('Tenant not found');
      return {
        requireLoanProductAtEnrollment: tenant.requireLoanProductAtEnrollment,
        autoCloseEod: tenant.autoCloseEod,
        foreclosureInterestPolicy: tenant.foreclosureInterestPolicy,
        foreclosureChargePercent: Number(tenant.foreclosureChargePercent),
        foreclosureChargeFlat: Number(tenant.foreclosureChargeFlat),
        savingsPerCollection: Number(tenant.savingsPerCollection),
      };
    });
  }

  async update(user: AuthUser, dto: UpdateSettingsDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const tenant = await tx.tenant.update({
        where: { id: user.tenantId },
        data: {
          ...('requireLoanProductAtEnrollment' in dto ? { requireLoanProductAtEnrollment: dto.requireLoanProductAtEnrollment } : {}),
          ...('autoCloseEod' in dto ? { autoCloseEod: dto.autoCloseEod } : {}),
          ...('foreclosureInterestPolicy' in dto ? { foreclosureInterestPolicy: dto.foreclosureInterestPolicy } : {}),
          ...('foreclosureChargePercent' in dto ? { foreclosureChargePercent: dto.foreclosureChargePercent } : {}),
          ...('foreclosureChargeFlat' in dto ? { foreclosureChargeFlat: dto.foreclosureChargeFlat } : {}),
          ...('savingsPerCollection' in dto ? { savingsPerCollection: dto.savingsPerCollection } : {}),
        },
      });
      return {
        requireLoanProductAtEnrollment: tenant.requireLoanProductAtEnrollment,
        autoCloseEod: tenant.autoCloseEod,
        foreclosureInterestPolicy: tenant.foreclosureInterestPolicy,
        foreclosureChargePercent: Number(tenant.foreclosureChargePercent),
        foreclosureChargeFlat: Number(tenant.foreclosureChargeFlat),
        savingsPerCollection: Number(tenant.savingsPerCollection),
      };
    });
  }
}
