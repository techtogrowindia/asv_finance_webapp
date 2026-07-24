import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useConfirm } from '../components/ConfirmProvider';
import { BranchScopeSelect } from '../components/BranchScopeSelect';
import {
  SavingsRefundRow,
  approveSavingsRefund,
  getSavingsRefunds,
  initiateSavingsRefund,
  rejectSavingsRefund,
  settleSavingsRefund,
} from '../api/collections';

const inr = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

const STATUS_LABEL: Record<string, string> = {
  INITIATED: 'Awaiting approval',
  APPROVED: 'Approved — awaiting closure',
  SETTLED: 'Closed',
  REJECTED: 'Rejected',
};

/** Savings refund workflow — one screen for all roles (buttons gated by can()):
 *  FDO "Initiate refund" → BM/HO "Approve"/"Reject" → FDO "Refund" to settle.
 *  Savings no longer auto-refunds at loan closure; it's handled here. */
export function SavingsRefundsPage() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const [branchId, setBranchId] = useState('');
  const [centerName, setCenterName] = useState('');
  const [groupNo, setGroupNo] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<SavingsRefundRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function refresh() {
    setRows(null);
    getSavingsRefunds(branchId || undefined).then(setRows).catch((e) => setError(e.message));
  }
  useEffect(refresh, [branchId]);

  const groupOf = (displayId: string) => displayId.split('.')[2] ?? '';
  const centerNames = [...new Set((rows ?? []).map((r) => r.centerName))].sort();
  const groups = [...new Set((rows ?? []).map((r) => groupOf(r.displayId)).filter(Boolean))].sort();
  const visible = (rows ?? []).filter(
    (r) =>
      (!centerName || r.centerName === centerName) &&
      (!groupNo || groupOf(r.displayId) === groupNo) &&
      (!q.trim() || r.clientName.toLowerCase().includes(q.trim().toLowerCase()) || r.displayId.includes(q.trim())),
  );

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setError(''); setSuccess(''); setBusyId(key);
    try {
      await fn();
      setSuccess(ok);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  async function onInitiate(r: SavingsRefundRow) {
    const okc = await confirm({
      title: 'Initiate savings closure?',
      message: `Request to close and pay out ${inr(r.balance)} savings on ${r.savingsAccount} for ${r.clientName}? A Branch Manager / Head Office must approve it before it can be paid out.`,
      confirmLabel: 'Initiate closure',
    });
    if (!okc) return;
    run(r.loanId, () => initiateSavingsRefund(r.loanId), 'Closure request sent for approval.');
  }

  async function onApprove(r: SavingsRefundRow) {
    const okc = await confirm({
      title: 'Approve this closure?',
      message: `Approve closing and paying out ${inr(r.requestAmount ?? r.balance)} savings on ${r.savingsAccount} for ${r.clientName}? The field officer will then pay it out and close it.`,
      confirmLabel: 'Approve',
    });
    if (!okc) return;
    run(r.requestId!, () => approveSavingsRefund(r.requestId!), 'Closure approved — ready for the field officer to close.');
  }

  async function onReject(r: SavingsRefundRow) {
    const okc = await confirm({
      title: 'Reject this closure?',
      message: `Reject the savings closure request on ${r.savingsAccount} for ${r.clientName}? Nothing is paid out.`,
      confirmLabel: 'Reject', danger: true,
    });
    if (!okc) return;
    run(r.requestId!, () => rejectSavingsRefund(r.requestId!), 'Closure request rejected.');
  }

  async function onSettle(r: SavingsRefundRow) {
    const okc = await confirm({
      title: 'Close this savings account?',
      message: `Confirm you have paid ${inr(r.requestAmount ?? r.balance)} savings back to ${r.clientName} for ${r.savingsAccount}? This records the payout and closes the savings account (clears the balance).`,
      confirmLabel: 'Close Savings',
    });
    if (!okc) return;
    run(r.requestId!, () => settleSavingsRefund(r.requestId!), 'Savings paid out and closed.');
  }

  const canInitiate = can('savings.refundInitiate');
  const canApprove = can('savings.refundApprove');
  const canSettle = can('savings.refundSettle');

  return (
    <>
      <div className="toolbar">
        <div>
          <h1 className="page-title">Savings Closure</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            Savings is closed separately from the loan: a field officer initiates, a Branch Manager / Head Office approves, then the field officer pays out and closes the savings account.
          </p>
        </div>
        <div className="toolbar-actions" style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <BranchScopeSelect value={branchId} onChange={setBranchId} />
          <select className="select" value={centerName} onChange={(e) => { setCenterName(e.target.value); setGroupNo(''); }}>
            <option value="">All centers</option>
            {centerNames.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="select" value={groupNo} disabled={groups.length === 0} onChange={(e) => setGroupNo(e.target.value)}>
            <option value="">All groups</option>
            {groups.map((g) => <option key={g} value={g}>Group {g}</option>)}
          </select>
          <input className="input search" placeholder="Search member / client ID" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && (
        <div className="alert-error" style={{ background: '#e3f5ee', color: '#157a5b', borderColor: '#bfe6d7' }}>{success}</div>
      )}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Client ID</th><th>Member</th><th>Branch</th><th>Center</th>
              <th>Savings A/c</th><th>Balance</th><th>Loan</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const key = r.requestId ?? r.loanId;
              const busy = busyId === key;
              return (
                <tr key={r.loanId}>
                  <td className="mono">{r.displayId}</td>
                  <td>{r.clientName}</td>
                  <td>{r.branchCode} — {r.branchName}</td>
                  <td>{r.centerName}</td>
                  <td className="mono">{r.savingsAccount}</td>
                  <td>{inr(r.balance)}</td>
                  <td><span className={`badge ${r.loanType === 'OPEN' ? 'active' : 'closed'}`}>{r.loanType}</span></td>
                  <td>
                    {r.requestStatus ? (
                      <>
                        {STATUS_LABEL[r.requestStatus]}
                        {r.initiatedByName && <div className="hint" style={{ marginTop: 2 }}>by {r.initiatedByName}</div>}
                      </>
                    ) : '—'}
                  </td>
                  <td style={{ display: 'flex', gap: 6, whiteSpace: 'nowrap' }}>
                    {!r.requestStatus && canInitiate && r.balance > 0 && (
                      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onInitiate(r)}>
                        {busy ? <span className="spinner" /> : 'Initiate closure'}
                      </button>
                    )}
                    {r.requestStatus === 'INITIATED' && canApprove && (
                      <>
                        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onApprove(r)}>
                          {busy ? <span className="spinner" /> : 'Approve'}
                        </button>
                        <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => onReject(r)}>Reject</button>
                      </>
                    )}
                    {r.requestStatus === 'APPROVED' && canSettle && (
                      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onSettle(r)}>
                        {busy ? <span className="spinner" /> : 'Close Savings'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows && visible.length === 0 && (
              <tr><td colSpan={9} className="empty">No savings balances to close{rows.length ? ' match the filter' : ' right now'}.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
