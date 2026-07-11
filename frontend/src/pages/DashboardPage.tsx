import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

interface DashboardData {
  cards: {
    totalCenters: number;
    totalClients: number;
    loanDisbursement: number;
    portfolioOutstanding: number;
  };
  report: unknown[];
}

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<DashboardData>('/dashboard')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <h1 className="page-title">Welcome, {user?.name?.split(' ')[0]}</h1>
      <p className="page-sub">Here's a snapshot of your centers and members.</p>

      {error && <div className="alert-error">{error}</div>}

      <div className="cards">
        <Stat icon="⌂" tone="teal" label="Total Centers" value={data ? String(data.cards.totalCenters) : '—'} />
        <Stat icon="☺" tone="teal" label="Total Members" value={data ? String(data.cards.totalClients) : '—'} />
        <Stat icon="₹" tone="amber" label="Loan Disbursement" value={data ? inr(data.cards.loanDisbursement) : '—'} />
        <Stat icon="▲" tone="amber" label="Portfolio Outstanding" value={data ? inr(data.cards.portfolioOutstanding) : '—'} />
      </div>

      <div className="panel">
        <div className="panel-head">Center-wise Collection</div>
        <div className="panel-body">
          <div className="empty">
            Collection figures (opening arrear → demand → collection → closing arrear)
            appear here once the Loan &amp; Collection modules are live.
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ icon, tone, label, value }: { icon: string; tone: 'teal' | 'amber'; label: string; value: string }) {
  return (
    <div className="card">
      <div className={`card-ico ${tone}`}>{icon}</div>
      <div>
        <div className="card-label">{label}</div>
        <div className="card-value">{value}</div>
      </div>
    </div>
  );
}
