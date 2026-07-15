import { useEffect, useState } from 'react';
import { CenterLite, listCenters, listMembers, MemberListItem, getSavingsPassbook, SavingsPassbook } from '../../api/members';
import { SavingsPassbookCard } from './SavingsPassbookCard';

const inr = (v: number | string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));

/** Savings Ledger: pick a center, pick a member, view their savings passbook
 *  (deposits & refunds with a running balance) — mirrors the Loan Ledger flow. */
export function SavingsLedgerReport() {
  const [centers, setCenters] = useState<CenterLite[]>([]);
  const [centerId, setCenterId] = useState('');
  const [members, setMembers] = useState<MemberListItem[] | null>(null);
  const [passbook, setPassbook] = useState<SavingsPassbook | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { listCenters().then(setCenters).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    setPassbook(null);
    if (!centerId) { setMembers(null); return; }
    setError('');
    listMembers({ centerId }).then(setMembers).catch((e) => setError(e.message));
  }, [centerId]);

  function view(clientId: string) {
    setError(''); setBusy(true);
    getSavingsPassbook(clientId).then(setPassbook).catch((e) => setError(e.message)).finally(() => setBusy(false));
  }

  if (passbook) {
    return (
      <>
        <div className="no-print" style={{ marginBottom: 14 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setPassbook(null)}>← Back to member list</button>
        </div>
        <SavingsPassbookCard passbook={passbook} />
      </>
    );
  }

  return (
    <>
      {error && <div className="alert-error">{error}</div>}
      <div className="form-card" style={{ maxWidth: 'none', marginBottom: 18 }}>
        <div className="form-grid">
          <div className="field">
            <label>Center</label>
            <select className="input" value={centerId} onChange={(e) => setCenterId(e.target.value)}>
              <option value="">Select center</option>
              {centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {!centerId ? (
        <div className="panel"><div className="panel-body"><div className="empty">Select a center to list its members' savings.</div></div></div>
      ) : (
        <div className="panel">
          <div className="panel-head">Members — Savings</div>
          <div className="panel-body">
            <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
              <table className="data">
                <thead><tr><th>Client ID</th><th>Member</th><th>Savings A/c</th><th>Balance</th><th></th></tr></thead>
                <tbody>
                  {members?.map((m) => (
                    <tr key={m.id}>
                      <td className="mono">{m.displayId}</td>
                      <td>{m.name}</td>
                      <td className="mono">{m.savingsAccount ?? '—'}</td>
                      <td>{inr(m.savingsBalance)}</td>
                      <td><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => view(m.id)}>View passbook</button></td>
                    </tr>
                  ))}
                  {members && members.length === 0 && <tr><td colSpan={5} className="empty">No members in this center.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
