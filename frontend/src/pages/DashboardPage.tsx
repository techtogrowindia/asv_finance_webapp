import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { RecentClosuresWidget } from '../components/RecentClosuresWidget';

interface CenterReportRow {
  centerId: string;
  centerCode: string;
  centerName: string;
  clientsWithDue: number;
  demand: number;
  collected: number;
  outstanding: number;
  status: string;
}

interface DashboardData {
  cards: {
    totalCenters: number;
    totalClients: number;
    loanDisbursement: number;
    portfolioOutstanding: number;
  };
  report: CenterReportRow[];
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
        <div className="panel-head">Center-wise Collection (today)</div>
        <div className="panel-body">
          {data && data.report.length > 0 ? (
            <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Center</th>
                    <th># Members due</th>
                    <th>Demand</th>
                    <th>Collected</th>
                    <th>Outstanding</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.report.map((r) => (
                    <tr key={r.centerId}>
                      <td>{r.centerCode} — {r.centerName}</td>
                      <td>{r.clientsWithDue}</td>
                      <td>{inr(r.demand)}</td>
                      <td>{inr(r.collected)}</td>
                      <td>{inr(r.outstanding)}</td>
                      <td><span className={`badge ${r.status === 'Collected' ? 'active' : r.status === 'No dues today' ? 'inactive' : 'pending'}`}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              {data ? 'No centers in scope yet.' : 'Loading…'}
            </div>
          )}
        </div>
      </div>

      <RecentClosuresWidget />
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
