import { ReactNode, useEffect, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { useAuth } from '../../auth/AuthContext';
import { downloadCsv } from '../../lib/csv';
import { downloadXlsx } from '../../lib/xlsx';
import { Preset, PRESETS, presetRange } from '../../lib/dateFilter';
import {
  AdvanceCollectionRow,
  BranchWiseRow,
  CenterWiseRow,
  ClientWiseRow,
  CollectionFollowupRow,
  EmployeePerformanceRow,
  ForeclosureReportRow,
  GroupWiseRow,
  ZeroCollectionRow,
  getAdvanceCollection,
  getBranchWise,
  getCenterWise,
  getClientWise,
  getCollectionFollowup,
  getEmployeePerformance,
  getForeclosures,
  getGroupWise,
  getZeroCollection,
} from '../../api/reportsAdmin';
import { SavingsBalance, getSavingsBalances, refundSavings } from '../../api/collections';
import { useConfirm } from '../../components/ConfirmProvider';

type Tab = 'zero' | 'followup' | 'advance' | 'branch' | 'center' | 'group' | 'client' | 'employee' | 'foreclosure' | 'savings';
const TABS: { id: Tab; label: string; perm: string }[] = [
  { id: 'zero', label: 'Zero Collection', perm: 'report.monitoring' },
  { id: 'followup', label: 'Collection Followup', perm: 'report.monitoring' },
  { id: 'advance', label: 'Advance Collection', perm: 'report.monitoring' },
  { id: 'branch', label: 'Branch Wise', perm: 'report.portfolio' },
  { id: 'center', label: 'Center Wise', perm: 'report.portfolio' },
  { id: 'group', label: 'Group Wise', perm: 'report.portfolio' },
  { id: 'client', label: 'Client Wise', perm: 'report.portfolio' },
  { id: 'employee', label: 'Employee Performance', perm: 'report.portfolio' },
  { id: 'foreclosure', label: 'Foreclosure', perm: 'report.portfolio' },
  { id: 'savings', label: 'Savings', perm: 'report.portfolio' },
];

const inr = (v: string | number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));
const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

