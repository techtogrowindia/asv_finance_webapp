import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { MastersService } from './masters.service';

@Controller()
export class MastersController {
  constructor(private readonly masters: MastersService) {}

  @Get('frequencies')
  frequencies(@CurrentUser() user: AuthUser) {
    return this.masters.frequencies(user);
  }

  @Get('purposes')
  purposes(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.masters.purposes(user, q);
  }

  @Get('loan-products')
  loanProducts(@CurrentUser() user: AuthUser) {
    return this.masters.loanProducts(user);
  }
}
