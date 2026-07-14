import { api } from '../lib/api';

export interface ZeroCollectionRow {
  branchCode: string;
  centerCode: string;
  centerName: string;
  displayId: string;
  memberName: string;
  loanAccount: string;
  disbursalDate: string;
  loanAmount: string;
  dueDate: string;
  frequency: string;
  openingArrear: number;
  dueCount: number;
  demand: number;
  balance: number;
  phone: string | null;
  nomineePhone: string | null;
  fdoName: string | null;
}

export interface CollectionFollowupRow {
  branchCode: string;
  centerCode: string;
  centerName: string;
  memberName: string;
  loanAccount: string;
  disbursalDate: string;
  loanAmount: string;
  openingArrear: number;
  dueAmount: number;
  collAmount: number;
  closingArrear: number;
  compDues: number;
  collDues: number;
  totalDues: number;
  loanType: 'OPEN' | 'CLOSED';
}

export interface AdvanceCollectionRow {
  branchCode: string;
  centerCode: string;
  centerName: string;
  memberName: string;
  loanAccount: string;
  dueAmount: string;
  collAmount: string;
  toBeCollected: number;
  dueDate: string;
  paidDate: string | null;
  status: 'PENDING' | 'PAID';
  arrear: number;
  loanOS: number;
  meetingDay: string | null;
}

export interface BranchWiseRow {
  branchCode: string;
  branchName: string;
  centers: number;
  clients: number;
  openLoans: number;
  loanDisbursement: number;
  portfolioOutstanding: number;
  totalCollected: number;
  arrear: number;
}

export interface CenterWiseRow {
  branchCode: string;
  centerCode: string;
  centerName: string;
  fdoName: string | null;
  groups: number;
  clients: number;
  openLoans: number;
  loanDisbursement: number;
  portfolioOutstanding: number;
  totalCollected: number;
  arrear: number;
}

export interface GroupWiseRow {
  centerCode: string;
  centerName: string;
  groupNo: number;
  members: number;
  openLoans: number;
  loanDisbursement: number;
  portfolioOutstanding: number;
  arrear: number;
}

export interface ClientWiseRow {
  branchCode: string;
  centerCode: string;
  centerName: string;
  displayId: string;
  clientCode: string;
  memberName: string;
  loanAccount: string;
  disbursalDate: string;
  loanAmount: string;
  totalDues: number;
  portfolioOutstanding: number;
  arrear: number;
  collected: number;
  loanType: 'OPEN' | 'CLOSED';
}

export interface EmployeePerformanceRow {
  fdoCode: string;
  fdoName: string;
  branchCode: string | null;
  centers: number;
  clients: number;
  openLoans: number;
  loanDisbursement: number;
  portfolioOutstanding: number;
  arrear: number;
  periodDemand: number;
  periodCollected: number;
  collectionEfficiency: number | null;
}

export interface ForeclosureReportRow {
  loanId: string;
  loanAccount: string;
  displayId: string;
  memberName: string;
  centerCode: string;
  centerName: string;
  disbursalDate: string;
  loanAmount: number;
  closedDate: string | null;
  principalPaid: number;
  interestCharged: number;
  interestWaived: number;
  foreclosureCharge: number;
  payoffTotal: number;
  policy: string;
}

const qs = (from: string, to: string) => `?from=${from}&to=${to}`;

export const getZeroCollection = (from: string, to: string) =>
  api<ZeroCollectionRow[]>(`/reports/zero-collection${qs(from, to)}`);

export const getCollectionFollowup = (from: string, to: string) =>
  api<CollectionFollowupRow[]>(`/reports/collection-followup${qs(from, to)}`);

export const getAdvanceCollection = (from: string, to: string) =>
  api<AdvanceCollectionRow[]>(`/reports/advance-collection${qs(from, to)}`);

export const getBranchWise = (from: string, to: string) =>
  api<BranchWiseRow[]>(`/reports/branch-wise${qs(from, to)}`);
export const getCenterWise = (from: string, to: string) =>
  api<CenterWiseRow[]>(`/reports/center-wise${qs(from, to)}`);
export const getGroupWise = (from: string, to: string) =>
  api<GroupWiseRow[]>(`/reports/group-wise${qs(from, to)}`);
export const getClientWise = (from: string, to: string, q?: string) =>
  api<ClientWiseRow[]>(`/reports/client-wise${qs(from, to)}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
export const getEmployeePerformance = (from: string, to: string) =>
  api<EmployeePerformanceRow[]>(`/reports/employee-performance${qs(from, to)}`);
export const getForeclosures = (from: string, to: string) =>
  api<ForeclosureReportRow[]>(`/reports/foreclosures${qs(from, to)}`);
