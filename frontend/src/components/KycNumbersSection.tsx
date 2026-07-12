import { useEffect, useState } from 'react';
import { DocumentTypeRow, listDocumentTypes } from '../api/masters';
import { KycNumberInfo, updateMemberKycNumbers } from '../api/members';

/**
 * Admin-configured ID-number fields (Aadhaar, PAN, ...) for one party (CLIENT
 * or NOMINEE) of a member, with an inline Edit form. DocumentType (requiresNumber
 * + appliesTo) is the single source of truth for which fields appear here —
 * matches whatever admin has configured in Masters > Document Types.
 */
export function KycNumbersSection({
  clientId,
  party,
  title,
  numbers,
  onSaved,
}: {
  clientId: string;
  party: 'CLIENT' | 'NOMINEE';
  title: string;
  numbers: KycNumberInfo[];
  onSaved: (numbers: KycNumberInfo[]) => void;
}) {
  const [types, setTypes] = useState<DocumentTypeRow[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listDocumentTypes()
      .then((all) => setTypes(all.filter((t) => t.requiresNumber && (t.appliesTo === party || t.appliesTo === 'BOTH'))))
      .catch((e) => setError(e.message));
  }, [party]);

  const byType = new Map(numbers.map((n) => [n.documentTypeId, n]));

  function startEdit() {
    const next: Record<string, string> = {};
    for (const t of types ?? []) {
      const existing = byType.get(t.id);
      // Masked values can't round-trip — leave blank with a hint instead.
      next[t.id] = existing && !t.maskValue ? existing.value : '';
    }
    setForm(next);
    setError('');
    setEditing(true);
  }

  async function save() {
    setError('');
    setBusy(true);
    try {
      const entries = (types ?? []).map((t) => ({ documentTypeId: t.id, value: form[t.id] ?? '' }));
      const updated = await updateMemberKycNumbers(clientId, party, entries);
      onSaved(updated.kycNumbers.filter((n) => n.party === party));
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  if (types && types.length === 0) return null;

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{title}</span>
        {!editing && types && (
          <button className="btn btn-ghost btn-sm" onClick={startEdit}>
            {numbers.length ? 'Edit' : 'Add numbers'}
          </button>
        )}
      </div>
      <div className="panel-body">
        {error && <div className="alert-error">{error}</div>}

        {!types ? (
          <div className="empty">Loading…</div>
        ) : editing ? (
          <>
            <div className="form-grid">
              {types.map((t) => {
                const existing = byType.get(t.id);
                return (
                  <div className="field" key={t.id}>
                    <label>{t.name}</label>
                    <input
                      className="input"
                      value={form[t.id] ?? ''}
                      placeholder={t.maskValue && existing ? `Current: ${existing.value} — type to change` : ''}
                      onChange={(e) => setForm((s) => ({ ...s, [t.id]: e.target.value }))}
                    />
                  </div>
                );
              })}
            </div>
            <div className="hint">Masked numbers (like Aadhaar) stay hidden after saving; leave blank to keep the existing one.</div>
            <div className="form-actions">
              <button className="btn btn-primary" disabled={busy} onClick={save}>
                {busy ? <span className="spinner" /> : 'Save'}
              </button>
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </>
        ) : numbers.length > 0 ? (
          <div className="detail-grid">
            {types.map((t) => {
              const n = byType.get(t.id);
              return <Item key={t.id} k={t.name} v={n?.value ?? '—'} />;
            })}
          </div>
        ) : (
          <div className="empty">No ID numbers recorded yet. Click "Add numbers".</div>
        )}
      </div>
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div className="detail-item">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}
