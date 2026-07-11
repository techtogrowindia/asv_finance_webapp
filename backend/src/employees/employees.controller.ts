import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { AuthUser } from '../common/types/auth-user';
import { EmployeesService } from './employees.service';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Roles('BM', 'HO')
  @Get('field-officers')
  fieldOfficers(@CurrentUser() user: AuthUser) {
    return this.employees.fieldOfficers(user);
  }
}
