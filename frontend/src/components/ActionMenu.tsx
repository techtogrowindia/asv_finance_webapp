import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ActionMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

/**
 * Per-row "⋮" kebab menu — replaces a cluttered row of separate buttons.
 * Rendered in a portal (fixed-positioned against the trigger button) so it
 * can never be clipped by an ancestor's `overflow: auto` (e.g. .table-wrap's
 * horizontal-scroll container).
 */
export function ActionMenu({ items }: { items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  function reposition() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
  }

  function toggle() {
    if (!open) reposition();
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  return (
    <>
      <button ref={btnRef} type="button" className="action-menu-btn" aria-label="Actions" onClick={toggle}>
        ⋮
      </button>
      {open && pos &&
        createPortal(
          <div ref={listRef} className="action-menu-list" style={{ top: pos.top, right: pos.right }}>
            {items.map((it, i) => (
              <button
                key={i}
                type="button"
                className={`action-menu-item ${it.danger ? 'danger' : ''}`}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  it.onClick();
                }}
              >
                {it.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
