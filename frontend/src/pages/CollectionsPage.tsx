import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { DueRow, getDue, postCollection } from '../api/collections';
import { CenterLite, listCenters } from '../api/members';

const inr = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

export function CollectionsPage() {
  const { user } = useAuth();
  const [centers, setCenters] = useState<CenterLite[]>([]);
  const [centerId, setCenterId] = useState('');
  const [rows, setRows] = useState<DueRow[] | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busyLoanId, setBusyLoanId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    listCenters().then(setCenters).catch((e) => setError(e.message));
  }, []);

  function refresh(cid: string) {
    setRows(null);
    getDue(cid)
      .then((data) => {
        setRows(data);
        const seeded: Record<string, string> = {};
        data.forEach((r) => { seeded[r.loanId] = String(r.totalDue); });
        setAmounts(seeded);
      })
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    if (centerId) refresh(centerId);
    else setRows(null);
  }, [centerId]);

  async function onCollect(row: DueRow) {
    const amount = Number(amounts[row.loanId]);
    if (!amount || amount <= 0) {
      setError('Enter a valid amount to collect');
      return;
    }
    setError('');
    setSuccess('');
    setBusyLoanId(row.loanId);
    try {
      const res = await postCollection(row.loanId, amount);
      setSuccess(
        `Collected ${inr(res.applied)} from ${row.clientName}` +
          (res.loanClosed ? ' — loan fully closed!' : res.unallocated > 0 ? ` (₹${res.unallocated} extra unallocated)` : ''),
      );
      refresh(centerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Collection failed');
    } finally {
      setBusyLoanId(null);
    }
  }

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
                <th>Client ID</th><th>Name</th><th>Loan A/c</th><th>Dues Pending</th>
                <th>Total Due</th><th>Collect Amount</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((r) => (
                <tr key={r.loanId}>
                  <td className="mono">{r.displayId}</td>
                  <td>{r.clientName}</td>
                  <td className="mono">{r.loanAccount}</td>
                  <td>{r.dueCount}</td>
                  <td>{inr(r.totalDue)}</td>
                  <td>
                    <input
                      className="input"
                      style={{ width: 120, padding: '7px 10px' }}
                      type="number"
                      min="0"
                      value={amounts[r.loanId] ?? ''}
                      onChange={(e) => setAmounts((a) => ({ ...a, [r.loanId]: e.target.value }))}
                    />
                  </td>
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
                <tr><td colSpan={7} className="empty">Nothing pending for this center. All caught up!</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {!centerId && <div className="panel"><div className="panel-body"><div className="empty">Select a center to see who owes money today.</div></div></div>}
    </>
  );
}
