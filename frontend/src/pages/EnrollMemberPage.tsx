import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CenterLite,
  createMember,
  CreateMemberBody,
  GroupLite,
  listCenters,
  listGroups,
} from '../api/members';
import { DocumentTypeRow, listDocumentTypes } from '../api/masters';
import { LoanProductLite, listLoanProducts, listPurposes, Purpose } from '../api/loans';
import { getSettings } from '../api/settings';
import { SearchableSelect } from '../components/SearchableSelect';

const GENDERS = ['Female', 'Male', 'Other'];
const RELATIONS = ['Husband', 'Father', 'Son', 'Brother', 'Mother', 'Other'];

export function EnrollMemberPage() {
  const navigate = useNavigate();
  const [centers, setCenters] = useState<CenterLite[]>([]);
  const [groups, setGroups] = useState<GroupLite[]>([]);
  const [docTypes, setDocTypes] = useState<DocumentTypeRow[]>([]);
  const [products, setProducts] = useState<LoanProductLite[]>([]);
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [productRequired, setProductRequired] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    centerId: '',
    groupNo: '',
    name: '',
    dob: '',
    gender: '',
    mobile: '',
    presentAddress: '',
    pincode: '',
    district: '',
    state: '',
    monthlyIncome: '',
    monthlyExpense: '',
    fatherName: '',
    productId: '',
    purposeId: '',
    coName: '',
    coGender: '',
    coDob: '',
    coRelation: '',
    coMobile: '',
  });

  // Dynamic ID-number values, keyed by DocumentType id (admin-managed).
  const [clientNumbers, setClientNumbers] = useState<Record<string, string>>({});
  const [nomineeNumbers, setNomineeNumbers] = useState<Record<string, string>>({});

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    listCenters().then(setCenters).catch((e) => setError(e.message));
    listDocumentTypes().then(setDocTypes).catch((e) => setError(e.message));
    listLoanProducts().then(setProducts).catch((e) => setError(e.message));
    listPurposes().then(setPurposes).catch((e) => setError(e.message));
    getSettings().then((s) => setProductRequired(s.requireLoanProductAtEnrollment)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.centerId) {
      setGroups([]);
      return;
    }
    listGroups(form.centerId).then(setGroups).catch((e) => setError(e.message));
  }, [form.centerId]);

  const clientTypes = useMemo(
    () => docTypes.filter((t) => t.requiresNumber && (t.appliesTo === 'CLIENT' || t.appliesTo === 'BOTH')),
    [docTypes],
  );
  const nomineeTypes = useMemo(
    () => docTypes.filter((t) => t.requiresNumber && (t.appliesTo === 'NOMINEE' || t.appliesTo === 'BOTH')),
    [docTypes],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const purposeId = form.purposeId || undefined;
    if (productRequired && (!form.productId || !purposeId)) {
      setError('Loan product and purpose are both required to enroll this member');
      return;
    }

    setBusy(true);
    try {
      const body: CreateMemberBody = {
        centerId: form.centerId,
        groupNo: Number(form.groupNo),
        name: form.name.trim(),
        dob: form.dob || undefined,
        gender: form.gender || undefined,
        mobile: form.mobile || undefined,
        presentAddress: form.presentAddress || undefined,
        pincode: form.pincode || undefined,
        district: form.district || undefined,
        state: form.state || undefined,
        monthlyIncome: form.monthlyIncome ? Number(form.monthlyIncome) : undefined,
        monthlyExpense: form.monthlyExpense ? Number(form.monthlyExpense) : undefined,
        fatherName: form.fatherName || undefined,
        productId: form.productId || undefined,
        purposeId,
        kycNumbers: Object.entries(clientNumbers)
          .filter(([, v]) => v.trim())
          .map(([documentTypeId, value]) => ({ documentTypeId, value: value.trim() })),
        coApplicant: form.coName
          ? {
              name: form.coName.trim(),
              gender: form.coGender || undefined,
              dob: form.coDob || undefined,
              relation: form.coRelation || undefined,
              mobile: form.coMobile || undefined,
              kycNumbers: Object.entries(nomineeNumbers)
                .filter(([, v]) => v.trim())
                .map(([documentTypeId, value]) => ({ documentTypeId, value: value.trim() })),
            }
          : undefined,
      };
      const created = await createMember(body);
      navigate(`/app/clients/${created.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enroll member');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="back-link" onClick={() => navigate('/app/clients')}>
        ← Back to members
      </button>
      <h1 className="page-title">Enroll Member</h1>
      <p className="page-sub">Add a woman to a group within one of your centers.</p>

      {error && <div className="alert-error">{error}</div>}

      <form className="form-card" onSubmit={onSubmit}>
        <div className="form-section-title">Placement</div>
        <div className="form-grid">
          <Field label="Center *">
            <select
              className="input"
              required
              value={form.centerId}
              onChange={(e) => {
                set('centerId', e.target.value);
                set('groupNo', '');
              }}
            >
              <option value="">Select center</option>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Group *">
            <select
              className="input"
              required
              value={form.groupNo}
              disabled={!form.centerId}
              onChange={(e) => set('groupNo', e.target.value)}
            >
              <option value="">Select group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.groupNo} disabled={g.slotsLeft === 0}>
                  Group {g.groupNo} — {g.memberCount}/5 {g.slotsLeft === 0 ? '(full)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Loan product${productRequired ? ' *' : ' (optional)'}`}>
            <select
              className="input"
              required={productRequired}
              value={form.productId}
              onChange={(e) => set('productId', e.target.value)}
            >
              <option value="">{productRequired ? 'Select loan product' : 'None yet'}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Purpose${productRequired ? ' *' : ' (optional)'}`}>
            <SearchableSelect
              options={purposes.map((p) => ({ id: p.id, label: p.name }))}
              value={form.purposeId}
              onChange={(v) => set('purposeId', v)}
              placeholder="Type to search…"
            />
          </Field>
        </div>
        <div className="hint">The formal loan application (with full eligibility checks) is still a separate step later.</div>

        <div className="form-section-title" style={{ marginTop: 20 }}>
          Member details
        </div>
        <div className="form-grid">
          <Field label="Full name *">
            <input className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Date of birth">
            <input type="date" className="input" value={form.dob} onChange={(e) => set('dob', e.target.value)} />
          </Field>
          <Field label="Gender">
            <select className="input" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
              <option value="">Select</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mobile">
            <input className="input" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} />
          </Field>
          <Field label="Father's name">
            <input className="input" value={form.fatherName} onChange={(e) => set('fatherName', e.target.value)} />
          </Field>
        </div>

        <div className="form-section-title" style={{ marginTop: 20 }}>
          Address & livelihood
        </div>
        <div className="form-grid">
          <Field label="Present address">
            <input className="input" value={form.presentAddress} onChange={(e) => set('presentAddress', e.target.value)} />
          </Field>
          <Field label="Pincode">
            <input className="input" value={form.pincode} onChange={(e) => set('pincode', e.target.value)} />
          </Field>
          <Field label="District">
            <input className="input" value={form.district} onChange={(e) => set('district', e.target.value)} />
          </Field>
          <Field label="State">
            <input className="input" value={form.state} onChange={(e) => set('state', e.target.value)} />
          </Field>
          <Field label="Monthly income (₹)">
            <input type="number" min="0" className="input" value={form.monthlyIncome} onChange={(e) => set('monthlyIncome', e.target.value)} />
          </Field>
          <Field label="Monthly expense (₹)">
            <input type="number" min="0" className="input" value={form.monthlyExpense} onChange={(e) => set('monthlyExpense', e.target.value)} />
          </Field>
        </div>

        <div className="form-section-title" style={{ marginTop: 20 }}>
          Government ID proofs (KYC)
        </div>
        <div className="hint">
          These fields are managed by the admin under Masters → Document Types. Masked numbers (like Aadhaar) are hidden everywhere they're shown after saving.
        </div>
        <div className="form-grid">
          {clientTypes.map((t) => (
            <Field label={t.name} key={t.id}>
              <input
                className="input"
                value={clientNumbers[t.id] ?? ''}
                onChange={(e) => setClientNumbers((s) => ({ ...s, [t.id]: e.target.value }))}
              />
            </Field>
          ))}
          {clientTypes.length === 0 && <div className="empty">No ID-number fields configured yet.</div>}
        </div>

        <div className="form-section-title" style={{ marginTop: 20 }}>
          Co-applicant / nominee
        </div>
        <div className="hint">Usually the member's husband or a family nominee.</div>
        <div className="form-grid">
          <Field label="Name">
            <input className="input" value={form.coName} onChange={(e) => set('coName', e.target.value)} />
          </Field>
          <Field label="Relation with member">
            <select className="input" value={form.coRelation} onChange={(e) => set('coRelation', e.target.value)}>
              <option value="">Select</option>
              {RELATIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Gender">
            <select className="input" value={form.coGender} onChange={(e) => set('coGender', e.target.value)}>
              <option value="">Select</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date of birth">
            <input type="date" className="input" value={form.coDob} onChange={(e) => set('coDob', e.target.value)} />
          </Field>
          <Field label="Mobile">
            <input className="input" value={form.coMobile} onChange={(e) => set('coMobile', e.target.value)} />
          </Field>
          {nomineeTypes.map((t) => (
            <Field label={t.name} key={t.id}>
              <input
                className="input"
                value={nomineeNumbers[t.id] ?? ''}
                onChange={(e) => setNomineeNumbers((s) => ({ ...s, [t.id]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
        {!form.coName && (
          <div className="hint">Nominee ID numbers are only saved once a nominee name is entered above.</div>
        )}

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? <span className="spinner" /> : 'Enroll member'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => navigate('/app/clients')}>
            Cancel
          </button>
        </div>
      </form>
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
