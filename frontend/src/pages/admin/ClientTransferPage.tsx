import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { useConfirm } from '../../components/ConfirmProvider';
import {
  CenterLite,
  GroupLite,
  MemberListItem,
  listCenters,
  listGroups,
  listMembers,
  transferMember,
} from '../../api/members';

export function ClientTransferPage() {
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<MemberListItem[]>([]);
  const [selected, setSelected] = useState<MemberListItem | null>(null);
  const [centers, setCenters] = useState<CenterLite[]>([]);
  const [groups, setGroups] = useState<GroupLite[]>([]);
  const [destCenterId, setDestCenterId] = useState('');
  const [destGroupNo, setDestGroupNo] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listCenters().then(setCenters).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(() => {
      listMembers({ q: q.trim() }).then(setResults).catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!destCenterId) { setGroups([]); return; }
    listGroups(destCenterId).then(setGroups).catch((e) => setError(e.message));
  }, [destCenterId]);

  function pick(m: MemberListItem) {
    setSelected(m);
    setResults([]);
    setQ(m.name);
    setDestCenterId('');
    setDestGroupNo('');
    setSuccess('');
  }

  function reset() {
    setSelected(null);
    setQ('');
    setDestCenterId('');
    setDestGroupNo('');
  }

  async function onTransfer() {
    if (!selected || !destCenterId || !destGroupNo) return;
    const destCenter = centers.find((c) => c.id === destCenterId);
    const ok = await confirm({
      title: 'Transfer this member?',
      message: `Move ${selected.name} (${selected.displayId}) to ${destCenter?.code} — ${destCenter?.name}, Group ${destGroupNo}? Their client ID will change; loans and collection history stay with them.`,
      confirmLabel: 'Transfer',
    });
    if (!ok) return;
    setError(''); setSuccess(''); setBusy(true);
    try {
      const updated = await transferMember(selected.id, destCenterId, Number(destGroupNo));
      setSuccess(`Transferred. New client ID: ${updated.displayId}.`);
      setSelected(null);
      setQ('');
      setDestCenterId('');
      setDestGroupNo('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transfer failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminLayout>
      <h1 className="page-title">Client Transfer</h1>
      <p className="page-sub">Move a member to a different center and group. Their client code, loans, and collection history are unaffected.</p>

      {error && <div className="alert-error">{error}</div>}
      {success && (
        <div className="alert-error" style={{ background: '#e3f5ee', color: '#157a5b', borderColor: '#bfe6d7' }}>
          {success}
        </div>
      )}

      <div className="form-card" style={{ maxWidth: 'none' }}>
        <div className="form-section-title">1. Find the member</div>
        <div className="field" style={{ maxWidth: 420 }}>
          <label>Search by name, client ID, or mobile</label>
          <input
            className="input"
            value={q}
            onChange={(e) => { setQ(e.target.value); setSelected(null); }}
            placeholder="e.g. Kaleeswari, PMF005392, 98765..."
          />
        </div>
        {results.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 10, boxShadow: 'none' }}>
            <table className="data">
              <tbody>
                {results.map((m) => (
                  <tr key={m.id} onClick={() => pick(m)}>
                    <td className="mono">{m.displayId}</td>
                    <td>{m.name}</td>
                    <td>{m.centerCode} — {m.centerName}</td>
                    <td>Group {m.groupNo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selected && (
          <>
            <div className="detail-grid" style={{ marginTop: 18 }}>
              <div className="detail-item"><div className="k">Current client ID</div><div className="v mono">{selected.displayId}</div></div>
              <div className="detail-item"><div className="k">Current center</div><div className="v">{selected.centerCode} — {selected.centerName}</div></div>
              <div className="detail-item"><div className="k">Current group</div><div className="v">Group {selected.groupNo}</div></div>
            </div>

            <div className="form-section-title" style={{ marginTop: 22 }}>2. Choose the destination</div>
            <div className="form-grid">
              <div className="field">
                <label>New center</label>
                <select className="input" value={destCenterId} onChange={(e) => { setDestCenterId(e.target.value); setDestGroupNo(''); }}>
                  <option value="">Select center</option>
                  {centers.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>New group</label>
                <select className="input" value={destGroupNo} onChange={(e) => setDestGroupNo(e.target.value)} disabled={!destCenterId}>
                  <option value="">Select group</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.groupNo} disabled={g.slotsLeft === 0}>
                      Group {g.groupNo} — {g.memberCount}/5 {g.slotsLeft === 0 ? '(full)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-actions">
              <button className="btn btn-primary" disabled={busy || !destCenterId || !destGroupNo} onClick={onTransfer}>
                {busy ? <span className="spinner" /> : 'Transfer member'}
              </button>
              <button className="btn btn-ghost" onClick={reset}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
