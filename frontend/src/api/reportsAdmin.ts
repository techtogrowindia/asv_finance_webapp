import { api } from '../lib/api';

export interface DemandRegisterRow {
  centerId: string;
  centerCode: string;
  centerName: string;
  phone: string | null;
  clientCount: number;
  pendingApplications: number;
  avgDueNo: number;
  meetingTime: string | null;
  loanOS: number;
  arrear: number;
  demand: number;
  collected: number;
}

export const getDemandRegister = (date: string) =>
  api<DemandRegisterRow[]>(`/reports/demand-register?date=${date}`);

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

export interface DisbursementRow {
  branchCode: string;
  centerCode: string;
  centerName: string;
  displayId: string;
  memberName: string;
  loanAccount: string;
  cycleNo: number;
  product: string;
  disbursalDate: string;
  loanAmount: number;
  interestAmount: number;
  totalAmount: number;
  totalDues: number;
  fdoName: string | null;
}

export interface ParAgingRow {
  branchCode: string;
  centerCode: string;
  centerName: string;
  displayId: string;
  memberName: string;
  loanAccount: string;
  loanOS: number;
  overdue: number;
  daysOverdue: number;
  bucket: string;
  fdoName: string | null;
}

export interface CollectionRegisterRow {
  date: string;
  centerCode: string;
  centerName: string;
  displayId: string;
  memberName: string;
  loanAccount: string;
  entryType: 'Loan' | 'Savings';
  kind: string;
  principal: number;
  interest: number;
  amount: number;
}

export interface ClosureRow {
  branchCode: string;
  centerCode: string;
  centerName: string;
  displayId: string;
  memberName: string;
  loanAccount: string;
  cycleNo: number;
  disbursalDate: string;
  loanAmount: number;
  totalAmount: number;
  totalRepaid: number;
  closedDate: string | null;
}

export interface SavingsLedgerRow {
  date: string;
  branchCode: string;
  centerCode: string;
  centerName: string;
  displayId: string;
  memberName: string;
  loanAccount: string;
  kind: 'DEPOSIT' | 'REFUND';
  deposit: number;
  refund: number;
}

export const getSavingsLedger = (from: string, to: string) =>
  api<SavingsLedgerRow[]>(`/reports/savings-ledger${qs(from, to)}`);

export interface LoanApplicationReportRow {
  appNo: string | null;
  branchCode: string;
  centerCode: string;
  centerName: string;
  displayId: string;
  memberName: string;
  loanAccount: string | null;
  product: string;
  purpose: string;
  requestedAmount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  appliedDate: string;
  fdoName: string | null;
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
export const getDisbursementRegister = (from: string, to: string) =>
  api<DisbursementRow[]>(`/reports/disbursement-register${qs(from, to)}`);
export const getParAging = (from: string, to: string) =>
  api<ParAgingRow[]>(`/reports/par-aging${qs(from, to)}`);
export const getCollectionRegister = (from: string, to: string) =>
  api<CollectionRegisterRow[]>(`/reports/collection-register${qs(from, to)}`);
export const getLoanClosures = (from: string, to: string) =>
  api<ClosureRow[]>(`/reports/loan-closures${qs(from, to)}`);
export const getLoanApplicationsReport = (from: string, to: string, status?: string) =>
  api<LoanApplicationReportRow[]>(`/reports/loan-applications${qs(from, to)}${status ? `&status=${status}` : ''}`);
