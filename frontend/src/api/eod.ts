import { api } from '../lib/api';

export interface EodPreview {
  branchId: string;
  branchName: string;
  workingDate: string;
  alreadyClosed: boolean;
  openingBalance: number;
  totalReceipts: number;
  totalPayments: number;
  closingBalance: number;
}

export interface EodHistoryRow {
  id: string;
  eodDate: string;
  openingBalance: string;
  totalReceipts: string;
  totalPayments: string;
  closingBalance: string;
  doneAt: string;
}

export interface EodCloseResult {
  id: string;
  eodDate: string;
  openingBalance: string;
  totalReceipts: string;
  totalPayments: string;
  closingBalance: string;
  nextWorkingDate: string;
}

export const getEodPreview = (branchId?: string) =>
  api<EodPreview>(`/eod/preview${branchId ? `?branchId=${branchId}` : ''}`);

export const getEodHistory = (branchId?: string) =>
  api<EodHistoryRow[]>(`/eod/history${branchId ? `?branchId=${branchId}` : ''}`);

export const closeEod = (branchId?: string) =>
  api<EodCloseResult>('/eod/close', { method: 'POST', body: JSON.stringify({ branchId }) });
