import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '../../components/AdminLayout';
import { getKycPending, MemberListItem } from '../../api/members';

export function KycVerificationPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<MemberListItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getKycPending().then(setRows).catch((e) => setError(e.message));
  }, []);

  return (
    <AdminLayout>
      <h1 className="page-title">KYC Verification</h1>
      <p className="page-sub">
        Members whose KYC isn't fully approved yet. Open a member to review their photos — once every
        mandatory document (client and nominee, if recorded) is approved, they become eligible for loan
        disbursement.
      </p>

      {error && <div className="alert-error">{error}</div>}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Client ID</th><th>Name</th><th>Center</th><th>Group</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((m) => (
              <tr key={m.id} onClick={() => navigate(`/admin/clients/${m.id}`)}>
                <td className="mono">{m.displayId}</td>
                <td>{m.name}</td>
                <td>{m.centerCode} — {m.centerName}</td>
                <td>Group {m.groupNo}</td>
                <td><span className={`badge ${m.status.toLowerCase()}`}>{m.status}</span></td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/admin/clients/${m.id}`); }}>
                    Review
                  </button>
                </td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr><td colSpan={6} className="empty">Nobody is pending KYC review — everyone in scope is fully approved.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
