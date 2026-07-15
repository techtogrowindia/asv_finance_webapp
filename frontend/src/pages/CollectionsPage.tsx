import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { DueRow, getDue, postCollection } from '../api/collections';
import { CenterLite, listCenters } from '../api/members';
import { getSettings } from '../api/settings';

const inr = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

export function CollectionsPage() {
  const { user } = useAuth();
  const [centers, setCenters] = useState<CenterLite[]>([]);
  const [centerId, setCenterId] = useState('');
  const [rows, setRows] = useState<DueRow[] | null>(null);
  const [advances, setAdvances] = useState<Record<string, string>>({});
  const [savings, setSavings] = useState(0);
  const [busyLoanId, setBusyLoanId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    listCenters().then(setCenters).catch((e) => setError(e.message));
    getSettings().then((s) => setSavings(s.savingsPerCollection)).catch(() => {});
  }, []);

  function refresh(cid: string) {
    setRows(null);
    getDue(cid)
      .then((data) => { setRows(data); setAdvances({}); })
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    if (centerId) refresh(centerId);
    else setRows(null);
  }, [centerId]);

  // Cash to collect = overdue + this period's instalment + any advance the member
  // chooses to pre-pay + the fixed savings deposit.
  const advanceOf = (r: DueRow) => Number(advances[r.loanId]) || 0;
  const rowTotal = (r: DueRow) => r.arrear + r.currentDue + advanceOf(r) + savings;

  async function onCollect(row: DueRow) {
    // The loan payment; savings is banked separately by the API.
    const amount = row.arrear + row.currentDue + advanceOf(row);
    if (amount <= 0) {
      setError('Nothing to collect for this member');
      return;
    }
    setError('');
    setSuccess('');
    setBusyLoanId(row.loanId);
    try {
      const res = await postCollection(row.loanId, amount);
      setSuccess(
        `Collected ${inr(res.applied)} from ${row.clientName}` +
          (res.savingsCollected > 0 ? ` + ${inr(res.savingsCollected)} savings` : '') +
          (res.advanceBanked > 0 ? ` (${inr(res.advanceBanked)} banked as advance)` : '') +
          (res.loanClosed ? ' — loan fully closed!' : '') +
          (res.savingsRefunded > 0 ? ` ${inr(res.savingsRefunded)} savings refunded to the client.` : ''),
      );
      refresh(centerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Collection failed');
    } finally {
      setBusyLoanId(null);
    }
  }

  const showSavings = savings > 0;
  const cols = showSavings ? 9 : 8;

  return (
    <>
      <div className="toolbar">
        <div>
          <h1 className="page-title">Collections</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            Working date: {user ? new Date(user.workingDate).toLocaleDateString('en-IN') : '—'}
          </p>
        </div>
        <div className="toolbar-actions">
          <select className="select" value={centerId} onChange={(e) => setCenterId(e.target.value)}>
            <option value="">Select center</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && (
        <div className="alert-error" style={{ background: '#e3f5ee', color: '#157a5b', borderColor: '#bfe6d7' }}>
          {success}
        </div>
      )}

      {centerId && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Client ID</th><th>Name</th><th>Loan A/c</th>
                <th>Arrear</th><th>Current Due</th><th>Advance (pre-pay)</th>
                {showSavings && <th>Savings</th>}
                <th>Total</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((r) => (
                <tr key={r.loanId}>
                  <td className="mono">{r.displayId}</td>
                  <td>{r.clientName}</td>
                  <td className="mono">{r.loanAccount}</td>
                  <td>{inr(r.arrear)}</td>
                  <td>{inr(r.currentDue)}</td>
                  <td>
                    <input
                      className="input"
                      style={{ width: 110, padding: '7px 10px' }}
                      type="number"
                      min="0"
                      placeholder="0"
                      value={advances[r.loanId] ?? ''}
                      onChange={(e) => setAdvances((a) => ({ ...a, [r.loanId]: e.target.value }))}
                    />
                    {r.advanceBalance > 0 && (
                      <div className="hint" style={{ marginTop: 2 }}>Held: {inr(r.advanceBalance)}</div>
                    )}
                  </td>
                  {showSavings && <td>{inr(savings)}</td>}
                  <td style={{ fontWeight: 600 }}>{inr(rowTotal(r))}</td>
                  <td>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={busyLoanId === r.loanId}
                      onClick={() => onCollect(r)}
                    >
                      {busyLoanId === r.loanId ? <span className="spinner" /> : 'Collect'}
                    </button>
                  </td>
                </tr>
              ))}
              {rows && rows.length === 0 && (
                <tr><td colSpan={cols} className="empty">Nothing pending for this center. All caught up!</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {!centerId && <div className="panel"><div className="panel-body"><div className="empty">Select a center to see who owes money today.</div></div></div>}
    </>
  );
}
