import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { useAuth } from '../../auth/AuthContext';
import { BranchLite, listAdminBranches } from '../../api/employeesAdmin';
import { downloadCsv } from '../../lib/csv';
import { downloadXlsx } from '../../lib/xlsx';
import { Preset, PRESETS, presetRange } from '../../lib/dateFilter';
import { Pager, usePagination } from '../../components/Pager';
import {
  AdvanceCollectionRow,
  BranchWiseRow,
  CenterWiseRow,
  ClientWiseRow,
  CollectionFollowupRow,
  ClosureRow,
  CollectionRegisterRow,
  DemandRegisterRow,
  DisbursementRow,
  EmployeePerformanceRow,
  ForeclosureReportRow,
  GroupWiseRow,
  LoanApplicationReportRow,
  ParAgingRow,
  ZeroCollectionRow,
  getAdvanceCollection,
  getBranchWise,
  getCenterWise,
  getClientWise,
  getCollectionFollowup,
  getCollectionRegister,
  getDemandRegister,
  getDisbursementRegister,
  getEmployeePerformance,
  getForeclosures,
  getGroupWise,
  getLoanApplicationsReport,
  getLoanClosures,
  getParAging,
  getZeroCollection,
} from '../../api/reportsAdmin';
import { CenterLoanRow, LoanLedger, getLedger, listLoansByCenter } from '../../api/loans';
import { SavingsLedgerReport } from '../../components/reports/SavingsLedgerReport';
import { CombinedStatementReport } from '../../components/reports/CombinedStatementReport';
import { CenterLite, listCenters } from '../../api/members';
import { LedgerView } from '../../components/LedgerView';
import { SavingsBalance, getSavingsBalances } from '../../api/collections';

type Tab = 'demand' | 'zero' | 'followup' | 'advance' | 'register' | 'ledger' | 'statement' | 'portfolio' | 'employee' | 'applications' | 'disbursement' | 'par' | 'foreclosure' | 'closure' | 'savings' | 'savingsledger';
const TABS: { id: Tab; label: string; perm: string }[] = [
  { id: 'demand', label: 'Demand Register', perm: 'report.monitoring' },
  { id: 'ledger', label: 'Loan Ledger', perm: 'report.portfolio' },
  { id: 'savingsledger', label: 'Savings Ledger', perm: 'report.monitoring' },
  { id: 'statement', label: 'Loan + Savings Statement', perm: 'report.portfolio' },
  { id: 'zero', label: 'Zero Collection', perm: 'report.monitoring' },
  { id: 'followup', label: 'Collection Followup', perm: 'report.monitoring' },
  { id: 'advance', label: 'Advance Collection', perm: 'report.monitoring' },
  { id: 'register', label: 'Collection Register', perm: 'report.monitoring' },
  { id: 'portfolio', label: 'Portfolio Summary', perm: 'report.portfolio' },
  { id: 'employee', label: 'Employee Performance', perm: 'report.portfolio' },
  { id: 'applications', label: 'Loan Applications', perm: 'report.portfolio' },
  { id: 'disbursement', label: 'Disbursement Register', perm: 'report.portfolio' },
  { id: 'par', label: 'PAR / Overdue Aging', perm: 'report.portfolio' },
  { id: 'foreclosure', label: 'Foreclosure', perm: 'report.portfolio' },
  { id: 'closure', label: 'Loan Closures', perm: 'report.portfolio' },
  { id: 'savings', label: 'Savings Balances', perm: 'report.portfolio' },
];

const inr = (v: string | number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));
const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

// Selected report branch filter, provided to every tab. '' = all branches (HO
// only). For a BM the backend forces their own branch regardless, so the value
// is informational — the selector is locked to their branch.
const BranchFilterContext = createContext<string>('');
const useReportBranch = () => useContext(BranchFilterContext);

