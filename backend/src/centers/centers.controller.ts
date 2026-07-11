import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { CentersService } from './centers.service';

@Controller('centers')
export class CentersController {
  constructor(private readonly centers: CentersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.centers.list(user);
  }

  @Get(':id/groups')
  groups(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.centers.groups(user, id);
  }
}
