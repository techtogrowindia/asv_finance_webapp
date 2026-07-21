import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { RequirePermission } from '../common/auth/permissions.decorator';
import { AuthUser } from '../common/types/auth-user';
import { CollectionsService } from './collections.service';
import { PostCollectionDto } from './dto/post-collection.dto';
import { CenterIdDto } from './dto/center-id.dto';
import { ForecloseDto } from './dto/foreclose.dto';
import { BulkImportCollectionDto } from './dto/bulk-import-collection.dto';

@Controller('collections')
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @RequirePermission('collection.view')
  @Get('due')
  due(
    @CurrentUser() user: AuthUser,
    @Query('centerId', ParseUUIDPipe) centerId: string,
    @Query('date') date?: string,
    @Query('includeAll') includeAll?: string,
  ) {
    return this.collections.due(user, centerId, date, includeAll === 'true');
  }

  @RequirePermission('collection.view')
  @Get('demand')
  demand(
    @CurrentUser() user: AuthUser,
    @Query('type') type: 'CENTERWISE' | 'CLIENTWISE' = 'CENTERWISE',
    @Query('date') date?: string,
  ) {
    return this.collections.demand(user, { date, type });
  }

  @RequirePermission('collection.view')
  @Get('center-summary')
  centerSummary(@CurrentUser() user: AuthUser, @Query('centerId', ParseUUIDPipe) centerId: string) {
    return this.collections.centerSummary(user, centerId);
  }

  @RequirePermission('collection.view')
  @Get('arrears')
  arrears(@CurrentUser() user: AuthUser, @Query('centerId', ParseUUIDPipe) centerId: string) {
    return this.collections.arrears(user, centerId);
  }

  @Roles('FDO', 'BM')
  @RequirePermission('collection.post')
  @Post()
  post(@CurrentUser() user: AuthUser, @Body() dto: PostCollectionDto) {
    return this.collections.post(user, dto);
  }

  @Roles('FDO', 'BM')
  @RequirePermission('collection.post')
  @Post('bulk-demand')
  bulkDemand(@CurrentUser() user: AuthUser, @Body() dto: CenterIdDto) {
    return this.collections.bulkCollectDemand(user, dto.centerId);
  }

  // Excel-import bulk collection — one row per loan account, from a sheet the
  // FDO fills out in the field and uploads back (parsed client-side).
  @Roles('FDO', 'BM')
  @RequirePermission('collection.post')
  @Post('bulk-import')
  bulkImport(@CurrentUser() user: AuthUser, @Body() dto: BulkImportCollectionDto) {
    return this.collections.bulkImport(user, dto);
  }

  // ---- Loan Advance (BM/HO — collection.advance) ----
  @RequirePermission('collection.advance')
  @Get('advances')
  advances(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.collections.advanceLoans(user, branchId);
  }

  @RequirePermission('collection.advance')
  @Post(':loanId/apply-advance')
  applyAdvance(@CurrentUser() user: AuthUser, @Param('loanId', ParseUUIDPipe) loanId: string) {
    return this.collections.applyAdvance(user, loanId);
  }

  // ---- Foreclosure (BM/HO — collection.foreclose) ----
  @RequirePermission('collection.foreclose')
  @Get(':loanId/foreclosure-quote')
  foreclosureQuote(
    @CurrentUser() user: AuthUser,
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Query('waiveInterest') waiveInterest?: string,
  ) {
    const waive = waiveInterest !== undefined ? Number(waiveInterest) : undefined;
    return this.collections.foreclosureQuote(user, loanId, Number.isFinite(waive) ? waive : undefined);
  }

  @Roles('BM', 'HO')
  @RequirePermission('collection.foreclose')
  @Post(':loanId/foreclose')
  foreclose(
    @CurrentUser() user: AuthUser,
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Body() dto: ForecloseDto,
  ) {
    return this.collections.foreclose(user, loanId, dto.waiveInterest);
  }

  // ---- Savings (view balances; refund is BM/HO — savings.refund) ----
  @RequirePermission('report.portfolio')
  @Get('savings/balances')
  savingsBalances(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.collections.savingsBalances(user, branchId);
  }

  @Roles('BM', 'HO')
  @RequirePermission('savings.refund')
  @Post('savings/:clientId/refund')
  refundSavings(@CurrentUser() user: AuthUser, @Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.collections.refundSavings(user, clientId);
  }
}
