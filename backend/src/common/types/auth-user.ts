export type Role = 'FDO' | 'BM' | 'HO';

/** Attached to req.user after JWT validation; the trusted request identity. */
export interface AuthUser {
  employeeId: string;
  tenantId: string;
  branchId: string | null;
  role: Role;
  name: string;
  code: string;
  permissions: string[];
}

/** Fields needed to set the per-request RLS context. */
export type TenantContext = Pick<
  AuthUser,
  'tenantId' | 'branchId' | 'role' | 'employeeId'
>;
