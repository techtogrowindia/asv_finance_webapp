import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getLoanStatement, LoanStatement } from '../api/loans';
import { LoanStatementCard } from '../components/reports/LoanStatementCard';
import { RequestCorrectionModal } from '../components/RequestCorrectionModal';

/** Combined per-loan ledger (loan schedule + savings) for a single loan. */
export function LoanStatementPage() {
  const { loanId } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [st, setSt] = useState<LoanStatement | null>(null);
  const [error, setError] = useState('');
  const [showCorrection, setShowCorrection] = useState(false);

  useEffect(() => {
    if (!loanId) return;
    getLoanStatement(loanId).then(setSt).catch((e) => setError(e.message));
  }, [loanId]);

  return (
    <>
      <div
        className="no-print"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}
      >
        <button className="back-link" onClick={() => navigate(-1)}>← Back</button>
        {can('collection.correct') && (
          <button
            className="btn btn-primary btn-sm"
            style={{ whiteSpace: 'nowrap' }}
            onClick={() => setShowCorrection(true)}
          >
            Request correction
          </button>
        )}
      </div>
      {error && <div className="alert-error">{error}</div>}
      {st ? <LoanStatementCard st={st} /> : !error && <div className="empty">Loading…</div>}
      {showCorrection && loanId && (
        <RequestCorrectionModal loanId={loanId} onClose={() => setShowCorrection(false)} />
      )}
    </>
  );
}
