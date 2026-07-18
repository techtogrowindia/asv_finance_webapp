import {
  Body,
  Controller,
  Delete,
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
import { CentersService } from './centers.service';
import { CreateCenterDto, UpdateCenterDto } from './dto/center.dto';

@Controller('centers')
export class CentersController {
  constructor(private readonly centers: CentersService) {}

  @RequirePermission('center.view')
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('branchId') branchId?: string) {
    return this.centers.list(user, branchId);
  }

  // ---- Admin management (BM/HO) ----
  @Roles('BM', 'HO')
  @RequirePermission('center.view')
  @Get('manage')
  adminList(@CurrentUser() user: AuthUser) {
    return this.centers.adminList(user);
  }

  @Roles('BM', 'HO')
  @RequirePermission('center.create')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCenterDto) {
    return this.centers.create(user, dto);
  }

  @Roles('BM', 'HO')
  @RequirePermission('center.edit')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCenterDto,
  ) {
    return this.centers.update(user, id, dto);
  }

  @Roles('BM', 'HO')
  @RequirePermission('center.delete')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.centers.remove(user, id);
  }

  @RequirePermission('center.view')
  @Get(':id/groups')
  groups(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.centers.groups(user, id);
  }
}
