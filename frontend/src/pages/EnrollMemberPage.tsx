import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CenterLite,
  createMember,
  CreateMemberBody,
  GroupLite,
  listCenters,
  listGroups,
} from '../api/members';

const GENDERS = ['Female', 'Male', 'Other'];

export function EnrollMemberPage() {
  const navigate = useNavigate();
  const [centers, setCenters] = useState<CenterLite[]>([]);
  const [groups, setGroups] = useState<GroupLite[]>([]);
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
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    listCenters().then(setCenters).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!form.centerId) {
      setGroups([]);
      return;
    }
    listGroups(form.centerId).then(setGroups).catch((e) => setError(e.message));
  }, [form.centerId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
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
        </div>

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