export function ReportsPage() {
  const { can } = useAuth();
  const tabs = TABS.filter((t) => can(t.perm));
  const [tab, setTab] = useState<Tab>(tabs[0]?.id ?? 'zero');

  return (
    <AdminLayout>
      <h1 className="page-title">Reports</h1>
      <p className="page-sub">Portfolio summaries and daily monitoring — filter by any period and export to CSV or Excel.</p>

      <div className="report-layout">
        <nav className="report-menu">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`report-menu-item ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="report-content">
          {tab === 'zero' && <ZeroCollectionTab />}
          {tab === 'followup' && <CollectionFollowupTab />}
          {tab === 'advance' && <AdvanceCollectionTab />}
          {tab === 'branch' && <BranchWiseTab />}
          {tab === 'center' && <CenterWiseTab />}
          {tab === 'group' && <GroupWiseTab />}
          {tab === 'client' && <ClientWiseTab />}
          {tab === 'employee' && <EmployeePerformanceTab />}
          {tab === 'foreclosure' && <ForeclosureTab />}
          {tab === 'savings' && <SavingsTab />}
        </div>
      </div>
    </AdminLayout>
  );
}

// ---------------------------------------------------------------------------
// Shared date-filter (quick presets + custom range) used by every report.

function useDateFilter(initial: Preset = 'month') {
  const first = presetRange(initial);
  const [preset, setPreset] = useState<Preset>(initial);
  const [from, setFromState] = useState(first.from);
  const [to, setToState] = useState(first.to);

  const choose = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') {
      const r = presetRange(p);
      setFromState(r.from);
      setToState(r.to);
    }
  };
  const editFrom = (v: string) => { setPreset('custom'); setFromState(v); };
  const editTo = (v: string) => { setPreset('custom'); setToState(v); };

  return { preset, from, to, choose, editFrom, editTo };
}
type DateFilter = ReturnType<typeof useDateFilter>;

function DateFilterBar({
  filter, onShow, onCsv, onXlsx, busy, hasRows, children,
}: {
  filter: DateFilter;
  onShow: () => void; onCsv: () => void; onXlsx: () => void;
  busy: boolean; hasRows: boolean; children?: ReactNode;
}) {
  return (
    <div className="form-card" style={{ maxWidth: 'none', marginBottom: 16, padding: 16 }}>
      <div className="preset-row">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className={`chip ${filter.preset === p.id ? 'active' : ''}`}
            onClick={() => filter.choose(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="form-grid" style={{ marginTop: 12 }}>
        <div className="field">
          <label>From date</label>
          <input type="date" className="input" value={filter.from} onChange={(e) => filter.editFrom(e.target.value)} />
        </div>
        <div className="field">
          <label>Till date</label>
          <input type="date" className="input" value={filter.to} onChange={(e) => filter.editTo(e.target.value)} />
        </div>
        {children}
      </div>
      <div className="form-actions" style={{ marginTop: 4 }}>
        <button className="btn btn-primary" disabled={busy} onClick={onShow}>{busy ? <span className="spinner" /> : 'Show'}</button>
        <button className="btn btn-ghost" disabled={!hasRows} onClick={onCsv}>Export CSV</button>
        <button className="btn btn-ghost" disabled={!hasRows} onClick={onXlsx}>Export Excel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ZeroCollectionTab() {
  const filter = useDateFilter('month');
  const [rows, setRows] = useState<ZeroCollectionRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getZeroCollection(filter.from, filter.to)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }

  const asRows = () => rows as unknown as Record<string, unknown>[];

  return (
    <div className="panel">
      <div className="panel-head">Members who paid nothing in this window (for follow-up calling)</div>
      <div className="panel-body">
        <DateFilterBar
          filter={filter} onShow={show} busy={busy} hasRows={!!rows?.length}
          onCsv={() => rows && downloadCsv('zero-collection.csv', asRows())}
          onXlsx={() => rows && downloadXlsx('zero-collection.xlsx', asRows())}
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
  const filter = useDateFilter('month');
  const [rows, setRows] = useState<CollectionFollowupRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getCollectionFollowup(filter.from, filter.to)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }

  const asRows = () => rows as unknown as Record<string, unknown>[];

  return (
    <div className="panel">
      <div className="panel-head">Per-loan arrears: opening → demand → collected → closing arrear</div>
      <div className="panel-body">
        <DateFilterBar
          filter={filter} onShow={show} busy={busy} hasRows={!!rows?.length}
          onCsv={() => rows && downloadCsv('collection-followup.csv', asRows())}
          onXlsx={() => rows && downloadXlsx('collection-followup.xlsx', asRows())}
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
  const filter = useDateFilter('month');
  const [rows, setRows] = useState<AdvanceCollectionRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getAdvanceCollection(filter.from, filter.to)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }

  const asRows = () => rows as unknown as Record<string, unknown>[];

  return (
    <div className="panel">
      <div className="panel-head">Upcoming installments (plan ahead)</div>
      <div className="panel-body">
        <DateFilterBar
          filter={filter} onShow={show} busy={busy} hasRows={!!rows?.length}
          onCsv={() => rows && downloadCsv('advance-collection.csv', asRows())}
          onXlsx={() => rows && downloadXlsx('advance-collection.xlsx', asRows())}
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
// Portfolio summaries: disbursement/collection within the window; outstanding
// and arrear as of the window's end date.

function BranchWiseTab() {
  const filter = useDateFilter('month');
  const [rows, setRows] = useState<BranchWiseRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getBranchWise(filter.from, filter.to)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }

  useEffect(() => { show(); }, []);
  const asRows = () => rows as unknown as Record<string, unknown>[];

  return (
    <div className="panel">
      <div className="panel-head">Portfolio summary per branch</div>
      <div className="panel-body">
        <DateFilterBar
          filter={filter} onShow={show} busy={busy} hasRows={!!rows?.length}
          onCsv={() => rows && downloadCsv('branch-wise.csv', asRows())}
          onXlsx={() => rows && downloadXlsx('branch-wise.xlsx', asRows())}
        />
        {error && <div className="alert-error">{error}</div>}
        {rows && (
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Branch</th><th>Centers</th><th>Clients</th><th>Open Loans</th>
                  <th>Disbursement</th><th>Portfolio OS</th><th>Collected</th><th>Arrear</th>
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
  const filter = useDateFilter('month');
  const [rows, setRows] = useState<CenterWiseRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getCenterWise(filter.from, filter.to)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }

  useEffect(() => { show(); }, []);
  const asRows = () => rows as unknown as Record<string, unknown>[];

  return (
    <div className="panel">
      <div className="panel-head">Portfolio summary per center</div>
      <div className="panel-body">
        <DateFilterBar
          filter={filter} onShow={show} busy={busy} hasRows={!!rows?.length}
          onCsv={() => rows && downloadCsv('center-wise.csv', asRows())}
          onXlsx={() => rows && downloadXlsx('center-wise.xlsx', asRows())}
        />
        {error && <div className="alert-error">{error}</div>}
        {rows && (
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Branch</th><th>Center</th><th>FDO</th><th>Groups</th><th>Clients</th>
                  <th>Open Loans</th><th>Disbursement</th><th>Portfolio OS</th><th>Collected</th><th>Arrear</th>
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
  const filter = useDateFilter('month');
  const [rows, setRows] = useState<GroupWiseRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getGroupWise(filter.from, filter.to)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }

  useEffect(() => { show(); }, []);
  const asRows = () => rows as unknown as Record<string, unknown>[];

  return (
    <div className="panel">
      <div className="panel-head">Portfolio summary per group</div>
      <div className="panel-body">
        <DateFilterBar
          filter={filter} onShow={show} busy={busy} hasRows={!!rows?.length}
          onCsv={() => rows && downloadCsv('group-wise.csv', asRows())}
          onXlsx={() => rows && downloadXlsx('group-wise.xlsx', asRows())}
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
  const filter = useDateFilter('month');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<ClientWiseRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getClientWise(filter.from, filter.to, q || undefined)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }

  useEffect(() => { show(); }, []);
  const asRows = () => rows as unknown as Record<string, unknown>[];

  return (
    <div className="panel">
      <div className="panel-head">Loan-wise client portfolio (search by name, client ID, or loan account)</div>
      <div className="panel-body">
        <DateFilterBar
          filter={filter} onShow={show} busy={busy} hasRows={!!rows?.length}
          onCsv={() => rows && downloadCsv('client-wise.csv', asRows())}
          onXlsx={() => rows && downloadXlsx('client-wise.xlsx', asRows())}
        >
          <div className="field">
            <label>Search</label>
            <input
              type="text" className="input" placeholder="Member name, client ID, or loan A/c"
              value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && show()}
            />
          </div>
        </DateFilterBar>
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
  const filter = useDateFilter('month');
  const [rows, setRows] = useState<EmployeePerformanceRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getEmployeePerformance(filter.from, filter.to)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }

  const asRows = () => rows as unknown as Record<string, unknown>[];

  return (
    <div className="panel">
      <div className="panel-head">Field officer portfolio &amp; collection efficiency</div>
      <div className="panel-body">
        <DateFilterBar
          filter={filter} onShow={show} busy={busy} hasRows={!!rows?.length}
          onCsv={() => rows && downloadCsv('employee-performance.csv', asRows())}
          onXlsx={() => rows && downloadXlsx('employee-performance.xlsx', asRows())}
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

// ---------------------------------------------------------------------------

function ForeclosureTab() {
  const filter = useDateFilter('year');
  const [rows, setRows] = useState<ForeclosureReportRow[] | null>(null);
  const [selected, setSelected] = useState<ForeclosureReportRow | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getForeclosures(filter.from, filter.to)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }
  useEffect(() => { show(); /* eslint-disable-next-line */ }, []);
  const asRows = () => rows as unknown as Record<string, unknown>[];

  if (selected) {
    return (
      <div>
        <div className="no-print" style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>← Back to list</button>
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>Print</button>
        </div>
        <div className="panel ledger-print">
          <div className="panel-body">
            <h2 style={{ textAlign: 'center', margin: '0 0 4px' }}>ASV FINANCE</h2>
            <p style={{ textAlign: 'center', margin: '0 0 20px', color: 'var(--ink-500)' }}>Loan Foreclosure Certificate</p>
            <div className="detail-grid" style={{ marginBottom: 20 }}>
              <Item k="Client ID" v={selected.displayId} />
              <Item k="Client Name" v={selected.memberName} />
              <Item k="Center" v={`${selected.centerCode} — ${selected.centerName}`} />
              <Item k="Loan Account" v={selected.loanAccount} />
              <Item k="Disbursed" v={date(selected.disbursalDate)} />
              <Item k="Loan Amount" v={inr(selected.loanAmount)} />
              <Item k="Closed On" v={date(selected.closedDate)} />
              <Item k="Principal Paid" v={inr(selected.principalPaid)} />
              <Item k="Interest Charged" v={inr(selected.interestCharged)} />
              <Item k="Interest Waived" v={inr(selected.interestWaived)} />
              <Item k="Foreclosure Charge" v={inr(selected.foreclosureCharge)} />
              <Item k="Total Paid to Close" v={inr(selected.payoffTotal)} />
            </div>
            <p style={{ color: 'var(--ink-700)' }}>
              This certifies that loan account <strong>{selected.loanAccount}</strong> of{' '}
              <strong>{selected.memberName}</strong> was foreclosed and fully settled on{' '}
              <strong>{date(selected.closedDate)}</strong>. No further dues remain against this loan.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">Loans foreclosed (early-closed) in this window</div>
      <div className="panel-body">
        <DateFilterBar
          filter={filter} onShow={show} busy={busy} hasRows={!!rows?.length}
          onCsv={() => rows && downloadCsv('foreclosures.csv', asRows())}
          onXlsx={() => rows && downloadXlsx('foreclosures.xlsx', asRows())}
        />
        {error && <div className="alert-error">{error}</div>}
        {rows && (
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Center</th><th>Client ID</th><th>Member</th><th>Loan A/c</th><th>Closed On</th>
                  <th>Principal</th><th>Interest</th><th>Waived</th><th>Charge</th><th>Total Paid</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.loanId}>
                    <td>{r.centerCode} — {r.centerName}</td>
                    <td className="mono">{r.displayId}</td>
                    <td>{r.memberName}</td>
                    <td className="mono">{r.loanAccount}</td>
                    <td>{date(r.closedDate)}</td>
                    <td>{inr(r.principalPaid)}</td>
                    <td>{inr(r.interestCharged)}</td>
                    <td>{inr(r.interestWaived)}</td>
                    <td>{inr(r.foreclosureCharge)}</td>
                    <td>{inr(r.payoffTotal)}</td>
                    <td><button className="btn btn-primary btn-sm" onClick={() => setSelected(r)}>Report</button></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={11} className="empty">No foreclosures in this window.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SavingsTab() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const [rows, setRows] = useState<SavingsBalance[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function refresh() { getSavingsBalances().then(setRows).catch((e) => setError(e.message)); }
  useEffect(refresh, []);

  async function onRefund(r: SavingsBalance) {
    const ok = await confirm({
      title: 'Refund savings?',
      message: `Refund ${inr(r.savingsBalance)} of held savings to ${r.clientName} (${r.displayId})? This records the payout and zeroes their savings balance.`,
      confirmLabel: 'Refund',
    });
    if (!ok) return;
    setError(''); setSuccess(''); setBusyId(r.clientId);
    try {
      const res = await refundSavings(r.clientId);
      setSuccess(`Refunded ${inr(res.refunded)} to ${r.clientName}.`);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refund failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">Clients holding a savings balance</div>
      <div className="panel-body">
        {error && <div className="alert-error">{error}</div>}
        {success && <div className="alert-error" style={{ background: '#e3f5ee', color: '#157a5b', borderColor: '#bfe6d7' }}>{success}</div>}
        {rows && (
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr><th>Client ID</th><th>Member</th><th>Center</th><th>Savings Balance</th><th>Loan Status</th>{can('savings.refund') && <th></th>}</tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.clientId}>
                    <td className="mono">{r.displayId}</td>
                    <td>{r.clientName}</td>
                    <td>{r.centerName}</td>
                    <td>{inr(r.savingsBalance)}</td>
                    <td>{r.hasOpenLoan ? <span className="badge active">Open loan</span> : <span className="badge closed">No open loan</span>}</td>
                    {can('savings.refund') && (
                      <td>
                        <button className="btn btn-primary btn-sm" disabled={r.hasOpenLoan || busyId === r.clientId} title={r.hasOpenLoan ? 'Refund only after all loans close' : ''} onClick={() => onRefund(r)}>
                          {busyId === r.clientId ? <span className="spinner" /> : 'Refund'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} className="empty">No clients are holding savings.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return <div className="detail-item"><div className="k">{k}</div><div className="v">{v}</div></div>;
}
