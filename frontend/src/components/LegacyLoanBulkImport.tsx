import { useRef, useState } from 'react';
import { BulkLegacyLoanResult, BulkLegacyLoanRow, bulkImportLegacyLoans } from '../api/loans';
import { downloadXlsx, readXlsxFile } from '../lib/xlsx';

const normKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
const KEYS = {
  clientDisplayId: ['clientid', 'clientdisplayid'],
  memberName: ['membername', 'name'],
  mobile: ['mobile', 'mobilenumber', 'mobno'],
  productName: ['loanproduct', 'product'],
  loanAmount: ['loanamount', 'amount'],
  disbursalDate: ['disburseddate', 'disbursaldate', 'disbdate'],
  dueAmount: ['dueamount', 'emi', 'emiamt'],
  dueStartDate: ['duestartdate', 'firstemidate'],
  dueEndDate: ['dueenddate', 'lastemidate'],
  totalDues: ['totalnoofdues', 'totaldues', 'totemi', 'noofdues'],
  duesPaid: ['noofduespaid', 'duespaid', 'paid'],
};

const asNum = (v: string) => (v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
/** Accept dd.mm.yyyy / dd-mm-yyyy / dd/mm/yyyy as well as ISO. */
function toIso(v: string): string {
  const s = v.trim();
  if (!s) return '';
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
}

/** Bulk import of pre-existing loans from Excel — matched to members by Client ID
 *  and to products by name; explicit amounts + a "dues paid" count reconstruct
 *  each loan's state (open with the right balance, or closed if fully paid). */
export function LegacyLoanBulkImport({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BulkLegacyLoanResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    setError('');
    downloadXlsx(
      'legacy-loans-import-template.xlsx',
      [
        {
          'Client ID': '5.29.1.1', 'Member Name': 'SAMPLE MEMBER', 'Mobile Number': '9000000000',
          'Loan Product': '30000 LOAN 40 DUE', 'Loan Amount': 30000, 'Disbursed Date': '2026-03-18',
          'Due Amount': 930, 'Due Start Date': '2026-03-25', 'Due End Date': '2026-12-16',
          'Total No of Dues': 40, 'No. of Dues Paid': 12,
        },
      ],
      'Loans',
    ).catch((e) => setError(e instanceof Error ? `Could not download the template: ${e.message}` : 'Could not download the template'));
  }

  function parseRows(raw: Record<string, unknown>[]): { rows: BulkLegacyLoanRow[]; skipped: number } {
    const rows: BulkLegacyLoanRow[] = [];
    let skipped = 0;
    for (const r of raw) {
      const entries = Object.entries(r).map(([k, v]) => [normKey(k), String(v ?? '').trim()] as const);
      const get = (keys: string[]) => entries.find(([k]) => keys.includes(k))?.[1] ?? '';

      const clientDisplayId = get(KEYS.clientDisplayId);
      const productName = get(KEYS.productName);
      const loanAmount = asNum(get(KEYS.loanAmount));
      const totalDues = asNum(get(KEYS.totalDues));
      const duesPaid = asNum(get(KEYS.duesPaid));
      if (!clientDisplayId || !productName || loanAmount === undefined || totalDues === undefined || duesPaid === undefined) {
        skipped += 1; continue;
      }
      rows.push({
        clientDisplayId,
        memberName: get(KEYS.memberName) || undefined,
        mobile: get(KEYS.mobile) || undefined,
        productName,
        loanAmount,
        disbursalDate: toIso(get(KEYS.disbursalDate)),
        dueAmount: asNum(get(KEYS.dueAmount)),
        dueStartDate: toIso(get(KEYS.dueStartDate)),
        dueEndDate: toIso(get(KEYS.dueEndDate)) || undefined,
        totalDues,
        duesPaid,
      });
    }
    return { rows, skipped };
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setError(''); setResult(null); setBusy(true);
    try {
      const raw = await readXlsxFile(file);
      const { rows, skipped } = parseRows(raw);
      if (rows.length === 0) { setError('No valid rows — each needs Client ID, Loan Product, Loan Amount, Total Dues and Dues Paid.'); return; }
      const res = await bulkImportLegacyLoans(rows);
      setResult({
        ...res,
        results: [...res.results, ...(skipped ? [{ row: 0, clientDisplayId: `${skipped} skipped`, status: 'ERROR' as const, message: 'Missing required column(s)', loanAccount: null }] : [])],
      });
      onDone();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-card" style={{ maxWidth: 'none', marginBottom: 18 }}>
      <div className="form-section-title">Bulk import from Excel</div>
      <p className="hint" style={{ marginTop: 0 }}>
        Upload a sheet of pre-existing loans (Client ID, Member Name, Mobile, Loan Product, Loan Amount, Disbursed Date,
        Due Amount, Due Start/End Date, Total No of Dues, No. of Dues Paid). Members are matched by Client ID and products
        by name; each loan is reconstructed open (with the right balance) or closed if all dues are paid.
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-ghost" onClick={downloadTemplate}>Download template</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onFile} />
        <button className="btn btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? <span className="spinner" /> : 'Import Excel'}
        </button>
      </div>

      {(error || result) && (
        <div className="modal-overlay" onClick={() => { setError(''); setResult(null); }}>
          <div className="modal-card" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3 className="modal-title">Loan import</h3>
            {error && <div className="alert-error">{error}</div>}
            {result && (
              <>
                <p className="modal-message">Imported {result.successCount} loan(s){result.failCount ? `, ${result.failCount} failed` : ''}.</p>
                <div className="table-wrap" style={{ boxShadow: 'none', border: 'none', maxHeight: 340, overflow: 'auto' }}>
                  <table className="data">
                    <thead><tr><th>Row</th><th>Client ID</th><th>Status</th><th>Detail</th></tr></thead>
                    <tbody>
                      {result.results.map((r, i) => (
                        <tr key={i}>
                          <td>{r.row || '—'}</td>
                          <td className="mono">{r.clientDisplayId}</td>
                          <td><span className={`badge ${r.status === 'OK' ? 'active' : 'inactive'}`}>{r.status}</span></td>
                          <td>{r.status === 'OK' ? r.loanAccount : r.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => { setError(''); setResult(null); }} autoFocus>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
