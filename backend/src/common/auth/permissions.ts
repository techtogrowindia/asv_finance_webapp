/**
 * Canonical permission catalog — the single source of truth for RBAC.
 * The Roles page renders these as tick-boxes (fetched via GET /roles/permissions),
 * and @RequirePermission(...) on routes checks a user's granted keys against them.
 */
export interface PermissionDef {
  key: string;
  label: string;
}
export interface PermissionGroup {
  group: string;
  permissions: PermissionDef[];
}

export const PERMISSION_CATALOG: PermissionGroup[] = [
  {
    group: 'Members',
    permissions: [
      { key: 'member.view', label: 'View members & client search' },
      { key: 'member.create', label: 'Enroll member' },
      { key: 'member.edit', label: 'Edit member & KYC' },
      { key: 'member.delete', label: 'Delete member / documents' },
    ],
  },
  {
    group: 'Loans',
    permissions: [
      { key: 'loan.view', label: 'View loans & ledger' },
      { key: 'loan.apply', label: 'Create loan application' },
      { key: 'loan.approve', label: 'Verify & disburse loans' },
    ],
  },
  {
    group: 'Collections',
    permissions: [
      { key: 'collection.view', label: 'View demand & collections' },
      { key: 'collection.post', label: 'Post collections' },
    ],
  },
  {
    group: 'Centers',
    permissions: [
      { key: 'center.view', label: 'View centers' },
      { key: 'center.create', label: 'Create center' },
      { key: 'center.edit', label: 'Edit center' },
      { key: 'center.delete', label: 'Delete center' },
    ],
  },
  {
    group: 'End of Day',
    permissions: [
      { key: 'eod.view', label: 'View End of Day' },
      { key: 'eod.close', label: 'Close the day' },
    ],
  },
  {
    group: 'Reports',
    permissions: [
      { key: 'report.monitoring', label: 'Daily monitoring reports' },
      { key: 'report.portfolio', label: 'Portfolio summary reports' },
    ],
  },
  {
    group: 'Administration',
    permissions: [
      { key: 'employee.manage', label: 'Manage employees' },
      { key: 'role.manage', label: 'Manage roles & permissions' },
      { key: 'master.manage', label: 'Manage master data' },
    ],
  },
];

/** Flat set of every valid permission key, for validation. */
export const ALL_PERMISSIONS: string[] = PERMISSION_CATALOG.flatMap((g) =>
  g.permissions.map((p) => p.key),
);

/** Default permission set for a seeded Field Officer role. */
export const FIELD_OFFICER_PERMISSIONS: string[] = [
  'member.view',
  'member.create',
  'member.edit',
  'center.view',
  'loan.view',
  'loan.apply',
  'collection.view',
  'collection.post',
  'report.monitoring',
];
