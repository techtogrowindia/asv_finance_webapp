import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types/auth-user';
import { EodService } from './eod.service';

const IST_OFFSET_MIN = 5 * 60 + 30;
const MAX_DAYS_PER_BRANCH = 60; // safety cap so a stuck branch can't loop forever

/** "Today" as a UTC-midnight-stamped Date, but the calendar day as seen in IST. */
function todayIST(): Date {
  const shifted = new Date(Date.now() + IST_OFFSET_MIN * 60_000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

/**
 * Optional automation for CLAUDE.md invariant #4 (working_date, never now()):
 * when a tenant opts in (Business Settings), this catches each branch's
 * working_date up to today by closing every overdue day — safe to automate
 * because EOD figures are fully computed from ledger data, never manually
 * entered (see EodService.close/computeFigures).
 */
@Injectable()
export class EodAutoCloseService {
  private readonly logger = new Logger(EodAutoCloseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eod: EodService,
  ) {}

  // Fires at 18:30 UTC = 00:00 IST, right at the India business-day rollover.
  @Cron('30 18 * * *')
  async handleCron() {
    await this.run();
  }

  /** Nightly sweep: every tenant that has opted in via Business Settings. */
  async run() {
    const tenants = await this.prisma.tenant.findMany({ where: { autoCloseEod: true, isActive: true } });
    for (const tenant of tenants) {
      try {
        await this.closeTenant(tenant.id);
      } catch (e) {
        this.logger.error(`Auto-close failed for tenant ${tenant.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  /** Manual "catch up now" trigger for one tenant — works regardless of the auto-close toggle. */
  async catchUpNow(tenantId: string) {
    await this.closeTenant(tenantId);
  }

  private async closeTenant(tenantId: string) {
    const admin = await this.prisma.employee.findFirst({
      where: { tenantId, status: 'ACTIVE', role: { in: ['HO', 'BM'] } },
      orderBy: { role: 'asc' },
    });
    if (!admin) return; // nobody to attribute the closing to — skip until one exists

    const branches = await this.prisma.branch.findMany({ where: { tenantId, isActive: true } });
    const today = todayIST();

    for (const branch of branches) {
      for (let i = 0; i < MAX_DAYS_PER_BRANCH; i++) {
        const fresh = await this.prisma.branch.findUnique({ where: { id: branch.id } });
        if (!fresh || fresh.workingDate >= today) break;

        const systemUser: AuthUser = {
          tenantId,
          branchId: fresh.id,
          role: 'HO',
          employeeId: admin.id,
          name: 'System (auto-close)',
          code: 'SYSTEM',
          permissions: [],
        };
        await this.eod.close(systemUser, { branchId: fresh.id });
      }
    }
  }
}
