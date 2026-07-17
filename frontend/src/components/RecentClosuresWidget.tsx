import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

interface RecentClosure {
  loanId: string;
  loanAccount: string;
  displayId: string;
  clientName: string;
  centerName: string;
  closedDate: string;
  foreclosed: boolean;
  totalAmount: number;
  savingsRefunded: number;
}

const inr = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
const date = (v: string) => new Date(v).toLocaleDateString('en-IN');

/** Dashboard notification widget — the last few loans closed in scope (auto-
 *  refunded savings shown alongside), so BM/HO/FDO see closures without
 *  hunting through Reports. Shared by both the employee and admin dashboards. */
export function RecentClosuresWidget() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const base = user?.role === 'FDO' ? '/app' : '/admin';
  const [rows, setRows] = useState<RecentClosure[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<RecentClosure[]>('/dashboard/recent-closures').then(setRows).catch((e) => setError(e.message));
  }, []);

  if (error) return null; // non-critical widget — fail quietly on the dashboard

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <div className="panel-head">Recently Closed Loans</div>
      <div className="panel-body">
        {rows && rows.length > 0 ? (
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Client ID</th><th>Member</th><th>Loan A/c</th><th>Center</th>
                  <th>Closed On</th><th>Type</th><th>Savings Refunded</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.loanId}>
                    <td className="mono">{r.displayId}</td>
                    <td>{r.clientName}</td>
                    <td className="mono">{r.loanAccount}</td>
                    <td>{r.centerName}</td>
                    <td>{date(r.closedDate)}</td>
                    <td><span className={`badge ${r.foreclosed ? 'pending' : 'active'}`}>{r.foreclosed ? 'Foreclosed' : 'Closed'}</span></td>
                    <td>{r.savingsRefunded > 0 ? inr(r.savingsRefunded) : '—'}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => navigate(`${base}/loans/${r.loanId}/statement`)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">{rows ? 'No loans closed recently.' : 'Loading…'}</div>
        )}
      </div>
    </div>
  );
}
