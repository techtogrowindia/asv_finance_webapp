import { useEffect, useState } from 'react';
import {
  DemandClientRow,
  getDemandClientwise,
} from '../api/collections';
import { CenterLoanRow, getLoanStatement, listLoansByCenter, LoanApplicationSummary, listLoanApplications, LoanStatement } from '../api/loans';
import { CenterLite, listCenters } from '../api/members';
import { DemandRegisterRow, SavingsLedgerRow, getDemandRegister, getSavingsLedger } from '../api/reportsAdmin';
import { presetRange } from '../lib/dateFilter';
import { LedgerView } from '../components/LedgerView';

type Tab = 'demand' | 'ledger' | 'apps' | 'savings';

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
        <button className={`btn ${tab === 'savings' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('savings')}>
          Savings Ledger
        </button>
      </div>

      {tab === 'demand' && <DemandSheetTab />}
      {tab === 'ledger' && <LoanLedgerTab />}
      {tab === 'apps' && <LoanApplicationsTab />}
      {tab === 'savings' && <SavingsLedgerTab />}
    </>
  );
}

function DemandSheetTab() {
  const [type, setType] = useState<'CENTERWISE' | 'CLIENTWISE'>('CENTERWISE');
  const [asOf, setAsOf] = useState(presetRange('today').from);
  const [centerRows, setCenterRows] = useState<DemandRegisterRow[] | null>(null);
  const [clientRows, setClientRows] = useState<DemandClientRow[] | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState('');

  function load() {
    setError('');
    if (type === 'CENTERWISE') {
      getDemandRegister(asOf).then(setCenterRows).catch((e) => setError(e.message));
    } else {
      getDemandClientwise().then(setClientRows).catch((e) => setError(e.message));
    }
  }
  useEffect(load, [type, asOf]);

  const totals = (centerRows ?? []).reduce(
    (t, r) => ({
      clients: t.clients + r.clientCount, pending: t.pending + r.pendingApplications,
      os: t.os + r.loanOS, arrear: t.arrear + r.arrear, demand: t.demand + r.demand, coll: t.coll + r.collected,
    }),
    { clients: 0, pending: 0, os: 0, arrear: 0, demand: 0, coll: 0 },
  );

  async function downloadPdf() {
    if (!centerRows) return;
    setPdfBusy(true);
    try {
      const m = await import('../lib/pdf/reportPdf');
      await m.downloadDemandRegisterPdf(centerRows, asOf);
    } finally { setPdfBusy(false); }
  }

  return (
    <div className="panel">
      <div className="panel-head no-print" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span>Demand Sheet</span>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as 'CENTERWISE' | 'CLIENTWISE')}>
            <option value="CENTERWISE">Centerwise (detailed)</option>
            <option value="CLIENTWISE">Clientwise</option>
          </select>
          {type === 'CENTERWISE' && (
            <input type="date" className="input" style={{ width: 160 }} value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          )}
        </div>
        {type === 'CENTERWISE' && (
          <button className="btn btn-primary btn-sm" disabled={pdfBusy || !centerRows?.length} onClick={downloadPdf}>
            {pdfBusy ? <span className="spinner" /> : 'Download PDF'}
          </button>
        )}
      </div>
      <div className="panel-body">
        {error && <div className="alert-error">{error}</div>}
        <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
          {type === 'CENTERWISE' ? (
            <table className="data">
              <thead>
                <tr>
                  <th>SI No</th><th>Center Name</th><th>Phone</th><th>No. of Clients</th><th>Pending Apps</th>
                  <th>Avg. Due No</th><th>Meeting Time</th><th>Loan OS</th><th>Arrear</th><th>Demand</th><th>Collected</th><th>CL Signature</th>
                </tr>
              </thead>
              <tbody>
                {centerRows?.map((r, i) => (
                  <tr key={r.centerId}>
                    <td>{i + 1}</td>
                    <td>{r.centerCode}-{r.centerName}</td>
                    <td>{r.phone ?? '—'}</td>
                    <td>{r.clientCount}</td>
                    <td>{r.pendingApplications}</td>
                    <td>{r.avgDueNo}</td>
                    <td>{r.meetingTime ?? '—'}</td>
                    <td>{inr(r.loanOS)}</td>
                    <td>{inr(r.arrear)}</td>
                    <td>{inr(r.demand)}</td>
                    <td>{inr(r.collected)}</td>
                    <td></td>
                  </tr>
                ))}
                {centerRows && centerRows.length === 0 && <tr><td colSpan={12} className="empty">No centers in scope.</td></tr>}
                {centerRows && centerRows.length > 0 && (
                  <tr style={{ fontWeight: 700 }}>
                    <td colSpan={3}>Grand Total</td><td>{totals.clients}</td><td>{totals.pending}</td><td></td><td></td>
                    <td>{inr(totals.os)}</td><td>{inr(totals.arrear)}</td><td>{inr(totals.demand)}</td><td>{inr(totals.coll)}</td><td></td>
                  </tr>
                )}
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
              <tr><th>App No</th><th>Client ID</th><th>Member</th><th>Center</th><th>Loan A/c</th><th>Product</th><th>Amount</th><th>Applied</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows?.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.appNo ?? '—'}</td>
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
              {rows && rows.length === 0 && <tr><td colSpan={9} className="empty">No loan applications.</td></tr>}
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
  const [ledger, setLedger] = useState<LoanStatement | null>(null);
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
    getLoanStatement(loanId)
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

const savDate = (v: string) => new Date(v).toLocaleDateString('en-IN');

function SavingsLedgerTab() {
  const [from, setFrom] = useState(presetRange('month').from);
  const [to, setTo] = useState(presetRange('month').to);
  const [rows, setRows] = useState<SavingsLedgerRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getSavingsLedger(from, to)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }
  useEffect(() => { show(); /* eslint-disable-next-line */ }, []);
  const totals = (rows ?? []).reduce((t, r) => ({ dep: t.dep + r.deposit, ref: t.ref + r.refund }), { dep: 0, ref: 0 });

  return (
    <div className="panel">
      <div className="panel-head no-print" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Savings Ledger — deposits &amp; refunds</span>
        <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>Print</button>
      </div>
      <div className="panel-body">
        <div className="form-card no-print" style={{ maxWidth: 'none', marginBottom: 16, padding: 16 }}>
          <div className="form-grid">
            <div className="field"><label>From date</label><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="field"><label>Till date</label><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
          <div className="form-actions" style={{ marginTop: 4 }}>
            <button className="btn btn-primary" disabled={busy} onClick={show}>{busy ? <span className="spinner" /> : 'Show'}</button>
          </div>
        </div>
        {error && <div className="alert-error">{error}</div>}
        <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
          <table className="data">
            <thead>
              <tr><th>Date</th><th>Client ID</th><th>Member</th><th>Loan A/c</th><th>Type</th><th>Deposit</th><th>Refund</th></tr>
            </thead>
            <tbody>
              {rows?.map((r, i) => (
                <tr key={i}>
                  <td>{savDate(r.date)}</td>
                  <td className="mono">{r.displayId}</td>
                  <td>{r.memberName}</td>
                  <td className="mono">{r.loanAccount}</td>
                  <td><span className={`badge ${r.kind === 'DEPOSIT' ? 'active' : 'pending'}`}>{r.kind}</span></td>
                  <td>{r.deposit ? inr(r.deposit) : '—'}</td>
                  <td>{r.refund ? inr(r.refund) : '—'}</td>
                </tr>
              ))}
              {rows && rows.length === 0 && <tr><td colSpan={7} className="empty">No savings activity in this window.</td></tr>}
              {rows && rows.length > 0 && (
                <tr style={{ fontWeight: 700 }}><td colSpan={5}>Total</td><td>{inr(totals.dep)}</td><td>{inr(totals.ref)}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
