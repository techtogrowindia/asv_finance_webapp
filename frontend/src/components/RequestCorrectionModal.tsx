import { useEffect, useState } from 'react';
import { CollectionDay, getLoanCollectionDays, requestCorrection } from '../api/collections';

const inr = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-IN');

/** FDO/BM requests a correction to a past REGULAR field collection on this loan.
 *  Goes to a BM/HO approval queue — nothing changes until it's approved. */
export function RequestCorrectionModal({ loanId, onClose }: { loanId: string; onClose: () => void }) {
  const [days, setDays] = useState<CollectionDay[] | null>(null);
  const [collectedOn, setCollectedOn] = useState('');
  const [correctedAmount, setCorrectedAmount] = useState('');
  const [correctedSavings, setCorrectedSavings] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getLoanCollectionDays(loanId).then(setDays).catch((e) => setError(e.message));
  }, [loanId]);

  const selected = days?.find((d) => d.collectedOn.slice(0, 10) === collectedOn);

  async function submit() {
    setError('');
    if (!collectedOn || !selected) { setError('Pick which day\'s collection to correct'); return; }
    const amt = Number(correctedAmount);
    if (!Number.isFinite(amt) || amt < 0) { setError('Enter a valid corrected amount'); return; }
    const savingsEntered = correctedSavings.trim() !== '';
    const sav = savingsEntered ? Number(correctedSavings) : undefined;
    if (savingsEntered && (!Number.isFinite(sav!) || sav! < 0)) { setError('Enter a valid corrected savings amount'); return; }
    if (amt === selected.amount && (!savingsEntered || sav === selected.savings)) {
      setError('Nothing to correct — change the amount and/or the savings');
      return;
    }
    if (reason.trim().length < 3) { setError('Enter a short reason for the correction'); return; }
    setBusy(true);
    try {
      await requestCorrection({
        loanId, collectedOn, correctedAmount: amt,
        ...(savingsEntered ? { correctedSavings: sav } : {}),
        reason: reason.trim(),
      });
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit the correction request');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3 className="modal-title">Request a collection correction</h3>
        {success ? (
          <>
            <p className="modal-message">
              Sent for approval. This loan's records won't change until a Branch Manager or Head Office reviews it.
            </p>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={onClose} autoFocus>Done</button>
            </div>
          </>
        ) : (
          <>
            <p className="modal-message">
              Corrects the loan repayment amount for that day. Leave savings blank to leave it as recorded.
            </p>
            {error && <div className="alert-error">{error}</div>}
            {days && days.length === 0 && (
              <div className="hint">No correctable field collections found for this loan.</div>
            )}
            {days && days.length > 0 && (
              <>
                <div className="field">
                  <label>Which day?</label>
                  <select className="select" value={collectedOn} onChange={(e) => setCollectedOn(e.target.value)}>
                    <option value="">Select date…</option>
                    {days.map((d) => (
                      <option key={d.collectedOn} value={d.collectedOn.slice(0, 10)}>
                        {fmtDate(d.collectedOn)} — {inr(d.amount)} collected
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Corrected amount {selected ? `(was ${inr(selected.amount)})` : ''}</label>
                  <input
                    className="input" type="number" min="0" placeholder="0"
                    value={correctedAmount} onChange={(e) => setCorrectedAmount(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>
                    Corrected savings {selected ? `(was ${inr(selected.savings)}, blank = unchanged)` : ''}
                  </label>
                  <input
                    className="input" type="number" min="0" placeholder="Leave blank to leave unchanged"
                    value={correctedSavings} onChange={(e) => setCorrectedSavings(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Reason</label>
                  <input
                    className="input" placeholder="e.g. typed 5000 instead of 500"
                    value={reason} onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              </>
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              {days && days.length > 0 && (
                <button className="btn btn-primary" disabled={busy} onClick={submit}>
                  {busy ? <span className="spinner" /> : 'Submit for approval'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
