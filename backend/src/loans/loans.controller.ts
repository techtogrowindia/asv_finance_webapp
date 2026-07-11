import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { AuthUser } from '../common/types/auth-user';
import { CreateLoanApplicationDto } from './dto/create-loan-application.dto';
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
}
