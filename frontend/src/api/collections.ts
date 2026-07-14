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
  api<{ applied: number; advanceBanked: number; unallocated: number; loanClosed: boolean }>('/collections', {
    method: 'POST',
    body: JSON.stringify({ loanId, amount }),
  });

export interface CenterSummary {
  centerId: string;
  centerCode: string;
  centerName: string;
  workingDate: string;
  memberCount: number;
  loanOutstanding: number;
  openingArrears: number;
  demand: number;
  collectedToday: number;
  closingArrears: number;
}

export const getCenterSummary = (centerId: string) =>
  api<CenterSummary>(`/collections/center-summary?centerId=${centerId}`);

export const getArrears = (centerId: string) =>
  api<DueRow[]>(`/collections/arrears?centerId=${centerId}`);

export const bulkCollectDemand = (centerId: string) =>
  api<{ loansCollected: number; totalCollected: number }>('/collections/bulk-demand', {
    method: 'POST',
    body: JSON.stringify({ centerId }),
  });

export interface AdvanceLoan {
  loanId: string;
  loanAccount: string;
  clientName: string;
  displayId: string;
  centerName: string;
  advanceBalance: number;
}

export const getAdvanceLoans = () => api<AdvanceLoan[]>('/collections/advances');

export const applyAdvance = (loanId: string) =>
  api<{ applied: number; advanceRemaining: number; loanClosed: boolean }>(`/collections/${loanId}/apply-advance`, {
    method: 'POST',
  });

export interface ForeclosureQuote {
  loanId: string;
  loanAccount: string;
  policy: 'FULL' | 'PRINCIPAL_ONLY' | 'INTEREST_TO_DATE';
  remainingPrincipal: number;
  interestCharged: number;
  interestWaived: number;
  payoffTotal: number;
  advanceBalance: number;
}

export const getForeclosureQuote = (loanId: string) =>
  api<ForeclosureQuote>(`/collections/${loanId}/foreclosure-quote`);

export const foreclose = (loanId: string) =>
  api<{ loanId: string; closed: boolean; payoffTotal: number; interestWaived: number }>(`/collections/${loanId}/foreclose`, {
    method: 'POST',
  });
