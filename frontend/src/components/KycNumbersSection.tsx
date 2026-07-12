import { useState } from 'react';
import { KycInfo, KycInput, updateMemberKyc } from '../api/members';

const FIELDS: { key: keyof KycInput; label: string; sensitive?: boolean }[] = [
  { key: 'uid', label: 'Aadhaar / UID', sensitive: true },
  { key: 'voterId', label: 'Voter ID' },
  { key: 'pan', label: 'PAN' },
  { key: 'rationCard', label: 'Ration card' },
  { key: 'smartCard', label: 'Smart card' },
  { key: 'otherId', label: 'Other ID' },
];

/** KYC ID numbers with an inline Edit form. Aadhaar stays masked on display and
 *  is only overwritten if the officer types a new value. */
export function KycNumbersSection({ clientId, kyc, onSaved }: { clientId: string; kyc: KycInfo | null; onSaved: (k: KycInfo) => void }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  function startEdit() {
    // Pre-fill non-sensitive fields; leave UID blank (it's masked, can't round-trip).
    setForm({
      voterId: kyc?.voterId ?? '',
      pan: kyc?.pan ?? '',
      rationCard: kyc?.rationCard ?? '',
      smartCard: kyc?.smartCard ?? '',
      otherId: kyc?.otherId ?? '',
      uid: '',
    });
    setError('');
    setEditing(true);
  }

  async function save() {
    setError('');
    setBusy(true);
    try {
      const body: KycInput = {
        voterId: form.voterId,
        pan: form.pan,
        rationCard: form.rationCard,
        smartCard: form.smartCard,
        otherId: form.otherId,
      };
      // Only send UID if the officer entered a new one (blank = keep existing).
      if (form.uid.trim()) body.uid = form.uid.trim();
      const saved = await updateMemberKyc(clientId, body);
      onSaved(saved);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Government ID proofs (KYC)</span>
        {!editing && (
          <button className="btn btn-ghost btn-sm" onClick={startEdit}>
            {kyc ? 'Edit' : 'Add numbers'}
          </button>
        )}
      </div>
      <div className="panel-body">
        {error && <div className="alert-error">{error}</div>}

        {editing ? (
          <>
            <div className="form-grid">
              {FIELDS.map((f) => (
                <div className="field" key={f.key}>
                  <label>{f.label}</label>
                  <input
                    className="input"
                    value={form[f.key] ?? ''}
                    placeholder={f.sensitive && kyc?.uid ? `Current: ${kyc.uid} — type to change` : ''}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="hint">Aadhaar is masked after saving; leave it blank to keep the existing one.</div>
            <div className="form-actions">
              <button className="btn btn-primary" disabled={busy} onClick={save}>
                {busy ? <span className="spinner" /> : 'Save'}
              </button>
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </>
        ) : kyc ? (
          <div className="detail-grid">
            <Item k="Aadhaar / UID" v={kyc.uid ?? '—'} />
            <Item k="Voter ID" v={kyc.voterId ?? '—'} />
            <Item k="PAN" v={kyc.pan ?? '—'} />
            <Item k="Ration card" v={kyc.rationCard ?? '—'} />
            <Item k="Smart card" v={kyc.smartCard ?? '—'} />
            <Item k="Other ID" v={kyc.otherId ?? '—'} />
          </div>
        ) : (
          <div className="empty">No ID numbers recorded yet. Click “Add numbers”.</div>
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
