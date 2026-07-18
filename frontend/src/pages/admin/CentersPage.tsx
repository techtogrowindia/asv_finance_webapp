import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { AdminLayout } from '../../components/AdminLayout';
import { ActionMenu } from '../../components/ActionMenu';
import { BranchScopeSelect } from '../../components/BranchScopeSelect';
import { useConfirm } from '../../components/ConfirmProvider';
import { BranchLite, listAdminBranches } from '../../api/employeesAdmin';
import {
  AdminCenter,
  CenterBody,
  createCenter,
  deleteCenter,
  FieldOfficer,
  listAdminCenters,
  listFieldOfficers,
  updateCenter,
} from '../../api/centersAdmin';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export function CentersPage() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<AdminCenter[] | null>(null);
  const [fdos, setFdos] = useState<FieldOfficer[]>([]);
  const [editing, setEditing] = useState<AdminCenter | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [branchId, setBranchId] = useState('');

  function refresh() {
    listAdminCenters(branchId).then(setRows).catch((e) => setError(e.message));
  }
  useEffect(() => {
    refresh();
    listFieldOfficers(branchId).then(setFdos).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  async function onDelete(c: AdminCenter) {
    const ok = await confirm({
      title: 'Delete center?',
      message: `Delete center ${c.code} — ${c.name}? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setError('');
    try {
      await deleteCenter(c.id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <AdminLayout>
      <div className="toolbar">
        <div>
          <h1 className="page-title">Centers</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            Village meeting centers. Each holds up to 5 groups × 5 members and is run by a field officer.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setAdding(true); setEditing(null); }}>
          + Add Center
        </button>
      </div>

      <div className="form-card no-print" style={{ maxWidth: 'none', marginBottom: 16, padding: 16 }}>
        <BranchScopeSelect value={branchId} onChange={setBranchId} />
      </div>

      {error && <div className="alert-error">{error}</div>}

      {(adding || editing) && (
        <CenterForm
          initial={editing}
          fdos={fdos}
          defaultBranchId={branchId}
          onCancel={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); refresh(); }}
        />
      )}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Branch</th><th>Code</th><th>Name</th><th>Field Officer</th><th>Meeting Day</th>
              <th>Members</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((c) => (
              <tr key={c.id}>
                <td>{c.branchCode} — {c.branchName}</td>
                <td className="mono">{c.code}</td>
                <td>{c.name}</td>
                <td>{c.fdoName ?? <span style={{ color: 'var(--ink-500)' }}>Unassigned</span>}</td>
                <td>{c.meetingDay ?? '—'}</td>
                <td>{c.clientCount}</td>
                <td><span className={`badge ${c.status === 'ACTIVE' ? 'active' : 'inactive'}`}>{c.status}</span></td>
                <td>
                  <ActionMenu
                    items={[
                      { label: 'Edit', onClick: () => { setEditing(c); setAdding(false); } },
                      {
                        label: c.status === 'ACTIVE' ? 'Deactivate' : 'Activate',
                        onClick: () => updateCenter(c.id, { status: c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }).then(refresh),
                      },
                      { label: 'Delete', onClick: () => onDelete(c), danger: true },
                    ]}
                  />
                </td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr><td colSpan={8} className="empty">No centers yet. Click “Add Center”.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}

function CenterForm({
  initial,
  fdos,
  defaultBranchId,
  onCancel,
  onSaved,
}: {
  initial: AdminCenter | null;
  fdos: FieldOfficer[];
  defaultBranchId: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const isHO = user?.role === 'HO';
  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [form, setForm] = useState({
    code: initial?.code ?? '',
    name: initial?.name ?? '',
    fdoId: initial?.fdoId ?? '',
    branchId: defaultBranchId,
    address: initial?.address ?? '',
    meetingDay: initial?.meetingDay ?? '',
    meetingTime: initial?.meetingTime ?? '',
    meetingPlace: initial?.meetingPlace ?? '',
    mobile: initial?.mobile ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!initial && isHO) listAdminBranches().then(setBranches).catch(() => {});
  }, [initial, isHO]);

  async function save() {
    setError('');
    if (!initial && isHO && !form.branchId) { setError('Select a branch for this center'); return; }
    setBusy(true);
    try {
      const body: CenterBody = {
        code: form.code.trim(),
        name: form.name.trim(),
        fdoId: form.fdoId || null,
        branchId: !initial ? form.branchId || undefined : undefined,
        address: form.address || undefined,
        meetingDay: form.meetingDay || undefined,
        meetingTime: form.meetingTime || undefined,
        meetingPlace: form.meetingPlace || undefined,
        mobile: form.mobile || undefined,
      };
      if (initial) await updateCenter(initial.id, body);
      else await createCenter(body);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-card" style={{ maxWidth: 'none', marginBottom: 18 }}>
      <div className="form-section-title">{initial ? `Edit center ${initial.code}` : 'New center'}</div>
      {error && <div className="alert-error">{error}</div>}
      <div className="form-grid">
        {!initial && isHO && (
          <Field label="Branch *">
            <select className="input" value={form.branchId} onChange={(e) => set('branchId', e.target.value)}>
              <option value="">Select branch</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Center code *"><input className="input" value={form.code} onChange={(e) => set('code', e.target.value)} /></Field>
        <Field label="Center name *"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Field officer">
          <select className="input" value={form.fdoId} onChange={(e) => set('fdoId', e.target.value)}>
            <option value="">Unassigned</option>
            {fdos.map((f) => <option key={f.id} value={f.id}>{f.code} - {f.name}</option>)}
          </select>
        </Field>
        <Field label="Meeting day">
          <select className="input" value={form.meetingDay} onChange={(e) => set('meetingDay', e.target.value)}>
            <option value="">—</option>
            {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Meeting time"><input type="time" className="input" value={form.meetingTime} onChange={(e) => set('meetingTime', e.target.value)} /></Field>
        <Field label="Meeting place"><input className="input" value={form.meetingPlace} onChange={(e) => set('meetingPlace', e.target.value)} /></Field>
        <Field label="Address"><input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Mobile"><input className="input" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} /></Field>
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : 'Save'}</button>
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
