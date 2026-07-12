import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { AuthUser } from '../common/types/auth-user';
import { CreateLoanApplicationDto } from './dto/create-loan-application.dto';
import { RejectApplicationDto } from './dto/reject-application.dto';
import { LoansService } from './loans.service';

@Controller()
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  @Get('clients/:id/loans')
  existingLoans(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.loans.existingLoans(user, id);
  }

  @Get('loan-applications/eligibility')
  eligibility(
    @CurrentUser() user: AuthUser,
    @Query('clientId', ParseUUIDPipe) clientId: string,
    @Query('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.loans.eligibility(user, clientId, productId);
  }

  @Roles('FDO', 'BM')
  @Post('loan-applications')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLoanApplicationDto) {
    return this.loans.createApplication(user, dto);
  }

  // ---- Verification & Disbursement (BM/HO) ----
  @Roles('BM', 'HO')
  @Get('loan-applications')
  list(@CurrentUser() user: AuthUser, @Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    return this.loans.listApplications(user, status);
  }

  @Roles('BM', 'HO')
  @Post('loan-applications/:id/disburse')
  disburse(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.loans.disburse(user, id);
  }

  @Roles('BM', 'HO')
  @Post('loan-applications/:id/reject')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectApplicationDto,
  ) {
    return this.loans.reject(user, id, dto);
  }

  @Get('loans/:id/ledger')
  ledger(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.loans.ledger(user, id);
  }
}
