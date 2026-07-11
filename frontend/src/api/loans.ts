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

export const createLoanApplication = (body: { clientId: string; productId: string; purposeId: string }) =>
  api<{ id: string; status: string; warnings: string[]; requestedAmount: string }>('/loan-applications', {
    method: 'POST',
    body: JSON.stringify(body),
  });
