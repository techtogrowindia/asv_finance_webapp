import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { useAuth } from '../../auth/AuthContext';
import {
  BranchLite,
  CreateEmployeeBody,
  EmployeeRole,
  EmployeeRow,
  createEmployee,
  listAdminBranches,
  listEmployees,
  resetEmployeePassword,
  updateEmployee,
} from '../../api/employeesAdmin';
import { RoleLite, listAssignableRoles } from '../../api/rolesAdmin';

const ROLE_LABEL: Record<EmployeeRole, string> = { FDO: 'Field Officer', BM: 'Branch Manager', HO: 'Head Office' };

export function EmployeesPage() {
  const { user } = useAuth();
  const isBM = user?.role === 'BM';

  const [rows, setRows] = useState<EmployeeRow[] | null>(null);
  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [roles, setRoles] = useState<RoleLite[]>([]);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<EmployeeRow | null>(null);
  const [error, setError] = useState('');

  function refresh() {
    listEmployees({ role: roleFilter || undefined, q: q || undefined }).then(setRows).catch((e) => setError(e.message));
  }
  useEffect(refresh, [roleFilter]);
  useEffect(() => {
    const t = setTimeout(refresh, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  useEffect(() => {
    listAdminBranches().then(setBranches).catch(() => {});
    listAssignableRoles().then(setRoles).catch(() => {});
  }, []);

  async function onToggleStatus(row: EmployeeRow) {
    setError('');
    try {
      await updateEmployee(row.id, { status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  return (
    <AdminLayout>
      <div className="toolbar">
        <div>
          <h1 className="page-title">Employees</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            {isBM ? 'Field officers in your branch.' : 'Field officers, branch managers, and head office logins.'}
          </p>
        </div>
        <div className="toolbar-actions">
          <input className="input search" placeholder="Search name / login / code" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">All roles</option>
            <option value="FDO">Field Officer</option>
            {!isBM && <option value="BM">Branch Manager</option>}
            {!isBM && <option value="HO">Head Office</option>}
          </select>
          <button className="btn btn-primary" onClick={() => { setAdding(true); setEditing(null); }}>
            + Add Employee
          </button>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {(adding || editing) && (
        <EmployeeForm
          initial={editing}
          branches={branches}
          roles={roles}
          isBM={isBM}
          onCancel={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); refresh(); }}
        />
      )}

      {resetting && (
        <ResetPasswordForm employee={resetting} onCancel={() => setResetting(null)} onSaved={() => setResetting(null)} />
      )}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Code</th><th>Name</th><th>Login</th><th>Access Level</th><th>Role</th><th>Branch</th>
              <th>Centers</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((e) => (
              <tr key={e.id}>
                <td className="mono">{e.code}</td>
                <td>{e.name}</td>
                <td className="mono">{e.login}</td>
                <td>{ROLE_LABEL[e.role]}</td>
                <td>{e.roleName ?? <span style={{ color: 'var(--ink-500)' }}>—</span>}</td>
                <td>{e.branchName ?? <span style={{ color: 'var(--ink-500)' }}>Tenant-wide</span>}</td>
                <td>{e.role === 'FDO' ? e.centerCount : '—'}</td>
                <td><span className={`badge ${e.status === 'ACTIVE' ? 'active' : 'inactive'}`}>{e.status}</span></td>
                <td>
                  {e.id === user?.id ? (
                    <span style={{ color: 'var(--ink-500)', fontSize: 13 }}>This is you</span>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => { setEditing(e); setAdding(false); }}>Edit</button>
                      <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => setResetting(e)}>Reset Password</button>
                      <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => onToggleStatus(e)}>
                        {e.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr><td colSpan={9} className="empty">No employees yet. Click “Add Employee”.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}

function EmployeeForm({
  initial,
  branches,
  roles,
  isBM,
  onCancel,
  onSaved,
}: {
  initial: EmployeeRow | null;
  branches: BranchLite[];
  roles: RoleLite[];
  isBM: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    code: initial?.code ?? '',
    name: initial?.name ?? '',
    login: initial?.login ?? '',
    password: '',
    role: initial?.role ?? ('FDO' as EmployeeRole),
    branchId: initial?.branchId ?? '',
    accessRoleId: initial?.accessRoleId ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setError('');
    if (form.role !== 'HO' && !form.branchId && !isBM) {
      setError('Select a branch for this access level');
      return;
    }
    if (!form.accessRoleId) {
      setError('Select a role');
      return;
    }
    if (!initial && form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setBusy(true);
    try {
      if (initial) {
        await updateEmployee(initial.id, {
          code: form.code.trim(),
          name: form.name.trim(),
          login: form.login.trim(),
          role: isBM ? undefined : form.role,
          branchId: isBM ? undefined : form.branchId || undefined,
          accessRoleId: form.accessRoleId,
        });
      } else {
        const body: CreateEmployeeBody = {
          code: form.code.trim(),
          name: form.name.trim(),
          login: form.login.trim(),
          password: form.password,
          role: isBM ? 'FDO' : form.role,
          branchId: form.branchId || undefined,
          accessRoleId: form.accessRoleId,
        };
        await createEmployee(body);
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
      <div className="form-section-title">{initial ? `Edit ${initial.name}` : 'New employee'}</div>
      {error && <div className="alert-error">{error}</div>}
      <div className="form-grid">
        <Field label="Code *"><input className="input" value={form.code} onChange={(e) => set('code', e.target.value)} /></Field>
        <Field label="Full name *"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Login *"><input className="input" value={form.login} onChange={(e) => set('login', e.target.value)} /></Field>
        {!initial && (
          <Field label="Password *">
            <input type="password" className="input" value={form.password} onChange={(e) => set('password', e.target.value)} />
          </Field>
        )}
        {!isBM && (
          <Field label="Access Level *">
            <select className="input" value={form.role} onChange={(e) => set('role', e.target.value)}>
              <option value="FDO">Field Officer</option>
              <option value="BM">Branch Manager</option>
              <option value="HO">Head Office</option>
            </select>
          </Field>
        )}
        <Field label="Role *">
          <select className="input" value={form.accessRoleId} onChange={(e) => set('accessRoleId', e.target.value)}>
            <option value="">Select role</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        {!isBM && form.role !== 'HO' && (
          <Field label="Branch *">
            <select className="input" value={form.branchId} onChange={(e) => set('branchId', e.target.value)}>
              <option value="">Select branch</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.code} - {b.name}</option>)}
            </select>
          </Field>
        )}
      </div>
      <div className="hint">
        <strong>Access Level</strong> controls what data this person sees (their centers / branch / company).
        <strong> Role</strong> controls which actions they may perform — manage these on the Roles page.
      </div>
      <div className="hint">
        {initial ? 'Leave password unchanged — use “Reset Password” in the table to set a new one.' : 'The employee signs in with this login and password.'}
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : 'Save'}</button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function ResetPasswordForm({ employee, onCancel, onSaved }: { employee: EmployeeRow; onCancel: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setBusy(true);
    try {
      await resetEmployeePassword(employee.id, password);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-card" style={{ maxWidth: 420, marginBottom: 18 }}>
      <div className="form-section-title">Reset password for {employee.name}</div>
      {error && <div className="alert-error">{error}</div>}
      <Field label="New password *">
        <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : 'Set password'}</button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
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
