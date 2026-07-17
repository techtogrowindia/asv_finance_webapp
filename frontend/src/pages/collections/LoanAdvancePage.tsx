import { useEffect, useState } from 'react';
import { useConfirm } from '../../components/ConfirmProvider';
import { InlineClosureReport } from '../../components/reports/InlineClosureReport';
import { AdvanceLoan, applyAdvance, getAdvanceLoans } from '../../api/collections';

const inr = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

export function LoanAdvancePage() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<AdvanceLoan[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [closedLoanId, setClosedLoanId] = useState<string | null>(null);

  function refresh() {
    getAdvanceLoans().then(setRows).catch((e) => setError(e.message));
  }
  useEffect(refresh, []);

  async function onApply(row: AdvanceLoan) {
    const ok = await confirm({
      title: 'Apply advance?',
      message: `Apply ${row.clientName}'s advance of ${inr(row.advanceBalance)} to their upcoming installments on ${row.loanAccount}?`,
      confirmLabel: 'Apply advance',
    });
    if (!ok) return;
    setError(''); setSuccess(''); setBusyId(row.loanId);
    try {
      const res = await applyAdvance(row.loanId);
      setSuccess(
        `Applied ${inr(res.applied)}.`
        + (res.loanClosed ? ' Loan fully closed!' : res.advanceRemaining > 0 ? ` ${inr(res.advanceRemaining)} advance still remaining.` : '')
        + (res.savingsRefunded > 0 ? ` ${inr(res.savingsRefunded)} savings refunded to the client.` : ''),
      );
      if (res.loanClosed) setClosedLoanId(row.loanId);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <h1 className="page-title">Loan Advance Adjustment</h1>
      <p className="page-sub">Members who paid more than their demand carry an advance. Apply it to upcoming installments.</p>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-error" style={{ background: '#e3f5ee', color: '#157a5b', borderColor: '#bfe6d7' }}>{success}</div>}
      {closedLoanId && <InlineClosureReport loanId={closedLoanId} onDismiss={() => setClosedLoanId(null)} />}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Client ID</th><th>Name</th><th>Center</th><th>Loan A/c</th><th>Advance Balance</th><th></th></tr>
          </thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.loanId}>
                <td className="mono">{r.displayId}</td>
                <td>{r.clientName}</td>
                <td>{r.centerName}</td>
                <td className="mono">{r.loanAccount}</td>
                <td>{inr(r.advanceBalance)}</td>
                <td>
                  <button className="btn btn-primary btn-sm" disabled={busyId === r.loanId} onClick={() => onApply(r)}>
                    {busyId === r.loanId ? <span className="spinner" /> : 'Apply advance'}
                  </button>
                </td>
              </tr>
            ))}
            {rows && rows.length === 0 && <tr><td colSpan={6} className="empty">No members are carrying an advance right now.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
