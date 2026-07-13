import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { RequirePermission } from '../common/auth/permissions.decorator';
import { AuthUser } from '../common/types/auth-user';
import { MastersService } from './masters.service';
import { CreateFrequencyDto, UpdateFrequencyDto } from './dto/frequency.dto';
import { CreatePurposeDto, UpdatePurposeDto } from './dto/purpose.dto';
import { CreateLoanProductDto, UpdateLoanProductDto } from './dto/loan-product.dto';
import { CreateDocumentTypeDto, UpdateDocumentTypeDto } from './dto/document-type.dto';

const truthy = (v?: string) => v === 'true' || v === '1';

@Controller()
export class MastersController {
  constructor(private readonly masters: MastersService) {}

  // ---- Frequency --------------------------------------------------------------
  @Get('frequencies')
  frequencies(@CurrentUser() user: AuthUser, @Query('all') all?: string) {
    return this.masters.frequencies(user, truthy(all));
  }

  @Roles('BM', 'HO')
  @RequirePermission('master.manage')
  @Post('frequencies')
  createFrequency(@CurrentUser() user: AuthUser, @Body() dto: CreateFrequencyDto) {
    return this.masters.createFrequency(user, dto);
  }

  @Roles('BM', 'HO')
  @RequirePermission('master.manage')
  @Patch('frequencies/:id')
  updateFrequency(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFrequencyDto,
  ) {
    return this.masters.updateFrequency(user, id, dto);
  }

  // ---- Purpose ------------------------------------------------------------------
  @Get('purposes')
  purposes(@CurrentUser() user: AuthUser, @Query('q') q?: string, @Query('all') all?: string) {
    return this.masters.purposes(user, { q, includeInactive: truthy(all) });
  }

  @Roles('BM', 'HO')
  @RequirePermission('master.manage')
  @Post('purposes')
  createPurpose(@CurrentUser() user: AuthUser, @Body() dto: CreatePurposeDto) {
    return this.masters.createPurpose(user, dto);
  }

  @Roles('BM', 'HO')
  @RequirePermission('master.manage')
  @Patch('purposes/:id')
  updatePurpose(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurposeDto,
  ) {
    return this.masters.updatePurpose(user, id, dto);
  }

  // ---- Loan Product ---------------------------------------------------------------
  @Get('loan-products')
  loanProducts(@CurrentUser() user: AuthUser, @Query('all') all?: string) {
    return this.masters.loanProducts(user, truthy(all));
  }

  @Roles('BM', 'HO')
  @RequirePermission('master.manage')
  @Post('loan-products')
  createLoanProduct(@CurrentUser() user: AuthUser, @Body() dto: CreateLoanProductDto) {
    return this.masters.createLoanProduct(user, dto);
  }

  @Roles('BM', 'HO')
  @RequirePermission('master.manage')
  @Patch('loan-products/:id')
  updateLoanProduct(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLoanProductDto,
  ) {
    return this.masters.updateLoanProduct(user, id, dto);
  }

  // ---- Document Type ---------------------------------------------------------------
  @Get('document-types')
  documentTypes(@CurrentUser() user: AuthUser, @Query('all') all?: string) {
    return this.masters.documentTypes(user, truthy(all));
  }

  @Roles('BM', 'HO')
  @RequirePermission('master.manage')
  @Post('document-types')
  createDocumentType(@CurrentUser() user: AuthUser, @Body() dto: CreateDocumentTypeDto) {
    return this.masters.createDocumentType(user, dto);
  }

  @Roles('BM', 'HO')
  @RequirePermission('master.manage')
  @Patch('document-types/:id')
  updateDocumentType(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentTypeDto,
  ) {
    return this.masters.updateDocumentType(user, id, dto);
  }
}
