import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { AuthUser } from '../common/types/auth-user';
import { EodService } from './eod.service';
import { CloseEodDto } from './dto/close-eod.dto';

@Controller('eod')
export class EodController {
  constructor(private readonly eod: EodService) {}

  @Roles('BM', 'HO')
  @Get('preview')
  preview(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.eod.preview(user, branchId);
  }

  @Roles('BM', 'HO')
  @Get('history')
  history(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.eod.history(user, branchId);
  }

  @Roles('BM', 'HO')
  @Post('close')
  close(@CurrentUser() user: AuthUser, @Body() dto: CloseEodDto) {
    return this.eod.close(user, dto);
  }
}
