import { useEffect, useState } from 'react';
import { getLoanStatement, LoanStatement } from '../../api/loans';
import { LoanStatementCard } from './LoanStatementCard';

/** Shown right on the page (not a popup) the moment a loan closes — the
 *  combined Loan + Savings statement (which already shows the savings
 *  refund as a REFUND row), with Print / Share-to-WhatsApp / Download PDF.
 *  Dismissible so the FDO can keep working the rest of the center. */
export function InlineClosureReport({ loanId, onDismiss }: { loanId: string; onDismiss: () => void }) {
  const [st, setSt] = useState<LoanStatement | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setSt(null);
    setError('');
    getLoanStatement(loanId).then(setSt).catch((e) => setError(e.message));
  }, [loanId]);

  return (
    <div className="closure-report" style={{ marginBottom: 20 }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontWeight: 600, color: 'var(--brand-700)' }}>✓ Loan closed — closure report</span>
        <button className="btn btn-ghost btn-sm" onClick={onDismiss}>✕ Dismiss</button>
      </div>
      {error && <div className="alert-error">{error}</div>}
      {st ? <LoanStatementCard st={st} /> : !error && <div className="panel"><div className="panel-body"><div className="empty">Loading…</div></div></div>}
    </div>
  );
}
