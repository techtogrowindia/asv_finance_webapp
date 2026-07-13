import { api } from '../lib/api';

export type EmployeeRole = 'FDO' | 'BM' | 'HO';

export interface EmployeeRow {
  id: string;
  code: string;
  name: string;
  login: string;
  role: EmployeeRole;
  status: 'ACTIVE' | 'INACTIVE';
  branchId: string | null;
  branchName: string | null;
  accessRoleId: string | null;
  roleName: string | null;
  centerCount: number;
}

export interface BranchLite {
  id: string;
  code: string;
  name: string;
}

export interface CreateEmployeeBody {
  code: string;
  name: string;
  login: string;
  password: string;
  role: EmployeeRole;
  branchId?: string;
  accessRoleId?: string;
}

export interface UpdateEmployeeBody {
  code?: string;
  name?: string;
  login?: string;
  role?: EmployeeRole;
  branchId?: string;
  accessRoleId?: string;
  status?: 'ACTIVE' | 'INACTIVE';
}

export const listEmployees = (params: { role?: string; status?: string; q?: string } = {}) => {
  const qs = new URLSearchParams();
  if (params.role) qs.set('role', params.role);
  if (params.status) qs.set('status', params.status);
  if (params.q) qs.set('q', params.q);
  const s = qs.toString();
  return api<EmployeeRow[]>(`/employees${s ? `?${s}` : ''}`);
};

export const listAdminBranches = () => api<BranchLite[]>('/employees/branches');

export const createEmployee = (body: CreateEmployeeBody) =>
  api<EmployeeRow>('/employees', { method: 'POST', body: JSON.stringify(body) });

export const updateEmployee = (id: string, body: UpdateEmployeeBody) =>
  api<EmployeeRow>(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const resetEmployeePassword = (id: string, password: string) =>
  api<{ reset: boolean }>(`/employees/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });

export interface EmployeeCenterOption {
  id: string;
  code: string;
  name: string;
  assigned: boolean;
}

export const listEmployeeCenters = (employeeId: string) =>
  api<EmployeeCenterOption[]>(`/employees/${employeeId}/centers`);

export const updateEmployeeCenters = (employeeId: string, centerIds: string[]) =>
  api<EmployeeCenterOption[]>(`/employees/${employeeId}/centers`, {
    method: 'PATCH',
    body: JSON.stringify({ centerIds }),
  });

export const reassignEmployeeCenters = (employeeId: string, toEmployeeId: string) =>
  api<{ movedCount: number }>(`/employees/${employeeId}/reassign-centers`, {
    method: 'POST',
    body: JSON.stringify({ toEmployeeId }),
  });
