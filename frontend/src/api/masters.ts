import { api } from '../lib/api';

export interface FrequencyRow {
  id: string;
  code: string;
  name: string;
  daysBetween: number;
  isActive: boolean;
}

export interface PurposeRow {
  id: string;
  name: string;
  isActive: boolean;
}

export interface LoanProductRow {
  id: string;
  name: string;
  loanAmount: string;
  totalDues: number;
  interestAmount: string;
  frequencyId: string;
  frequencyCode: string;
  isActive: boolean;
}

export type DocumentParty = 'CLIENT' | 'NOMINEE' | 'BOTH';

export interface DocumentTypeRow {
  id: string;
  name: string;
  appliesTo: DocumentParty;
  requiresNumber: boolean;
  requiresPhoto: boolean;
  maskValue: boolean;
  isMandatory: boolean;
  isActive: boolean;
}

// ---- Frequencies ----
export const listFrequenciesAll = () => api<FrequencyRow[]>('/frequencies?all=true');
export const createFrequency = (body: { code: string; name: string; daysBetween: number }) =>
  api<FrequencyRow>('/frequencies', { method: 'POST', body: JSON.stringify(body) });
export const updateFrequency = (id: string, body: Partial<{ code: string; name: string; daysBetween: number; isActive: boolean }>) =>
  api<FrequencyRow>(`/frequencies/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

// ---- Purposes ----
export const listPurposesAll = () => api<PurposeRow[]>('/purposes?all=true');
export const createPurpose = (body: { name: string }) =>
  api<PurposeRow>('/purposes', { method: 'POST', body: JSON.stringify(body) });
export const updatePurpose = (id: string, body: Partial<{ name: string; isActive: boolean }>) =>
  api<PurposeRow>(`/purposes/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

// ---- Loan Products ----
export const listLoanProductsAll = () => api<LoanProductRow[]>('/loan-products?all=true');
export const createLoanProduct = (body: {
  name: string;
  loanAmount: number;
  totalDues: number;
  interestAmount: number;
  frequencyId: string;
}) => api<LoanProductRow>('/loan-products', { method: 'POST', body: JSON.stringify(body) });
export const updateLoanProduct = (
  id: string,
  body: Partial<{ name: string; loanAmount: number; totalDues: number; interestAmount: number; frequencyId: string; isActive: boolean }>,
) => api<LoanProductRow>(`/loan-products/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

// ---- Document Types (single source of truth for KYC numbers + photo uploads) ----
/** Active document types only — any employee role (used by the Enroll form / KYC editors). */
export const listDocumentTypes = () => api<DocumentTypeRow[]>('/document-types');
/** All document types incl. inactive — admin (BM/HO) management screen. */
export const listDocumentTypesAll = () => api<DocumentTypeRow[]>('/document-types?all=true');
export const createDocumentType = (body: {
  name: string;
  appliesTo: DocumentParty;
  requiresNumber?: boolean;
  requiresPhoto?: boolean;
  maskValue?: boolean;
  isMandatory?: boolean;
}) => api<DocumentTypeRow>('/document-types', { method: 'POST', body: JSON.stringify(body) });
export const updateDocumentType = (
  id: string,
  body: Partial<{
    name: string;
    appliesTo: DocumentParty;
    requiresNumber: boolean;
    requiresPhoto: boolean;
    maskValue: boolean;
    isMandatory: boolean;
    isActive: boolean;
  }>,
) => api<DocumentTypeRow>(`/document-types/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
