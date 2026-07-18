import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { ActionMenu } from '../../components/ActionMenu';
import { useAuth } from '../../auth/AuthContext';
import { AdminBranch, createBranch, listBranches, updateBranch } from '../../api/branchesAdmin';

const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

export function BranchesPage() {
  const { user } = useAuth();
  const isBM = user?.role === 'BM';
  const [rows, setRows] = useState<AdminBranch[] | null>(null);
  const [editing, setEditing] = useState<AdminBranch | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  function refresh() {
    listBranches().then(setRows).catch((e) => setError(e.message));
  }
  useEffect(refresh, []);

  async function onToggleStatus(b: AdminBranch) {
    setError('');
    try {
      await updateBranch(b.id, { isActive: !b.isActive });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  return (
    <AdminLayout>
      <div className="toolbar">
        <div>
          <h1 className="page-title">{isBM ? 'Your Branch' : 'Branches'}</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            {isBM
              ? 'You can rename your own branch. Adding branches or changing status is done by Head Office.'
              : 'Each branch is an office covering an area — centers, employees, and the working date are scoped per branch.'}
          </p>
        </div>
        {!isBM && (
          <button className="btn btn-primary" onClick={() => { setAdding(true); setEditing(null); }}>
            + Add Branch
          </button>
        )}
      </div>

      {error && <div className="alert-error">{error}</div>}

      {(adding || editing) && (
        <BranchForm
          initial={editing}
          isBM={isBM}
          onCancel={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); refresh(); }}
        />
      )}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Code</th><th>Name</th><th>Working Date</th><th>Centers</th><th>Employees</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((b) => (
              <tr key={b.id}>
                <td className="mono">{b.code}</td>
                <td>{b.name}</td>
                <td>{date(b.workingDate)}</td>
                <td>{b.centerCount}</td>
                <td>{b.employeeCount}</td>
                <td><span className={`badge ${b.isActive ? 'active' : 'inactive'}`}>{b.isActive ? 'ACTIVE' : 'INACTIVE'}</span></td>
                <td>
                  <ActionMenu
                    items={[
                      { label: 'Edit', onClick: () => { setEditing(b); setAdding(false); } },
                      ...(isBM ? [] : [{ label: b.isActive ? 'Deactivate' : 'Activate', onClick: () => onToggleStatus(b) }]),
                    ]}
                  />
                </td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr><td colSpan={7} className="empty">{isBM ? 'Your branch is not set up yet.' : 'No branches yet. Click "Add Branch".'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}

function BranchForm({
  initial,
  isBM,
  onCancel,
  onSaved,
}: {
  initial: AdminBranch | null;
  isBM: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    code: initial?.code ?? '',
    name: initial?.name ?? '',
    workingDate: initial?.workingDate?.slice(0, 10) ?? today,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setError('');
    if (!form.code.trim() || !form.name.trim()) {
      setError('Code and name are required');
      return;
    }
    setBusy(true);
    try {
      if (initial) {
        // A branch admin (BM) may only rename their own branch — never send
        // code/status, which the backend would reject anyway.
        await updateBranch(initial.id, isBM ? { name: form.name.trim() } : { code: form.code.trim(), name: form.name.trim() });
      } else {
        await createBranch({ code: form.code.trim(), name: form.name.trim(), workingDate: form.workingDate });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-card" style={{ maxWidth: 'none', marginBottom: 18 }}>
      <div className="form-section-title">{initial ? `Edit ${initial.name}` : 'New branch'}</div>
      {error && <div className="alert-error">{error}</div>}
      <div className="form-grid">
        <div className="field">
          <label>Code {!isBM && '*'}</label>
          <input className="input" value={form.code} disabled={isBM} onChange={(e) => set('code', e.target.value)} placeholder="e.g. 006" />
        </div>
        <div className="field">
          <label>Name *</label>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Dindigul" />
        </div>
        {!initial && (
          <div className="field">
            <label>Starting working date</label>
            <input type="date" className="input" value={form.workingDate} onChange={(e) => set('workingDate', e.target.value)} />
          </div>
        )}
      </div>
      {initial && (
        <div className="hint">
          Working date advances only via End of Day close, not from here.
          {isBM && ' Branch code and active status are managed by Head Office.'}
        </div>
      )}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : 'Save'}</button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
