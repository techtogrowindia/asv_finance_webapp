import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getLoanStatement, LoanStatement } from '../api/loans';
import { LoanStatementCard } from '../components/reports/LoanStatementCard';

/** Combined per-loan ledger (loan schedule + savings) for a single loan. */
export function LoanStatementPage() {
  const { loanId } = useParams();
  const navigate = useNavigate();
  const [st, setSt] = useState<LoanStatement | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loanId) return;
    getLoanStatement(loanId).then(setSt).catch((e) => setError(e.message));
  }, [loanId]);

  return (
    <>
      <button className="back-link no-print" onClick={() => navigate(-1)}>← Back</button>
      {error && <div className="alert-error">{error}</div>}
      {st ? <LoanStatementCard st={st} /> : !error && <div className="empty">Loading…</div>}
    </>
  );
}
