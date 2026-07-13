import { Body, Controller, Get, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { RequirePermission } from '../common/auth/permissions.decorator';
import { AuthUser } from '../common/types/auth-user';
import { CollectionsService } from './collections.service';
import { PostCollectionDto } from './dto/post-collection.dto';

@Controller('collections')
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @RequirePermission('collection.view')
  @Get('due')
  due(
    @CurrentUser() user: AuthUser,
    @Query('centerId', ParseUUIDPipe) centerId: string,
    @Query('date') date?: string,
  ) {
    return this.collections.due(user, centerId, date);
  }

  @RequirePermission('collection.view')
  @Get('demand')
  demand(
    @CurrentUser() user: AuthUser,
    @Query('type') type: 'CENTERWISE' | 'CLIENTWISE' = 'CENTERWISE',
    @Query('date') date?: string,
  ) {
    return this.collections.demand(user, { date, type });
  }

  @Roles('FDO', 'BM')
  @RequirePermission('collection.post')
  @Post()
  post(@CurrentUser() user: AuthUser, @Body() dto: PostCollectionDto) {
    return this.collections.post(user, dto);
  }
}
