import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { useConfirm } from '../../components/ConfirmProvider';
import {
  CreateRoleBody,
  PermissionGroup,
  RoleRow,
  createRole,
  deleteRole,
  getPermissionCatalog,
  listRoles,
  updateRole,
} from '../../api/rolesAdmin';

export function RolesPage() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<RoleRow[] | null>(null);
  const [catalog, setCatalog] = useState<PermissionGroup[]>([]);
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  function refresh() {
    listRoles().then(setRows).catch((e) => setError(e.message));
  }
  useEffect(refresh, []);
  useEffect(() => {
    getPermissionCatalog().then(setCatalog).catch(() => {});
  }, []);

  async function onDelete(row: RoleRow) {
    const ok = await confirm({
      title: 'Delete role',
      message: `Delete the role "${row.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setError('');
    try {
      await deleteRole(row.id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <AdminLayout>
      <div className="toolbar">
        <div>
          <h1 className="page-title">Roles</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            Create roles and tick the actions each may perform. Assign a role to an employee on the Employees page.
          </p>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-primary" onClick={() => { setAdding(true); setEditing(null); }}>
            + Add Role
          </button>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {(adding || editing) && (
        <RoleForm
          initial={editing}
          catalog={catalog}
          onCancel={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); refresh(); }}
        />
      )}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Role</th><th>Permissions</th><th>Employees</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.name} {r.isSystem && <span className="badge" style={{ marginLeft: 6 }}>Built-in</span>}
                </td>
                <td>{r.permissions.length}</td>
                <td>{r.employeeCount}</td>
                <td><span className={`badge ${r.isActive ? 'active' : 'inactive'}`}>{r.isActive ? 'ACTIVE' : 'INACTIVE'}</span></td>
                <td>
                  {r.isSystem ? (
                    <span style={{ color: 'var(--ink-500)', fontSize: 13 }}>Read-only</span>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => { setEditing(r); setAdding(false); }}>Edit</button>
                      <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => onDelete(r)}>Delete</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr><td colSpan={5} className="empty">No roles yet. Click “Add Role”.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}

function RoleForm({
  initial,
  catalog,
  onCancel,
  onSaved,
}: {
  initial: RoleRow | null;
  catalog: PermissionGroup[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [selected, setSelected] = useState<Set<string>>(new Set(initial?.permissions ?? []));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleGroup = (group: PermissionGroup, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      group.permissions.forEach((p) => (on ? next.add(p.key) : next.delete(p.key)));
      return next;
    });

  async function save() {
    setError('');
    if (!name.trim()) { setError('Enter a role name'); return; }
    setBusy(true);
    try {
      const body: CreateRoleBody = { name: name.trim(), permissions: [...selected], isActive };
      if (initial) await updateRole(initial.id, body);
      else await createRole(body);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-card" style={{ maxWidth: 'none', marginBottom: 18 }}>
      <div className="form-section-title">{initial ? `Edit ${initial.name}` : 'New role'}</div>
      {error && <div className="alert-error">{error}</div>}
      <div className="form-grid">
        <div className="field">
          <label>Role name *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Senior Field Officer" />
        </div>
        <div className="field">
          <label>Status</label>
          <select className="input" value={isActive ? 'yes' : 'no'} onChange={(e) => setIsActive(e.target.value === 'yes')}>
            <option value="yes">Active</option>
            <option value="no">Inactive</option>
          </select>
        </div>
      </div>

      <div className="perm-groups">
        {catalog.map((g) => {
          const total = g.permissions.length;
          const on = g.permissions.filter((p) => selected.has(p.key)).length;
          const allOn = on === total;
          return (
            <div className="perm-group" key={g.group}>
              <label className="perm-group-head">
                <input
                  type="checkbox"
                  checked={allOn}
                  ref={(el) => { if (el) el.indeterminate = on > 0 && !allOn; }}
                  onChange={(e) => toggleGroup(g, e.target.checked)}
                />
                <span>{g.group}</span>
                <span className="perm-count">{on}/{total}</span>
              </label>
              <div className="perm-items">
                {g.permissions.map((p) => (
                  <label className="perm-item" key={p.key}>
                    <input type="checkbox" checked={selected.has(p.key)} onChange={() => toggle(p.key)} />
                    <span>{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : 'Save role'}</button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
