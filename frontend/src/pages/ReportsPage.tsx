import { useEffect, useState } from 'react';
import {
  DemandCenterRow,
  DemandClientRow,
  getDemandCenterwise,
  getDemandClientwise,
} from '../api/collections';
import { ExistingLoan, getLedger, listExistingLoans, LoanLedger } from '../api/loans';
import { CenterLite, listCenters, listMembers, MemberListItem } from '../api/members';
import { LedgerView } from '../components/LedgerView';

type Tab = 'demand' | 'ledger';

const inr = (v: string | number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));

export function ReportsPage() {
  const [tab, setTab] = useState<Tab>('demand');

  return (
    <>
      <h1 className="page-title">Reports</h1>
      <p className="page-sub">Demand sheet and loan ledger — printable.</p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button className={`btn ${tab === 'demand' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('demand')}>
          Demand Sheet
        </button>
        <button className={`btn ${tab === 'ledger' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('ledger')}>
          Loan Ledger
        </button>
      </div>

      {tab === 'demand' && <DemandSheetTab />}
      {tab === 'ledger' && <LoanLedgerTab />}
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

function LoanLedgerTab() {
  const [centers, setCenters] = useState<CenterLite[]>([]);
  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [loans, setLoans] = useState<ExistingLoan[]>([]);
  const [centerId, setCenterId] = useState('');
  const [clientId, setClientId] = useState('');
  const [loanId, setLoanId] = useState('');
  const [ledger, setLedger] = useState<LoanLedger | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { listCenters().then(setCenters).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    if (!centerId) { setMembers([]); return; }
    listMembers({ centerId }).then(setMembers).catch((e) => setError(e.message));
  }, [centerId]);
  useEffect(() => {
    if (!clientId) { setLoans([]); return; }
    listExistingLoans(clientId).then(setLoans).catch((e) => setError(e.message));
  }, [clientId]);
  useEffect(() => {
    if (!loanId) { setLedger(null); return; }
    getLedger(loanId).then(setLedger).catch((e) => setError(e.message));
  }, [loanId]);

  return (
    <>
      {error && <div className="alert-error no-print">{error}</div>}
      <div className="form-card no-print" style={{ maxWidth: 'none', marginBottom: 18 }}>
        <div className="form-grid">
          <Field label="Center">
            <select className="input" value={centerId} onChange={(e) => { setCenterId(e.target.value); setClientId(''); setLoanId(''); }}>
              <option value="">Select center</option>
              {centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </Field>
          <Field label="Client">
            <select className="input" value={clientId} disabled={!centerId} onChange={(e) => { setClientId(e.target.value); setLoanId(''); }}>
              <option value="">Select member</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.displayId} — {m.name}</option>)}
            </select>
          </Field>
          <Field label="Loan Account">
            <select className="input" value={loanId} disabled={!clientId} onChange={(e) => setLoanId(e.target.value)}>
              <option value="">Select loan</option>
              {loans.map((l) => <option key={l.id} value={l.id}>{l.loanAccount} ({l.loanType})</option>)}
            </select>
          </Field>
        </div>
      </div>

      {ledger && <LedgerView ledger={ledger} />}
      {!ledger && <div className="panel no-print"><div className="panel-body"><div className="empty">Select a center, member, and loan account to view the ledger.</div></div></div>}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}
