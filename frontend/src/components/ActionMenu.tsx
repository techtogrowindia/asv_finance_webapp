import { useEffect, useRef, useState } from 'react';

export interface ActionMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

/** Per-row "⋮" kebab menu — replaces a cluttered row of separate buttons. */
export function ActionMenu({ items }: { items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div className="action-menu" ref={rootRef} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="action-menu-btn" aria-label="Actions" onClick={() => setOpen((v) => !v)}>
        ⋮
      </button>
      {open && (
        <div className="action-menu-list">
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              className={`action-menu-item ${it.danger ? 'danger' : ''}`}
              onClick={() => { setOpen(false); it.onClick(); }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
