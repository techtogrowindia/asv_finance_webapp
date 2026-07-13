import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { AuthUser } from '../common/types/auth-user';
import { ReportsService } from './reports.service';

function parseRange(from?: string, to?: string): [Date, Date] {
  if (!from || !to) throw new BadRequestException('from and to dates are required');
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new BadRequestException('Invalid date');
  }
  return [fromDate, toDate];
}

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Roles('BM', 'HO')
  @Get('zero-collection')
  zeroCollection(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    const [f, t] = parseRange(from, to);
    return this.reports.zeroCollection(user, f, t);
  }

  @Roles('BM', 'HO')
  @Get('collection-followup')
  collectionFollowup(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    const [f, t] = parseRange(from, to);
    return this.reports.collectionFollowup(user, f, t);
  }

  @Roles('BM', 'HO')
  @Get('advance-collection')
  advanceCollection(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    const [f, t] = parseRange(from, to);
    return this.reports.advanceCollection(user, f, t);
  }
}
