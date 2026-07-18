import { Prisma } from '@prisma/client';
import { AuthUser } from './types/auth-user';

/**
 * Branch/center visibility scope on top of RLS tenant isolation:
 *   FDO → only centers they are assigned to (fdoId)
 *   BM  → only their own branch (a requested branchId is ignored — a branch
 *         admin can never see another branch)
 *   HO  → whole tenant, optionally narrowed to one branch via `branchId`
 *         (the reports branch filter; omitted = all branches)
 */
export function centerScope(user: AuthUser, branchId?: string): Prisma.CenterWhereInput {
  if (user.role === 'FDO') return { fdoId: user.employeeId };
  if (user.role === 'BM') return { branchId: user.branchId ?? undefined };
  return branchId ? { branchId } : {};
}

/** The same scope expressed as a filter on a relation named `center`. */
export function clientCenterScope(user: AuthUser, branchId?: string): Prisma.ClientWhereInput {
  return { center: centerScope(user, branchId) };
}
