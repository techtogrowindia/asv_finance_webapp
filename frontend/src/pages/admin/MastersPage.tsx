import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import {
  createDocumentType,
  createFrequency,
  createLoanProduct,
  createPurpose,
  DocumentParty,
  DocumentTypeRow,
  FrequencyRow,
  listDocumentTypesAll,
  listFrequenciesAll,
  listLoanProductsAll,
  listPurposesAll,
  LoanProductRow,
  PurposeRow,
  updateDocumentType,
  updateFrequency,
  updateLoanProduct,
  updatePurpose,
} from '../../api/masters';
import { getSettings, updateSettings } from '../../api/settings';

type Tab = 'products' | 'frequencies' | 'purposes' | 'documentTypes' | 'settings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'products', label: 'Loan Products' },
  { id: 'frequencies', label: 'Frequencies' },
  { id: 'purposes', label: 'Purposes' },
  { id: 'documentTypes', label: 'Document Types' },
  { id: 'settings', label: 'Settings' },
];

export function MastersPage() {
  const [tab, setTab] = useState<Tab>('products');
  const [frequencies, setFrequencies] = useState<FrequencyRow[]>([]);

  useEffect(() => {
    listFrequenciesAll().then(setFrequencies).catch(() => {});
  }, []);

  return (
    <AdminLayout>
      <h1 className="page-title">Masters</h1>
      <p className="page-sub">
        Manage the dropdown data used across Enrollment and Loan Application. Editing a
        record here updates it everywhere it's referenced — nothing is hardcoded.
      </p>

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

      {tab === 'products' && <LoanProductsTab frequencies={frequencies} />}
      {tab === 'frequencies' && <FrequenciesTab onChanged={() => listFrequenciesAll().then(setFrequencies)} />}
      {tab === 'purposes' && <PurposesTab />}
      {tab === 'documentTypes' && <DocumentTypesTab />}
      {tab === 'settings' && <SettingsTab />}
    </AdminLayout>
  );
}

