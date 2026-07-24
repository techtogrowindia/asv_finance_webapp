import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { RecentCollection, getRecentCollections } from '../api/collections';
import { RequestCorrectionModal } from './RequestCorrectionModal';

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
 *  selected center (and group, when filtered), each with View ledger + Request
 *  correction. `refreshKey` re-fetches after a new collection is posted. */
export function RecentCollections({ centerId, groupNo, refreshKey }: { centerId: string; groupNo?: string; refreshKey?: number }) {
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const base = user?.role === 'FDO' ? '/app' : '/admin';
  const [rows, setRows] = useState<RecentCollection[] | null>(null);
  const [error, setError] = useState('');
  const [correctionLoanId, setCorrectionLoanId] = useState<string | null>(null);

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
              <tr><th>Date</th><th>Client ID</th><th>Name</th><th>Loan A/c</th><th>Type</th><th>Amount</th><th></th></tr>
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
                  <td style={{ display: 'flex', gap: 6, whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(`${base}/loans/${r.loanId}/statement`)}>
                      View ledger
                    </button>
                    {can('collection.correct') && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setCorrectionLoanId(r.loanId)}>
                        Request correction
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {rows && rows.length === 0 && (
                <tr><td colSpan={7} className="empty">No collections yet for this {groupNo ? 'group' : 'center'}.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {correctionLoanId && (
        <RequestCorrectionModal loanId={correctionLoanId} onClose={() => setCorrectionLoanId(null)} />
      )}
    </div>
  );
}
