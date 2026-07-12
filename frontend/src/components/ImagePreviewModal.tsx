import { useEffect, useRef, useState } from 'react';

/** Full-screen preview for a KYC document image: rotate, zoom, pan, download. */
export function ImagePreviewModal({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const [rotation, setRotation] = useState(0);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function reset() {
    setRotation(0);
    setScale(1);
    setPos({ x: 0, y: 0 });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="preview-card" onClick={(e) => e.stopPropagation()}>
        <div className="preview-toolbar">
          <span className="preview-title">{title}</span>
          <div className="preview-tools">
            <button className="icon-btn" title="Rotate left" onClick={() => setRotation((r) => (r - 90 + 360) % 360)}>⟲</button>
            <button className="icon-btn" title="Rotate right" onClick={() => setRotation((r) => (r + 90) % 360)}>⟳</button>
            <button className="icon-btn" title="Zoom out" onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}>−</button>
            <button className="icon-btn" title="Zoom in" onClick={() => setScale((s) => Math.min(4, s + 0.25))}>+</button>
            <button className="icon-btn" title="Reset" onClick={reset}>⟳0</button>
            <a className="icon-btn" href={url} download title="Download">⬇</a>
            <button className="icon-btn" title="Close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div
          className={`preview-stage ${dragging.current ? 'dragging' : ''}`}
          onMouseDown={(e) => { dragging.current = true; last.current = { x: e.clientX, y: e.clientY }; }}
          onMouseMove={(e) => {
            if (!dragging.current) return;
            setPos((p) => ({ x: p.x + (e.clientX - last.current.x), y: p.y + (e.clientY - last.current.y) }));
            last.current = { x: e.clientX, y: e.clientY };
          }}
          onMouseUp={() => { dragging.current = false; }}
          onMouseLeave={() => { dragging.current = false; }}
        >
          <img
            src={url}
            alt={title}
            style={{ transform: `translate(${pos.x}px, ${pos.y}px) rotate(${rotation}deg) scale(${scale})` }}
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
