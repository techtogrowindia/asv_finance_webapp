import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Public } from '../common/auth/public.decorator';
import { AuthUser } from '../common/types/auth-user';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  /** Current identity — used by the web app after login / on refresh. */
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const workingDate = await this.auth.workingDate(user);
    return {
      id: user.employeeId,
      name: user.name,
      code: user.code,
      role: user.role,
      branchId: user.branchId,
      permissions: user.permissions,
      workingDate,
    };
  }
}
