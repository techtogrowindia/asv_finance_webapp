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
  centerCode: string;
  centerName: string;
  groupNo: number;
  memberNo: number;
  mobile: string | null;
  status: string;
  dateOfJoining: string | null;
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

export interface MemberDetail extends MemberListItem {
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

export const listCenters = () => api<CenterLite[]>('/centers');
export const listGroups = (centerId: string) => api<GroupLite[]>(`/centers/${centerId}/groups`);

export const listMembers = (params: { centerId?: string; q?: string }) => {
  const qs = new URLSearchParams();
  if (params.centerId) qs.set('centerId', params.centerId);
  if (params.q) qs.set('q', params.q);
  const s = qs.toString();
  return api<MemberListItem[]>(`/clients${s ? `?${s}` : ''}`);
};

export const getMember = (id: string) => api<MemberDetail>(`/clients/${id}`);

export const createMember = (body: CreateMemberBody) =>
  api<MemberDetail>('/clients', { method: 'POST', body: JSON.stringify(body) });

/** Upsert (or clear, on blank value) a party's admin-defined ID numbers. */
export const updateMemberKycNumbers = (id: string, party: 'CLIENT' | 'NOMINEE', entries: KycNumberEntry[]) =>
  api<MemberDetail>(`/clients/${id}/kyc-numbers`, {
    method: 'PATCH',
    body: JSON.stringify({ party, entries }),
  });
