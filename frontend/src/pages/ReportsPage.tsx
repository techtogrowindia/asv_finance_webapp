import { useEffect, useState } from 'react';
import {
  DemandCenterRow,
  DemandClientRow,
  getDemandCenterwise,
  getDemandClientwise,
} from '../api/collections';
import { CenterLoanRow, getLedger, listLoansByCenter, LoanApplicationSummary, listLoanApplications, LoanLedger } from '../api/loans';
import { CenterLite, listCenters } from '../api/members';
import { LedgerView } from '../components/LedgerView';

type Tab = 'demand' | 'ledger' | 'apps';

const inr = (v: string | number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));

export function ReportsPage() {
  const [tab, setTab] = useState<Tab>('demand');

  return (
    <>
      <h1 className="page-title no-print">Reports</h1>
      <p className="page-sub no-print">Demand sheet and loan ledger — printable.</p>

      <div className="no-print" style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button className={`btn ${tab === 'demand' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('demand')}>
          Demand Sheet
        </button>
        <button className={`btn ${tab === 'ledger' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('ledger')}>
          Loan Ledger
        </button>
        <button className={`btn ${tab === 'apps' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('apps')}>
          Loan Applications
        </button>
      </div>

      {tab === 'demand' && <DemandSheetTab />}
      {tab === 'ledger' && <LoanLedgerTab />}
      {tab === 'apps' && <LoanApplicationsTab />}
    </>
  );
}

function DemandSheetTab() {
  const [type, setType] = useState<'CENTERWISE' | 'CLIENTWISE'>('CENTERWISE');
  const [centerRows, setCenterRows] = useState<DemandCenterRow[] | null>(null);
  const [clientRows, setClientRows] = useState<DemandClientRow[] | null>(null);
  const [error, setError] = useState('');

  function load() {
    setError('');
    if (type === 'CENTERWISE') {
      getDemandCenterwise().then(setCenterRows).catch((e) => setError(e.message));
    } else {
      getDemandClientwise().then(setClientRows).catch((e) => setError(e.message));
    }
  }
  useEffect(load, [type]);

  return (
    <div className="panel">
      <div className="panel-head no-print" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span>Demand Sheet</span>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as 'CENTERWISE' | 'CLIENTWISE')}>
            <option value="CENTERWISE">Centerwise</option>
            <option value="CLIENTWISE">Clientwise</option>
          </select>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>Print</button>
      </div>
      <div className="panel-body">
        {error && <div className="alert-error">{error}</div>}
        <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
          {type === 'CENTERWISE' ? (
            <table className="data">
              <thead><tr><th>Code</th><th>Center</th><th>Members with Dues</th><th>Total Demand</th></tr></thead>
              <tbody>
                {centerRows?.map((r) => (
                  <tr key={r.centerId}>
                    <td className="mono">{r.centerCode}</td>
                    <td>{r.centerName}</td>
                    <td>{r.clientCount}</td>
                    <td>{inr(r.totalDemand)}</td>
                  </tr>
                ))}
                {centerRows && centerRows.length === 0 && <tr><td colSpan={4} className="empty">No demand outstanding.</td></tr>}
              </tbody>
            </table>
          ) : (
            <table className="data">
              <thead><tr><th>Center</th><th>Client ID</th><th>Name</th><th>Loan A/c</th><th>Dues</th><th>Amount</th></tr></thead>
              <tbody>
                {clientRows?.map((r) => (
                  <tr key={r.loanId}>
                    <td>{r.centerCode} — {r.centerName}</td>
                    <td className="mono">{r.displayId}</td>
                    <td>{r.clientName}</td>
                    <td className="mono">{r.loanAccount}</td>
                    <td>{r.dueCount}</td>
                    <td>{inr(r.totalDue)}</td>
                  </tr>
                ))}
                {clientRows && clientRows.length === 0 && <tr><td colSpan={6} className="empty">No demand outstanding.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

function LoanApplicationsTab() {
  const [status, setStatus] = useState<'' | 'PENDING' | 'APPROVED' | 'REJECTED'>('');
  const [rows, setRows] = useState<LoanApplicationSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    listLoanApplications(status || undefined).then(setRows).catch((e) => setError(e.message));
  }, [status]);

  return (
    <div className="panel">
      <div className="panel-head no-print" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span>Loan Applications</span>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>Print</button>
      </div>
      <div className="panel-body">
        {error && <div className="alert-error">{error}</div>}
        <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
          <table className="data">
            <thead>
              <tr><th>Client ID</th><th>Member</th><th>Center</th><th>Loan A/c</th><th>Product</th><th>Amount</th><th>Applied</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows?.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.displayId}</td>
                  <td>{a.clientName}</td>
                  <td>{a.centerName}</td>
                  <td className="mono">{a.loanAccount ?? '—'}</td>
                  <td>{a.productName}</td>
                  <td>{inr(a.loanAmount)}</td>
                  <td>{date(a.createdAt)}</td>
                  <td><span className={`badge ${a.status === 'APPROVED' ? 'active' : a.status === 'REJECTED' ? 'closed' : 'pending'}`}>{a.status}</span></td>
                </tr>
              ))}
              {rows && rows.length === 0 && <tr><td colSpan={8} className="empty">No loan applications.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LoanLedgerTab() {
  const [centers, setCenters] = useState<CenterLite[]>([]);
  const [centerId, setCenterId] = useState('');
  const [type, setType] = useState<'OPEN' | 'CLOSED' | 'ALL'>('OPEN');
  const [loans, setLoans] = useState<CenterLoanRow[] | null>(null);
  const [ledger, setLedger] = useState<LoanLedger | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { listCenters().then(setCenters).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    setLedger(null);
    if (!centerId) { setLoans(null); return; }
    setError('');
    listLoansByCenter(centerId, type).then(setLoans).catch((e) => setError(e.message));
  }, [centerId, type]);

  function viewLedger(loanId: string) {
    setError('');
    setLoadingLedger(true);
    getLedger(loanId)
      .then(setLedger)
      .catch((e) => setError(e.message))
      .finally(() => setLoadingLedger(false));
  }

  // Viewing one loan's full ledger — show it with a way back to the list.
  if (ledger) {
    return (
      <>
        <div className="no-print" style={{ marginBottom: 14 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setLedger(null)}>← Back to loan list</button>
        </div>
        <LedgerView ledger={ledger} />
      </>
    );
  }

  return (
    <>
      {error && <div className="alert-error">{error}</div>}
      <div className="form-card" style={{ maxWidth: 'none', marginBottom: 18 }}>
        <div className="form-grid">
          <div className="field">
            <label>Center</label>
            <select className="input" value={centerId} onChange={(e) => setCenterId(e.target.value)}>
              <option value="">Select center</option>
              {centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Loan Type</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as 'OPEN' | 'CLOSED' | 'ALL')}>
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
              <option value="ALL">All</option>
            </select>
          </div>
        </div>
      </div>

      {!centerId ? (
        <div className="panel"><div className="panel-body"><div className="empty">Select a center to list its loans.</div></div></div>
      ) : (
        <div className="panel">
          <div className="panel-head">Client Loan Schedule</div>
          <div className="panel-body">
            <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
              <table className="data">
                <thead>
                  <tr><th>Client ID</th><th>Client Name</th><th>Loan A/c</th><th>Disb. Date</th><th>Amount</th><th></th></tr>
                </thead>
                <tbody>
                  {loans?.map((l) => (
                    <tr key={l.id}>
                      <td className="mono">{l.displayId}</td>
                      <td>{l.clientName}</td>
                      <td className="mono">{l.loanAccount}</td>
                      <td>{date(l.disbursalDate)}</td>
                      <td>{inr(l.loanAmount)}</td>
                      <td>
                        <button className="btn btn-primary btn-sm" disabled={loadingLedger} onClick={() => viewLedger(l.id)}>
                          View ledger
                        </button>
                      </td>
                    </tr>
                  ))}
                  {loans && loans.length === 0 && <tr><td colSpan={6} className="empty">No {type === 'ALL' ? '' : type.toLowerCase() + ' '}loans in this center.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
