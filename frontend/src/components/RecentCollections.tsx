import { useEffect, useState } from 'react';
import { RecentCollection, getRecentCollections } from '../api/collections';

const inr = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-IN');

const KIND_LABEL: Record<string, string> = {
  REGULAR: 'Collection',
  ADVANCE: 'Advance',
  FORECLOSURE: 'Foreclosure',
  FORECLOSURE_CHARGE: 'Foreclosure charge',
  CORRECTION_REVERSAL: 'Correction',
};

/** "Last 10 Collections" panel — the most recent money-in postings for the
 *  selected center (and group, when filtered). `refreshKey` re-fetches after a
 *  new collection is posted on the page. */
export function RecentCollections({ centerId, groupNo, refreshKey }: { centerId: string; groupNo?: string; refreshKey?: number }) {
  const [rows, setRows] = useState<RecentCollection[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!centerId) { setRows(null); return; }
    setError('');
    getRecentCollections(centerId, groupNo || undefined).then(setRows).catch((e) => setError(e.message));
  }, [centerId, groupNo, refreshKey]);

  if (!centerId) return null;

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <div className="panel-head">Last 10 Collections</div>
      <div className="panel-body">
        {error && <div className="alert-error">{error}</div>}
        <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
          <table className="data">
            <thead>
              <tr><th>Date</th><th>Client ID</th><th>Name</th><th>Loan A/c</th><th>Type</th><th>Amount</th></tr>
            </thead>
            <tbody>
              {rows?.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.collectedOn)}</td>
                  <td className="mono">{r.displayId}</td>
                  <td>{r.clientName}</td>
                  <td className="mono">{r.loanAccount}</td>
                  <td>{KIND_LABEL[r.kind] ?? r.kind}</td>
                  <td>{inr(r.amount)}</td>
                </tr>
              ))}
              {rows && rows.length === 0 && (
                <tr><td colSpan={6} className="empty">No collections yet for this {groupNo ? 'group' : 'center'}.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
