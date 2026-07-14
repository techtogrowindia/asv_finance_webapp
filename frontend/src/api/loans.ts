import { api } from '../lib/api';

export interface Frequency {
  id: string;
  code: string;
  name: string;
  daysBetween: number;
}

export interface Purpose {
  id: string;
  name: string;
}

export interface LoanProductLite {
  id: string;
  name: string;
  loanAmount: string;
  totalDues: number;
  interestAmount: string;
  frequencyId: string;
  frequencyCode: string;
}

export interface ExistingLoan {
  id: string;
  loanAccount: string;
  disbursalDate: string;
  loanAmount: string;
  totalDues: number;
  compDues: number;
  collDues: number;
  dueStartDate: string;
  maturityDate: string;
  closedDate: string | null;
  loanType: 'OPEN' | 'CLOSED';
  priBalance: number;
  intBalance: number;
  closingArrPri: number;
  closingArrInt: number;
}

export interface Eligibility {
  warnings: string[];
  sanctionedAmount: string;
}

export const listFrequencies = () => api<Frequency[]>('/frequencies');
export const listPurposes = (q?: string) => api<Purpose[]>(`/purposes${q ? `?q=${encodeURIComponent(q)}` : ''}`);
export const listLoanProducts = () => api<LoanProductLite[]>('/loan-products');
export const listExistingLoans = (clientId: string) => api<ExistingLoan[]>(`/clients/${clientId}/loans`);

export const getEligibility = (clientId: string, productId: string) =>
  api<Eligibility>(`/loan-applications/eligibility?clientId=${clientId}&productId=${productId}`);

export const createLoanApplication = (body: { clientId: string; productId: string; purposeId: string; notes?: string }) =>
  api<{ id: string; status: string; warnings: string[]; requestedAmount: string }>('/loan-applications', {
    method: 'POST',
    body: JSON.stringify(body),
  });

// ---- Verification & Disbursement (BM/HO) -----------------------------------

export interface LoanApplicationSummary {
  id: string;
  clientId: string;
  clientCode: string;
  clientName: string;
  displayId: string;
  centerName: string;
  productName: string;
  loanAmount: string;
  totalDues: number;
  purposeName: string;
  requestedAmount: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  warnings: string[];
  notes: string | null;
  createdAt: string;
}

export const listLoanApplications = (status?: 'PENDING' | 'APPROVED' | 'REJECTED') =>
  api<LoanApplicationSummary[]>(`/loan-applications${status ? `?status=${status}` : ''}`);

export const updateApplicationNotes = (id: string, notes: string) =>
  api<{ id: string; notes: string | null }>(`/loan-applications/${id}/notes`, {
    method: 'PATCH',
    body: JSON.stringify({ notes }),
  });

export const disburseApplication = (id: string, dates?: { disbursalDate?: string; dueStartDate?: string }) =>
  api<{ id: string; loanAccount: string; disbursalDate: string; dueStartDate: string; maturityDate: string }>(
    `/loan-applications/${id}/disburse`,
    { method: 'POST', body: JSON.stringify(dates ?? {}) },
  );

export const rejectApplication = (id: string, reason?: string) =>
  api<{ id: string; status: string }>(`/loan-applications/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

// ---- Loan Ledger (report) ---------------------------------------------------

export interface LedgerRow {
  dueNo: number;
  dueDate: string;
  collDate: string | null;
  duePri: string;
  dueInt: string;
  dueAmt: string;
  collPri: string;
  collInt: string;
  collAmt: string;
  dueBalance: string;
}

export interface LoanLedger {
  loanAccount: string;
  clientDisplayId: string;
  clientName: string;
  disbursalDate: string;
  loanAmount: string;
  interestAmount: string;
  totalAmount: string;
  totalDues: number;
  loanType: 'OPEN' | 'CLOSED';
  closedDate: string | null;
  schedule: LedgerRow[];
}

export const getLedger = (loanId: string) => api<LoanLedger>(`/loans/${loanId}/ledger`);
