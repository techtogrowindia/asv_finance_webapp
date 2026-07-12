import { api } from '../lib/api';

export interface TenantSettings {
  requireLoanProductAtEnrollment: boolean;
}

export const getSettings = () => api<TenantSettings>('/settings');
export const updateSettings = (body: TenantSettings) =>
  api<TenantSettings>('/settings', { method: 'PATCH', body: JSON.stringify(body) });
