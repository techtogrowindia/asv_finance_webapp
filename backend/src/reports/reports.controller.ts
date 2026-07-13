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

  // ---- Portfolio summary reports (disbursement/collection within [from, to],
  //      outstanding/arrear as of the window's end) ---------------------------

  @Roles('BM', 'HO')
  @Get('branch-wise')
  branchWise(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    const [f, t] = parseRange(from, to);
    return this.reports.branchWise(user, f, t);
  }

  @Roles('BM', 'HO')
  @Get('center-wise')
  centerWise(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    const [f, t] = parseRange(from, to);
    return this.reports.centerWise(user, f, t);
  }

  @Roles('BM', 'HO')
  @Get('group-wise')
  groupWise(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    const [f, t] = parseRange(from, to);
    return this.reports.groupWise(user, f, t);
  }

  @Roles('BM', 'HO')
  @Get('client-wise')
  clientWise(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
  ) {
    const [f, t] = parseRange(from, to);
    return this.reports.clientWise(user, f, t, q);
  }

  @Roles('BM', 'HO')
  @Get('employee-performance')
  employeePerformance(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    const [f, t] = parseRange(from, to);
    return this.reports.employeePerformance(user, f, t);
  }
}
