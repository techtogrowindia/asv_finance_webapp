import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getSavingsPassbook, SavingsPassbook } from '../api/members';
import { SavingsPassbookCard } from '../components/reports/SavingsPassbookCard';

export function SavingsPassbookPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const [passbook, setPassbook] = useState<SavingsPassbook | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!clientId) return;
    getSavingsPassbook(clientId).then(setPassbook).catch((e) => setError(e.message));
  }, [clientId]);

  return (
    <>
      <button className="back-link no-print" onClick={() => navigate(-1)}>← Back</button>
      {error && <div className="alert-error">{error}</div>}
      {passbook ? <SavingsPassbookCard passbook={passbook} /> : !error && <div className="empty">Loading…</div>}
    </>
  );
}
