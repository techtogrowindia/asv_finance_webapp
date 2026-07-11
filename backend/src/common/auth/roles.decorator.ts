import { SetMetadata } from '@nestjs/common';
import { Role } from '../types/auth-user';

export const ROLES_KEY = 'roles';
/** Restrict a route to the given roles (checked by RolesGuard). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