export function ReportsPage() {
  const { can, user } = useAuth();
  const isBM = user?.role === 'BM';
  const tabs = TABS.filter((t) => can(t.perm));
  const [tab, setTab] = useState<Tab>(tabs[0]?.id ?? 'zero');
  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [branchId, setBranchId] = useState('');

  useEffect(() => {
    listAdminBranches()
      .then((bs) => {
        setBranches(bs);
        if (isBM && bs.length) setBranchId(bs[0].id); // BM: locked to their one branch
      })
      .catch(() => {});
  }, [isBM]);

  return (
    <AdminLayout>
      <h1 className="page-title no-print">Reports</h1>
      <p className="page-sub no-print">Portfolio summaries and daily monitoring — filter by any period and export to CSV or Excel.</p>

      <div className="form-card no-print" style={{ maxWidth: 'none', marginBottom: 16, padding: 16 }}>
        <div className="field" style={{ marginBottom: 0, maxWidth: 340 }}>
          <label>Branch</label>
          <select className="input" value={branchId} disabled={isBM} onChange={(e) => setBranchId(e.target.value)}>
            {!isBM && <option value="">All branches</option>}
            {branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
          </select>
          {isBM && <div className="hint" style={{ marginTop: 6 }}>Scoped to your branch.</div>}
        </div>
      </div>

      <div className="report-layout">
        <nav className="report-menu no-print">
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

        <BranchFilterContext.Provider value={branchId}>
        <div className="report-content">
          {tab === 'demand' && <DemandRegisterTab />}
          {tab === 'ledger' && <LoanLedgerTab branchId={branchId} />}
          {tab === 'savingsledger' && <SavingsLedgerReport branchId={branchId} />}
          {tab === 'statement' && <CombinedStatementReport branchId={branchId} />}
          {tab === 'zero' && <ZeroCollectionTab />}
          {tab === 'followup' && <CollectionFollowupTab />}
          {tab === 'advance' && <AdvanceCollectionTab />}
          {tab === 'register' && <CollectionRegisterTab />}
          {tab === 'portfolio' && <PortfolioSummaryTab />}
          {tab === 'employee' && <EmployeePerformanceTab />}
          {tab === 'applications' && <LoanApplicationsReportTab />}
          {tab === 'disbursement' && <DisbursementTab />}
          {tab === 'par' && <ParAgingTab />}
          {tab === 'foreclosure' && <ForeclosureTab />}
          {tab === 'closure' && <ClosureTab />}
          {tab === 'savings' && <SavingsTab />}
        </div>
        </BranchFilterContext.Provider>
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
// Demand Register — printable centerwise register, single "as of" date.

function DemandRegisterTab() {
  const branchId = useReportBranch();
  const [date, setDate] = useState(presetRange('today').from);
  const [preset, setPreset] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [rows, setRows] = useState<DemandRegisterRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  function choose(p: 'today' | 'yesterday') {
    setPreset(p);
    setDate(presetRange(p).from);
  }

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getDemandRegister(date, branchId)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }
  useEffect(() => { show(); /* eslint-disable-next-line */ }, []);

  async function downloadPdf() {
    if (!rows) return;
    setPdfBusy(true);
    try {
      const m = await import('../../lib/pdf/reportPdf');
      await m.downloadDemandRegisterPdf(rows, date);
    } finally { setPdfBusy(false); }
  }

  const totals = (rows ?? []).reduce(
    (t, r) => ({
      clients: t.clients + r.clientCount,
      pending: t.pending + r.pendingApplications,
      loanOS: t.loanOS + r.loanOS,
      arrear: t.arrear + r.arrear,
      demand: t.demand + r.demand,
      collected: t.collected + r.collected,
    }),
    { clients: 0, pending: 0, loanOS: 0, arrear: 0, demand: 0, collected: 0 },
  );
  const asRows = () => rows as unknown as Record<string, unknown>[];

  return (
    <div className="panel">
      <div className="panel-head no-print">Centerwise Demand Register — as of a single date, for the center meeting</div>
      <div className="panel-body">
        <div className="form-card no-print" style={{ maxWidth: 'none', marginBottom: 16, padding: 16 }}>
          <div className="preset-row">
            <button className={`chip ${preset === 'today' ? 'active' : ''}`} onClick={() => choose('today')}>Today</button>
            <button className={`chip ${preset === 'yesterday' ? 'active' : ''}`} onClick={() => choose('yesterday')}>Yesterday</button>
            <button className={`chip ${preset === 'custom' ? 'active' : ''}`} onClick={() => setPreset('custom')}>Custom</button>
          </div>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Date</label>
              <input type="date" className="input" value={date} onChange={(e) => { setPreset('custom'); setDate(e.target.value); }} />
            </div>
          </div>
          <div className="form-actions" style={{ marginTop: 4 }}>
            <button className="btn btn-primary" disabled={busy} onClick={show}>{busy ? <span className="spinner" /> : 'Show'}</button>
            <button className="btn btn-ghost" disabled={pdfBusy || !rows?.length} onClick={downloadPdf}>{pdfBusy ? <span className="spinner" /> : 'Download PDF'}</button>
            <button className="btn btn-ghost" disabled={!rows?.length} onClick={() => rows && downloadCsv('demand-register.csv', asRows())}>Export CSV</button>
            <button className="btn btn-ghost" disabled={!rows?.length} onClick={() => rows && downloadXlsx('demand-register.xlsx', asRows())}>Export Excel</button>
          </div>
        </div>
        {error && <div className="alert-error">{error}</div>}
        {rows && (
          <div className="ledger-print">
            <h2 style={{ textAlign: 'center', margin: '0 0 4px' }}>ASV FINANCE</h2>
            <p style={{ textAlign: 'center', margin: '0 0 16px', color: 'var(--ink-500)' }}>Centerwise Demand Register — {date}</p>
            <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>SI No</th><th>Branch</th><th>Center Name</th><th>Phone</th><th>No. of Clients</th>
                    <th>Pending Apps</th><th>Avg. Due No</th><th>Meeting Time</th>
                    <th>Loan OS</th><th>Arrear</th><th>Demand</th><th>Collected</th><th>CL Signature</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.centerId}>
                      <td>{i + 1}</td>
                      <td>{r.branchCode}-{r.branchName}</td>
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
                  {rows.length === 0 && <tr><td colSpan={13} className="empty">No centers in scope.</td></tr>}
                  {rows.length > 0 && (
                    <tr style={{ fontWeight: 700 }}>
                      <td colSpan={4}>Grand Total</td>
                      <td>{totals.clients}</td>
                      <td>{totals.pending}</td>
                      <td></td>
                      <td></td>
                      <td>{inr(totals.loanOS)}</td>
                      <td>{inr(totals.arrear)}</td>
                      <td>{inr(totals.demand)}</td>
                      <td>{inr(totals.collected)}</td>
                      <td></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ZeroCollectionTab() {
  const filter = useDateFilter('month');
  const branchId = useReportBranch();
  const [rows, setRows] = useState<ZeroCollectionRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getZeroCollection(filter.from, filter.to, branchId)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }

  const asRows = () => rows as unknown as Record<string, unknown>[];
  const p = usePagination(rows);

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
          <>
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Branch</th><th>Center</th><th>Member</th><th>Client ID</th><th>Loan A/c</th><th>Loan Amt</th>
                  <th>Due Date</th><th>Freq</th><th>Opening Arr</th><th>Missed Dues</th><th>Demand</th>
                  <th>Balance</th><th>Phone</th><th>Nominee Phone</th><th>FDO</th>
                </tr>
              </thead>
              <tbody>
                {(p.pageRows ?? []).map((r, i) => (
                  <tr key={i}>
                    <td>{r.branchCode}</td>
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
                {rows.length === 0 && <tr><td colSpan={15} className="empty">No zero-collection members in this window.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager p={p} />
          </>
        )}
      </div>
    </div>
  );
}

function CollectionFollowupTab() {
  const filter = useDateFilter('month');
  const branchId = useReportBranch();
  const [rows, setRows] = useState<CollectionFollowupRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getCollectionFollowup(filter.from, filter.to, branchId)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }

  const asRows = () => rows as unknown as Record<string, unknown>[];
  const p = usePagination(rows);

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
          <>
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Branch</th><th>Center</th><th>Member</th><th>Loan A/c</th><th>Disb. Date</th><th>Loan Amt</th>
                  <th>Opening Arr</th><th>Due Amt</th><th>Coll. Amt</th><th>Closing Arr</th>
                  <th>Comp. Dues</th><th>Coll. Dues</th><th>Total Dues</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(p.pageRows ?? []).map((r, i) => (
                  <tr key={i}>
                    <td>{r.branchCode}</td>
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
                {rows.length === 0 && <tr><td colSpan={14} className="empty">No loans with dues in this window.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager p={p} />
          </>
        )}
      </div>
    </div>
  );
}

function AdvanceCollectionTab() {
  const filter = useDateFilter('month');
  const branchId = useReportBranch();
  const [rows, setRows] = useState<AdvanceCollectionRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getAdvanceCollection(filter.from, filter.to, branchId)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }

  const asRows = () => rows as unknown as Record<string, unknown>[];
  const p = usePagination(rows);

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
          <>
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Branch</th><th>Center</th><th>Member</th><th>Loan A/c</th><th>Due Amt</th><th>To Be Collected</th>
                  <th>Due Date</th><th>Paid Date</th><th>Status</th><th>Arrear</th><th>Loan OS</th><th>Meeting Day</th>
                </tr>
              </thead>
              <tbody>
                {(p.pageRows ?? []).map((r, i) => (
                  <tr key={i}>
                    <td>{r.branchCode}</td>
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
                {rows.length === 0 && <tr><td colSpan={12} className="empty">No upcoming dues in this window.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager p={p} />
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Portfolio summaries: disbursement/collection within the window; outstanding
// and arrear as of the window's end date.

type PortfolioLevel = 'branch' | 'center' | 'group' | 'client';

/** Branch/Center/Group/Client Wise combined behind one level dropdown — same
 *  date filter and export, just a different aggregation grain and columns. */
function PortfolioSummaryTab() {
  const filter = useDateFilter('month');
  const branchId = useReportBranch();
  const [level, setLevel] = useState<PortfolioLevel>('branch');
  const [q, setQ] = useState('');
  const [branchRows, setBranchRows] = useState<BranchWiseRow[] | null>(null);
  const [centerRows, setCenterRows] = useState<CenterWiseRow[] | null>(null);
  const [groupRows, setGroupRows] = useState<GroupWiseRow[] | null>(null);
  const [clientRows, setClientRows] = useState<ClientWiseRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try {
      if (level === 'branch') setBranchRows(await getBranchWise(filter.from, filter.to, branchId));
      else if (level === 'center') setCenterRows(await getCenterWise(filter.from, filter.to, branchId));
      else if (level === 'group') setGroupRows(await getGroupWise(filter.from, filter.to, branchId));
      else setClientRows(await getClientWise(filter.from, filter.to, q || undefined, branchId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setBusy(false);
    }
  }
  // Load once on mount; switching Level (or dates) then waits for a Show click
  // — no surprise fetch the moment the dropdown changes.
  useEffect(() => { show(); /* eslint-disable-next-line */ }, []);

  const rows = level === 'branch' ? branchRows : level === 'center' ? centerRows : level === 'group' ? groupRows : clientRows;
  const asRows = () => rows as unknown as Record<string, unknown>[];
  const file = `portfolio-${level}-wise`;

  return (
    <div className="panel">
      <div className="panel-head">Portfolio summary — pick a level to aggregate by</div>
      <div className="panel-body">
        <DateFilterBar
          filter={filter} onShow={show} busy={busy} hasRows={!!rows?.length}
          onCsv={() => rows && downloadCsv(`${file}.csv`, asRows())}
          onXlsx={() => rows && downloadXlsx(`${file}.xlsx`, asRows())}
        >
          <div className="field">
            <label>Level</label>
            <select className="input" value={level} onChange={(e) => setLevel(e.target.value as PortfolioLevel)}>
              <option value="branch">Branch Wise</option>
              <option value="center">Center Wise</option>
              <option value="group">Group Wise</option>
              <option value="client">Client Wise</option>
            </select>
          </div>
          {level === 'client' && (
            <div className="field">
              <label>Search</label>
              <input
                type="text" className="input" placeholder="Member name, client ID, or loan A/c"
                value={q} onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && show()}
              />
            </div>
          )}
        </DateFilterBar>
        {error && <div className="alert-error">{error}</div>}
        {!rows && !busy && <div className="empty">Click <strong>Show</strong> to load this level for the chosen dates.</div>}
        {level === 'branch' && branchRows && <BranchWiseTable rows={branchRows} />}
        {level === 'center' && centerRows && <CenterWiseTable rows={centerRows} />}
        {level === 'group' && groupRows && <GroupWiseTable rows={groupRows} />}
        {level === 'client' && clientRows && <ClientWiseTable rows={clientRows} />}
      </div>
    </div>
  );
}

function BranchWiseTable({ rows }: { rows: BranchWiseRow[] }) {
  return (
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
  );
}

function CenterWiseTable({ rows }: { rows: CenterWiseRow[] }) {
  return (
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
  );
}

function GroupWiseTable({ rows }: { rows: GroupWiseRow[] }) {
  return (
    <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
      <table className="data">
        <thead>
          <tr>
            <th>Branch</th><th>Center</th><th>Group</th><th>Members</th><th>Open Loans</th>
            <th>Disbursement</th><th>Portfolio OS</th><th>Arrear</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.branchCode} — {r.branchName}</td>
              <td>{r.centerCode} — {r.centerName}</td>
              <td>Group {r.groupNo}</td>
              <td>{r.members}</td>
              <td>{r.openLoans}</td>
              <td>{inr(r.loanDisbursement)}</td>
              <td>{inr(r.portfolioOutstanding)}</td>
              <td>{inr(r.arrear)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={8} className="empty">No groups found.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ClientWiseTable({ rows }: { rows: ClientWiseRow[] }) {
  const p = usePagination(rows);
  return (
    <>
      <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
        <table className="data">
          <thead>
            <tr>
              <th>Branch</th><th>Center</th><th>Client ID</th><th>Member</th><th>Loan A/c</th><th>Disb. Date</th>
              <th>Loan Amt</th><th>Total Dues</th><th>Portfolio OS</th><th>Arrear</th><th>Collected</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(p.pageRows ?? []).map((r, i) => (
              <tr key={i}>
                <td>{r.branchCode}</td>
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
            {rows.length === 0 && <tr><td colSpan={12} className="empty">No loans found.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager p={p} />
    </>
  );
}

function EmployeePerformanceTab() {
  const filter = useDateFilter('month');
  const branchId = useReportBranch();
  const [rows, setRows] = useState<EmployeePerformanceRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getEmployeePerformance(filter.from, filter.to, branchId)); }
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

function LoanApplicationsReportTab() {
  const filter = useDateFilter('month');
  const branchId = useReportBranch();
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<LoanApplicationReportRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getLoanApplicationsReport(filter.from, filter.to, status || undefined, branchId)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }
  useEffect(() => { show(); /* eslint-disable-next-line */ }, []);
  const asRows = () => rows as unknown as Record<string, unknown>[];
  const p = usePagination(rows);

  return (
    <div className="panel">
      <div className="panel-head">Loan applications submitted in this window (all branches &amp; centers in scope)</div>
      <div className="panel-body">
        <DateFilterBar
          filter={filter} onShow={show} busy={busy} hasRows={!!rows?.length}
          onCsv={() => rows && downloadCsv('loan-applications.csv', asRows())}
          onXlsx={() => rows && downloadXlsx('loan-applications.xlsx', asRows())}
        >
          <div className="field">
            <label>Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </DateFilterBar>
        {error && <div className="alert-error">{error}</div>}
        {rows && (
          <>
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>App No</th><th>Branch</th><th>Center</th><th>Client ID</th><th>Member</th><th>Loan A/c</th><th>Product</th>
                  <th>Purpose</th><th>Amount</th><th>Applied</th><th>Status</th><th>FDO</th>
                </tr>
              </thead>
              <tbody>
                {(p.pageRows ?? []).map((r, i) => (
                  <tr key={i}>
                    <td className="mono">{r.appNo ?? '—'}</td>
                    <td>{r.branchCode}</td>
                    <td>{r.centerCode} — {r.centerName}</td>
                    <td className="mono">{r.displayId}</td>
                    <td>{r.memberName}</td>
                    <td className="mono">{r.loanAccount ?? '—'}</td>
                    <td>{r.product}</td>
                    <td>{r.purpose}</td>
                    <td>{inr(r.requestedAmount)}</td>
                    <td>{date(r.appliedDate)}</td>
                    <td><span className={`badge ${r.status === 'APPROVED' ? 'active' : r.status === 'REJECTED' ? 'closed' : 'pending'}`}>{r.status}</span></td>
                    <td>{r.fdoName ?? '—'}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={12} className="empty">No applications in this window.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager p={p} />
          </>
        )}
      </div>
    </div>
  );
}

function DisbursementTab() {
  const filter = useDateFilter('month');
  const branchId = useReportBranch();
  const [rows, setRows] = useState<DisbursementRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getDisbursementRegister(filter.from, filter.to, branchId)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }
  useEffect(() => { show(); /* eslint-disable-next-line */ }, []);
  const asRows = () => rows as unknown as Record<string, unknown>[];
  const p = usePagination(rows);

  return (
    <div className="panel">
      <div className="panel-head">Loans disbursed in this window</div>
      <div className="panel-body">
        <DateFilterBar
          filter={filter} onShow={show} busy={busy} hasRows={!!rows?.length}
          onCsv={() => rows && downloadCsv('disbursement-register.csv', asRows())}
          onXlsx={() => rows && downloadXlsx('disbursement-register.xlsx', asRows())}
        />
        {error && <div className="alert-error">{error}</div>}
        {rows && (
          <>
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Branch</th><th>Center</th><th>Client ID</th><th>Member</th><th>Loan A/c</th><th>Cycle</th><th>Product</th>
                  <th>Disb. Date</th><th>Loan Amt</th><th>Interest</th><th>Total</th><th>Dues</th><th>FDO</th>
                </tr>
              </thead>
              <tbody>
                {(p.pageRows ?? []).map((r, i) => (
                  <tr key={i}>
                    <td>{r.branchCode}</td>
                    <td>{r.centerCode} — {r.centerName}</td>
                    <td className="mono">{r.displayId}</td>
                    <td>{r.memberName}</td>
                    <td className="mono">{r.loanAccount}</td>
                    <td>{r.cycleNo}</td>
                    <td>{r.product}</td>
                    <td>{date(r.disbursalDate)}</td>
                    <td>{inr(r.loanAmount)}</td>
                    <td>{inr(r.interestAmount)}</td>
                    <td>{inr(r.totalAmount)}</td>
                    <td>{r.totalDues}</td>
                    <td>{r.fdoName ?? '—'}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={13} className="empty">No disbursements in this window.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager p={p} />
          </>
        )}
      </div>
    </div>
  );
}

function ParAgingTab() {
  const filter = useDateFilter('today');
  const branchId = useReportBranch();
  const [rows, setRows] = useState<ParAgingRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getParAging(filter.from, filter.to, branchId)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }
  useEffect(() => { show(); /* eslint-disable-next-line */ }, []);
  const asRows = () => rows as unknown as Record<string, unknown>[];
  const bucketClass = (b: string) => (b === '90+' ? 'closed' : b === '31–90' ? 'pending' : 'active');
  const p = usePagination(rows);

  return (
    <div className="panel">
      <div className="panel-head">Portfolio at risk — overdue as of the "Till date", bucketed by days overdue</div>
      <div className="panel-body">
        <DateFilterBar
          filter={filter} onShow={show} busy={busy} hasRows={!!rows?.length}
          onCsv={() => rows && downloadCsv('par-aging.csv', asRows())}
          onXlsx={() => rows && downloadXlsx('par-aging.xlsx', asRows())}
        />
        {error && <div className="alert-error">{error}</div>}
        {rows && (
          <>
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Branch</th><th>Center</th><th>Client ID</th><th>Member</th><th>Loan A/c</th>
                  <th>Loan OS</th><th>Overdue</th><th>Days Overdue</th><th>Bucket</th><th>FDO</th>
                </tr>
              </thead>
              <tbody>
                {(p.pageRows ?? []).map((r, i) => (
                  <tr key={i}>
                    <td>{r.branchCode}</td>
                    <td>{r.centerCode} — {r.centerName}</td>
                    <td className="mono">{r.displayId}</td>
                    <td>{r.memberName}</td>
                    <td className="mono">{r.loanAccount}</td>
                    <td>{inr(r.loanOS)}</td>
                    <td>{inr(r.overdue)}</td>
                    <td>{r.daysOverdue}</td>
                    <td><span className={`badge ${bucketClass(r.bucket)}`}>{r.bucket}</span></td>
                    <td>{r.fdoName ?? '—'}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={10} className="empty">No overdue loans as of this date.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager p={p} />
          </>
        )}
      </div>
    </div>
  );
}

function CollectionRegisterTab() {
  const filter = useDateFilter('today');
  const branchId = useReportBranch();
  const [rows, setRows] = useState<CollectionRegisterRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getCollectionRegister(filter.from, filter.to, branchId)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }
  useEffect(() => { show(); /* eslint-disable-next-line */ }, []);
  const asRows = () => rows as unknown as Record<string, unknown>[];
  const total = rows?.reduce((s, r) => s + r.amount, 0) ?? 0;
  const p = usePagination(rows);

  return (
    <div className="panel">
      <div className="panel-head">Day-book — every receipt (loan collections &amp; savings) in this window</div>
      <div className="panel-body">
        <DateFilterBar
          filter={filter} onShow={show} busy={busy} hasRows={!!rows?.length}
          onCsv={() => rows && downloadCsv('collection-register.csv', asRows())}
          onXlsx={() => rows && downloadXlsx('collection-register.xlsx', asRows())}
        />
        {error && <div className="alert-error">{error}</div>}
        {rows && (
          <>
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th><th>Branch</th><th>Center</th><th>Client ID</th><th>Member</th><th>Loan A/c</th>
                  <th>Type</th><th>Kind</th><th>Principal</th><th>Interest</th><th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(p.pageRows ?? []).map((r, i) => (
                  <tr key={i}>
                    <td>{date(r.date)}</td>
                    <td>{r.branchCode}</td>
                    <td>{r.centerCode} — {r.centerName}</td>
                    <td className="mono">{r.displayId}</td>
                    <td>{r.memberName}</td>
                    <td className="mono">{r.loanAccount}</td>
                    <td>{r.entryType}</td>
                    <td>{r.kind}</td>
                    <td>{inr(r.principal)}</td>
                    <td>{inr(r.interest)}</td>
                    <td>{inr(r.amount)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={11} className="empty">No receipts in this window.</td></tr>}
                {rows.length > 0 && (
                  <tr><td colSpan={10} style={{ textAlign: 'right', fontWeight: 700 }}>Total received</td><td style={{ fontWeight: 700 }}>{inr(total)}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pager p={p} />
          </>
        )}
      </div>
    </div>
  );
}

function ClosureTab() {
  const filter = useDateFilter('year');
  const branchId = useReportBranch();
  const [rows, setRows] = useState<ClosureRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getLoanClosures(filter.from, filter.to, branchId)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setBusy(false); }
  }
  useEffect(() => { show(); /* eslint-disable-next-line */ }, []);
  const asRows = () => rows as unknown as Record<string, unknown>[];
  const p = usePagination(rows);

  return (
    <div className="panel">
      <div className="panel-head">Loans fully repaid &amp; closed in this window (foreclosures are a separate tab)</div>
      <div className="panel-body">
        <DateFilterBar
          filter={filter} onShow={show} busy={busy} hasRows={!!rows?.length}
          onCsv={() => rows && downloadCsv('loan-closures.csv', asRows())}
          onXlsx={() => rows && downloadXlsx('loan-closures.xlsx', asRows())}
        />
        {error && <div className="alert-error">{error}</div>}
        {rows && (
          <>
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Branch</th><th>Center</th><th>Client ID</th><th>Member</th><th>Loan A/c</th><th>Cycle</th>
                  <th>Disb. Date</th><th>Loan Amt</th><th>Total</th><th>Repaid</th><th>Closed On</th>
                </tr>
              </thead>
              <tbody>
                {(p.pageRows ?? []).map((r, i) => (
                  <tr key={i}>
                    <td>{r.branchCode}</td>
                    <td>{r.centerCode} — {r.centerName}</td>
                    <td className="mono">{r.displayId}</td>
                    <td>{r.memberName}</td>
                    <td className="mono">{r.loanAccount}</td>
                    <td>{r.cycleNo}</td>
                    <td>{date(r.disbursalDate)}</td>
                    <td>{inr(r.loanAmount)}</td>
                    <td>{inr(r.totalAmount)}</td>
                    <td>{inr(r.totalRepaid)}</td>
                    <td>{date(r.closedDate)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={11} className="empty">No loans closed in this window.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager p={p} />
          </>
        )}
      </div>
    </div>
  );
}

function ForeclosureTab() {
  const filter = useDateFilter('year');
  const branchId = useReportBranch();
  const [rows, setRows] = useState<ForeclosureReportRow[] | null>(null);
  const [selected, setSelected] = useState<ForeclosureReportRow | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function show() {
    setError(''); setBusy(true);
    try { setRows(await getForeclosures(filter.from, filter.to, branchId)); }
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
              <Item k="Branch" v={`${selected.branchCode} — ${selected.branchName}`} />
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
                  <th>Branch</th><th>Center</th><th>Client ID</th><th>Member</th><th>Loan A/c</th><th>Closed On</th>
                  <th>Principal</th><th>Interest</th><th>Waived</th><th>Charge</th><th>Total Paid</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.loanId}>
                    <td>{r.branchCode}</td>
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
                {rows.length === 0 && <tr><td colSpan={12} className="empty">No foreclosures in this window.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SavingsTab() {
  const branchId = useReportBranch();
  const [rows, setRows] = useState<SavingsBalance[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { getSavingsBalances(branchId).then(setRows).catch((e) => setError(e.message)); }, [branchId]);

  return (
    <div className="panel">
      <div className="panel-head">Clients holding a savings balance</div>
      <div className="panel-body">
        {error && <div className="alert-error">{error}</div>}
        <div className="hint" style={{ marginBottom: 12 }}>
          This report is view-only. Savings is closed/refunded on the Savings Closure page (initiate → approve → close).
        </div>
        {rows && (
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Client ID</th><th>Member</th><th>Branch</th><th>Center</th>
                  <th>Loan A/c</th><th>Disb. Date</th><th>No. of Dues</th>
                  <th>Savings Balance</th><th>Loan Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.clientId}>
                    <td className="mono">{r.displayId}</td>
                    <td>{r.clientName}</td>
                    <td>{r.branchCode} — {r.branchName}</td>
                    <td>{r.centerName}</td>
                    <td className="mono">{r.loanAccount ?? '—'}</td>
                    <td>{date(r.disbursalDate)}</td>
                    <td>{r.totalDues ?? '—'}</td>
                    <td>{inr(r.savingsBalance)}</td>
                    <td>{r.hasOpenLoan ? <span className="badge active">Open loan</span> : <span className="badge closed">No open loan</span>}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={9} className="empty">No clients are holding savings.</td></tr>}
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

// ---------------------------------------------------------------------------
// Savings Ledger — the savings passbook (deposits & refunds) over a window.

// ---------------------------------------------------------------------------
// Loan Ledger — pick a center + type, list its loans, open a full ledger
// (mirrors the employee portal's Client Loan Schedule).

function LoanLedgerTab({ branchId }: { branchId: string }) {
  const [centers, setCenters] = useState<CenterLite[]>([]);
  const [centerId, setCenterId] = useState('');
  const [type, setType] = useState<'OPEN' | 'CLOSED' | 'ALL'>('OPEN');
  const [loans, setLoans] = useState<CenterLoanRow[] | null>(null);
  const [ledger, setLedger] = useState<LoanLedger | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setCenterId('');
    listCenters(branchId).then(setCenters).catch((e) => setError(e.message));
  }, [branchId]);
  useEffect(() => {
    setLedger(null);
    if (!centerId) { setLoans(null); return; }
    setError('');
    listLoansByCenter(centerId, type).then(setLoans).catch((e) => setError(e.message));
  }, [centerId, type]);

  function viewLedger(loanId: string) {
    setError(''); setLoadingLedger(true);
    getLedger(loanId).then(setLedger).catch((e) => setError(e.message)).finally(() => setLoadingLedger(false));
  }

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
    <div className="panel">
      <div className="panel-head no-print">Client Loan Schedule — pick a center to list its loans, then view a ledger</div>
      <div className="panel-body">
        {error && <div className="alert-error">{error}</div>}
        <div className="form-card no-print" style={{ maxWidth: 'none', marginBottom: 16, padding: 16 }}>
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
        {centerId && loans && (
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr><th>Client ID</th><th>Branch</th><th>Center</th><th>Client Name</th><th>Loan A/c</th><th>Disb. Date</th><th>Amount</th><th></th></tr>
              </thead>
              <tbody>
                {loans.map((l) => (
                  <tr key={l.id}>
                    <td className="mono">{l.displayId}</td>
                    <td>{l.branchCode} — {l.branchName}</td>
                    <td>{l.centerCode} — {l.centerName}</td>
                    <td>{l.clientName}</td>
                    <td className="mono">{l.loanAccount}</td>
                    <td>{date(l.disbursalDate)}</td>
                    <td>{inr(l.loanAmount)}</td>
                    <td><button className="btn btn-primary btn-sm" disabled={loadingLedger} onClick={() => viewLedger(l.id)}>View ledger</button></td>
                  </tr>
                ))}
                {loans.length === 0 && <tr><td colSpan={8} className="empty">No {type === 'ALL' ? '' : type.toLowerCase() + ' '}loans in this center.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
