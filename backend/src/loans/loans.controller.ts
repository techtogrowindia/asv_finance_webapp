import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { RequirePermission } from '../common/auth/permissions.decorator';
import { AuthUser } from '../common/types/auth-user';
import { CreateLoanApplicationDto } from './dto/create-loan-application.dto';
import { DisburseLoanDto } from './dto/disburse-loan.dto';
import { RejectApplicationDto } from './dto/reject-application.dto';
import { UpdateApplicationNotesDto } from './dto/update-application-notes.dto';
import { LoansService } from './loans.service';

@Controller()
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  @RequirePermission('loan.view')
  @Get('clients/:id/loans')
  existingLoans(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.loans.existingLoans(user, id);
  }

  @RequirePermission('loan.apply')
  @Get('loan-applications/eligibility')
  eligibility(
    @CurrentUser() user: AuthUser,
    @Query('clientId', ParseUUIDPipe) clientId: string,
    @Query('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.loans.eligibility(user, clientId, productId);
  }

  @Roles('FDO', 'BM')
  @RequirePermission('loan.apply')
  @Post('loan-applications')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLoanApplicationDto) {
    return this.loans.createApplication(user, dto);
  }

  // ---- Verification & Disbursement (BM/HO) ----
  @Roles('BM', 'HO')
  @RequirePermission('loan.approve')
  @Get('loan-applications')
  list(@CurrentUser() user: AuthUser, @Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    return this.loans.listApplications(user, status);
  }

  @Roles('BM', 'HO')
  @RequirePermission('loan.approve')
  @Post('loan-applications/:id/disburse')
  disburse(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DisburseLoanDto,
  ) {
    return this.loans.disburse(user, id, dto);
  }

  @Roles('BM', 'HO')
  @RequirePermission('loan.approve')
  @Post('loan-applications/:id/reject')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectApplicationDto,
  ) {
    return this.loans.reject(user, id, dto);
  }

  @Roles('FDO', 'BM', 'HO')
  @RequirePermission('loan.apply', 'loan.approve')
  @Patch('loan-applications/:id/notes')
  updateNotes(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationNotesDto,
  ) {
    return this.loans.updateNotes(user, id, dto.notes);
  }

  @RequirePermission('loan.view')
  @Get('loans')
  loansByCenter(
    @CurrentUser() user: AuthUser,
    @Query('centerId', ParseUUIDPipe) centerId: string,
    @Query('type') type: 'OPEN' | 'CLOSED' | 'ALL' = 'OPEN',
  ) {
    return this.loans.loansByCenter(user, centerId, type);
  }

  @RequirePermission('loan.view')
  @Get('loans/:id/ledger')
  ledger(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.loans.ledger(user, id);
  }
}
