import { useEffect, useState } from 'react';
import { CenterLite, listCenters, listMembers, MemberListItem, getClientStatement, ClientStatement } from '../../api/members';

const inr = (v: number | string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));
const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

/** Combined report: a member's loans (each full schedule) plus their savings
 *  passbook, in one statement — downloadable as a single PDF. */
export function CombinedStatementReport() {
  const [centers, setCenters] = useState<CenterLite[]>([]);
  const [centerId, setCenterId] = useState('');
  const [members, setMembers] = useState<MemberListItem[] | null>(null);
  const [st, setSt] = useState<ClientStatement | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { listCenters().then(setCenters).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    setSt(null);
    if (!centerId) { setMembers(null); return; }
    setError('');
    listMembers({ centerId }).then(setMembers).catch((e) => setError(e.message));
  }, [centerId]);

  function view(clientId: string) {
    setError(''); setBusy(true);
    getClientStatement(clientId).then(setSt).catch((e) => setError(e.message)).finally(() => setBusy(false));
  }

  async function downloadPdf() {
    if (!st) return;
    setPdfBusy(true);
    try { const m = await import('../../lib/pdf/reportPdf'); await m.downloadClientStatementPdf(st); }
    finally { setPdfBusy(false); }
  }

  if (st) {
    return (
      <>
        <div className="no-print" style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setSt(null)}>← Back to member list</button>
          <button className="btn btn-primary btn-sm" disabled={pdfBusy} onClick={downloadPdf}>{pdfBusy ? <span className="spinner" /> : 'Download PDF'}</button>
        </div>
        <div className="panel ledger-print">
          <div className="panel-body">
            <h2 style={{ textAlign: 'center', margin: '0 0 4px' }}>ASV FINANCE</h2>
            <p style={{ textAlign: 'center', margin: '0 0 18px', color: 'var(--ink-500)' }}>Member Statement — Loans &amp; Savings</p>
            <div className="detail-grid" style={{ marginBottom: 18 }}>
              <div className="detail-item"><div className="k">Client ID</div><div className="v">{st.displayId}</div></div>
              <div className="detail-item"><div className="k">Client Name</div><div className="v">{st.clientName}</div></div>
              <div className="detail-item"><div className="k">Savings A/c</div><div className="v">{st.savingsAccount ?? '—'}</div></div>
              <div className="detail-item"><div className="k">Savings Balance</div><div className="v" style={{ fontWeight: 700 }}>{inr(st.savingsBalance)}</div></div>
            </div>

            {st.loans.map((l) => (
              <div key={l.loanAccount} style={{ marginBottom: 18 }}>
                <div className="panel-head" style={{ padding: '0 0 8px', borderBottom: 'none' }}>
                  Loan {l.loanAccount} — {inr(l.loanAmount)} · <span className={`badge ${l.loanType === 'OPEN' ? 'active' : 'closed'}`}>{l.loanType}</span>
                </div>
                <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
                  <table className="data">
                    <thead><tr>
                      <th>Due No</th><th>Due Date</th><th>Coll Date</th><th>Due Pri</th><th>Due Int</th>
                      <th>Due Amt</th><th>Coll Pri</th><th>Coll Int</th><th>Coll Amt</th><th>Savings</th><th>Balance</th>
                    </tr></thead>
                    <tbody>
                      {l.schedule.map((r) => (
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
              </div>
            ))}
            {st.loans.length === 0 && <div className="empty">No loans for this member.</div>}

            <div className="panel-head" style={{ padding: '8px 0', borderBottom: 'none' }}>Savings Passbook</div>
            <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
              <table className="data">
                <thead><tr><th>Date</th><th>Loan A/c</th><th>Type</th><th>Deposit</th><th>Refund</th><th>Balance</th></tr></thead>
                <tbody>
                  {st.savings.map((r, i) => (
                    <tr key={i}>
                      <td>{date(r.date)}</td><td className="mono">{r.loanAccount ?? '—'}</td>
                      <td><span className={`badge ${r.kind === 'DEPOSIT' ? 'active' : 'pending'}`}>{r.kind}</span></td>
                      <td>{r.deposit ? inr(r.deposit) : '—'}</td><td>{r.refund ? inr(r.refund) : '—'}</td><td>{inr(r.balance)}</td>
                    </tr>
                  ))}
                  {st.savings.length === 0 && <tr><td colSpan={6} className="empty">No savings activity.</td></tr>}
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
        <div className="panel"><div className="panel-body"><div className="empty">Select a center, then a member, to see their combined loan &amp; savings statement.</div></div></div>
      ) : (
        <div className="panel">
          <div className="panel-head">Members</div>
          <div className="panel-body">
            <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
              <table className="data">
                <thead><tr><th>Client ID</th><th>Member</th><th>Savings A/c</th><th></th></tr></thead>
                <tbody>
                  {members?.map((m) => (
                    <tr key={m.id}>
                      <td className="mono">{m.displayId}</td>
                      <td>{m.name}</td>
                      <td className="mono">{m.savingsAccount ?? '—'}</td>
                      <td><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => view(m.id)}>View statement</button></td>
                    </tr>
                  ))}
                  {members && members.length === 0 && <tr><td colSpan={4} className="empty">No members in this center.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
