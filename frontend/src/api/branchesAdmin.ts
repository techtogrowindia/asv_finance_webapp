import { api } from '../lib/api';

export interface AdminBranch {
  id: string;
  code: string;
  name: string;
  workingDate: string;
  isActive: boolean;
  centerCount: number;
  employeeCount: number;
}

export interface CreateBranchBody {
  code: string;
  name: string;
  workingDate?: string;
}

export interface UpdateBranchBody {
  code?: string;
  name?: string;
  isActive?: boolean;
}

export const listBranches = () => api<AdminBranch[]>('/branches');
export const createBranch = (body: CreateBranchBody) =>
  api<AdminBranch>('/branches', { method: 'POST', body: JSON.stringify(body) });
export const updateBranch = (id: string, body: UpdateBranchBody) =>
  api<AdminBranch>(`/branches/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
