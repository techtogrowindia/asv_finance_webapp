import { Prisma } from '@prisma/client';
import { AuthUser } from './types/auth-user';

/**
 * Branch/center visibility scope on top of RLS tenant isolation:
 *   FDO → only centers they are assigned to (fdoId)
 *   BM  → only their branch
 *   HO  → whole tenant (still RLS-bounded)
 */
export function centerScope(user: AuthUser): Prisma.CenterWhereInput {
  if (user.role === 'FDO') return { fdoId: user.employeeId };
  if (user.role === 'BM') return { branchId: user.branchId ?? undefined };
  return {};
}

/** The same scope expressed as a filter on a relation named `center`. */
export function clientCenterScope(user: AuthUser): Prisma.ClientWhereInput {
  return { center: centerScope(user) };
}
