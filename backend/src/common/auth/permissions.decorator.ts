import { SetMetadata } from '@nestjs/common';

export const PERMS_KEY = 'permissions';
/**
 * Require the caller to hold at least one of the given permission keys
 * (checked by PermissionsGuard). Layers on top of @Roles(...) / RLS scoping.
 */
export const RequirePermission = (...permissions: string[]) => SetMetadata(PERMS_KEY, permissions);
