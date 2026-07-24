import { api } from '../lib/api';

export interface DueRow {
  clientId: string;
  clientName: string;
  displayId: string;
  groupNo: number;
  loanId: string;
  loanAccount: string;
  dueCount: number;
  totalDue: number;
  arrear: number;
  currentDue: number;
  advanceBalance: number;
  disbursalDate: string;
  totalDues: number;
  lastPaidDate: string | null;
  nextDueDate: string | null;
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

export interface RecentCollection {
  id: string;
  collectedOn: string;
  clientName: string;
  displayId: string;
  loanAccount: string;
  amount: number;
  kind: string;
}

/** The most recent money-in collections for a center (optionally one group). */
export const getRecentCollections = (centerId: string, groupNo?: string) =>
  api<RecentCollection[]>(`/collections/recent?centerId=${centerId}${groupNo ? `&groupNo=${groupNo}` : ''}`);

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
  loanAccount: string | null;
  disbursalDate: string | null;
  totalDues: number | null;
}

export const getSavingsBalances = (branchId?: string) =>
  api<SavingsBalance[]>(`/collections/savings/balances${branchId ? `?branchId=${branchId}` : ''}`);

// ---- Savings refund workflow (FDO initiate → BM/HO approve → FDO settle) ----

export type SavingsRefundStatus = 'INITIATED' | 'APPROVED' | 'SETTLED' | 'REJECTED';

export interface SavingsRefundRow {
  loanId: string;
  loanAccount: string;
  savingsAccount: string;
  clientName: string;
  displayId: string;
  branchCode: string;
  branchName: string;
  centerName: string;
  loanType: 'OPEN' | 'CLOSED';
  balance: number;
  requestId: string | null;
  requestStatus: SavingsRefundStatus | null;
  requestAmount: number | null;
  initiatedByName: string | null;
  approvedByName: string | null;
}

export const getSavingsRefunds = (branchId?: string) =>
  api<SavingsRefundRow[]>(`/collections/savings/refunds${branchId ? `?branchId=${branchId}` : ''}`);

export const initiateSavingsRefund = (loanId: string) =>
  api<{ id: string; status: string; amount: number }>(`/collections/savings/${loanId}/refund/initiate`, { method: 'POST' });

export const approveSavingsRefund = (id: string, notes?: string) =>
  api<{ id: string; status: string }>(`/collections/savings/refunds/${id}/approve`, {
    method: 'POST', body: JSON.stringify({ notes }),
  });

export const rejectSavingsRefund = (id: string, notes?: string) =>
  api<{ id: string; status: string }>(`/collections/savings/refunds/${id}/reject`, {
    method: 'POST', body: JSON.stringify({ notes }),
  });

export const settleSavingsRefund = (id: string) =>
  api<{ id: string; status: string; refunded: number }>(`/collections/savings/refunds/${id}/settle`, { method: 'POST' });

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

// ---- Collection corrections (maker-checker: FDO requests, BM/HO approves) --

export interface CollectionDay {
  collectedOn: string;
  amount: number;
  savings: number;
}

/** Days this loan has a live REGULAR field collection that could be corrected
 *  (already-requested/approved days are excluded). */
export const getLoanCollectionDays = (loanId: string) =>
  api<CollectionDay[]>(`/collections/${loanId}/collection-days`);

export const requestCorrection = (body: {
  loanId: string; collectedOn: string; correctedAmount: number; correctedSavings?: number; reason: string;
}) =>
  api<{
    id: string; status: string; originalAmount: number; correctedAmount: number;
    originalSavings: number | null; correctedSavings: number | null; wouldReopen: boolean; wouldClose: boolean;
  }>('/collections/corrections', { method: 'POST', body: JSON.stringify(body) });

export interface CollectionCorrection {
  id: string;
  loanId: string;
  loanAccount: string;
  loanType: 'OPEN' | 'CLOSED';
  clientName: string;
  displayId: string;
  branchCode: string;
  branchName: string;
  centerName: string;
  collectedOn: string;
  originalAmount: number;
  correctedAmount: number;
  originalSavings: number | null;
  correctedSavings: number | null;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  wouldReopen: boolean;
  wouldClose: boolean;
  approverNotes: string | null;
  requestedByName: string | null;
  reviewedByName: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export const listCorrections = (status?: 'PENDING' | 'APPROVED' | 'REJECTED', branchId?: string) => {
  const q = new URLSearchParams();
  if (status) q.set('status', status);
  if (branchId) q.set('branchId', branchId);
  const qs = q.toString();
  return api<CollectionCorrection[]>(`/collections/corrections${qs ? `?${qs}` : ''}`);
};

export const approveCorrection = (id: string, opts: { confirmClosure?: boolean; notes?: string } = {}) =>
  api<{
    id: string; status: string; applied: number; advanceBanked: number; loanClosed: boolean; reopened: boolean;
    savingsCorrected: number | null;
  }>(`/collections/corrections/${id}/approve`, { method: 'POST', body: JSON.stringify(opts) });

export const rejectCorrection = (id: string, notes?: string) =>
  api<{ id: string; status: string }>(`/collections/corrections/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  });
