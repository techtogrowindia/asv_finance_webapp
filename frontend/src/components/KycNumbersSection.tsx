import { useEffect, useState } from 'react';
import { DocumentTypeRow, listDocumentTypes } from '../api/masters';
import { KycNumberInfo, updateMemberKycNumbers } from '../api/members';

/**
 * Admin-configured ID-number fields (Aadhaar, PAN, ...) for one party (CLIENT
 * or NOMINEE) of a member — always shown as editable fields (no separate
 * view/edit toggle). DocumentType (requiresNumber + appliesTo) is the single
 * source of truth for which fields appear here — matches whatever admin has
 * configured in Masters > Document Types.
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
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listDocumentTypes()
      .then((all) => setTypes(all.filter((t) => t.requiresNumber && (t.appliesTo === party || t.appliesTo === 'BOTH'))))
      .catch((e) => setError(e.message));
  }, [party]);

  const byType = new Map(numbers.map((n) => [n.documentTypeId, n]));

  // Seed the form once the field list and current values are known.
  useEffect(() => {
    if (!types) return;
    const next: Record<string, string> = {};
    for (const t of types) {
      const existing = byType.get(t.id);
      // Masked values can't round-trip — leave blank with a hint instead.
      next[t.id] = existing && !t.maskValue ? existing.value : '';
    }
    setForm(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types, numbers]);

  async function save() {
    setError('');
    setBusy(true);
    try {
      const entries = (types ?? []).map((t) => ({ documentTypeId: t.id, value: form[t.id] ?? '' }));
      const updated = await updateMemberKycNumbers(clientId, party, entries);
      onSaved(updated.kycNumbers.filter((n) => n.party === party));
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