function SettingsTab() {
  const [requireLoanProductAtEnrollment, setRequireLoanProductAtEnrollment] = useState<boolean | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getSettings().then((s) => setRequireLoanProductAtEnrollment(s.requireLoanProductAtEnrollment)).catch((e) => setError(e.message));
  }, []);

  async function toggle() {
    if (requireLoanProductAtEnrollment === null) return;
    const next = !requireLoanProductAtEnrollment;
    setError('');
    try {
      await updateSettings({ requireLoanProductAtEnrollment: next });
      setRequireLoanProductAtEnrollment(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">Enrollment Settings</div>
      <div className="panel-body">
        {error && <div className="alert-error">{error}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            className={`toggle ${requireLoanProductAtEnrollment ? 'on' : ''}`}
            title="Click to toggle whether a loan product must be picked at enrollment"
            disabled={requireLoanProductAtEnrollment === null}
            onClick={toggle}
          >
            <span className="knob" />
            <span className="toggle-label">{requireLoanProductAtEnrollment ? 'Mandatory' : 'Optional'}</span>
          </button>
          <span style={{ color: 'var(--ink-700)' }}>Loan product required while enrolling a member</span>
        </div>
        <div className="hint" style={{ marginTop: 12 }}>
          When Mandatory, field officers must pick a loan product on the Enroll Member form.
          When Optional, they may leave it blank and apply for a loan later.
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function FrequenciesTab({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<FrequencyRow[] | null>(null);
  const [editing, setEditing] = useState<FrequencyRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  function refresh() {
    listFrequenciesAll().then(setRows).catch((e) => setError(e.message));
    onChanged();
  }
  useEffect(refresh, []);

  return (
    <div className="panel">
      <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between' }}>
        Frequencies
        <button className="btn btn-primary" onClick={() => { setAdding(true); setEditing(null); }}>+ Add</button>
      </div>
      <div className="panel-body">
        {error && <div className="alert-error">{error}</div>}
        {(adding || editing) && (
          <FrequencyForm
            initial={editing}
            onCancel={() => { setAdding(false); setEditing(null); }}
            onSaved={() => { setAdding(false); setEditing(null); refresh(); }}
          />
        )}
        <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
          <table className="data">
            <thead><tr><th>Code</th><th>Name</th><th>Days Between</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows?.map((f) => (
                <tr key={f.id}>
                  <td className="mono">{f.code}</td>
                  <td>{f.name}</td>
                  <td>{f.daysBetween}</td>
                  <td><StatusBadge active={f.isActive} /></td>
                  <td>
                    <RowActions
                      onEdit={() => { setEditing(f); setAdding(false); }}
                      active={f.isActive}
                      onToggle={() => updateFrequency(f.id, { isActive: !f.isActive }).then(refresh)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FrequencyForm({ initial, onCancel, onSaved }: { initial: FrequencyRow | null; onCancel: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(initial?.code ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [daysBetween, setDaysBetween] = useState(String(initial?.daysBetween ?? ''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    setBusy(true);
    try {
      const body = { code: code.trim(), name: name.trim(), daysBetween: Number(daysBetween) };
      if (initial) await updateFrequency(initial.id, body);
      else await createFrequency(body);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-card" style={{ maxWidth: 'none', marginBottom: 16, padding: 16 }}>
      {error && <div className="alert-error">{error}</div>}
      <div className="form-grid">
        <Field label="Code (e.g. WKS)"><input className="input" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
        <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Days between dues"><input type="number" min="1" className="input" value={daysBetween} onChange={(e) => setDaysBetween(e.target.value)} /></Field>
      </div>
      <div className="form-actions" style={{ marginTop: 4 }}>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : 'Save'}</button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PurposesTab() {
  const [rows, setRows] = useState<PurposeRow[] | null>(null);
  const [editing, setEditing] = useState<PurposeRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  function refresh() {
    listPurposesAll().then(setRows).catch((e) => setError(e.message));
  }
  useEffect(refresh, []);

  return (
    <div className="panel">
      <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between' }}>
        Purposes
        <button className="btn btn-primary" onClick={() => { setAdding(true); setEditing(null); }}>+ Add</button>
      </div>
      <div className="panel-body">
        {error && <div className="alert-error">{error}</div>}
        {(adding || editing) && (
          <PurposeForm
            initial={editing}
            onCancel={() => { setAdding(false); setEditing(null); }}
            onSaved={() => { setAdding(false); setEditing(null); refresh(); }}
          />
        )}
        <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
          <table className="data">
            <thead><tr><th>Name</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows?.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td><StatusBadge active={p.isActive} /></td>
                  <td>
                    <RowActions
                      onEdit={() => { setEditing(p); setAdding(false); }}
                      active={p.isActive}
                      onToggle={() => updatePurpose(p.id, { isActive: !p.isActive }).then(refresh)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PurposeForm({ initial, onCancel, onSaved }: { initial: PurposeRow | null; onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    setBusy(true);
    try {
      if (initial) await updatePurpose(initial.id, { name: name.trim() });
      else await createPurpose({ name: name.trim() });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-card" style={{ maxWidth: 'none', marginBottom: 16, padding: 16 }}>
      {error && <div className="alert-error">{error}</div>}
      <div className="form-grid">
        <Field label="Purpose name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      </div>
      <div className="form-actions" style={{ marginTop: 4 }}>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : 'Save'}</button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function LoanProductsTab({ frequencies }: { frequencies: FrequencyRow[] }) {
  const [rows, setRows] = useState<LoanProductRow[] | null>(null);
  const [editing, setEditing] = useState<LoanProductRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  function refresh() {
    listLoanProductsAll().then(setRows).catch((e) => setError(e.message));
  }
  useEffect(refresh, []);

  const inr = (v: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));

  return (
    <div className="panel">
      <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between' }}>
        Loan Products
        <button className="btn btn-primary" onClick={() => { setAdding(true); setEditing(null); }}>+ Add</button>
      </div>
      <div className="panel-body">
        {error && <div className="alert-error">{error}</div>}
        {(adding || editing) && (
          <LoanProductForm
            initial={editing}
            frequencies={frequencies}
            onCancel={() => { setAdding(false); setEditing(null); }}
            onSaved={() => { setAdding(false); setEditing(null); refresh(); }}
          />
        )}
        <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
          <table className="data">
            <thead><tr><th>Name</th><th>Loan Amt</th><th>Total Dues</th><th>Interest Amt</th><th>Frequency</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows?.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{inr(p.loanAmount)}</td>
                  <td>{p.totalDues}</td>
                  <td>{inr(p.interestAmount)}</td>
                  <td>{p.frequencyCode}</td>
                  <td><StatusBadge active={p.isActive} /></td>
                  <td>
                    <RowActions
                      onEdit={() => { setEditing(p); setAdding(false); }}
                      active={p.isActive}
                      onToggle={() => updateLoanProduct(p.id, { isActive: !p.isActive }).then(refresh)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LoanProductForm({
  initial,
  frequencies,
  onCancel,
  onSaved,
}: {
  initial: LoanProductRow | null;
  frequencies: FrequencyRow[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [loanAmount, setLoanAmount] = useState(String(initial?.loanAmount ?? ''));
  const [totalDues, setTotalDues] = useState(String(initial?.totalDues ?? ''));
  const [interestAmount, setInterestAmount] = useState(String(initial?.interestAmount ?? ''));
  const [frequencyId, setFrequencyId] = useState(initial?.frequencyId ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    if (!frequencyId) { setError('Select a frequency'); return; }
    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        loanAmount: Number(loanAmount),
        totalDues: Number(totalDues),
        interestAmount: Number(interestAmount),
        frequencyId,
      };
      if (initial) await updateLoanProduct(initial.id, body);
      else await createLoanProduct(body);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-card" style={{ maxWidth: 'none', marginBottom: 16, padding: 16 }}>
      {error && <div className="alert-error">{error}</div>}
      <div className="form-grid">
        <Field label="Product name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Loan amount (₹)"><input type="number" min="1" className="input" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} /></Field>
        <Field label="Total dues (installments)"><input type="number" min="1" className="input" value={totalDues} onChange={(e) => setTotalDues(e.target.value)} /></Field>
        <Field label="Interest amount (₹)"><input type="number" min="0" className="input" value={interestAmount} onChange={(e) => setInterestAmount(e.target.value)} /></Field>
        <Field label="Frequency">
          <select className="input" value={frequencyId} onChange={(e) => setFrequencyId(e.target.value)}>
            <option value="">Select</option>
            {frequencies.map((f) => <option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="form-actions" style={{ marginTop: 4 }}>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : 'Save'}</button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function DocumentTypesTab() {
  const [rows, setRows] = useState<DocumentTypeRow[] | null>(null);
  const [editing, setEditing] = useState<DocumentTypeRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  function refresh() {
    listDocumentTypesAll().then(setRows).catch((e) => setError(e.message));
  }
  useEffect(refresh, []);

  return (
    <div className="panel">
      <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between' }}>
        Document Types
        <button className="btn btn-primary" onClick={() => { setAdding(true); setEditing(null); }}>+ Add</button>
      </div>
      <div className="panel-body">
        {error && <div className="alert-error">{error}</div>}
        {(adding || editing) && (
          <DocumentTypeForm
            initial={editing}
            onCancel={() => { setAdding(false); setEditing(null); }}
            onSaved={() => { setAdding(false); setEditing(null); refresh(); }}
          />
        )}
        <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Name</th><th>Applies To</th><th>Number</th><th>Photo</th>
                <th>Mandatory</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d.appliesTo}</td>
                  <td>
                    <button
                      className={`toggle ${d.requiresNumber ? 'on' : ''}`}
                      title="Click to toggle whether this ID needs a typed number"
                      onClick={() => updateDocumentType(d.id, { requiresNumber: !d.requiresNumber }).then(refresh)}
                    >
                      <span className="knob" />
                      <span className="toggle-label">{d.requiresNumber ? 'Required' : 'Off'}</span>
                    </button>
                  </td>
                  <td>
                    <button
                      className={`toggle ${d.requiresPhoto ? 'on' : ''}`}
                      title="Click to toggle whether this ID needs an uploaded photo"
                      onClick={() => updateDocumentType(d.id, { requiresPhoto: !d.requiresPhoto }).then(refresh)}
                    >
                      <span className="knob" />
                      <span className="toggle-label">{d.requiresPhoto ? 'Required' : 'Off'}</span>
                    </button>
                  </td>
                  <td>
                    <button
                      className={`toggle ${d.isMandatory ? 'on' : ''}`}
                      title="Click to toggle whether this document is mandatory"
                      onClick={() => updateDocumentType(d.id, { isMandatory: !d.isMandatory }).then(refresh)}
                    >
                      <span className="knob" />
                      <span className="toggle-label">{d.isMandatory ? 'Mandatory' : 'Optional'}</span>
                    </button>
                  </td>
                  <td><StatusBadge active={d.isActive} /></td>
                  <td>
                    <RowActions
                      onEdit={() => { setEditing(d); setAdding(false); }}
                      active={d.isActive}
                      onToggle={() => updateDocumentType(d.id, { isActive: !d.isActive }).then(refresh)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DocumentTypeForm({ initial, onCancel, onSaved }: { initial: DocumentTypeRow | null; onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [appliesTo, setAppliesTo] = useState<DocumentParty>(initial?.appliesTo ?? 'CLIENT');
  const [requiresNumber, setRequiresNumber] = useState(initial?.requiresNumber ?? true);
  const [requiresPhoto, setRequiresPhoto] = useState(initial?.requiresPhoto ?? true);
  const [maskValue, setMaskValue] = useState(initial?.maskValue ?? false);
  const [isMandatory, setIsMandatory] = useState(initial?.isMandatory ?? true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    if (!requiresNumber && !requiresPhoto) {
      setError('Enable at least one of Requires Number or Requires Photo');
      return;
    }
    setBusy(true);
    try {
      const body = { name: name.trim(), appliesTo, requiresNumber, requiresPhoto, maskValue, isMandatory };
      if (initial) await updateDocumentType(initial.id, body);
      else await createDocumentType(body);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-card" style={{ maxWidth: 'none', marginBottom: 16, padding: 16 }}>
      {error && <div className="alert-error">{error}</div>}
      <div className="form-grid">
        <Field label="Document name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Applies to">
          <select className="input" value={appliesTo} onChange={(e) => setAppliesTo(e.target.value as DocumentParty)}>
            <option value="CLIENT">Client</option>
            <option value="NOMINEE">Nominee</option>
            <option value="BOTH">Both (client + nominee)</option>
          </select>
        </Field>
        <Field label="Requires a number">
          <select className="input" value={requiresNumber ? '1' : '0'} onChange={(e) => setRequiresNumber(e.target.value === '1')}>
            <option value="1">Yes — show a text field</option>
            <option value="0">No</option>
          </select>
        </Field>
        <Field label="Requires a photo">
          <select className="input" value={requiresPhoto ? '1' : '0'} onChange={(e) => setRequiresPhoto(e.target.value === '1')}>
            <option value="1">Yes — show an upload card</option>
            <option value="0">No</option>
          </select>
        </Field>
        <Field label="Mask the number (e.g. Aadhaar)">
          <select className="input" value={maskValue ? '1' : '0'} onChange={(e) => setMaskValue(e.target.value === '1')}>
            <option value="0">No</option>
            <option value="1">Yes — show only last 4 chars</option>
          </select>
        </Field>
        <Field label="Mandatory">
          <select className="input" value={isMandatory ? '1' : '0'} onChange={(e) => setIsMandatory(e.target.value === '1')}>
            <option value="1">Yes</option>
            <option value="0">No</option>
          </select>
        </Field>
      </div>
      <div className="form-actions" style={{ marginTop: 4 }}>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : 'Save'}</button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function StatusBadge({ active }: { active: boolean }) {
  return <span className={`badge ${active ? 'active' : 'inactive'}`}>{active ? 'Active' : 'Inactive'}</span>;
}

function RowActions({ onEdit, active, onToggle }: { onEdit: () => void; active: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={onEdit}>Edit</button>
      <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={onToggle}>
        {active ? 'Deactivate' : 'Activate'}
      </button>
    </div>
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
