import { api } from '../lib/api';

export type ForeclosureInterestPolicy = 'FULL' | 'PRINCIPAL_ONLY' | 'INTEREST_TO_DATE';

export interface TenantSettings {
  requireLoanProductAtEnrollment: boolean;
  autoCloseEod: boolean;
  foreclosureInterestPolicy: ForeclosureInterestPolicy;
}

export const getSettings = () => api<TenantSettings>('/settings');
export const updateSettings = (body: Partial<TenantSettings>) =>
  api<TenantSettings>('/settings', { method: 'PATCH', body: JSON.stringify(body) });
