import { api } from '../lib/api';

export interface AdminCenter {
  id: string;
  code: string;
  name: string;
  address: string | null;
  branchCode: string;
  fdoId: string | null;
  fdoName: string | null;
  meetingDay: string | null;
  meetingTime: string | null;
  meetingPlace: string | null;
  mobile: string | null;
  formationDate: string | null;
  nextMeeting: string | null;
  latitude: string | null;
  longitude: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  clientCount: number;
}

export interface FieldOfficer {
  id: string;
  code: string;
  name: string;
}

export interface CenterBody {
  code: string;
  name: string;
  fdoId?: string | null;
  address?: string;
  meetingDay?: string;
  meetingTime?: string;
  meetingPlace?: string;
  mobile?: string;
  formationDate?: string;
  nextMeeting?: string;
  latitude?: number;
  longitude?: number;
  status?: 'ACTIVE' | 'INACTIVE';
}

export const listAdminCenters = () => api<AdminCenter[]>('/centers/manage');
export const listFieldOfficers = () => api<FieldOfficer[]>('/employees/field-officers');
export const createCenter = (body: CenterBody) =>
  api<AdminCenter>('/centers', { method: 'POST', body: JSON.stringify(body) });
export const updateCenter = (id: string, body: Partial<CenterBody>) =>
  api<AdminCenter>(`/centers/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteCenter = (id: string) =>
  api<{ deleted: boolean }>(`/centers/${id}`, { method: 'DELETE' });
