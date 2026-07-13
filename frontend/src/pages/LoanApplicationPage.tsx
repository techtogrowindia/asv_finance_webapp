import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CenterLite, getMember, listCenters, listMembers, MemberDetail, MemberListItem } from '../api/members';
import { SearchableSelect } from '../components/SearchableSelect';
import {
  createLoanApplication,
  Eligibility,
  ExistingLoan,
  Frequency,
  getEligibility,
  listExistingLoans,
  listFrequencies,
  listLoanProducts,
  listPurposes,
  LoanProductLite,
  Purpose,
} from '../api/loans';

const inr = (v: string | number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));
const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

export function LoanApplicationPage() {
  const navigate = useNavigate();
  const [centers, setCenters] = useState<CenterLite[]>([]);
  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [frequencies, setFrequencies] = useState<Frequency[]>([]);
  const [products, setProducts] = useState<LoanProductLite[]>([]);
  const [purposes, setPurposes] = useState<Purpose[]>([]);

  const [centerId, setCenterId] = useState('');
  const [clientId, setClientId] = useState('');
  const [frequencyId, setFrequencyId] = useState('');
  const [productId, setProductId] = useState('');
  const [purposeQuery, setPurposeQuery] = useState('');

  const [client, setClient] = useState<MemberDetail | null>(null);
  const [existingLoans, setExistingLoans] = useState<ExistingLoan[] | null>(null);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listCenters().then(setCenters).catch((e) => setError(e.message));
    listFrequencies().then(setFrequencies).catch((e) => setError(e.message));
    listLoanProducts().then(setProducts).catch((e) => setError(e.message));
    listPurposes().then(setPurposes).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!centerId) {
      setMembers([]);
      return;
    }
    listMembers({ centerId }).then(setMembers).catch((e) => setError(e.message));
  }, [centerId]);

  useEffect(() => {
    if (!clientId) {
      setClient(null);
      setExistingLoans(null);
      return;
    }
    getMember(clientId).then(setClient).catch((e) => setError(e.message));
    listExistingLoans(clientId).then(setExistingLoans).catch((e) => setError(e.message));
  }, [clientId]);

  useEffect(() => {
    if (!clientId || !productId) {
      setEligibility(null);
      return;
    }
    getEligibility(clientId, productId).then(setEligibility).catch((e) => setError(e.message));
  }, [clientId, productId]);

  const productsForFrequency = useMemo(
    () => (frequencyId ? products.filter((p) => p.frequencyId === frequencyId) : products),
    [products, frequencyId],
  );
  const selectedProduct = products.find((p) => p.id === productId) ?? null;

  async function onSave() {
    if (!clientId || !productId) return;
    setError('');
    setSuccess('');

    const purpose = purposes.find((p) => p.name.toLowerCase() === purposeQuery.trim().toLowerCase());
    if (!purpose) {
      setError('Select a valid purpose from the list');
      return;
    }

    setBusy(true);
    try {
      await createLoanApplication({ clientId, productId, purposeId: purpose.id });
      setSuccess('Loan application submitted for verification.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit application');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="page-title">Loan Application</h1>
      <p className="page-sub">Apply for a new loan on behalf of a member.</p>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-error" style={{ background: '#e3f5ee', color: '#157a5b', borderColor: '#bfe6d7' }}>{success}</div>}

      <div className="form-card" style={{ maxWidth: 'none' }}>
        <div className="form-grid">
          <Field label="Center *">
            <select className="input" value={centerId} onChange={(e) => { setCenterId(e.target.value); setClientId(''); }}>
              <option value="">Select center</option>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Client *">
            <select className="input" value={clientId} disabled={!centerId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Select member</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.displayId} — {m.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Frequency">
            <select className="input" value={frequencyId} onChange={(e) => { setFrequencyId(e.target.value); setProductId(''); }}>
              <option value="">All</option>
              {frequencies.map((f) => (
                <option key={f.id} value={f.id}>{f.code}</option>
              ))}
            </select>
          </Field>
          <Field label="Loan Product *">
            <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Select product</option>
              {productsForFrequency.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Purpose *">
            <SearchableSelect
              options={purposes.map((p) => ({ id: p.id, label: p.name }))}
              value={purposeQuery}
              onChange={setPurposeQuery}
              onSelect={() => {}}
              placeholder="Type to search…"
            />
          </Field>
        </div>
        <div className="hint">
          Sanctioned Amount:{' '}
          <strong style={{ color: 'var(--ink-900)' }}>
            {eligibility ? inr(eligibility.sanctionedAmount) : '0'}
          </strong>
        </div>
      </div>

      {client && (
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="panel-head">KYC Details</div>
          <div className="panel-body detail-grid">
            <Item k="Client Phone" v={client.mobile ?? '—'} />
            {client.kycNumbers
              .filter((n) => n.party === 'CLIENT')
              .map((n) => (
                <Item key={n.documentTypeId} k={`Client ${n.name}`} v={n.value} />
              ))}
            {client.coApplicant && (
              <>
                <Item k="Nominee Phone" v={client.coApplicant.mobile ?? '—'} />
                {client.kycNumbers
                  .filter((n) => n.party === 'NOMINEE')
                  .map((n) => (
                    <Item key={n.documentTypeId} k={`Nominee ${n.name}`} v={n.value} />
                  ))}
              </>
            )}
          </div>
        </div>
      )}

      {existingLoans && (
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="panel-head">Existing Loan Details</div>
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Disb. Date</th><th>Loan A/c</th><th>Loan Amt</th><th>Total Dues</th>
                  <th>Comp. Dues</th><th>Coll. Dues</th><th>Due Start</th><th>Maturity</th>
                  <th>Closed</th><th>Pri. Balance</th><th>Int. Balance</th>
                  <th>Closing Arr. Pri</th><th>Closing Arr. Int</th>
                </tr>
              </thead>
              <tbody>
                {existingLoans.map((l) => (
                  <tr key={l.id}>
                    <td>{date(l.disbursalDate)}</td>
                    <td className="mono">{l.loanAccount}</td>
                    <td>{inr(l.loanAmount)}</td>
                    <td>{l.totalDues}</td>
                    <td>{l.compDues}</td>
                    <td>{l.collDues}</td>
                    <td>{date(l.dueStartDate)}</td>
                    <td>{date(l.maturityDate)}</td>
                    <td>{date(l.closedDate)}</td>
                    <td>{inr(l.priBalance)}</td>
                    <td>{inr(l.intBalance)}</td>
                    <td>{inr(l.closingArrPri)}</td>
                    <td>{inr(l.closingArrInt)}</td>
                  </tr>
                ))}
                {existingLoans.length === 0 && (
                  <tr><td colSpan={13} className="empty">No existing loans for this member.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedProduct && (
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="panel-head">Product Details</div>
          <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
            <table className="data">
              <thead>
                <tr><th>Product Name</th><th>Frequency</th><th>Loan Amt</th><th>Total Dues</th><th>Int. Amt</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>{selectedProduct.name}</td>
                  <td>{selectedProduct.frequencyCode}</td>
                  <td>{inr(selectedProduct.loanAmount)}</td>
                  <td>{selectedProduct.totalDues}</td>
                  <td>{inr(selectedProduct.interestAmount)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {eligibility && eligibility.warnings.length > 0 && (
        <div className="warning-box" style={{ marginTop: 18 }}>
          <div className="title">Please review before sanctioning</div>
          <ul>
            {eligibility.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="form-actions">
        <button className="btn btn-primary" disabled={!clientId || !productId || busy} onClick={onSave}>
          {busy ? <span className="spinner" /> : 'Save'}
        </button>
        <button className="btn btn-ghost" type="button" onClick={() => navigate('/app')}>
          Cancel
        </button>
      </div>
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

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div className="detail-item">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}
