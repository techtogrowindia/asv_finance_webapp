import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../types/auth-user';
import { PERMS_KEY } from './permissions.decorator';

/** Enforces @RequirePermission(...) on routes. Runs after JwtAuthGuard/RolesGuard. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    const granted = user?.permissions ?? [];
    if (!user || !required.some((p) => granted.includes(p))) {
      throw new ForbiddenException('Insufficient permission');
    }
    return true;
  }
}
