import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { downloadCsv } from '../../lib/csv';
import {
  AdvanceCollectionRow,
  BranchWiseRow,
  CenterWiseRow,
  ClientWiseRow,
  CollectionFollowupRow,
  EmployeePerformanceRow,
  GroupWiseRow,
  ZeroCollectionRow,
  getAdvanceCollection,
  getBranchWise,
  getCenterWise,
  getClientWise,
  getCollectionFollowup,
  getEmployeePerformance,
  getGroupWise,
  getZeroCollection,
} from '../../api/reportsAdmin';

type Tab = 'zero' | 'followup' | 'advance' | 'branch' | 'center' | 'group' | 'client' | 'employee';
const TABS: { id: Tab; label: string }[] = [
  { id: 'zero', label: 'Zero Collection' },
  { id: 'followup', label: 'Collection Followup' },
  { id: 'advance', label: 'Advance Collection' },
  { id: 'branch', label: 'Branch Wise' },
  { id: 'center', label: 'Center Wise' },
  { id: 'group', label: 'Group Wise' },
  { id: 'client', label: 'Client Wise' },
  { id: 'employee', label: 'Employee Performance' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoIso(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
const inr = (v: string | number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));
const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

export function ReportsPage() {
  const [tab, setTab] = useState<Tab>('zero');

  return (
    <AdminLayout>
      <h1 className="page-title">Daily Monitoring Reports</h1>
      <p className="page-sub">Follow up on missed payments, review arrears, and plan ahead for upcoming dues.</p>

      <div className="toolbar" style={{ marginBottom: 6 }}>
        <div className="toolbar-actions">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`btn ${tab === t.id ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'zero' && <ZeroCollectionTab />}
      {tab === 'followup' && <CollectionFollowupTab />}
      {tab === 'advance' && <AdvanceCollectionTab />}
      {tab === 'branch' && <BranchWiseTab />}
      {tab === 'center' && <CenterWiseTab />}
      {tab === 'group' && <GroupWiseTab />}
      {tab === 'client' && <ClientWiseTab />}
      {tab === 'employee' && <EmployeePerformanceTab />}
    </AdminLayout>
  );
}

// ---------------------------------------------------------------------------

function DateRangeBar({
  from, to, onFrom, onTo, onShow, onExport, busy, hasRows,
}: {
  from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void;
  onShow: () => void; onExport: () => void; busy: boolean; hasRows: boolean;
}) {
  return (
    <div className="form-card" style={{ maxWidth: 'none', marginBottom: 16, padding: 16 }}>
      <div className="form-grid">
        <div className="field">
          <label>From date</label>
          <input type="date" className="input" value={from} onChange={(e) => onFrom(e.target.value)} />
        </div>
        <div className="field">
          <label>Till date</label>
          <input type="date" className="input" value={to} onChange={(e) => onTo(e.target.value)} />
        </div>
      </div>
      <div className="form-actions" style={{ marginTop: 4 }}>
        <button className="btn btn-primary" disabled={busy} onClick={onShow}>{busy ? <span className="spinner" /> : 'Show'}</button>
        <button className="btn btn-ghost" disabled={!hasRows} onClick={onExport}>Export CSV</button>
      </div>
    </div>
  );
}

function ZeroCollectionTab() {
  const [from, setFrom] = useState(daysAgoIso(7));
  const [to, setTo] = useState(todayIso());
  const [rows, setRows] = useState<ZeroCollectionRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getZeroCollection(from, to)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <div className="panel-head">Members who paid nothing in this window (for follow-up calling)</div>
      <div className="panel-body">
        <DateRangeBar
          from={from} to={to} onFrom={setFrom} onTo={setTo} onShow={show} busy={busy}
          hasRows={!!rows?.length}
          onExport={() => rows && downloadCsv('zero-collection.csv', rows as unknown as Record<string, unknown>[])}
        />
        {error && <div className="alert-error">{error}</div>}
        {rows && (
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Center</th><th>Member</th><th>Client ID</th><th>Loan A/c</th><th>Loan Amt</th>
                  <th>Due Date</th><th>Freq</th><th>Opening Arr</th><th>Missed Dues</th><th>Demand</th>
                  <th>Balance</th><th>Phone</th><th>Nominee Phone</th><th>FDO</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.centerCode} — {r.centerName}</td>
                    <td>{r.memberName}</td>
                    <td className="mono">{r.displayId}</td>
                    <td className="mono">{r.loanAccount}</td>
                    <td>{inr(r.loanAmount)}</td>
                    <td>{date(r.dueDate)}</td>
                    <td>{r.frequency}</td>
                    <td>{inr(r.openingArrear)}</td>
                    <td>{r.dueCount}</td>
                    <td>{inr(r.demand)}</td>
                    <td>{inr(r.balance)}</td>
                    <td>{r.phone ? <a href={`tel:${r.phone}`}>{r.phone}</a> : '—'}</td>
                    <td>{r.nomineePhone ? <a href={`tel:${r.nomineePhone}`}>{r.nomineePhone}</a> : '—'}</td>
                    <td>{r.fdoName ?? '—'}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={14} className="empty">No zero-collection members in this window.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CollectionFollowupTab() {
  const [from, setFrom] = useState(daysAgoIso(7));
  const [to, setTo] = useState(todayIso());
  const [rows, setRows] = useState<CollectionFollowupRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getCollectionFollowup(from, to)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <div className="panel-head">Per-loan arrears: opening → demand → collected → closing arrear</div>
      <div className="panel-body">
        <DateRangeBar
          from={from} to={to} onFrom={setFrom} onTo={setTo} onShow={show} busy={busy}
          hasRows={!!rows?.length}
          onExport={() => rows && downloadCsv('collection-followup.csv', rows as unknown as Record<string, unknown>[])}
        />
        {error && <div className="alert-error">{error}</div>}
        {rows && (
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Center</th><th>Member</th><th>Loan A/c</th><th>Disb. Date</th><th>Loan Amt</th>
                  <th>Opening Arr</th><th>Due Amt</th><th>Coll. Amt</th><th>Closing Arr</th>
                  <th>Comp. Dues</th><th>Coll. Dues</th><th>Total Dues</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.centerCode} — {r.centerName}</td>
                    <td>{r.memberName}</td>
                    <td className="mono">{r.loanAccount}</td>
                    <td>{date(r.disbursalDate)}</td>
                    <td>{inr(r.loanAmount)}</td>
                    <td>{inr(r.openingArrear)}</td>
                    <td>{inr(r.dueAmount)}</td>
                    <td>{inr(r.collAmount)}</td>
                    <td>{inr(r.closingArrear)}</td>
                    <td>{r.compDues}</td>
                    <td>{r.collDues}</td>
                    <td>{r.totalDues}</td>
                    <td><span className={`badge ${r.loanType === 'OPEN' ? 'active' : 'closed'}`}>{r.loanType}</span></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={13} className="empty">No loans with dues in this window.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AdvanceCollectionTab() {
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(daysAgoIso(-14));
  const [rows, setRows] = useState<AdvanceCollectionRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getAdvanceCollection(from, to)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <div className="panel-head">Upcoming installments (plan ahead)</div>
      <div className="panel-body">
        <DateRangeBar
          from={from} to={to} onFrom={setFrom} onTo={setTo} onShow={show} busy={busy}
          hasRows={!!rows?.length}
          onExport={() => rows && downloadCsv('advance-collection.csv', rows as unknown as Record<string, unknown>[])}
        />
        {error && <div className="alert-error">{error}</div>}
        {rows && (
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Center</th><th>Member</th><th>Loan A/c</th><th>Due Amt</th><th>To Be Collected</th>
                  <th>Due Date</th><th>Paid Date</th><th>Status</th><th>Arrear</th><th>Loan OS</th><th>Meeting Day</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.centerCode} — {r.centerName}</td>
                    <td>{r.memberName}</td>
                    <td className="mono">{r.loanAccount}</td>
                    <td>{inr(r.dueAmount)}</td>
                    <td>{inr(r.toBeCollected)}</td>
                    <td>{date(r.dueDate)}</td>
                    <td>{date(r.paidDate)}</td>
                    <td><span className={`badge ${r.status === 'PAID' ? 'active' : 'pending'}`}>{r.status}</span></td>
                    <td>{inr(r.arrear)}</td>
                    <td>{inr(r.loanOS)}</td>
                    <td>{r.meetingDay ?? '—'}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={11} className="empty">No upcoming dues in this window.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SnapshotBar({ onShow, onExport, busy, hasRows }: { onShow: () => void; onExport: () => void; busy: boolean; hasRows: boolean }) {
  return (
    <div className="form-card" style={{ maxWidth: 'none', marginBottom: 16, padding: 16 }}>
      <div className="form-actions" style={{ marginTop: 0 }}>
        <button className="btn btn-primary" disabled={busy} onClick={onShow}>{busy ? <span className="spinner" /> : 'Refresh'}</button>
        <button className="btn btn-ghost" disabled={!hasRows} onClick={onExport}>Export CSV</button>
      </div>
    </div>
  );
}

function BranchWiseTab() {
  const [rows, setRows] = useState<BranchWiseRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getBranchWise()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }

  useEffect(() => { show(); }, []);

  return (
    <div className="panel">
      <div className="panel-head">Portfolio summary per branch (current snapshot)</div>
      <div className="panel-body">
        <SnapshotBar onShow={show} busy={busy} hasRows={!!rows?.length}
          onExport={() => rows && downloadCsv('branch-wise.csv', rows as unknown as Record<string, unknown>[])}
        />
        {error && <div className="alert-error">{error}</div>}
        {rows && (
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Branch</th><th>Centers</th><th>Clients</th><th>Open Loans</th>
                  <th>Disbursement</th><th>Portfolio OS</th><th>Total Collected</th><th>Arrear</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.branchCode} — {r.branchName}</td>
                    <td>{r.centers}</td>
                    <td>{r.clients}</td>
                    <td>{r.openLoans}</td>
                    <td>{inr(r.loanDisbursement)}</td>
                    <td>{inr(r.portfolioOutstanding)}</td>
                    <td>{inr(r.totalCollected)}</td>
                    <td>{inr(r.arrear)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={8} className="empty">No branches found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CenterWiseTab() {
  const [rows, setRows] = useState<CenterWiseRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getCenterWise()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }

  useEffect(() => { show(); }, []);

  return (
    <div className="panel">
      <div className="panel-head">Portfolio summary per center (current snapshot)</div>
      <div className="panel-body">
        <SnapshotBar onShow={show} busy={busy} hasRows={!!rows?.length}
          onExport={() => rows && downloadCsv('center-wise.csv', rows as unknown as Record<string, unknown>[])}
        />
        {error && <div className="alert-error">{error}</div>}
        {rows && (
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Branch</th><th>Center</th><th>FDO</th><th>Groups</th><th>Clients</th>
                  <th>Open Loans</th><th>Disbursement</th><th>Portfolio OS</th><th>Total Collected</th><th>Arrear</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.branchCode}</td>
                    <td>{r.centerCode} — {r.centerName}</td>
                    <td>{r.fdoName ?? '—'}</td>
                    <td>{r.groups}</td>
                    <td>{r.clients}</td>
                    <td>{r.openLoans}</td>
                    <td>{inr(r.loanDisbursement)}</td>
                    <td>{inr(r.portfolioOutstanding)}</td>
                    <td>{inr(r.totalCollected)}</td>
                    <td>{inr(r.arrear)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={10} className="empty">No centers found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function GroupWiseTab() {
  const [rows, setRows] = useState<GroupWiseRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getGroupWise()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }

  useEffect(() => { show(); }, []);

  return (
    <div className="panel">
      <div className="panel-head">Portfolio summary per group (current snapshot)</div>
      <div className="panel-body">
        <SnapshotBar onShow={show} busy={busy} hasRows={!!rows?.length}
          onExport={() => rows && downloadCsv('group-wise.csv', rows as unknown as Record<string, unknown>[])}
        />
        {error && <div className="alert-error">{error}</div>}
        {rows && (
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Center</th><th>Group</th><th>Members</th><th>Open Loans</th>
                  <th>Disbursement</th><th>Portfolio OS</th><th>Arrear</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.centerCode} — {r.centerName}</td>
                    <td>Group {r.groupNo}</td>
                    <td>{r.members}</td>
                    <td>{r.openLoans}</td>
                    <td>{inr(r.loanDisbursement)}</td>
                    <td>{inr(r.portfolioOutstanding)}</td>
                    <td>{inr(r.arrear)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7} className="empty">No groups found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ClientWiseTab() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<ClientWiseRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getClientWise(q || undefined)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }

  useEffect(() => { show(); }, []);

  return (
    <div className="panel">
      <div className="panel-head">Loan-wise client portfolio (search by name, client ID, or loan account)</div>
      <div className="panel-body">
        <div className="form-card" style={{ maxWidth: 'none', marginBottom: 16, padding: 16 }}>
          <div className="form-grid">
            <div className="field">
              <label>Search</label>
              <input
                type="text" className="input" placeholder="Member name, client ID, or loan A/c"
                value={q} onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && show()}
              />
            </div>
          </div>
          <div className="form-actions" style={{ marginTop: 4 }}>
            <button className="btn btn-primary" disabled={busy} onClick={show}>{busy ? <span className="spinner" /> : 'Show'}</button>
            <button className="btn btn-ghost" disabled={!rows?.length} onClick={() => rows && downloadCsv('client-wise.csv', rows as unknown as Record<string, unknown>[])}>Export CSV</button>
          </div>
        </div>
        {error && <div className="alert-error">{error}</div>}
        {rows && (
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Center</th><th>Client ID</th><th>Member</th><th>Loan A/c</th><th>Disb. Date</th>
                  <th>Loan Amt</th><th>Total Dues</th><th>Portfolio OS</th><th>Arrear</th><th>Collected</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.centerCode} — {r.centerName}</td>
                    <td className="mono">{r.displayId}</td>
                    <td>{r.memberName}</td>
                    <td className="mono">{r.loanAccount}</td>
                    <td>{date(r.disbursalDate)}</td>
                    <td>{inr(r.loanAmount)}</td>
                    <td>{r.totalDues}</td>
                    <td>{inr(r.portfolioOutstanding)}</td>
                    <td>{inr(r.arrear)}</td>
                    <td>{inr(r.collected)}</td>
                    <td><span className={`badge ${r.loanType === 'OPEN' ? 'active' : 'closed'}`}>{r.loanType}</span></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={11} className="empty">No loans found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function EmployeePerformanceTab() {
  const [from, setFrom] = useState(daysAgoIso(30));
  const [to, setTo] = useState(todayIso());
  const [rows, setRows] = useState<EmployeePerformanceRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getEmployeePerformance(from, to)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <div className="panel-head">Field officer portfolio &amp; collection efficiency</div>
      <div className="panel-body">
        <DateRangeBar
          from={from} to={to} onFrom={setFrom} onTo={setTo} onShow={show} busy={busy}
          hasRows={!!rows?.length}
          onExport={() => rows && downloadCsv('employee-performance.csv', rows as unknown as Record<string, unknown>[])}
        />
        {error && <div className="alert-error">{error}</div>}
        {rows && (
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>FDO</th><th>Branch</th><th>Centers</th><th>Clients</th><th>Open Loans</th>
                  <th>Disbursement</th><th>Portfolio OS</th><th>Arrear</th>
                  <th>Period Demand</th><th>Period Collected</th><th>Efficiency %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.fdoCode} — {r.fdoName}</td>
                    <td>{r.branchCode ?? '—'}</td>
                    <td>{r.centers}</td>
                    <td>{r.clients}</td>
                    <td>{r.openLoans}</td>
                    <td>{inr(r.loanDisbursement)}</td>
                    <td>{inr(r.portfolioOutstanding)}</td>
                    <td>{inr(r.arrear)}</td>
                    <td>{inr(r.periodDemand)}</td>
                    <td>{inr(r.periodCollected)}</td>
                    <td>{r.collectionEfficiency == null ? '—' : `${r.collectionEfficiency}%`}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={11} className="empty">No field officers found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
