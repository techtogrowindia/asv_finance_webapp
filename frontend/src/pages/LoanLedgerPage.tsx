import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getLoanStatement, LoanStatement } from '../api/loans';
import { LedgerView } from '../components/LedgerView';

export function LoanLedgerPage() {
  const { loanId } = useParams();
  const navigate = useNavigate();
  const [ledger, setLedger] = useState<LoanStatement | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loanId) return;
    getLoanStatement(loanId).then(setLedger).catch((e) => setError(e.message));
  }, [loanId]);

  return (
    <>
      <button className="back-link no-print" onClick={() => navigate(-1)}>
        ← Back
      </button>
      {error && <div className="alert-error">{error}</div>}
      {ledger ? <LedgerView ledger={ledger} /> : !error && <div className="empty">Loading…</div>}
    </>
  );
}
