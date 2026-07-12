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
      return { requireLoanProductAtEnrollment: tenant.requireLoanProductAtEnrollment };
    });
  }

  async update(user: AuthUser, dto: UpdateSettingsDto) {
    return this.prisma.withTenant(user, async (tx) => {
      const tenant = await tx.tenant.update({
        where: { id: user.tenantId },
        data: { requireLoanProductAtEnrollment: dto.requireLoanProductAtEnrollment },
      });
      return { requireLoanProductAtEnrollment: tenant.requireLoanProductAtEnrollment };
    });
  }
}
