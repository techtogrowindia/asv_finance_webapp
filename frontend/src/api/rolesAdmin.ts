import { api } from '../lib/api';

export interface PermissionDef {
  key: string;
  label: string;
}
export interface PermissionGroup {
  group: string;
  permissions: PermissionDef[];
}

export interface RoleRow {
  id: string;
  name: string;
  permissions: string[];
  isSystem: boolean;
  isActive: boolean;
  employeeCount: number;
}

export interface RoleLite {
  id: string;
  name: string;
}

export interface CreateRoleBody {
  name: string;
  permissions: string[];
  isActive?: boolean;
}
export interface UpdateRoleBody {
  name?: string;
  permissions?: string[];
  isActive?: boolean;
}

export const getPermissionCatalog = () => api<PermissionGroup[]>('/roles/permissions');
export const listRoles = () => api<RoleRow[]>('/roles');
export const listAssignableRoles = () => api<RoleLite[]>('/roles/assignable');

export const createRole = (body: CreateRoleBody) =>
  api<RoleRow>('/roles', { method: 'POST', body: JSON.stringify(body) });

export const updateRole = (id: string, body: UpdateRoleBody) =>
  api<RoleRow>(`/roles/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteRole = (id: string) =>
  api<{ deleted: boolean }>(`/roles/${id}`, { method: 'DELETE' });
