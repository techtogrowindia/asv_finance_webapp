import { api } from '../lib/api';

export interface CenterLite {
  id: string;
  code: string;
  name: string;
  branchCode: string;
  meetingDay: string | null;
  status: string;
  clientCount: number;
}

export interface GroupLite {
  id: string;
  groupNo: number;
  memberCount: number;
  slotsLeft: number;
}

export interface MemberListItem {
  id: string;
  clientCode: string;
  displayId: string;
  name: string;
  centerId: string;
  branchCode: string | null;
  branchName: string | null;
  centerCode: string;
  centerName: string;
  groupNo: number;
  memberNo: number;
  mobile: string | null;
  status: string;
  dateOfJoining: string | null;
  savingsAccount: string | null;
  savingsBalance: number;
}

/** One admin-configured ID-proof number, already resolved for a client + party. */
export interface KycNumberInfo {
  documentTypeId: string;
  name: string;
  appliesTo: 'CLIENT' | 'NOMINEE' | 'BOTH';
  party: 'CLIENT' | 'NOMINEE';
  value: string; // masked by the API when the DocumentType has maskValue=true
}

export interface CoApplicantInfo {
  name: string;
  gender: string | null;
  dob: string | null;
  relation: string | null;
  mobile: string | null;
}

export interface SavingsPassbookRow {
  date: string;
  loanAccount: string | null;
  kind: 'DEPOSIT' | 'REFUND';
  deposit: number;
  refund: number;
  balance: number;
}
export interface SavingsPassbook {
  clientId: string;
  clientName: string;
  displayId: string;
  savingsAccount: string | null;
  savingsBalance: number;
  rows: SavingsPassbookRow[];
}
export const getSavingsPassbook = (id: string) => api<SavingsPassbook>(`/clients/${id}/savings`);

export interface StatementLedgerRow {
  dueNo: number; dueDate: string; collDate: string | null;
  duePri: string; dueInt: string; dueAmt: string;
  collPri: string; collInt: string; collAmt: string; savings: number; dueBalance: string;
}
export interface StatementLoan {
  loanAccount: string;
  disbursalDate: string;
  loanAmount: string;
  interestAmount: string;
  totalAmount: string;
  totalDues: number;
  loanType: 'OPEN' | 'CLOSED';
  closedDate: string | null;
  schedule: StatementLedgerRow[];
}
export interface ClientStatement {
  clientName: string;
  displayId: string;
  savingsAccount: string | null;
  savingsBalance: number;
  savings: SavingsPassbookRow[];
  loans: StatementLoan[];
}
export const getClientStatement = (id: string) => api<ClientStatement>(`/clients/${id}/statement`);

export interface MemberDetail extends MemberListItem {
  savingsAccount: string | null;
  savingsBalance: number;
  dob: string | null;
  gender: string | null;
  presentAddress: string | null;
  pincode: string | null;
  district: string | null;
  state: string | null;
  monthlyIncome: string | null;
  monthlyExpense: string | null;
  fatherName: string | null;
  latitude: string | null;
  longitude: string | null;
  requestedProductId: string | null;
  requestedProductName: string | null;
  requestedPurposeId: string | null;
  requestedPurposeName: string | null;
  kycNumbers: KycNumberInfo[];
  coApplicant: CoApplicantInfo | null;
}

export interface KycNumberEntry {
  documentTypeId: string;
  value: string;
}

export interface CreateMemberBody {
  centerId: string;
  groupNo: number;
  name: string;
  dob?: string;
  gender?: string;
  mobile?: string;
  presentAddress?: string;
  pincode?: string;
  district?: string;
  state?: string;
  monthlyIncome?: number;
  monthlyExpense?: number;
  fatherName?: string;
  dateOfJoining?: string;
  productId?: string;
  purposeId?: string;
  kycNumbers?: KycNumberEntry[];
  coApplicant?: {
    name: string;
    gender?: string;
    dob?: string;
    relation?: string;
    mobile?: string;
    kycNumbers?: KycNumberEntry[];
  };
}

export const listCenters = (branchId?: string) =>
  api<CenterLite[]>(`/centers${branchId ? `?branchId=${branchId}` : ''}`);
export const listGroups = (centerId: string) => api<GroupLite[]>(`/centers/${centerId}/groups`);

export const listMembers = (params: { centerId?: string; q?: string; branchId?: string }) => {
  const qs = new URLSearchParams();
  if (params.centerId) qs.set('centerId', params.centerId);
  if (params.q) qs.set('q', params.q);
  if (params.branchId) qs.set('branchId', params.branchId);
  const s = qs.toString();
  return api<MemberListItem[]>(`/clients${s ? `?${s}` : ''}`);
};

export const getMember = (id: string) => api<MemberDetail>(`/clients/${id}`);

/** Clients whose KYC isn't fully approved yet — the review queue (BM/HO, member.verify). */
export const getKycPending = (branchId?: string) =>
  api<MemberListItem[]>(`/clients/kyc-pending${branchId ? `?branchId=${branchId}` : ''}`);

/** Move a client to a different center/group (BM/HO only, member.transfer). */
export const transferMember = (id: string, centerId: string, groupNo: number) =>
  api<MemberDetail>(`/clients/${id}/transfer`, {
    method: 'POST',
    body: JSON.stringify({ centerId, groupNo }),
  });

export const createMember = (body: CreateMemberBody) =>
  api<MemberDetail>('/clients', { method: 'POST', body: JSON.stringify(body) });

/** Upsert (or clear, on blank value) a party's admin-defined ID numbers. */
export const updateMemberKycNumbers = (id: string, party: 'CLIENT' | 'NOMINEE', entries: KycNumberEntry[]) =>
  api<MemberDetail>(`/clients/${id}/kyc-numbers`, {
    method: 'PATCH',
    body: JSON.stringify({ party, entries }),
  });

// ---- Bulk member import (Excel) --------------------------------------------

export interface BulkMemberRow {
  centerCode: string;
  groupNo: number;
  name: string;
  dob?: string;
  gender?: string;
  mobile?: string;
  fatherName?: string;
  presentAddress?: string;
  pincode?: string;
  district?: string;
  state?: string;
  monthlyIncome?: string;
  monthlyExpense?: string;
  kycNumbers?: KycNumberEntry[];
  nominee?: { name: string; relation?: string; mobile?: string; kycNumbers?: KycNumberEntry[] };
}

export interface BulkMemberResult {
  successCount: number;
  failCount: number;
  results: { row: number; name: string; centerCode: string; status: 'OK' | 'ERROR'; message: string | null; displayId: string | null }[];
}

export const bulkImportMembers = (rows: BulkMemberRow[]) =>
  api<BulkMemberResult>('/clients/bulk-import', { method: 'POST', body: JSON.stringify({ rows }) });
