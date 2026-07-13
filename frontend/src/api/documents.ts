import { api } from '../lib/api';
import { tokenStore } from '../lib/api';

export type DocumentReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface DocumentChecklistItem {
  documentTypeId: string;
  name: string;
  appliesTo: 'CLIENT' | 'NOMINEE' | 'BOTH';
  party: 'CLIENT' | 'NOMINEE';
  isMandatory: boolean;
  documentId: string | null;
  uploadedAt: string | null;
  status: DocumentReviewStatus | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

export const getChecklist = (clientId: string) =>
  api<DocumentChecklistItem[]>(`/clients/${clientId}/documents`);

export const deleteDocument = (documentId: string) =>
  api<{ deleted: boolean }>(`/documents/${documentId}`, { method: 'DELETE' });

export const reviewDocument = (documentId: string, decision: 'APPROVE' | 'REJECT', reason?: string) =>
  api<{ documentId: string; status: DocumentReviewStatus; reviewedAt: string }>(
    `/documents/${documentId}/review`,
    { method: 'POST', body: JSON.stringify({ decision, reason }) },
  );

export async function uploadDocument(
  clientId: string,
  documentTypeId: string,
  party: 'CLIENT' | 'NOMINEE',
  file: File,
) {
  const token = tokenStore.get();
  const form = new FormData();
  form.append('documentTypeId', documentTypeId);
  form.append('party', party);
  form.append('file', file);
  const res = await fetch(`/api/v1/clients/${clientId}/documents`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Upload failed');
  }
  return res.json() as Promise<{ documentId: string; uploadedAt: string }>;
}

/** Fetch a stored KYC image as an object URL (the <img> tag can't send auth headers itself). */
export async function fetchDocumentBlobUrl(documentId: string): Promise<string> {
  const token = tokenStore.get();
  const res = await fetch(`/api/v1/documents/${documentId}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error('Could not load document image');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
