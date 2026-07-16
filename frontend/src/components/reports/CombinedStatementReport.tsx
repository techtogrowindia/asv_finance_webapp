import { useEffect, useState } from 'react';
import { CenterLite, listCenters } from '../../api/members';
import { CenterSavingsAccount, listCenterSavingsAccounts, getLoanStatement, LoanStatement } from '../../api/loans';
import { LoanStatementCard } from './LoanStatementCard';

const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

/** Loan + Savings report: pick a center → one row per loan account → View
 *  ledger opens that loan's full ledger (due / collected / savings / balance)
 *  plus its savings passbook, downloadable as one PDF. */
export function CombinedStatementReport() {
  const [centers, setCenters] = useState<CenterLite[]>([]);
  const [centerId, setCenterId] = useState('');
  const [accounts, setAccounts] = useState<CenterSavingsAccount[] | null>(null);
  const [st, setSt] = useState<LoanStatement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { listCenters().then(setCenters).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    setSt(null);
    if (!centerId) { setAccounts(null); return; }
    setError('');
    listCenterSavingsAccounts(centerId).then(setAccounts).catch((e) => setError(e.message));
  }, [centerId]);

  function view(loanId: string) {
    setError(''); setBusy(true);
    getLoanStatement(loanId).then(setSt).catch((e) => setError(e.message)).finally(() => setBusy(false));
  }

  if (st) {
    return (
      <>
        <div className="no-print" style={{ marginBottom: 14 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setSt(null)}>← Back to loan list</button>
        </div>
        <LoanStatementCard st={st} />
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
        <div className="panel"><div className="panel-body"><div className="empty">Select a center, then a loan account, to see its combined loan &amp; savings ledger.</div></div></div>
      ) : (
        <div className="panel">
          <div className="panel-head">Loan Accounts</div>
          <div className="panel-body">
            <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
              <table className="data">
                <thead><tr><th>Client ID</th><th>Member</th><th>Loan A/c</th><th>Savings A/c</th><th>Start Date</th><th>Closed Date</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {accounts?.map((a) => (
                    <tr key={a.loanId}>
                      <td className="mono">{a.displayId}</td>
                      <td>{a.clientName}</td>
                      <td className="mono">{a.loanAccount}</td>
                      <td className="mono">{a.savingsAccount}</td>
                      <td>{date(a.disbursalDate)}</td>
                      <td>{date(a.closedDate)}</td>
                      <td><span className={`badge ${a.loanType === 'OPEN' ? 'active' : 'closed'}`}>{a.loanType}</span></td>
                      <td><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => view(a.loanId)}>View ledger</button></td>
                    </tr>
                  ))}
                  {accounts && accounts.length === 0 && <tr><td colSpan={8} className="empty">No loans in this center.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
