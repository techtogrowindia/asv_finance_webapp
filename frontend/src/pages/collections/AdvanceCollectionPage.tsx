import { useEffect, useState } from 'react';
import { CenterLite, listCenters, listMembers, MemberListItem } from '../../api/members';
import { ExistingLoan, listExistingLoans } from '../../api/loans';
import { SearchableSelect } from '../../components/SearchableSelect';
import { postCollection } from '../../api/collections';

const inr = (v: number | string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));

/**
 * Advance Collection — a member who wants to pay ahead of schedule. The amount
 * settles any current demand first, then the remainder is banked as an advance
 * and applied to upcoming instalments (via Loan Advance Adjustment).
 */
export function AdvanceCollectionPage() {
  const [centers, setCenters] = useState<CenterLite[]>([]);
  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [loans, setLoans] = useState<ExistingLoan[]>([]);
  const [centerId, setCenterId] = useState('');
  const [clientId, setClientId] = useState('');
  const [loanId, setLoanId] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { listCenters().then(setCenters).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    setClientId(''); setMembers([]);
    if (centerId) listMembers({ centerId }).then(setMembers).catch((e) => setError(e.message));
  }, [centerId]);
  useEffect(() => {
    setLoanId(''); setLoans([]);
    if (clientId) listExistingLoans(clientId).then((ls) => setLoans(ls.filter((l) => l.loanType === 'OPEN'))).catch((e) => setError(e.message));
  }, [clientId]);

  const loan = loans.find((l) => l.id === loanId);

  async function onCollect() {
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError('Enter a valid advance amount'); return; }
    setError(''); setSuccess(''); setBusy(true);
    try {
      const res = await postCollection(loanId, amt);
      setSuccess(
        `Collected ${inr(res.applied + res.advanceBanked)}` +
          (res.advanceBanked > 0 ? ` — ${inr(res.advanceBanked)} banked as advance` : '') +
          (res.loanClosed ? ' — loan fully closed!' : ''),
      );
      setAmount('');
      if (clientId) listExistingLoans(clientId).then((ls) => setLoans(ls.filter((l) => l.loanType === 'OPEN')));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Collection failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="page-title">Advance Collection</h1>
      <p className="page-sub">Collect a payment from a member who wants to pay ahead of schedule. It settles any current demand first, then banks the rest as an advance.</p>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-error" style={{ background: '#e3f5ee', color: '#157a5b', borderColor: '#bfe6d7' }}>{success}</div>}

      <div className="form-card" style={{ maxWidth: 'none' }}>
        <div className="form-grid">
          <div className="field">
            <label>Center</label>
            <SearchableSelect options={centers.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))} value={centerId} onChange={setCenterId} placeholder="Select center…" />
          </div>
          <div className="field">
            <label>Member</label>
            <SearchableSelect options={members.map((m) => ({ id: m.id, label: `${m.displayId} — ${m.name}` }))} value={clientId} onChange={setClientId} disabled={!centerId} placeholder="Select member…" />
          </div>
          <div className="field">
            <label>Loan</label>
            <SearchableSelect options={loans.map((l) => ({ id: l.id, label: `${l.loanAccount} · ${inr(l.loanAmount)}` }))} value={loanId} onChange={setLoanId} disabled={!clientId} placeholder={clientId && loans.length === 0 ? 'No open loans' : 'Select loan…'} />
          </div>
          <div className="field">
            <label>Advance amount</label>
            <input className="input" type="number" min="0" value={amount} disabled={!loanId} placeholder="0" onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        {loan && (
          <div className="hint" style={{ marginTop: 12 }}>
            Outstanding on {loan.loanAccount}: {inr(loan.priBalance + loan.intBalance)} · {loan.totalDues - loan.compDues} instalments left.
          </div>
        )}
        <div className="form-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" disabled={busy || !loanId} onClick={onCollect}>
            {busy ? <span className="spinner" /> : 'Collect advance'}
          </button>
        </div>
      </div>
    </>
  );
}
