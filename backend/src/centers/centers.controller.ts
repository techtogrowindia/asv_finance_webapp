import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { AuthUser } from '../common/types/auth-user';
import { CentersService } from './centers.service';
import { CreateCenterDto, UpdateCenterDto } from './dto/center.dto';

@Controller('centers')
export class CentersController {
  constructor(private readonly centers: CentersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.centers.list(user);
  }

  // ---- Admin management (BM/HO) ----
  @Roles('BM', 'HO')
  @Get('manage')
  adminList(@CurrentUser() user: AuthUser) {
    return this.centers.adminList(user);
  }

  @Roles('BM', 'HO')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCenterDto) {
    return this.centers.create(user, dto);
  }

  @Roles('BM', 'HO')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCenterDto,
  ) {
    return this.centers.update(user, id, dto);
  }

  @Roles('BM', 'HO')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.centers.remove(user, id);
  }

  @Get(':id/groups')
  groups(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.centers.groups(user, id);
  }
}
