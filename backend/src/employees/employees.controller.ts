import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { RequirePermission } from '../common/auth/permissions.decorator';
import { AuthUser } from '../common/types/auth-user';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Roles('BM', 'HO')
  @Get('field-officers')
  fieldOfficers(@CurrentUser() user: AuthUser) {
    return this.employees.fieldOfficers(user);
  }

  @Roles('BM', 'HO')
  @Get('branches')
  branches(@CurrentUser() user: AuthUser) {
    return this.employees.branches(user);
  }

  @Roles('BM', 'HO')
  @RequirePermission('employee.manage')
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.employees.list(user, { role, status, q });
  }

  @Roles('BM', 'HO')
  @RequirePermission('employee.manage')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEmployeeDto) {
    return this.employees.create(user, dto);
  }

  @Roles('BM', 'HO')
  @RequirePermission('employee.manage')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employees.update(user, id, dto);
  }

  @Roles('BM', 'HO')
  @RequirePermission('employee.manage')
  @Post(':id/reset-password')
  resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.employees.resetPassword(user, id, dto);
  }
}
