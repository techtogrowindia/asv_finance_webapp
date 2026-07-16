import { useEffect, useState } from 'react';
import { CenterLite, listCenters } from '../../api/members';
import { CenterSavingsAccount, listCenterSavingsAccounts, getLoanStatement, LoanStatement } from '../../api/loans';

const inr = (v: number | string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));
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
  const [pdfBusy, setPdfBusy] = useState(false);
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

  async function downloadPdf() {
    if (!st) return;
    setPdfBusy(true);
    try { const m = await import('../../lib/pdf/reportPdf'); await m.downloadLoanStatementPdf(st); }
    finally { setPdfBusy(false); }
  }

  if (st) {
    return (
      <>
        <div className="no-print" style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setSt(null)}>← Back to loan list</button>
          <button className="btn btn-primary btn-sm" disabled={pdfBusy} onClick={downloadPdf}>{pdfBusy ? <span className="spinner" /> : 'Download PDF'}</button>
        </div>
        <div className="panel ledger-print">
          <div className="panel-body">
            <h2 style={{ textAlign: 'center', margin: '0 0 4px' }}>ASV FINANCE</h2>
            <p style={{ textAlign: 'center', margin: '0 0 18px', color: 'var(--ink-500)' }}>Loan + Savings Statement</p>
            <div className="detail-grid" style={{ marginBottom: 18 }}>
              <div className="detail-item"><div className="k">Client ID</div><div className="v">{st.clientDisplayId}</div></div>
              <div className="detail-item"><div className="k">Client Name</div><div className="v">{st.clientName}</div></div>
              <div className="detail-item"><div className="k">Loan Account</div><div className="v mono">{st.loanAccount}</div></div>
              <div className="detail-item"><div className="k">Savings A/c</div><div className="v mono">{st.savingsAccount}</div></div>
              <div className="detail-item"><div className="k">Loan Amount</div><div className="v">{inr(st.loanAmount)}</div></div>
              <div className="detail-item"><div className="k">Status</div><div className="v"><span className={`badge ${st.loanType === 'OPEN' ? 'active' : 'closed'}`}>{st.loanType}</span></div></div>
            </div>

            <div className="panel-head" style={{ padding: '0 0 8px', borderBottom: 'none' }}>Repayment Schedule</div>
            <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
              <table className="data">
                <thead><tr>
                  <th>Due No</th><th>Due Date</th><th>Coll Date</th><th>Due Pri</th><th>Due Int</th>
                  <th>Due Amt</th><th>Coll Pri</th><th>Coll Int</th><th>Coll Amt</th><th>Savings</th><th>Balance</th>
                </tr></thead>
                <tbody>
                  {st.schedule.map((r) => (
                    <tr key={r.dueNo}>
                      <td>{r.dueNo}</td><td>{date(r.dueDate)}</td><td>{date(r.collDate)}</td>
                      <td>{inr(r.duePri)}</td><td>{inr(r.dueInt)}</td><td>{inr(r.dueAmt)}</td>
                      <td>{inr(r.collPri)}</td><td>{inr(r.collInt)}</td><td>{inr(r.collAmt)}</td>
                      <td>{inr(r.savings)}</td><td>{inr(r.dueBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="panel-head" style={{ padding: '16px 0 8px', borderBottom: 'none' }}>Savings Passbook</div>
            <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
              <table className="data">
                <thead><tr><th>Date</th><th>Type</th><th>Deposit</th><th>Refund</th><th>Balance</th></tr></thead>
                <tbody>
                  {st.savings.map((r, i) => (
                    <tr key={i}>
                      <td>{date(r.date)}</td>
                      <td><span className={`badge ${r.kind === 'DEPOSIT' ? 'active' : 'pending'}`}>{r.kind}</span></td>
                      <td>{r.deposit ? inr(r.deposit) : '—'}</td><td>{r.refund ? inr(r.refund) : '—'}</td><td>{inr(r.balance)}</td>
                    </tr>
                  ))}
                  {st.savings.length === 0 && <tr><td colSpan={5} className="empty">No savings activity.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
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
