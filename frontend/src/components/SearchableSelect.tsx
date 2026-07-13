import { useEffect, useRef, useState } from 'react';

export interface SearchableSelectOption {
  id: string;
  label: string;
}

/**
 * Type-to-search combobox with a dropdown that reliably reopens on click —
 * unlike a native <input list="…"> datalist, whose browser-rendered arrow
 * often won't reopen suggestions once the typed text already matches an
 * option exactly.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  onSelect,
  placeholder,
}: {
  options: SearchableSelectOption[];
  value: string;
  onChange: (text: string) => void;
  onSelect: (option: SearchableSelectOption) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const filtered = value.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(value.trim().toLowerCase()))
    : options;

  function pick(o: SearchableSelectOption) {
    onChange(o.label);
    onSelect(o);
    setOpen(false);
  }

  return (
    <div className="combo" ref={rootRef}>
      <div className="combo-input-wrap">
        <input
          className="input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        <button
          type="button"
          className="combo-arrow"
          aria-label="Show options"
          onClick={() => setOpen((v) => !v)}
        >
          ▾
        </button>
      </div>
      {open && filtered.length > 0 && (
        <div className="combo-list">
          {filtered.map((o) => (
            <div key={o.id} className="combo-option" onMouseDown={() => pick(o)}>
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
