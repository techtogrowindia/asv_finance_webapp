import { useEffect, useState } from 'react';
import { CenterLite, listCenters, listMembers, MemberListItem } from '../../api/members';
import { ExistingLoan, listExistingLoans } from '../../api/loans';
import { SearchableSelect } from '../../components/SearchableSelect';
import { useConfirm } from '../../components/ConfirmProvider';
import { ForeclosureQuote, foreclose, getForeclosureQuote } from '../../api/collections';

const inr = (v: number | string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));

const POLICY_LABEL: Record<string, string> = {
  FULL: 'Full principal + interest',
  PRINCIPAL_ONLY: 'Principal only (interest waived)',
  INTEREST_TO_DATE: 'Principal + interest to date',
};

export function ForeclosurePage() {
  const confirm = useConfirm();
  const [centers, setCenters] = useState<CenterLite[]>([]);
  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [loans, setLoans] = useState<ExistingLoan[]>([]);
  const [centerId, setCenterId] = useState('');
  const [clientId, setClientId] = useState('');
  const [loanId, setLoanId] = useState('');
  const [quote, setQuote] = useState<ForeclosureQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { listCenters().then(setCenters).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    setClientId(''); setMembers([]);
    if (centerId) listMembers({ centerId }).then(setMembers).catch((e) => setError(e.message));
  }, [centerId]);
  useEffect(() => {
    setLoanId(''); setLoans([]); setQuote(null);
    if (clientId) listExistingLoans(clientId).then((ls) => setLoans(ls.filter((l) => l.loanType === 'OPEN'))).catch((e) => setError(e.message));
  }, [clientId]);
  useEffect(() => {
    setQuote(null);
    if (loanId) getForeclosureQuote(loanId).then(setQuote).catch((e) => setError(e.message));
  }, [loanId]);

  async function onForeclose() {
    if (!quote) return;
    const ok = await confirm({
      title: 'Foreclose this loan?',
      message: `Close ${quote.loanAccount} early for a payoff of ${inr(quote.payoffTotal)} (${inr(quote.interestWaived)} interest waived)? This settles and closes the loan — it cannot be undone.`,
      confirmLabel: 'Foreclose',
      danger: true,
    });
    if (!ok) return;
    setError(''); setSuccess(''); setBusy(true);
    try {
      const res = await foreclose(quote.loanId);
      setSuccess(`Loan closed. Payoff ${inr(res.payoffTotal)}, interest waived ${inr(res.interestWaived)}.`);
      setLoanId(''); setQuote(null);
      if (clientId) listExistingLoans(clientId).then((ls) => setLoans(ls.filter((l) => l.loanType === 'OPEN')));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Foreclosure failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="page-title">Foreclosure</h1>
      <p className="page-sub">Close a member's loan early. The payoff below reflects the foreclosure policy set in Business Settings.</p>

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
        </div>
      </div>

      {quote && (
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="panel-head">Foreclosure quote — {POLICY_LABEL[quote.policy]}</div>
          <div className="panel-body">
            <div className="detail-grid">
              <div className="detail-item"><div className="k">Remaining principal</div><div className="v">{inr(quote.remainingPrincipal)}</div></div>
              <div className="detail-item"><div className="k">Interest charged</div><div className="v">{inr(quote.interestCharged)}</div></div>
              <div className="detail-item"><div className="k">Interest waived</div><div className="v">{inr(quote.interestWaived)}</div></div>
              <div className="detail-item"><div className="k">Advance on hand</div><div className="v">{inr(quote.advanceBalance)}</div></div>
              <div className="detail-item"><div className="k">Payoff total</div><div className="v" style={{ fontWeight: 700 }}>{inr(quote.payoffTotal)}</div></div>
            </div>
            <div className="form-actions" style={{ marginTop: 18 }}>
              <button className="btn btn-danger" disabled={busy} onClick={onForeclose}>
                {busy ? <span className="spinner" /> : 'Foreclose loan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
