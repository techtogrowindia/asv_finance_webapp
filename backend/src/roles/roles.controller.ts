import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { RequirePermission } from '../common/auth/permissions.decorator';
import { AuthUser } from '../common/types/auth-user';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Roles('BM', 'HO')
  @RequirePermission('role.manage')
  @Get('permissions')
  permissions() {
    return this.roles.catalog();
  }

  // Used by the employee form; available to anyone who can manage employees.
  @Roles('BM', 'HO')
  @RequirePermission('employee.manage')
  @Get('assignable')
  assignable(@CurrentUser() user: AuthUser) {
    return this.roles.assignable(user);
  }

  @Roles('BM', 'HO')
  @RequirePermission('role.manage')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.roles.list(user);
  }

  @Roles('BM', 'HO')
  @RequirePermission('role.manage')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRoleDto) {
    return this.roles.create(user, dto);
  }

  @Roles('BM', 'HO')
  @RequirePermission('role.manage')
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(user, id, dto);
  }

  @Roles('BM', 'HO')
  @RequirePermission('role.manage')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.roles.remove(user, id);
  }
}
