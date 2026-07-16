import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getLoanSavingsLedger, LoanSavingsLedger } from '../api/loans';
import { LoanSavingsCard } from '../components/reports/LoanSavingsCard';

/** One loan's savings account ledger (savings account = member no _ loan a/c). */
export function SavingsLoanLedgerPage() {
  const { loanId } = useParams();
  const navigate = useNavigate();
  const [ledger, setLedger] = useState<LoanSavingsLedger | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loanId) return;
    getLoanSavingsLedger(loanId).then(setLedger).catch((e) => setError(e.message));
  }, [loanId]);

  return (
    <>
      <button className="back-link no-print" onClick={() => navigate(-1)}>← Back</button>
      {error && <div className="alert-error">{error}</div>}
      {ledger ? <LoanSavingsCard ledger={ledger} /> : !error && <div className="empty">Loading…</div>}
    </>
  );
}
