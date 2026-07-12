import { useEffect, useRef, useState } from 'react';
import {
  DocumentChecklistItem,
  deleteDocument,
  fetchDocumentBlobUrl,
  getChecklist,
  uploadDocument,
} from '../api/documents';
import { useConfirm } from './ConfirmProvider';
import { ImagePreviewModal } from './ImagePreviewModal';

const key = (i: Pick<DocumentChecklistItem, 'documentTypeId' | 'party'>) => `${i.documentTypeId}:${i.party}`;

/**
 * Inline KYC document images for a member: one card per required document type
 * (expanded per party for CLIENT+NOMINEE-applicable types), showing the
 * uploaded image thumbnail (or an upload placeholder) with Upload / Change /
 * Delete actions. Pass `party` to show only that party's documents (e.g. the
 * nominee's photos grouped with the nominee's ID numbers).
 */
export function KycDocumentGrid({ clientId, party }: { clientId: string; party?: 'CLIENT' | 'NOMINEE' }) {
  const confirm = useConfirm();
  const [allItems, setAllItems] = useState<DocumentChecklistItem[] | null>(null);
  const items = allItems ? (party ? allItems.filter((i) => i.party === party) : allItems) : null;
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const pending = useRef<{ documentTypeId: string; party: 'CLIENT' | 'NOMINEE' } | null>(null);

  useEffect(() => {
    load();
    return () => Object.values(urlsRef.current).forEach((u) => URL.revokeObjectURL(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const urlsRef = useRef<Record<string, string>>({});
  urlsRef.current = urls;

  async function load() {
    try {
      const list = await getChecklist(clientId);
      setAllItems(list);
      const next: Record<string, string> = {};
      await Promise.all(
        list
          .filter((i) => i.documentId)
          .map(async (i) => {
            try {
              next[key(i)] = await fetchDocumentBlobUrl(i.documentId!);
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

  function pick(item: DocumentChecklistItem) {
    pending.current = { documentTypeId: item.documentTypeId, party: item.party };
    fileInput.current?.click();
  }

  async function onFile(file: File | undefined) {
    const target = pending.current;
    if (!file || !target) return;
    setError('');
    setBusyKey(`${target.documentTypeId}:${target.party}`);
    try {
      await uploadDocument(clientId, target.documentTypeId, target.party, file);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusyKey(null);
      pending.current = null;
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
    setBusyKey(key(item));
    try {
      await deleteDocument(item.documentId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusyKey(null);
    }
  }

  if (error) return <div className="alert-error">{error}</div>;
  if (!items) return <div className="empty">Loading…</div>;
  if (items.length === 0) return <div className="empty">No document types require a photo.</div>;

  return (
    <>
      <div className="doc-grid">
        {items.map((item) => {
          const k = key(item);
          const url = urls[k];
          const busy = busyKey === k;
          return (
            <div className="doc-card" key={k}>
              <div className="doc-card-title">
                {item.name}
                {item.isMandatory && <span className="req">•</span>}
              </div>
              <div className="doc-card-image">
                {url ? (
                  <button
                    type="button"
                    className="doc-card-imgbtn"
                    title="Preview (rotate, zoom)"
                    onClick={() => setPreview({ url, title: item.name })}
                  >
                    <img src={url} alt={item.name} />
                  </button>
                ) : (
                  <div className="doc-card-empty">Not uploaded</div>
                )}
              </div>
              <div className="doc-card-actions">
                {item.documentId ? (
                  <>
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => pick(item)}>
                      {busy ? <span className="spinner" /> : 'Change'}
                    </button>
                    <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => onDelete(item)}>
                      Delete
                    </button>
                  </>
                ) : (
                  <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => pick(item)}>
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
      {preview && (
        <ImagePreviewModal url={preview.url} title={preview.title} onClose={() => setPreview(null)} />
      )}
    </>
  );
}
