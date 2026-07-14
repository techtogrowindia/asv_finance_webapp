import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SearchableSelectOption {
  id: string;
  label: string;
}

/**
 * Type-to-search combobox, driven by the selected option's id (mirrors a
 * native <select>'s value/onChange, but with search + a dropdown that
 * reliably reopens on click — unlike a native <input list="…"> datalist,
 * whose browser-rendered arrow often won't reopen suggestions once the
 * typed text already matches an option exactly).
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  options: SearchableSelectOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // The arrow always browses the FULL list (to pick something different),
  // while typing narrows it down — otherwise reopening after a value is
  // already selected would show just the one already-matching option.
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Keep the displayed text in sync with the selected id, including when the
  // parent resets/changes it programmatically (e.g. clearing Client when
  // Center changes).
  useEffect(() => {
    const match = options.find((o) => o.id === value);
    setQuery(match ? match.label : value ? query : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      // The list is portaled to document.body, so check it too (else clicking an
      // option would close/unmount it before the pick registers).
      if (rootRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Position the portal-rendered list against the input, and keep it in sync
  // while open (scroll/resize) so it can't drift or be clipped by an ancestor.
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const r = wrapRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  const filtered = !showAll && query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  function pick(o: SearchableSelectOption) {
    setQuery(o.label);
    onChange(o.id);
    setOpen(false);
  }

  function onBlur() {
    // Give a click on a suggestion time to register before reverting.
    setTimeout(() => {
      const exact = options.find((o) => o.label.toLowerCase() === query.trim().toLowerCase());
      if (exact) {
        if (exact.id !== value) onChange(exact.id);
      } else {
        const current = options.find((o) => o.id === value);
        setQuery(current ? current.label : '');
      }
      setOpen(false);
    }, 150);
  }

  return (
    <div className="combo" ref={rootRef}>
      <div className="combo-input-wrap" ref={wrapRef}>
        <input
          className="input"
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowAll(false);
            setOpen(true);
            if (e.target.value.trim() === '' && value) onChange('');
          }}
          onFocus={() => setOpen(true)}
          onBlur={onBlur}
        />
        <button
          type="button"
          className="combo-arrow"
          aria-label="Show options"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((v) => { const next = !v; if (next) setShowAll(true); return next; })}
        >
          ▾
        </button>
      </div>
      {open && pos && filtered.length > 0 &&
        createPortal(
          <div ref={listRef} className="combo-list" style={{ top: pos.top, left: pos.left, width: pos.width }}>
            {filtered.map((o) => (
              <div key={o.id} className="combo-option" onMouseDown={() => pick(o)}>
                {o.label}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
