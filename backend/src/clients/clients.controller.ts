import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { RequirePermission } from '../common/auth/permissions.decorator';
import { AuthUser } from '../common/types/auth-user';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { UpdateKycNumbersDto } from './dto/kyc-number.dto';
import { TransferClientDto } from './dto/transfer-client.dto';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @RequirePermission('member.view')
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('centerId') centerId?: string,
    @Query('q') q?: string,
  ) {
    return this.clients.list(user, { centerId, q });
  }

  // Must be declared before ':id' — otherwise Express would try to match
  // "kyc-pending" against the :id param (and ParseUUIDPipe would 400 on it).
  @Roles('BM', 'HO')
  @RequirePermission('member.verify')
  @Get('kyc-pending')
  kycPending(@CurrentUser() user: AuthUser) {
    return this.clients.kycPending(user);
  }

  @RequirePermission('member.view')
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.clients.get(user, id);
  }

  @Roles('BM', 'HO')
  @RequirePermission('member.transfer')
  @Post(':id/transfer')
  transfer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferClientDto,
  ) {
    return this.clients.transfer(user, id, dto);
  }

  @Roles('FDO', 'BM')
  @RequirePermission('member.create')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateClientDto) {
    return this.clients.create(user, dto);
  }

  @Roles('FDO', 'BM')
  @RequirePermission('member.edit')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clients.update(user, id, dto);
  }

  @Roles('FDO', 'BM')
  @RequirePermission('member.edit')
  @Patch(':id/kyc-numbers')
  updateKycNumbers(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKycNumbersDto,
  ) {
    return this.clients.updateKycNumbers(user, id, dto);
  }
}
