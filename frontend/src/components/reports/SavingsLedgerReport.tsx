import { useEffect, useState } from 'react';
import { CenterLite, listCenters } from '../../api/members';
import { CenterSavingsAccount, listCenterSavingsAccounts, getLoanSavingsLedger, LoanSavingsLedger } from '../../api/loans';
import { LoanSavingsCard } from './LoanSavingsCard';

const inr = (v: number | string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));
const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

/** Savings Ledger: pick a center → one row per loan's savings account
 *  (SB…_loan a/c) → view that account's deposits/refunds + running balance. */
export function SavingsLedgerReport({ branchId }: { branchId?: string } = {}) {
  const [centers, setCenters] = useState<CenterLite[]>([]);
  const [centerId, setCenterId] = useState('');
  const [accounts, setAccounts] = useState<CenterSavingsAccount[] | null>(null);
  const [ledger, setLedger] = useState<LoanSavingsLedger | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setCenterId('');
    listCenters(branchId).then(setCenters).catch((e) => setError(e.message));
  }, [branchId]);
  useEffect(() => {
    setLedger(null);
    if (!centerId) { setAccounts(null); return; }
    setError('');
    listCenterSavingsAccounts(centerId).then(setAccounts).catch((e) => setError(e.message));
  }, [centerId]);

  function view(loanId: string) {
    setError(''); setBusy(true);
    getLoanSavingsLedger(loanId).then(setLedger).catch((e) => setError(e.message)).finally(() => setBusy(false));
  }

  if (ledger) {
    return (
      <>
        <div className="no-print" style={{ marginBottom: 14 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setLedger(null)}>← Back to accounts</button>
        </div>
        <LoanSavingsCard ledger={ledger} />
      </>
    );
  }

  return (
    <>
      {error && <div className="alert-error">{error}</div>}
      <div className="form-card" style={{ maxWidth: 'none', marginBottom: 18 }}>
        <div className="form-grid">
          <div className="field">
            <label>Center</label>
            <select className="input" value={centerId} onChange={(e) => setCenterId(e.target.value)}>
              <option value="">Select center</option>
              {centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {!centerId ? (
        <div className="panel"><div className="panel-body"><div className="empty">Select a center to list its savings accounts (one per loan).</div></div></div>
      ) : (
        <div className="panel">
          <div className="panel-head">Savings Accounts</div>
          <div className="panel-body">
            <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
              <table className="data">
                <thead><tr><th>Client ID</th><th>Branch</th><th>Center</th><th>Member</th><th>Loan A/c</th><th>Savings A/c</th><th>Start Date</th><th>No. of Dues</th><th>Closed Date</th><th>Balance</th><th></th></tr></thead>
                <tbody>
                  {accounts?.map((a) => (
                    <tr key={a.loanId}>
                      <td className="mono">{a.displayId}</td>
                      <td>{a.branchCode} — {a.branchName}</td>
                      <td>{a.centerCode} — {a.centerName}</td>
                      <td>{a.clientName}</td>
                      <td className="mono">{a.loanAccount}</td>
                      <td className="mono">{a.savingsAccount}</td>
                      <td>{date(a.disbursalDate)}</td>
                      <td>{a.totalDues}</td>
                      <td>{date(a.closedDate)}</td>
                      <td>{inr(a.balance)}</td>
                      <td><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => view(a.loanId)}>View ledger</button></td>
                    </tr>
                  ))}
                  {accounts && accounts.length === 0 && <tr><td colSpan={11} className="empty">No loans (savings accounts) in this center.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
