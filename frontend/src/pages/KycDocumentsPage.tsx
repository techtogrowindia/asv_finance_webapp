import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getMember, MemberDetail } from '../api/members';
import {
  deleteDocument,
  DocumentChecklistItem,
  fetchDocumentBlobUrl,
  getChecklist,
  uploadDocument,
} from '../api/documents';
import { useConfirm } from '../components/ConfirmProvider';

export function KycDocumentsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [client, setClient] = useState<MemberDetail | null>(null);
  const [items, setItems] = useState<DocumentChecklistItem[] | null>(null);
  const [activeTypeId, setActiveTypeId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!id) return;
    getMember(id).then(setClient).catch((e) => setError(e.message));
    load(id);
  }, [id]);

  function load(clientId: string, keepActive?: string | null) {
    return getChecklist(clientId)
      .then((list) => {
        setItems(list);
        const nextActive = keepActive ?? activeTypeId ?? list[0]?.documentTypeId ?? null;
        setActiveTypeId(nextActive);
        const activeItem = list.find((i) => i.documentTypeId === nextActive);
        loadPreview(activeItem ?? null);
      })
      .catch((e) => setError(e.message));
  }

  async function loadPreview(item: DocumentChecklistItem | null) {
    setPreviewUrl(null);
    if (!item?.documentId) return;
    try {
      setPreviewUrl(await fetchDocumentBlobUrl(item.documentId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load preview');
    }
  }

  const active = useMemo(
    () => items?.find((i) => i.documentTypeId === activeTypeId) ?? null,
    [items, activeTypeId],
  );
  const uploadedCount = useMemo(() => items?.filter((i) => i.documentId).length ?? 0, [items]);

  function selectChip(item: DocumentChecklistItem) {
    setActiveTypeId(item.documentTypeId);
    loadPreview(item);
  }

  function openPicker() {
    fileInput.current?.click();
  }

  async function onFilePicked(file: File | undefined) {
    if (!file || !id || !activeTypeId) return;
    setError('');
    setBusy(true);
    try {
      await uploadDocument(id, activeTypeId, file);
      await load(id, activeTypeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function onDelete() {
    if (!active?.documentId || !id) return;
    const ok = await confirm({
      title: 'Delete document?',
      message: `Delete the uploaded "${active.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      await deleteDocument(active.documentId);
      await load(id, activeTypeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="back-link" onClick={() => navigate(`/app/clients/${id}`)}>
        ← Back to member
      </button>
      <h1 className="page-title">KYC Documents</h1>
      <p className="page-sub">{client ? `${client.name} · ${client.displayId}` : 'Loading…'}</p>

      {error && <div className="alert-error">{error}</div>}

      <div className="panel">
        <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Uploaded Documents</span>
          {items && (
            <span style={{ fontWeight: 500, color: 'var(--ink-500)' }}>
              {uploadedCount} of {items.length} uploaded
            </span>
          )}
        </div>
        <div className="panel-body">
          {/* Chips are selectors only — they never trigger an upload. */}
          <div className="doc-chips">
            {items?.map((item) => (
              <button
                key={item.documentTypeId}
                type="button"
                className={`doc-chip ${item.documentId ? 'uploaded' : ''} ${activeTypeId === item.documentTypeId ? 'active' : ''}`}
                onClick={() => selectChip(item)}
              >
                <span className="dot" />
                {item.name}
              </button>
            ))}
            {items && items.length === 0 && <div className="empty">No document types configured.</div>}
          </div>

          {/* Explicit actions for the selected document. */}
          {active && (
            <div className="doc-actionbar">
              <div className="doc-actionbar-label">
                <strong>{active.name}</strong>
                <span className={`badge ${active.documentId ? 'active' : 'pending'}`} style={{ marginLeft: 10 }}>
                  {active.documentId ? 'Uploaded' : 'Not uploaded'}
                </span>
              </div>
              <div className="doc-actionbar-buttons">
                {active.documentId ? (
                  <>
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={openPicker}>
                      Change
                    </button>
                    <button className="btn btn-danger btn-sm" disabled={busy} onClick={onDelete}>
                      Delete
                    </button>
                  </>
                ) : (
                  <button className="btn btn-primary btn-sm" disabled={busy} onClick={openPicker}>
                    {busy ? <span className="spinner" /> : 'Upload'}
                  </button>
                )}
              </div>
            </div>
          )}

          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => onFilePicked(e.target.files?.[0])}
          />

          <Viewer url={previewUrl} />
        </div>
      </div>
    </>
  );
}

function Viewer({ url }: { url: string | null }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, [url]);

  return (
    <div className="viewer">
      <div className="viewer-toolbar">
        <span>Drag to pan when zoomed in</span>
        <button className="icon-btn" onClick={() => setPos({ x: 0, y: 0 })} title="Reset position">⟲</button>
        <button className="icon-btn" onClick={() => setScale((s) => Math.max(1, s - 0.25))} title="Zoom out">−</button>
        <button className="icon-btn" onClick={() => setScale((s) => Math.min(4, s + 0.25))} title="Zoom in">+</button>
        <a
          className="icon-btn"
          href={url ?? undefined}
          download={url ? 'document' : undefined}
          style={{ textDecoration: 'none', pointerEvents: url ? 'auto' : 'none', opacity: url ? 1 : 0.4 }}
          title="Download"
        >
          ⬇
        </a>
      </div>
      <div
        className="viewer-stage"
        onMouseDown={(e) => { dragging.current = true; last.current = { x: e.clientX, y: e.clientY }; }}
        onMouseMove={(e) => {
          if (!dragging.current) return;
          setPos((p) => ({ x: p.x + (e.clientX - last.current.x), y: p.y + (e.clientY - last.current.y) }));
          last.current = { x: e.clientX, y: e.clientY };
        }}
        onMouseUp={() => { dragging.current = false; }}
        onMouseLeave={() => { dragging.current = false; }}
      >
        {url ? (
          <img
            src={url}
            alt="Document preview"
            style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }}
            draggable={false}
          />
        ) : (
          <span className="viewer-empty">
            Select a document above. Uploaded documents preview here; empty ones show an Upload button.
          </span>
        )}
      </div>
    </div>
  );
}
