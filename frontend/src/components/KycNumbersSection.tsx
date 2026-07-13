import { useEffect, useState } from 'react';
import { DocumentTypeRow, listDocumentTypes } from '../api/masters';
import { KycNumberInfo, updateMemberKycNumbers } from '../api/members';

/**
 * Admin-configured ID-number fields (Aadhaar, PAN, ...) for one party (CLIENT
 * or NOMINEE) of a member. All fields are always visible (no click needed to
 * reveal them); they're read-only until "Edit" is pressed. This matters for
 * masked types (e.g. Aadhaar): the true value never round-trips to the
 * browser, so an always-editable field would show blank right after saving,
 * looking like the data vanished. In read-only mode we display the already
 * masked value (e.g. "XXXX XXXX 6789") instead of blanking it; only entering
 * edit mode clears masked fields, ready for a fresh value.
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
      // Masked values can't round-trip — start blank so typing replaces them.
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
      <div className="panel-head">{title}</div>
      <div className="panel-body">
        {error && <div className="alert-error">{error}</div>}

        {!types ? (
          <div className="empty">Loading…</div>
        ) : (
          <>
            <div className="form-grid">
              {types.map((t) => {
                const existing = byType.get(t.id);
                const readOnlyValue = existing?.value ?? '';
                return (
                  <div className="field" key={t.id}>
                    <label>{t.name}{t.isMandatory && ' *'}</label>
                    {editing ? (
                      <input
                        className="input"
                        value={form[t.id] ?? ''}
                        placeholder={t.maskValue && existing ? `Current: ${existing.value} — type to change` : ''}
                        onChange={(e) => setForm((s) => ({ ...s, [t.id]: e.target.value }))}
                      />
                    ) : (
                      <input className="input" value={readOnlyValue || '—'} disabled readOnly />
                    )}
                  </div>
                );
              })}
            </div>
            {editing && (
              <div className="hint">Masked numbers (like Aadhaar) stay hidden after saving; leave blank to keep the existing one.</div>
            )}
            <div className="form-actions">
              {editing ? (
                <>
                  <button className="btn btn-primary" disabled={busy} onClick={save}>
                    {busy ? <span className="spinner" /> : 'Save'}
                  </button>
                  <button className="btn btn-ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
                </>
              ) : (
                <button className="btn btn-ghost" onClick={startEdit}>Edit</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
