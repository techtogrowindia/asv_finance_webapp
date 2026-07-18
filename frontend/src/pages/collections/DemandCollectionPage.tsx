import { useEffect, useState } from 'react';
import { CenterLite, listCenters } from '../../api/members';
import { SearchableSelect } from '../../components/SearchableSelect';
import { BranchScopeSelect } from '../../components/BranchScopeSelect';
import { useConfirm } from '../../components/ConfirmProvider';
import { getSettings } from '../../api/settings';
import { InlineClosureReport } from '../../components/reports/InlineClosureReport';
import {
  bulkCollectDemand,
  CenterSummary,
  DueRow,
  getCenterSummary,
  getDue,
  postCollection,
} from '../../api/collections';

const inr = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

export function DemandCollectionPage() {
  const confirm = useConfirm();
  const [branchId, setBranchId] = useState('');
  const [centers, setCenters] = useState<CenterLite[]>([]);
  const [centerId, setCenterId] = useState('');
  const [summary, setSummary] = useState<CenterSummary | null>(null);
  const [rows, setRows] = useState<DueRow[] | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busyLoanId, setBusyLoanId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [savings, setSavings] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [closedLoanId, setClosedLoanId] = useState<string | null>(null);

  useEffect(() => {
    setCenterId('');
    listCenters(branchId).then(setCenters).catch((e) => setError(e.message));
  }, [branchId]);
  useEffect(() => {
    getSettings().then((s) => setSavings(s.savingsPerCollection)).catch(() => {});
  }, []);

  function refresh(cid: string) {
    if (!cid) { setSummary(null); setRows(null); return; }
    getCenterSummary(cid).then(setSummary).catch((e) => setError(e.message));
    getDue(cid)
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
      setSuccess(
        `Collected ${inr(res.applied)} from ${row.clientName}`
        + (res.savingsCollected > 0 ? ` + ${inr(res.savingsCollected)} savings` : '')
        + (res.loanClosed ? ' — loan closed!' : res.advanceBanked > 0 ? ` (₹${res.advanceBanked} banked as advance)` : '')
        + (res.savingsRefunded > 0 ? ` ${inr(res.savingsRefunded)} savings refunded to the client.` : ''),
      );
      if (res.loanClosed) setClosedLoanId(row.loanId);
      refresh(centerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Collection failed');
    } finally {
      setBusyLoanId(null);
    }
  }

  async function onCollectAll() {
    if (!summary) return;
    const ok = await confirm({
      title: 'Collect the whole center?',
      message: `Post each member's full demand for ${summary.centerCode} — ${summary.centerName} (total ${inr(summary.demand)})? This records a collection for everyone who owes today.`,
      confirmLabel: 'Collect all',
    });
    if (!ok) return;
    setError(''); setSuccess(''); setBulkBusy(true);
    try {
      const res = await bulkCollectDemand(centerId);
      setSuccess(`Collected ${inr(res.totalCollected)} across ${res.loansCollected} loan(s).` + (res.totalSavings > 0 ? ` + ${inr(res.totalSavings)} savings.` : ''));
      refresh(centerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk collect failed');
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <>
      <div className="toolbar">
        <div>
          <h1 className="page-title">Demand Collection</h1>
          <p className="page-sub" style={{ margin: 0 }}>Center totals and one-tap "everyone paid" collection.</p>
        </div>
        <div className="toolbar-actions" style={{ minWidth: 260, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <BranchScopeSelect value={branchId} onChange={setBranchId} />
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
      {closedLoanId && <InlineClosureReport loanId={closedLoanId} onDismiss={() => setClosedLoanId(null)} />}

      {summary && (
        <div className="cards">
          <SummaryCard label="Members with dues" value={String(summary.memberCount)} />
          <SummaryCard label="Loan outstanding" value={inr(summary.loanOutstanding)} />
          <SummaryCard label="Opening arrears" value={inr(summary.openingArrears)} />
          <SummaryCard label="Demand today" value={inr(summary.demand)} />
          <SummaryCard label="Collected today" value={inr(summary.collectedToday)} />
          <SummaryCard label="Closing arrears" value={inr(summary.closingArrears)} />
        </div>
      )}

      {centerId && (
        <>
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <div />
            <button className="btn btn-primary" disabled={bulkBusy || !rows?.length} onClick={onCollectAll}>
              {bulkBusy ? <span className="spinner" /> : 'Collect all demand'}
            </button>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Client ID</th><th>Name</th><th>Loan A/c</th><th>Dues</th><th>Total Due</th>{savings > 0 && <th>Savings</th>}<th>Collect</th><th></th></tr>
              </thead>
              <tbody>
                {rows?.map((r) => (
                  <tr key={r.loanId}>
                    <td className="mono">{r.displayId}</td>
                    <td>{r.clientName}</td>
                    <td className="mono">{r.loanAccount}</td>
                    <td>{r.dueCount}</td>
                    <td>{inr(r.totalDue)}</td>
                    {savings > 0 && <td>{inr(savings)}</td>}
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
                {rows && rows.length === 0 && <tr><td colSpan={savings > 0 ? 8 : 7} className="empty">Nothing pending for this center.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!centerId && <div className="panel"><div className="panel-body"><div className="empty">Select a center to see its demand.</div></div></div>}
    </>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div>
        <div className="card-label">{label}</div>
        <div className="card-value">{value}</div>
      </div>
    </div>
  );
}
