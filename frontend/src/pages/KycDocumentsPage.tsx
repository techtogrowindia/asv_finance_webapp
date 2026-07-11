import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getMember, MemberDetail } from '../api/members';
import { DocumentChecklistItem, fetchDocumentBlobUrl, getChecklist, uploadDocument } from '../api/documents';

export function KycDocumentsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState<MemberDetail | null>(null);
  const [items, setItems] = useState<DocumentChecklistItem[] | null>(null);
  const [activeTypeId, setActiveTypeId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadingTypeId, setUploadingTypeId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!id) return;
    getMember(id).then(setClient).catch((e) => setError(e.message));
    refreshChecklist(id);
  }, [id]);

  function refreshChecklist(clientId: string) {
    getChecklist(clientId).then(setItems).catch((e) => setError(e.message));
  }

  const uploadedCount = useMemo(() => items?.filter((i) => i.documentId).length ?? 0, [items]);

  async function selectForPreview(item: DocumentChecklistItem) {
    if (!item.documentId) return;
    setActiveTypeId(item.documentTypeId);
    setPreviewUrl(null);
    try {
      const url = await fetchDocumentBlobUrl(item.documentId);
      setPreviewUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load preview');
    }
  }

  async function onFilePicked(item: DocumentChecklistItem, file: File | undefined) {
    if (!file || !id) return;
    setError('');
    setUploadingTypeId(item.documentTypeId);
    try {
      await uploadDocument(id, item.documentTypeId, file);
      refreshChecklist(id);
      setActiveTypeId(item.documentTypeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadingTypeId(null);
    }
  }

  return (
    <>
      <button className="back-link" onClick={() => navigate(`/app/clients/${id}`)}>
        ← Back to member
      </button>
      <h1 className="page-title">KYC Documents</h1>
      <p className="page-sub">
        {client ? `${client.name} · ${client.displayId}` : 'Loading…'}
      </p>

      {error && <div className="alert-error">{error}</div>}

      <div className="panel">
        <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Uploaded Documents</span>
          {items && <span style={{ fontWeight: 500, color: 'var(--ink-500)' }}>{uploadedCount} of {items.length} uploaded</span>}
        </div>
        <div className="panel-body">
          <div className="doc-chips">
            {items?.map((item) => {
              const busy = uploadingTypeId === item.documentTypeId;
              const active = activeTypeId === item.documentTypeId;
              if (item.documentId) {
                return (
                  <button
                    key={item.documentTypeId}
                    type="button"
                    className={`doc-chip uploaded ${active ? 'active' : ''}`}
                    onClick={() => selectForPreview(item)}
                  >
                    <span className="dot" />
                    {item.name}
                  </button>
                );
              }
              return (
                <label key={item.documentTypeId} className={`doc-chip ${active ? 'active' : ''}`}>
                  <span className="dot" />
                  {busy ? <span className="spinner" style={{ borderColor: '#cbd5d1', borderTopColor: 'var(--brand-600)' }} /> : item.name}
                  <input
                    ref={(el) => { fileInputs.current[item.documentTypeId] = el; }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={busy}
                    onChange={(e) => onFilePicked(item, e.target.files?.[0])}
                  />
                </label>
              );
            })}
            {items && items.length === 0 && <div className="empty">No document types configured.</div>}
          </div>

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

  function onMouseDown(e: React.MouseEvent) {
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    setPos((p) => ({ x: p.x + dx, y: p.y + dy }));
  }
  function stopDrag() {
    dragging.current = false;
  }

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
        className={`viewer-stage ${dragging.current ? 'dragging' : ''}`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
      >
        {url ? (
          <img
            src={url}
            alt="Document preview"
            style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }}
            draggable={false}
          />
        ) : (
          <span className="viewer-empty">Select an uploaded document to preview it here.</span>
        )}
      </div>
    </div>
  );
}
