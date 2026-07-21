import { api } from '../lib/api';

export interface DueRow {
  clientId: string;
  clientName: string;
  displayId: string;
  loanId: string;
  loanAccount: string;
  dueCount: number;
  totalDue: number;
  arrear: number;
  currentDue: number;
  advanceBalance: number;
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

export const postCollection = (loanId: string, amount: number, savings?: number) =>
  api<{
    applied: number; advanceBanked: number; unallocated: number;
    savingsCollected: number; savingsRefunded: number; loanClosed: boolean;
  }>('/collections', {
    method: 'POST',
    body: JSON.stringify({ loanId, amount, ...(savings !== undefined ? { savings } : {}) }),
  });

export interface BulkImportRow {
  loanAccount: string;
  amount: number;
  savings?: number;
}

export interface BulkImportResultRow {
  loanAccount: string;
  clientName: string | null;
  status: 'OK' | 'ERROR';
  message: string | null;
  applied: number;
  advanceBanked: number;
  savingsCollected: number;
  loanClosed: boolean;
}

export interface BulkImportResult {
  successCount: number;
  failCount: number;
  totalCollected: number;
  totalSavings: number;
  results: BulkImportResultRow[];
}

/** Post a whole center's collections from an uploaded Excel sheet in one call — each
 *  row matched by loan account and applied independently (see collections.controller). */
export const bulkImportCollections = (centerId: string, rows: BulkImportRow[]) =>
  api<BulkImportResult>('/collections/bulk-import', {
    method: 'POST',
    body: JSON.stringify({ centerId, rows }),
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
  api<{ loansCollected: number; totalCollected: number; totalSavings: number; totalSavingsRefunded: number }>('/collections/bulk-demand', {
    method: 'POST',
    body: JSON.stringify({ centerId }),
  });

export interface SavingsBalance {
  clientId: string;
  clientName: string;
  displayId: string;
  branchCode: string;
  branchName: string;
  centerName: string;
  savingsBalance: number;
  hasOpenLoan: boolean;
}

export const getSavingsBalances = (branchId?: string) =>
  api<SavingsBalance[]>(`/collections/savings/balances${branchId ? `?branchId=${branchId}` : ''}`);

export const refundSavings = (clientId: string) =>
  api<{ clientId: string; refunded: number }>(`/collections/savings/${clientId}/refund`, { method: 'POST' });

export interface AdvanceLoan {
  loanId: string;
  loanAccount: string;
  clientName: string;
  displayId: string;
  branchCode: string;
  branchName: string;
  centerName: string;
  advanceBalance: number;
}

export const getAdvanceLoans = (branchId?: string) =>
  api<AdvanceLoan[]>(`/collections/advances${branchId ? `?branchId=${branchId}` : ''}`);

export const applyAdvance = (loanId: string) =>
  api<{ applied: number; advanceRemaining: number; loanClosed: boolean; savingsRefunded: number }>(`/collections/${loanId}/apply-advance`, {
    method: 'POST',
  });

export interface ForeclosureQuote {
  loanId: string;
  loanAccount: string;
  policy: 'FULL' | 'PRINCIPAL_ONLY' | 'INTEREST_TO_DATE';
  remainingPrincipal: number;
  interestCharged: number;
  interestWaived: number;
  manualWaived: number;
  foreclosureCharge: number;
  chargePercent: number;
  chargeFlat: number;
  canWaive: boolean;
  payoffTotal: number;
  advanceBalance: number;
  savingsToRefund: number;
}

export const getForeclosureQuote = (loanId: string, waiveInterest?: number) =>
  api<ForeclosureQuote>(
    `/collections/${loanId}/foreclosure-quote${waiveInterest ? `?waiveInterest=${waiveInterest}` : ''}`,
  );

export const foreclose = (loanId: string, waiveInterest?: number) =>
  api<{
    loanId: string; closed: boolean; payoffTotal: number; interestWaived: number;
    manualWaived: number; foreclosureCharge: number; savingsRefunded: number;
  }>(`/collections/${loanId}/foreclose`, {
    method: 'POST',
    body: JSON.stringify(waiveInterest ? { waiveInterest } : {}),
  });
