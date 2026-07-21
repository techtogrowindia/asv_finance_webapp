import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { BulkImportResult, BulkImportRow, DueRow, bulkImportCollections, getDue, postCollection } from '../api/collections';
import { CenterLite, listCenters } from '../api/members';
import { getSettings } from '../api/settings';
import { BranchScopeSelect } from '../components/BranchScopeSelect';
import { InlineClosureReport } from '../components/reports/InlineClosureReport';
import { downloadXlsx, readXlsxFile } from '../lib/xlsx';

const inr = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-IN') : '—');

const normKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
const LOAN_KEYS = ['loanac', 'loanaccount', 'loanacno', 'loanaccountno', 'loanno'];
const AMOUNT_KEYS = ['amount', 'amt', 'collected', 'collectedamount', 'paid'];
const SAVINGS_KEYS = ['savings', 'saving'];

/** Best-effort column matching so the FDO's edited copy of the downloaded
 *  template (or a hand-made sheet with similarly-named columns) still parses. */
function parseImportRows(raw: Record<string, unknown>[]): { rows: BulkImportRow[]; skipped: number } {
  const rows: BulkImportRow[] = [];
  let skipped = 0;
  for (const r of raw) {
    const entries = Object.entries(r).map(([k, v]) => [normKey(k), v] as const);
    const get = (keys: string[]) => entries.find(([k]) => keys.includes(k))?.[1];
    const loanAccount = String(get(LOAN_KEYS) ?? '').trim();
    const amountRaw = get(AMOUNT_KEYS);
    const amount = Number(amountRaw);
    if (!loanAccount || amountRaw === undefined || amountRaw === '' || !Number.isFinite(amount) || amount <= 0) {
      skipped += 1;
      continue;
    }
    const savingsRaw = get(SAVINGS_KEYS);
    const savings = savingsRaw !== undefined && savingsRaw !== '' ? Number(savingsRaw) : undefined;
    rows.push({ loanAccount, amount, ...(savings !== undefined && Number.isFinite(savings) ? { savings } : {}) });
  }
  return { rows, skipped };
}

