import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { RequirePermission } from '../common/auth/permissions.decorator';
import { AuthUser } from '../common/types/auth-user';
import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

// Branches are the top of the domain hierarchy (Tenant -> Branch -> Center ->
// Group -> Client, invariant #3). Creating a branch is HO-only; a BM (branch
// admin) may view/rename only their OWN branch, never another one — enforced
// again in the service (list/update scope + field restrictions).
@Controller('branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Roles('BM', 'HO')
  @RequirePermission('branch.manage')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.branches.list(user);
  }

  @Roles('HO')
  @RequirePermission('branch.manage')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBranchDto) {
    return this.branches.create(user, dto);
  }

  @Roles('BM', 'HO')
  @RequirePermission('branch.manage')
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBranchDto) {
    return this.branches.update(user, id, dto);
  }
}
