import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { BranchScopeSelect } from '../../components/BranchScopeSelect';
import { useConfirm } from '../../components/ConfirmProvider';
import {
  CollectionCorrection,
  approveCorrection,
  listCorrections,
  rejectCorrection,
} from '../../api/collections';

const inr = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-IN');

const STATUS_TABS: Array<'PENDING' | 'APPROVED' | 'REJECTED'> = ['PENDING', 'APPROVED', 'REJECTED'];

export function CollectionCorrectionsPage() {
  const confirm = useConfirm();
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [branchId, setBranchId] = useState('');
  const [rows, setRows] = useState<CollectionCorrection[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function refresh() {
    setRows(null);
    listCorrections(status, branchId || undefined).then(setRows).catch((e) => setError(e.message));
  }
  useEffect(refresh, [status, branchId]);

  async function onApprove(r: CollectionCorrection) {
    const needsDoubleCheck = r.wouldReopen || r.wouldClose || r.loanType === 'CLOSED';
    const ok = await confirm({
      title: needsDoubleCheck ? 'Double-check before approving' : 'Approve this correction?',
      message: needsDoubleCheck
        ? (r.wouldReopen
            ? `This was the loan's closing payment. Approving will REOPEN loan ${r.loanAccount} and reverse its automatic savings refund, then re-apply the corrected amount of ${inr(r.correctedAmount)}. Continue?`
            : r.wouldClose
              ? `Approving will fully CLOSE loan ${r.loanAccount} with a corrected amount of ${inr(r.correctedAmount)} (was ${inr(r.originalAmount)}). Continue?`
              : `Loan ${r.loanAccount} is currently closed — approving touches its final settlement. Continue?`)
        : `Correct ${r.clientName}'s ${fmtDate(r.collectedOn)} collection on ${r.loanAccount} from ${inr(r.originalAmount)} to ${inr(r.correctedAmount)}?`,
      confirmLabel: 'Approve',
      danger: needsDoubleCheck,
    });
    if (!ok) return;
    setError(''); setSuccess(''); setBusyId(r.id);
    try {
      const res = await approveCorrection(r.id, { confirmClosure: needsDoubleCheck });
      setSuccess(
        `Corrected ${r.loanAccount} — ${inr(res.applied)} applied` +
          (res.advanceBanked > 0 ? `, ${inr(res.advanceBanked)} banked as advance` : '') +
          (res.reopened ? '. Loan re-opened.' : res.loanClosed ? '. Loan closed.' : '') + '.',
      );
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed');
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(r: CollectionCorrection) {
    const ok = await confirm({
      title: 'Reject this correction?',
      message: `Reject ${r.clientName}'s correction request for ${r.loanAccount}? The original ${inr(r.originalAmount)} collection stands.`,
      confirmLabel: 'Reject',
      danger: true,
    });
    if (!ok) return;
    setError(''); setSuccess(''); setBusyId(r.id);
    try {
      await rejectCorrection(r.id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reject failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminLayout>
      <div className="toolbar">
        <div>
          <h1 className="page-title">Collection Corrections</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            Field officers request corrections to a past collection here; approving reverses the wrong entry and
            re-applies the corrected amount — both dated today, so no closed EOD day is rewritten.
          </p>
        </div>
        <div className="toolbar-actions" style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <BranchScopeSelect value={branchId} onChange={setBranchId} />
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            {STATUS_TABS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && (
        <div className="alert-error" style={{ background: '#e3f5ee', color: '#157a5b', borderColor: '#bfe6d7' }}>
          {success}
        </div>
      )}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Client ID</th><th>Name</th><th>Branch</th><th>Center</th><th>Loan A/c</th>
              <th>Date</th><th>Original</th><th>Corrected</th><th>Reason</th><th>Requested by</th>
              {status !== 'PENDING' && <th>Reviewed by</th>}
              {status === 'PENDING' && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.displayId}</td>
                <td>{r.clientName}</td>
                <td>{r.branchCode} — {r.branchName}</td>
                <td>{r.centerName}</td>
                <td className="mono">{r.loanAccount}</td>
                <td>{fmtDate(r.collectedOn)}</td>
                <td>{inr(r.originalAmount)}</td>
                <td style={{ fontWeight: 600 }}>
                  {inr(r.correctedAmount)}
                  {(r.wouldReopen || r.wouldClose) && (
                    <div className="hint" style={{ marginTop: 2 }}>{r.wouldReopen ? 'Re-opens loan' : 'Closes loan'}</div>
                  )}
                </td>
                <td>{r.reason}</td>
                <td>{r.requestedByName ?? '—'}</td>
                {status !== 'PENDING' && <td>{r.reviewedByName ?? '—'}</td>}
                {status === 'PENDING' && (
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-primary btn-sm" disabled={busyId === r.id} onClick={() => onApprove(r)}>
                      {busyId === r.id ? <span className="spinner" /> : 'Approve'}
                    </button>
                    <button className="btn btn-danger btn-sm" disabled={busyId === r.id} onClick={() => onReject(r)}>
                      Reject
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr><td colSpan={11} className="empty">No {status.toLowerCase()} correction requests.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