export function CollectionsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const base = user?.role === 'FDO' ? '/app' : '/admin';
  const [branchId, setBranchId] = useState('');
  const [centers, setCenters] = useState<CenterLite[]>([]);
  const [centerId, setCenterId] = useState('');
  const [rows, setRows] = useState<DueRow[] | null>(null);
  const [advances, setAdvances] = useState<Record<string, string>>({});
  const [savingsInputs, setSavingsInputs] = useState<Record<string, string>>({});
  const [savings, setSavings] = useState(0);
  const [busyLoanId, setBusyLoanId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [closedLoanId, setClosedLoanId] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCenterId('');
    listCenters(branchId).then(setCenters).catch((e) => setError(e.message));
  }, [branchId]);
  useEffect(() => {
    getSettings().then((s) => setSavings(s.savingsPerCollection)).catch(() => {});
  }, []);

  function refresh(cid: string) {
    setRows(null);
    getDue(cid)
      .then((data) => { setRows(data); setAdvances({}); setSavingsInputs({}); })
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    setImportResult(null);
    if (centerId) refresh(centerId);
    else setRows(null);
  }, [centerId]);

  /** A blank sample — not this center's real loans. Fill in the actual Loan
   *  A/c + Amount (+ Savings) for each collection you made, then re-upload. */
  async function downloadTemplate() {
    setError('');
    try {
      await downloadXlsx(
        'collection-import-template.xlsx',
        [
          { 'Loan A/c': 'ASVLN000001_1', Amount: 500, Savings: 100 },
          { 'Loan A/c': 'ASVLN000002_1', Amount: 700, Savings: 100 },
        ],
        'Collections',
      );
    } catch (e) {
      setError(e instanceof Error ? `Could not download the template: ${e.message}` : 'Could not download the template');
    }
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file || !centerId) return;
    setError(''); setSuccess(''); setImportResult(null); setImportBusy(true);
    try {
      const raw = await readXlsxFile(file);
      const { rows: parsedRows, skipped } = parseImportRows(raw);
      if (parsedRows.length === 0) {
        setError('No valid rows found — check the file has "Loan A/c" and "Amount" columns.');
        return;
      }
      const res = await bulkImportCollections(centerId, parsedRows);
      setImportResult(res);
      setSuccess(
        `Imported ${res.successCount} of ${parsedRows.length} row(s), ${inr(res.totalCollected)} collected` +
          (res.totalSavings > 0 ? ` + ${inr(res.totalSavings)} savings` : '') +
          (skipped > 0 ? `. ${skipped} row(s) skipped (missing loan account or amount).` : '.'),
      );
      refresh(centerId);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Import failed');
    } finally {
      setImportBusy(false);
    }
  }

  // Cash to collect = overdue + this period's instalment + any advance the member
  // chooses to pre-pay + the savings deposit (editable — the FDO may set it to 0
  // if the client skips savings this time, like advance).
  const advanceOf = (r: DueRow) => Number(advances[r.loanId]) || 0;
  const savingsOf = (r: DueRow) =>
    savingsInputs[r.loanId] !== undefined ? Number(savingsInputs[r.loanId]) || 0 : savings;
  const rowTotal = (r: DueRow) => r.arrear + r.currentDue + advanceOf(r) + savingsOf(r);

  async function onCollect(row: DueRow) {
    // The loan payment; savings is banked separately by the API.
    const amount = row.arrear + row.currentDue + advanceOf(row);
    if (amount <= 0) {
      setError('Nothing to collect for this member');
      return;
    }
    setError('');
    setSuccess('');
    setBusyLoanId(row.loanId);
    try {
      const res = await postCollection(row.loanId, amount, savingsOf(row));
      setSuccess(
        `Collected ${inr(res.applied)} from ${row.clientName}` +
          (res.savingsCollected > 0 ? ` + ${inr(res.savingsCollected)} savings` : '') +
          (res.advanceBanked > 0 ? ` (${inr(res.advanceBanked)} banked as advance)` : '') +
          (res.loanClosed ? ' — loan fully closed!' : '') +
          (res.savingsRefunded > 0 ? ` ${inr(res.savingsRefunded)} savings refunded to the client.` : ''),
      );
      if (res.loanClosed) setClosedLoanId(row.loanId);
      refresh(centerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Collection failed');
    } finally {
      setBusyLoanId(null);
    }
  }

  const showSavings = savings > 0;
  const cols = showSavings ? 13 : 12;

  return (
    <>
      <div className="toolbar">
        <div>
          <h1 className="page-title">Collections</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            Working date: {user ? new Date(user.workingDate).toLocaleDateString('en-IN') : '—'}
          </p>
        </div>
        <div className="toolbar-actions" style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <BranchScopeSelect value={branchId} onChange={setBranchId} />
          <select className="select" value={centerId} onChange={(e) => setCenterId(e.target.value)}>
            <option value="">Select center</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
            ))}
          </select>
          <button className="btn btn-ghost" onClick={downloadTemplate}>
            Download template
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onImportFile} />
          <button className="btn btn-primary" disabled={!centerId || importBusy} onClick={() => fileInputRef.current?.click()}>
            {importBusy ? <span className="spinner" /> : 'Import Excel'}
          </button>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && (
        <div className="alert-error" style={{ background: '#e3f5ee', color: '#157a5b', borderColor: '#bfe6d7' }}>
          {success}
        </div>
      )}
      {closedLoanId && <InlineClosureReport loanId={closedLoanId} onDismiss={() => setClosedLoanId(null)} />}

      {importResult && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <div className="panel-head">
            Import results — {importResult.successCount} posted, {importResult.failCount} failed
          </div>
          <div className="panel-body">
            <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
              <table className="data">
                <thead>
                  <tr><th>Loan A/c</th><th>Client</th><th>Status</th><th>Applied</th><th>Detail</th></tr>
                </thead>
                <tbody>
                  {importResult.results.map((r, i) => (
                    <tr key={`${r.loanAccount}-${i}`}>
                      <td className="mono">{r.loanAccount}</td>
                      <td>{r.clientName ?? '—'}</td>
                      <td><span className={`badge ${r.status === 'OK' ? 'active' : 'inactive'}`}>{r.status}</span></td>
                      <td>{r.status === 'OK' ? inr(r.applied) : '—'}</td>
                      <td>
                        {r.status === 'ERROR'
                          ? r.message
                          : [
                              r.savingsCollected > 0 ? `+${inr(r.savingsCollected)} savings` : '',
                              r.advanceBanked > 0 ? `${inr(r.advanceBanked)} banked as advance` : '',
                              r.loanClosed ? 'Loan closed' : '',
                            ].filter(Boolean).join(' · ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {centerId && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Client ID</th><th>Name</th><th>Loan A/c</th>
                <th>Disb. Date</th><th>Last Paid</th><th>Due Date</th>
                <th>Arrear</th><th>Current Due</th><th>Advance (pre-pay)</th>
                {showSavings && <th>Savings</th>}
                <th>Total</th><th></th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((r) => (
                <tr key={r.loanId}>
                  <td className="mono">{r.displayId}</td>
                  <td>{r.clientName}</td>
                  <td className="mono">{r.loanAccount}</td>
                  <td>{fmtDate(r.disbursalDate)}</td>
                  <td>{fmtDate(r.lastPaidDate)}</td>
                  <td>{fmtDate(r.nextDueDate)}</td>
                  <td>{inr(r.arrear)}</td>
                  <td>{inr(r.currentDue)}</td>
                  <td>
                    <input
                      className="input"
                      style={{ width: 110, padding: '7px 10px' }}
                      type="number"
                      min="0"
                      placeholder="0"
                      value={advances[r.loanId] ?? ''}
                      onChange={(e) => setAdvances((a) => ({ ...a, [r.loanId]: e.target.value }))}
                    />
                    {r.advanceBalance > 0 && (
                      <div className="hint" style={{ marginTop: 2 }}>Held: {inr(r.advanceBalance)}</div>
                    )}
                  </td>
                  {showSavings && (
                    <td>
                      <input
                        className="input"
                        style={{ width: 90, padding: '7px 10px' }}
                        type="number"
                        min="0"
                        value={savingsInputs[r.loanId] ?? String(savings)}
                        onChange={(e) => setSavingsInputs((a) => ({ ...a, [r.loanId]: e.target.value }))}
                      />
                    </td>
                  )}
                  <td style={{ fontWeight: 600 }}>{inr(rowTotal(r))}</td>
                  <td>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={busyLoanId === r.loanId}
                      onClick={() => onCollect(r)}
                    >
                      {busyLoanId === r.loanId ? <span className="spinner" /> : 'Collect'}
                    </button>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(`${base}/loans/${r.loanId}/statement`)}>
                      View ledger
                    </button>
                  </td>
                </tr>
              ))}
              {rows && rows.length === 0 && (
                <tr><td colSpan={cols} className="empty">Nothing pending for this center. All caught up!</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {!centerId && <div className="panel"><div className="panel-body"><div className="empty">Select a center to see who owes money today.</div></div></div>}
    </>
  );
}
