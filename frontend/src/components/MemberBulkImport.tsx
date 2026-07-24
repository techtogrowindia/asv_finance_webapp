import { useEffect, useRef, useState } from 'react';
import { BulkMemberResult, BulkMemberRow, bulkImportMembers } from '../api/members';
import { DocumentTypeRow, listDocumentTypes } from '../api/masters';
import { downloadXlsx, readXlsxFile } from '../lib/xlsx';

const normKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

// Fixed member columns (normalized header → row field).
const FIXED: Record<string, keyof BulkMemberRow | 'nomineeName' | 'nomineeRelation' | 'nomineeMobile'> = {
  centercode: 'centerCode',
  groupno: 'groupNo',
  name: 'name',
  mobile: 'mobile',
  dob: 'dob',
  gender: 'gender',
  fathername: 'fatherName',
  address: 'presentAddress',
  presentaddress: 'presentAddress',
  pincode: 'pincode',
  district: 'district',
  state: 'state',
  monthlyincome: 'monthlyIncome',
  monthlyexpense: 'monthlyExpense',
  nomineename: 'nomineeName',
  nomineerelation: 'nomineeRelation',
  nomineemobile: 'nomineeMobile',
};

const nomineeHeader = (dt: DocumentTypeRow) => (dt.appliesTo === 'NOMINEE' ? dt.name : `Nominee ${dt.name}`);

/** Bulk member import — template columns (and their mapping back) are driven by
 *  the admin DocumentType masters (Settings), so the sheet always matches the
 *  tenant's configured ID proofs. Mandatory ones are enforced server-side. */
export function MemberBulkImport({ onDone }: { onDone: () => void }) {
  const [docTypes, setDocTypes] = useState<DocumentTypeRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BulkMemberResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listDocumentTypes().then(setDocTypes).catch((e) => setError(e.message));
  }, []);

  const clientKyc = docTypes.filter((d) => d.requiresNumber && (d.appliesTo === 'CLIENT' || d.appliesTo === 'BOTH'));
  const nomineeKyc = docTypes.filter((d) => d.requiresNumber && (d.appliesTo === 'NOMINEE' || d.appliesTo === 'BOTH'));

  function downloadTemplate() {
    setError('');
    const sample: Record<string, unknown> = {
      'Center Code': '029',
      'Group No': 1,
      Name: 'SAMPLE MEMBER',
      Mobile: '9000000000',
      DOB: '1990-01-31',
      Gender: 'F',
      'Father Name': '',
      Address: '',
      Pincode: '',
      District: '',
      State: '',
      'Monthly Income': '',
      'Monthly Expense': '',
    };
    for (const d of clientKyc) sample[d.name] = '';
    sample['Nominee Name'] = 'SAMPLE NOMINEE';
    sample['Nominee Relation'] = 'SPOUSE';
    sample['Nominee Mobile'] = '';
    for (const d of nomineeKyc) sample[nomineeHeader(d)] = '';
    downloadXlsx('member-import-template.xlsx', [sample], 'Members').catch((e) =>
      setError(e instanceof Error ? `Could not download the template: ${e.message}` : 'Could not download the template'),
    );
  }

  function parseRows(raw: Record<string, unknown>[]): { rows: BulkMemberRow[]; skipped: number } {
    // Build normalized header → target maps from the current doc types.
    const clientMap = new Map(clientKyc.map((d) => [normKey(d.name), d.id]));
    const nomineeMap = new Map(nomineeKyc.map((d) => [normKey(nomineeHeader(d)), d.id]));

    const rows: BulkMemberRow[] = [];
    let skipped = 0;
    for (const r of raw) {
      const entries = Object.entries(r).map(([k, v]) => [normKey(k), String(v ?? '').trim()] as const);
      const get = (nk: string) => entries.find(([k]) => k === nk)?.[1] ?? '';

      const centerCode = get('centercode');
      const name = get('name');
      const groupNo = Number(get('groupno'));
      if (!centerCode || !name || !Number.isFinite(groupNo) || groupNo < 1) { skipped += 1; continue; }

      const row: BulkMemberRow = { centerCode, groupNo, name };
      const rowRec = row as unknown as Record<string, unknown>;
      for (const [nk, field] of Object.entries(FIXED)) {
        if (['centercode', 'groupno', 'name', 'nomineename', 'nomineerelation', 'nomineemobile'].includes(nk)) continue;
        const val = get(nk);
        if (val) rowRec[field] = val;
      }

      const kyc: { documentTypeId: string; value: string }[] = [];
      for (const [nk, value] of entries) {
        const id = clientMap.get(nk);
        if (id && value) kyc.push({ documentTypeId: id, value });
      }
      if (kyc.length) row.kycNumbers = kyc;

      const nomName = get('nomineename');
      if (nomName) {
        const nomKyc: { documentTypeId: string; value: string }[] = [];
        for (const [nk, value] of entries) {
          const id = nomineeMap.get(nk);
          if (id && value) nomKyc.push({ documentTypeId: id, value });
        }
        row.nominee = {
          name: nomName,
          relation: get('nomineerelation') || undefined,
          mobile: get('nomineemobile') || undefined,
          ...(nomKyc.length ? { kycNumbers: nomKyc } : {}),
        };
      }
      rows.push(row);
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
      if (rows.length === 0) { setError('No valid rows found — each row needs at least Center Code, Group No and Name.'); return; }
      const res = await bulkImportMembers(rows);
      setResult({ ...res, results: [...res.results, ...(skipped ? [{ row: 0, name: `${skipped} blank/invalid row(s)`, centerCode: '', status: 'ERROR' as const, message: 'Skipped (missing Center Code / Group No / Name)', displayId: null }] : [])] });
      onDone();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn btn-ghost" onClick={downloadTemplate}>Download template</button>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onFile} />
      <button className="btn btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? <span className="spinner" /> : 'Import Excel'}
      </button>

      {(error || result) && (
        <div className="modal-overlay" onClick={() => { setError(''); setResult(null); }}>
          <div className="modal-card" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3 className="modal-title">Member import</h3>
            {error && <div className="alert-error">{error}</div>}
            {result && (
              <>
                <p className="modal-message">
                  Imported {result.successCount} member(s){result.failCount ? `, ${result.failCount} failed` : ''}.
                </p>
                <div className="table-wrap" style={{ boxShadow: 'none', border: 'none', maxHeight: 340, overflow: 'auto' }}>
                  <table className="data">
                    <thead><tr><th>Row</th><th>Name</th><th>Center</th><th>Status</th><th>Detail</th></tr></thead>
                    <tbody>
                      {result.results.map((r, i) => (
                        <tr key={i}>
                          <td>{r.row || '—'}</td>
                          <td>{r.name}</td>
                          <td>{r.centerCode || '—'}</td>
                          <td><span className={`badge ${r.status === 'OK' ? 'active' : 'inactive'}`}>{r.status}</span></td>
                          <td>{r.status === 'OK' ? r.displayId : r.message}</td>
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
    </>
  );
}
