import { api } from '../lib/api';

export interface DueRow {
  clientId: string;
  clientName: string;
  displayId: string;
  loanId: string;
  loanAccount: string;
  dueCount: number;
  totalDue: number;
}

export interface DemandCenterRow {
  centerId: string;
  centerCode: string;
  centerName: string;
  clientCount: number;
  totalDemand: number;
}

export interface DemandClientRow extends DueRow {
  centerCode: string;
  centerName: string;
}

export const getDue = (centerId: string, date?: string) =>
  api<DueRow[]>(`/collections/due?centerId=${centerId}${date ? `&date=${date}` : ''}`);

export const getDemandCenterwise = (date?: string) =>
  api<DemandCenterRow[]>(`/collections/demand?type=CENTERWISE${date ? `&date=${date}` : ''}`);

export const getDemandClientwise = (date?: string) =>
  api<DemandClientRow[]>(`/collections/demand?type=CLIENTWISE${date ? `&date=${date}` : ''}`);

export const postCollection = (loanId: string, amount: number) =>
  api<{ applied: number; unallocated: number; loanClosed: boolean }>('/collections', {
    method: 'POST',
    body: JSON.stringify({ loanId, amount }),
  });
