import { useEffect, useState } from 'react';
import { getLoanStatement, LoanStatement } from '../../api/loans';
import { LoanStatementCard } from './LoanStatementCard';

/** Pops up right after a loan closes (foreclosure or full repayment) — the
 *  combined Loan + Savings statement (which already shows the savings refund
 *  as a REFUND row) with Print / Share-to-WhatsApp / Download PDF actions. */
export function ClosureReportModal({ loanId, onClose }: { loanId: string; onClose: () => void }) {
  const [st, setSt] = useState<LoanStatement | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getLoanStatement(loanId).then(setSt).catch((e) => setError(e.message));
  }, [loanId]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card-wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>Loan closed — closure report</span>
          <button className="btn btn-ghost btn-sm" style={{ background: '#fff' }} onClick={onClose}>✕ Close</button>
        </div>
        {error && <div className="alert-error">{error}</div>}
        {st ? <LoanStatementCard st={st} /> : !error && <div className="panel"><div className="panel-body"><div className="empty">Loading…</div></div></div>}
      </div>
    </div>
  );
}
