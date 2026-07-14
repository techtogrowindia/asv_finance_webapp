import { useEffect, useState } from 'react';
import { CenterLite, listCenters } from '../../api/members';
import { SearchableSelect } from '../../components/SearchableSelect';
import { CenterSummary, DueRow, getArrears, getCenterSummary, postCollection } from '../../api/collections';

const inr = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

export function ArrearCollectionPage() {
  const [centers, setCenters] = useState<CenterLite[]>([]);
  const [centerId, setCenterId] = useState('');
  const [summary, setSummary] = useState<CenterSummary | null>(null);
  const [rows, setRows] = useState<DueRow[] | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busyLoanId, setBusyLoanId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    listCenters().then(setCenters).catch((e) => setError(e.message));
  }, []);

  function refresh(cid: string) {
    if (!cid) { setSummary(null); setRows(null); return; }
    getCenterSummary(cid).then(setSummary).catch((e) => setError(e.message));
    getArrears(cid)
      .then((data) => {
        setRows(data);
        setAmounts(Object.fromEntries(data.map((r) => [r.loanId, String(r.totalDue)])));
      })
      .catch((e) => setError(e.message));
  }

  useEffect(() => { refresh(centerId); /* eslint-disable-next-line */ }, [centerId]);

  async function onCollect(row: DueRow) {
    const amount = Number(amounts[row.loanId]);
    if (!amount || amount <= 0) { setError('Enter a valid amount'); return; }
    setError(''); setSuccess(''); setBusyLoanId(row.loanId);
    try {
      const res = await postCollection(row.loanId, amount);
      setSuccess(`Collected ${inr(res.applied)} from ${row.clientName} — arrears reduced.` + (res.loanClosed ? ' Loan closed!' : ''));
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
          <h1 className="page-title">Arrear Collection</h1>
          <p className="page-sub" style={{ margin: 0 }}>Overdue members only. Collecting reduces the noted overdue.</p>
        </div>
        <div className="toolbar-actions" style={{ minWidth: 260 }}>
          <SearchableSelect
            options={centers.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))}
            value={centerId}
            onChange={setCenterId}
            placeholder="Select center…"
          />
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-error" style={{ background: '#e3f5ee', color: '#157a5b', borderColor: '#bfe6d7' }}>{success}</div>}

      {summary && (
        <div className="cards">
          <div className="card"><div><div className="card-label">Members in arrears</div><div className="card-value">{summary.memberCount}</div></div></div>
          <div className="card"><div><div className="card-label">Opening arrears</div><div className="card-value">{inr(summary.openingArrears)}</div></div></div>
          <div className="card"><div><div className="card-label">Collected today</div><div className="card-value">{inr(summary.collectedToday)}</div></div></div>
          <div className="card"><div><div className="card-label">Closing arrears</div><div className="card-value">{inr(summary.closingArrears)}</div></div></div>
        </div>
      )}

      {centerId && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Client ID</th><th>Name</th><th>Loan A/c</th><th>Overdue Weeks</th><th>Overdue Amount</th><th>Collect</th><th></th></tr>
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
                    <input className="input" style={{ width: 120, padding: '7px 10px' }} type="number" min="0"
                      value={amounts[r.loanId] ?? ''} onChange={(e) => setAmounts((a) => ({ ...a, [r.loanId]: e.target.value }))} />
                  </td>
                  <td>
                    <button className="btn btn-primary btn-sm" disabled={busyLoanId === r.loanId} onClick={() => onCollect(r)}>
                      {busyLoanId === r.loanId ? <span className="spinner" /> : 'Collect'}
                    </button>
                  </td>
                </tr>
              ))}
              {rows && rows.length === 0 && <tr><td colSpan={7} className="empty">No overdue members in this center. 🎉</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {!centerId && <div className="panel"><div className="panel-body"><div className="empty">Select a center to see overdue members.</div></div></div>}
    </>
  );
}
