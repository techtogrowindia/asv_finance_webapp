import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { AuthUser } from '../common/types/auth-user';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Any employee role can read (the Enroll form needs to know whether to require it). */
  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.settings.get(user);
  }

  @Roles('BM', 'HO')
  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsDto) {
    return this.settings.update(user, dto);
  }
}
