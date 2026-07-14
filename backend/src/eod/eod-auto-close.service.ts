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
 * entered (see EodService.close/computeFigures). Every query goes through
 * PrismaService.withTenant() — RLS enforces tenant isolation even here;
 * the one exception is cross-tenant discovery for the nightly sweep, which
 * (like login) goes through a SECURITY DEFINER function — see rls.sql.
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

  /** Nightly sweep across every tenant that has opted in via Business Settings. */
  async run() {
    const candidates = await this.prisma.$queryRaw<{ tenant_id: string; branch_id: string }[]>`
      SELECT tenant_id, branch_id FROM eod_autoclose_candidates()
    `;
    for (const c of candidates) {
      try {
        await this.closeOverdueDays(c.tenant_id, c.branch_id);
      } catch (e) {
        this.logger.error(`Auto-close failed for branch ${c.branch_id}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  /** Manual "catch up now" — every branch the calling BM/HO can see (mirrors EodService.resolveBranch scoping). */
  async catchUpNow(user: AuthUser) {
    const branches = await this.prisma.withTenant(user, (tx) =>
      tx.branch.findMany({
        where: { isActive: true, ...(user.role === 'BM' && user.branchId ? { id: user.branchId } : {}) },
      }),
    );
    for (const branch of branches) {
      await this.closeOverdueDays(user.tenantId, branch.id, user.employeeId);
    }
  }

  /** Closes one branch's overdue days one at a time — each close() re-reads the now-current working_date. */
  private async closeOverdueDays(tenantId: string, branchId: string, employeeId?: string) {
    const doneBy = employeeId ?? (await this.findAdmin(tenantId, branchId));
    if (!doneBy) return; // no employee to attribute the closing to yet — skip until one exists

    const ctx: AuthUser = {
      tenantId,
      branchId,
      role: 'HO',
      employeeId: doneBy,
      name: 'System (auto-close)',
      code: 'SYSTEM',
      permissions: [],
    };
    const today = todayIST();

    for (let i = 0; i < MAX_DAYS_PER_BRANCH; i++) {
      const fresh = await this.prisma.withTenant(ctx, (tx) => tx.branch.findUnique({ where: { id: branchId } }));
      if (!fresh || fresh.workingDate >= today) break;
      await this.eod.close(ctx, { branchId });
    }
  }

  private async findAdmin(tenantId: string, branchId: string): Promise<string | null> {
    const bootstrapCtx: AuthUser = {
      tenantId,
      branchId,
      role: 'HO',
      employeeId: tenantId, // placeholder — not read by this query, just needs to be a valid uuid
      name: 'System (auto-close)',
      code: 'SYSTEM',
      permissions: [],
    };
    const admin = await this.prisma.withTenant(bootstrapCtx, (tx) =>
      tx.employee.findFirst({ where: { status: 'ACTIVE', role: { in: ['HO', 'BM'] } }, orderBy: { role: 'asc' } }),
    );
    return admin?.id ?? null;
  }
}
