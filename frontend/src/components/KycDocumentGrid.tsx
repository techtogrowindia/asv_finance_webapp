import { useEffect, useRef, useState } from 'react';
import {
  DocumentChecklistItem,
  deleteDocument,
  fetchDocumentBlobUrl,
  getChecklist,
  uploadDocument,
} from '../api/documents';
import { useConfirm } from './ConfirmProvider';

/**
 * Inline KYC document images for a member: one card per required document type,
 * showing the uploaded image thumbnail (or an upload placeholder) with
 * Upload / Change / Delete actions. Replaces the old separate documents page.
 */
export function KycDocumentGrid({ clientId }: { clientId: string }) {
  const confirm = useConfirm();
  const [items, setItems] = useState<DocumentChecklistItem[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busyType, setBusyType] = useState<string | null>(null);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement | null>(null);
  const pendingType = useRef<string | null>(null);

  useEffect(() => {
    load();
    // revoke object URLs on unmount
    return () => Object.values(urlsRef.current).forEach((u) => URL.revokeObjectURL(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // Keep a ref to current urls for cleanup without re-running the effect.
  const urlsRef = useRef<Record<string, string>>({});
  urlsRef.current = urls;

  async function load() {
    try {
      const list = await getChecklist(clientId);
      setItems(list);
      const next: Record<string, string> = {};
      await Promise.all(
        list
          .filter((i) => i.documentId)
          .map(async (i) => {
            try {
              next[i.documentTypeId] = await fetchDocumentBlobUrl(i.documentId!);
            } catch {
              /* skip broken image */
            }
          }),
      );
      setUrls(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load documents');
    }
  }

  function pick(documentTypeId: string) {
    pendingType.current = documentTypeId;
    fileInput.current?.click();
  }

  async function onFile(file: File | undefined) {
    const documentTypeId = pendingType.current;
    if (!file || !documentTypeId) return;
    setError('');
    setBusyType(documentTypeId);
    try {
      await uploadDocument(clientId, documentTypeId, file);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusyType(null);
      pendingType.current = null;
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function onDelete(item: DocumentChecklistItem) {
    if (!item.documentId) return;
    const ok = await confirm({
      title: 'Delete document?',
      message: `Delete the uploaded "${item.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setBusyType(item.documentTypeId);
    try {
      await deleteDocument(item.documentId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusyType(null);
    }
  }

  if (error) return <div className="alert-error">{error}</div>;
  if (!items) return <div className="empty">Loading…</div>;
  if (items.length === 0) return <div className="empty">No document types configured.</div>;

  return (
    <>
      <div className="doc-grid">
        {items.map((item) => {
          const url = urls[item.documentTypeId];
          const busy = busyType === item.documentTypeId;
          return (
            <div className="doc-card" key={item.documentTypeId}>
              <div className="doc-card-title">
                {item.name}
                {item.isMandatory && <span className="req">•</span>}
              </div>
              <div className="doc-card-image">
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer" title="Open full image">
                    <img src={url} alt={item.name} />
                  </a>
                ) : (
                  <div className="doc-card-empty">Not uploaded</div>
                )}
              </div>
              <div className="doc-card-actions">
                {item.documentId ? (
                  <>
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => pick(item.documentTypeId)}>
                      {busy ? <span className="spinner" /> : 'Change'}
                    </button>
                    <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => onDelete(item)}>
                      Delete
                    </button>
                  </>
                ) : (
                  <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => pick(item.documentTypeId)}>
                    {busy ? <span className="spinner" /> : 'Upload'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </>
  );
}
