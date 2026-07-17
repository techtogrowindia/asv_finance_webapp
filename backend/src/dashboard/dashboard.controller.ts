import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  summary(@CurrentUser() user: AuthUser) {
    return this.dashboard.summary(user);
  }

  @Get('recent-closures')
  recentClosures(@CurrentUser() user: AuthUser) {
    return this.dashboard.recentClosures(user);
  }
}
