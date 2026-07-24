import { useEffect, useMemo, useRef, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { SearchableSelect } from '../../components/SearchableSelect';
import { LegacyLoanBulkImport } from '../../components/LegacyLoanBulkImport';
import { useConfirm } from '../../components/ConfirmProvider';
import { listMembers, MemberListItem } from '../../api/members';
import { Frequency, LoanProductLite, importLegacyLoan, listFrequencies, listLoanProducts } from '../../api/loans';
import { getSettings } from '../../api/settings';
import { downloadXlsx, readXlsxFile } from '../../lib/xlsx';

const inr = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
const round2 = (n: number) => Math.round(n * 100) / 100;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-IN');

const normKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
const DUE_NO_KEYS = ['dueno', 'no', 'installment', 'installmentno', 'sno', 'slno'];
const COLLECTED_KEYS = ['collected', 'amount', 'amt', 'paid'];
const SAVINGS_KEYS = ['savings', 'saving'];

interface PreviewRow {
  dueNo: number;
  dueDate: string; // ISO
  dueAmt: number;
}

/** Same flat-interest even split as the backend's generateSchedule — used ONLY
 *  to preview due dates/amounts while entering history. The backend recomputes
 *  the authoritative schedule on submit and only trusts dueNo/collected/savings. */
function previewSchedule(p: {
  loanAmount: number;
  interestAmount: number;
  totalDues: number;
  daysBetween: number;
  dueStartDate: string;
}): PreviewRow[] {
  const pri = round2(p.loanAmount / p.totalDues);
  const int = round2(p.interestAmount / p.totalDues);
  const start = new Date(p.dueStartDate);
  const rows: PreviewRow[] = [];
  for (let dueNo = 1; dueNo <= p.totalDues; dueNo++) {
    const isLast = dueNo === p.totalDues;
    const duePri = isLast ? round2(p.loanAmount - pri * (p.totalDues - 1)) : pri;
    const dueInt = isLast ? round2(p.interestAmount - int * (p.totalDues - 1)) : int;
    const d = new Date(start);
    d.setDate(d.getDate() + p.daysBetween * (dueNo - 1));
    rows.push({ dueNo, dueDate: iso(d), dueAmt: round2(duePri + dueInt) });
  }
  return rows;
}

export function ImportLegacyLoanPage() {
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<MemberListItem[]>([]);
  const [client, setClient] = useState<MemberListItem | null>(null);
  const [products, setProducts] = useState<LoanProductLite[]>([]);
  const [frequencies, setFrequencies] = useState<Frequency[]>([]);
  const [productId, setProductId] = useState('');
  const [disbursalDate, setDisbursalDate] = useState('');
  const [dueStartDate, setDueStartDate] = useState('');
  const [collected, setCollected] = useState<Record<number, string>>({});
  const [savings, setSavings] = useState<Record<number, string>>({});
  const [paidCount, setPaidCount] = useState('');
  const [quickSavings, setQuickSavings] = useState('');
  const [busy, setBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listLoanProducts().then(setProducts).catch((e) => setError(e.message));
    listFrequencies().then(setFrequencies).catch(() => {});
    getSettings().then((s) => setQuickSavings(String(s.savingsPerCollection))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!q.trim() || client) { setResults([]); return; }
    const t = setTimeout(() => {
      listMembers({ q: q.trim() }).then(setResults).catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q, client]);

  const product = products.find((p) => p.id === productId);
  const daysBetween = frequencies.find((f) => f.id === product?.frequencyId)?.daysBetween;

  const schedule = useMemo<PreviewRow[]>(() => {
    if (!product || !dueStartDate || !daysBetween) return [];
    return previewSchedule({
      loanAmount: Number(product.loanAmount),
      interestAmount: Number(product.interestAmount),
      totalDues: product.totalDues,
      daysBetween,
      dueStartDate,
    });
  }, [product, dueStartDate, daysBetween]);

  const collectedOf = (dueNo: number, dueAmt: number) => Math.min(Number(collected[dueNo]) || 0, dueAmt);
  const savingsOf = (dueNo: number) => Number(savings[dueNo]) || 0;

  const totals = useMemo(() => {
    let coll = 0, sav = 0, due = 0;
    for (const r of schedule) {
      coll += collectedOf(r.dueNo, r.dueAmt);
      sav += savingsOf(r.dueNo);
      due += r.dueAmt;
    }
    return { coll: round2(coll), sav: round2(sav), due: round2(due), remaining: round2(due - coll) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, collected, savings]);

  function pickClient(m: MemberListItem) {
    setClient(m);
    setResults([]);
    setQ(m.name);
  }

  function resetClient() {
    setClient(null);
    setQ('');
  }

  /** Seed the first N installments as fully paid (due amount + the entered savings). */
  function fillPaid() {
    const n = Math.max(0, Math.min(Number(paidCount) || 0, schedule.length));
    const sav = Math.max(0, Number(quickSavings) || 0);
    const nextColl: Record<number, string> = {};
    const nextSav: Record<number, string> = {};
    for (const r of schedule) {
      if (r.dueNo <= n) {
        nextColl[r.dueNo] = String(r.dueAmt);
        if (sav > 0) nextSav[r.dueNo] = String(sav);
      }
    }
    setCollected(nextColl);
    setSavings(nextSav);
  }

  /** A blank sample — not this loan's real schedule. Fill in the real
   *  Collected/Savings for each installment (matched by Due No), then upload. */
  async function downloadTemplate() {
    setError('');
    try {
      await downloadXlsx(
        'legacy-loan-import-template.xlsx',
        [
          { 'Due No': 1, 'Due Date': '', 'Due Amount': '', Collected: 500, Savings: 100 },
          { 'Due No': 2, 'Due Date': '', 'Due Amount': '', Collected: 500, Savings: 100 },
          { 'Due No': 3, 'Due Date': '', 'Due Amount': '', Collected: '', Savings: '' },
        ],
        'History',
      );
    } catch (e) {
      setError(e instanceof Error ? `Could not download the template: ${e.message}` : 'Could not download the template');
    }
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    setError(''); setSuccess(''); setImportBusy(true);
    try {
      const raw = await readXlsxFile(file);
      const nextColl: Record<number, string> = {};
      const nextSav: Record<number, string> = {};
      let matched = 0;
      for (const row of raw) {
        const entries = Object.entries(row).map(([k, v]) => [normKey(k), v] as const);
        const get = (keys: string[]) => entries.find(([k]) => keys.includes(k))?.[1];
        const dueNoRaw = get(DUE_NO_KEYS);
        const dueNo = Number(dueNoRaw);
        if (dueNoRaw === undefined || dueNoRaw === '' || !Number.isFinite(dueNo) || dueNo < 1) continue;
        const collectedRaw = get(COLLECTED_KEYS);
        const savingsRaw = get(SAVINGS_KEYS);
        if (collectedRaw !== undefined && collectedRaw !== '') nextColl[dueNo] = String(collectedRaw);
        if (savingsRaw !== undefined && savingsRaw !== '') nextSav[dueNo] = String(savingsRaw);
        matched += 1;
      }
      if (matched === 0) {
        setError('No valid rows found — check the file has a "Due No" column matching the downloaded template.');
        return;
      }
      setCollected((c) => ({ ...c, ...nextColl }));
      setSavings((s) => ({ ...s, ...nextSav }));
      setSuccess(`Loaded ${matched} row(s) from the file — review the table below, then Import loan.`);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Could not read that file');
    } finally {
      setImportBusy(false);
    }
  }

  async function submit() {
    if (!client || !product || !disbursalDate || !dueStartDate) return;
    if (totals.coll <= 0) { setError('Enter at least one collected installment'); return; }
    if (totals.remaining <= 0) { setError('This loan is fully repaid — the import screen is only for loans still open.'); return; }
    const ok = await confirm({
      title: 'Import this legacy loan?',
      message:
        `Create an OPEN loan for ${client.name} (${client.displayId}) on product "${product.name}", ` +
        `back-dated to ${fmtDate(disbursalDate)}, with ${inr(totals.coll)} already collected` +
        (totals.sav > 0 ? ` and ${inr(totals.sav)} savings` : '') +
        `. Remaining balance ${inr(totals.remaining)}. This records historical collections — proceed?`,
      confirmLabel: 'Import loan',
    });
    if (!ok) return;
    setError(''); setSuccess(''); setBusy(true);
    try {
      const rows = schedule
        .map((r) => ({ dueNo: r.dueNo, collected: collectedOf(r.dueNo, r.dueAmt), savings: savingsOf(r.dueNo) }))
        .filter((r) => r.collected > 0 || r.savings > 0);
      const res = await importLegacyLoan({ clientId: client.id, productId, disbursalDate, dueStartDate, rows });
      setSuccess(
        `Imported loan ${res.loanAccount} — ${inr(res.totalCollected)} collected` +
          (res.totalSavings > 0 ? `, ${inr(res.totalSavings)} savings` : '') +
          `, ${inr(res.remainingBalance)} still outstanding.`,
      );
      // Clear the form for the next loan.
      resetClient();
      setProductId(''); setDisbursalDate(''); setDueStartDate('');
      setCollected({}); setSavings({}); setPaidCount('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminLayout>
      <h1 className="page-title">Import Legacy Loan</h1>
      <p className="page-sub">
        Bring loans members took before this system existed into the app. Import many at once from Excel below, or add a
        single loan with full per-installment history using the form underneath.
      </p>

      <LegacyLoanBulkImport onDone={resetClient} />

      <div className="form-section-title" style={{ marginBottom: 12 }}>Or add one loan manually</div>

      {error && <div className="alert-error">{error}</div>}
      {success && (
        <div className="alert-error" style={{ background: '#e3f5ee', color: '#157a5b', borderColor: '#bfe6d7' }}>
          {success}
        </div>
      )}

      <div className="form-card" style={{ maxWidth: 'none', marginBottom: 18 }}>
        <div className="form-section-title">1. Member</div>
        {!client ? (
          <div className="field" style={{ maxWidth: 420 }}>
            <label>Search by name, client ID, or mobile</label>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Kaleeswari, ASVLN005392, 98765..." />
            {results.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 10, boxShadow: 'none' }}>
                <table className="data">
                  <tbody>
                    {results.map((m) => (
                      <tr key={m.id} onClick={() => pickClient(m)}>
                        <td className="mono">{m.displayId}</td>
                        <td>{m.name}</td>
                        <td>{m.centerCode} — {m.centerName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="detail-grid">
            <div className="detail-item"><div className="k">Member</div><div className="v">{client.name}</div></div>
            <div className="detail-item"><div className="k">Client ID</div><div className="v mono">{client.displayId}</div></div>
            <div className="detail-item"><div className="k">Center</div><div className="v">{client.centerCode} — {client.centerName}</div></div>
            <div className="detail-item"><div className="k"> </div><div className="v"><button className="btn btn-ghost btn-sm" onClick={resetClient}>Change</button></div></div>
          </div>
        )}
      </div>

      {client && (
        <div className="form-card" style={{ maxWidth: 'none', marginBottom: 18 }}>
          <div className="form-section-title">2. Loan terms</div>
          <div className="form-grid">
            <div className="field">
              <label>Loan product *</label>
              <SearchableSelect
                options={products.map((p) => ({ id: p.id, label: `${p.name} · ${inr(Number(p.loanAmount))} · ${p.totalDues} dues` }))}
                value={productId}
                onChange={(id) => { setProductId(id); setCollected({}); setSavings({}); setPaidCount(''); }}
                placeholder="Select product…"
              />
            </div>
            <div className="field">
              <label>Disbursal date * (original)</label>
              <input type="date" className="input" max={iso(new Date())} value={disbursalDate} onChange={(e) => setDisbursalDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Due start date * (first installment)</label>
              <input type="date" className="input" value={dueStartDate} onChange={(e) => setDueStartDate(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {schedule.length > 0 && (
        <div className="panel">
          <div className="panel-head">3. Repayment history — {product?.name} ({schedule.length} installments)</div>
          <div className="panel-body">
            <div className="form-card no-print" style={{ maxWidth: 'none', marginBottom: 14, padding: 14 }}>
              <div className="form-grid" style={{ alignItems: 'flex-end' }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Quick fill — installments fully paid so far</label>
                  <input type="number" className="input" min="0" max={schedule.length} value={paidCount} onChange={(e) => setPaidCount(e.target.value)} placeholder="e.g. 20" />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Savings per installment</label>
                  <input type="number" className="input" min="0" value={quickSavings} onChange={(e) => setQuickSavings(e.target.value)} placeholder="0" />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <button className="btn btn-ghost" onClick={fillPaid}>Fill as paid</button>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <button className="btn btn-ghost" onClick={downloadTemplate}>Download template</button>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onImportFile} />
                  <button className="btn btn-primary" disabled={importBusy} onClick={() => fileInputRef.current?.click()}>
                    {importBusy ? <span className="spinner" /> : 'Import Excel'}
                  </button>
                </div>
              </div>
              <div className="hint" style={{ marginTop: 8 }}>
                Seeds the first N rows as fully paid, plus the entered savings each — or download the template, fill
                in the real Collected/Savings for each installment offline, and re-upload. Either way, review and edit any row below before importing.
              </div>
            </div>

            <div className="cards" style={{ marginBottom: 14 }}>
              <SummaryCard label="Total due" value={inr(totals.due)} />
              <SummaryCard label="Collected (entered)" value={inr(totals.coll)} />
              <SummaryCard label="Savings (entered)" value={inr(totals.sav)} />
              <SummaryCard label="Remaining balance" value={inr(totals.remaining)} />
            </div>

            <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
              <table className="data">
                <thead>
                  <tr><th>#</th><th>Due date</th><th>Due amount</th><th>Collected</th><th>Savings</th><th>Balance</th></tr>
                </thead>
                <tbody>
                  {schedule.map((r) => {
                    const coll = collectedOf(r.dueNo, r.dueAmt);
                    return (
                      <tr key={r.dueNo}>
                        <td>{r.dueNo}</td>
                        <td>{fmtDate(r.dueDate)}</td>
                        <td>{inr(r.dueAmt)}</td>
                        <td>
                          <input
                            className="input" style={{ width: 110, padding: '6px 9px' }} type="number" min="0" max={r.dueAmt} placeholder="0"
                            value={collected[r.dueNo] ?? ''}
                            onChange={(e) => setCollected((c) => ({ ...c, [r.dueNo]: e.target.value }))}
                          />
                        </td>
                        <td>
                          <input
                            className="input" style={{ width: 90, padding: '6px 9px' }} type="number" min="0" placeholder="0"
                            value={savings[r.dueNo] ?? ''}
                            onChange={(e) => setSavings((s) => ({ ...s, [r.dueNo]: e.target.value }))}
                          />
                        </td>
                        <td>{inr(round2(r.dueAmt - coll))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="form-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-primary" disabled={busy || totals.coll <= 0 || totals.remaining <= 0} onClick={submit}>
                {busy ? <span className="spinner" /> : 'Import loan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card"><div><div className="card-label">{label}</div><div className="card-value">{value}</div></div></div>
  );
}
