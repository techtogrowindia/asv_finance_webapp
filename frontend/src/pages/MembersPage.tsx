import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { CenterLite, listCenters, listMembers, MemberListItem } from '../api/members';
import { BranchScopeSelect } from '../components/BranchScopeSelect';
import { MemberBulkImport } from '../components/MemberBulkImport';
import { Pager, usePagination } from '../components/Pager';

export function MembersPage() {
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const base = user?.role === 'FDO' ? '/app' : '/admin';
  const [branchId, setBranchId] = useState('');
  const [centers, setCenters] = useState<CenterLite[]>([]);
  const [centerId, setCenterId] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<MemberListItem[] | null>(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    setCenterId('');
    listCenters(branchId).then(setCenters).catch((e) => setError(e.message));
  }, [branchId]);

  useEffect(() => {
    const t = setTimeout(() => {
      setRows(null);
      listMembers({ centerId: centerId || undefined, q: q || undefined, branchId: branchId || undefined })
        .then(setRows)
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [centerId, q, branchId, reloadKey]);

  const total = useMemo(() => rows?.length ?? 0, [rows]);
  const p = usePagination(rows);

  return (
    <>
      <div className="toolbar">
        <div>
          <h1 className="page-title">Members</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            {rows ? `${total} member${total === 1 ? '' : 's'}` : 'Loading…'}
          </p>
        </div>
        <div className="toolbar-actions" style={{ flexWrap: 'wrap' }}>
          <BranchScopeSelect value={branchId} onChange={setBranchId} />
          <input
            className="input search"
            placeholder="Search name / code / mobile"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="select" value={centerId} onChange={(e) => setCenterId(e.target.value)}>
            <option value="">All centers</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
          {can('member.create') && <MemberBulkImport onDone={reload} />}
          {base === '/app' && can('member.create') && (
            <button className="btn btn-primary" onClick={() => navigate('/app/enroll')}>
              + Enroll
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Client ID</th>
              <th>Account</th>
              {base === '/admin' && <th>Branch</th>}
              <th>Name</th>
              <th>Center</th>
              <th>Group</th>
              <th>Mobile</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {p.pageRows?.map((m) => (
              <tr key={m.id} onClick={() => navigate(`${base}/clients/${m.id}`)}>
                <td className="mono">{m.displayId}</td>
                <td className="mono">{m.clientCode}</td>
                {base === '/admin' && <td>{m.branchCode} — {m.branchName}</td>}
                <td>{m.name}</td>
                <td>
                  {m.centerCode} — {m.centerName}
                </td>
                <td>
                  {m.groupNo}.{m.memberNo}
                </td>
                <td>{m.mobile ?? '—'}</td>
                <td>
                  <span className={`badge ${m.status.toLowerCase()}`}>{m.status}</span>
                </td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={base === '/admin' ? 8 : 7} className="empty">
                  No members found.{base === '/app' ? ' Click “Enroll” to add the first member.' : ''}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager p={p} />
    </>
  );
}
