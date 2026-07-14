import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { RequirePermission } from '../common/auth/permissions.decorator';
import { AuthUser } from '../common/types/auth-user';
import { EodService } from './eod.service';
import { EodAutoCloseService } from './eod-auto-close.service';
import { CloseEodDto } from './dto/close-eod.dto';

@Controller('eod')
export class EodController {
  constructor(
    private readonly eod: EodService,
    private readonly autoClose: EodAutoCloseService,
  ) {}

  @Roles('BM', 'HO')
  @RequirePermission('eod.view')
  @Get('preview')
  preview(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.eod.preview(user, branchId);
  }

  @Roles('BM', 'HO')
  @RequirePermission('eod.view')
  @Get('history')
  history(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.eod.history(user, branchId);
  }

  @Roles('BM', 'HO')
  @RequirePermission('eod.close')
  @Post('close')
  close(@CurrentUser() user: AuthUser, @Body() dto: CloseEodDto) {
    return this.eod.close(user, dto);
  }

  /** Closes every overdue day for the caller's tenant right now (doesn't require the auto-close setting). */
  @Roles('BM', 'HO')
  @RequirePermission('eod.close')
  @Post('catch-up')
  async catchUp(@CurrentUser() user: AuthUser) {
    await this.autoClose.catchUpNow(user.tenantId);
    return { done: true };
  }
}
