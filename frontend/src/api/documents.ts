import { api } from '../lib/api';
import { tokenStore } from '../lib/api';

export interface DocumentChecklistItem {
  documentTypeId: string;
  name: string;
  appliesTo: 'CLIENT' | 'NOMINEE' | 'BOTH';
  isMandatory: boolean;
  documentId: string | null;
  uploadedAt: string | null;
}

export const getChecklist = (clientId: string) =>
  api<DocumentChecklistItem[]>(`/clients/${clientId}/documents`);

export async function uploadDocument(clientId: string, documentTypeId: string, file: File) {
  const token = tokenStore.get();
  const form = new FormData();
  form.append('documentTypeId', documentTypeId);
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
