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

const qs = (from: string, to: string) => `?from=${from}&to=${to}`;

export const getZeroCollection = (from: string, to: string) =>
  api<ZeroCollectionRow[]>(`/reports/zero-collection${qs(from, to)}`);

export const getCollectionFollowup = (from: string, to: string) =>
  api<CollectionFollowupRow[]>(`/reports/collection-followup${qs(from, to)}`);

export const getAdvanceCollection = (from: string, to: string) =>
  api<AdvanceCollectionRow[]>(`/reports/advance-collection${qs(from, to)}`);
