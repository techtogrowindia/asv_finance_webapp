import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { useAuth } from '../../auth/AuthContext';
import { useConfirm } from '../../components/ConfirmProvider';
import {
  disburseApplication,
  LoanApplicationSummary,
  listLoanApplications,
  rejectApplication,
  updateApplicationNotes,
} from '../../api/loans';

const inr = (v: string | number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));

/** YYYY-MM-DD for a date input, from an ISO string or Date. */
function toDateInput(v: string | Date): string {
  return (typeof v === 'string' ? v : v.toISOString()).slice(0, 10);
}

interface DisburseDates {
  disbursalDate: string;
  dueStartDate: string;
}

export function LoanVerificationPage() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [rows, setRows] = useState<LoanApplicationSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dates, setDates] = useState<Record<string, DisburseDates>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const workingDate = user?.workingDate ? toDateInput(user.workingDate) : toDateInput(new Date());

  function refresh() {
    listLoanApplications('PENDING').then(setRows).catch((e) => setError(e.message));
  }
  useEffect(refresh, []);

  function getDates(a: LoanApplicationSummary): DisburseDates {
    return dates[a.id] ?? { disbursalDate: workingDate, dueStartDate: workingDate };
  }
  function setDate(a: LoanApplicationSummary, field: keyof DisburseDates, value: string) {
    setDates((prev) => ({ ...prev, [a.id]: { ...getDates(a), [field]: value } }));
  }

  function getNote(a: LoanApplicationSummary): string {
    return a.id in noteDrafts ? noteDrafts[a.id] : a.notes ?? '';
  }

  async function saveNote(a: LoanApplicationSummary) {
    const value = getNote(a);
    setError('');
    setSavingNoteId(a.id);
    try {
      await updateApplicationNotes(a.id, value);
      setRows((prev) => prev?.map((r) => (r.id === a.id ? { ...r, notes: value.trim() || null } : r)) ?? prev);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save note');
    } finally {
      setSavingNoteId(null);
    }
  }

  async function onDisburse(a: LoanApplicationSummary) {
    const d = getDates(a);
    const ok = await confirm({
      title: 'Disburse this loan?',
      message: `Disburse ${inr(a.loanAmount)} to ${a.clientName} (${a.clientCode}), dated ${d.disbursalDate} with the first due on ${d.dueStartDate}? This creates the loan and its repayment schedule — it cannot be undone.`,
      confirmLabel: 'Disburse',
    });
    if (!ok) return;
    setError('');
    setSuccess('');
    setBusyId(a.id);
    try {
      const res = await disburseApplication(a.id, d);
      setSuccess(`Disbursed as loan account ${res.loanAccount}.`);
      setSelectedId(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Disbursement failed');
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(a: LoanApplicationSummary) {
    const ok = await confirm({
      title: 'Reject this application?',
      message: `Reject the loan application for ${a.clientName} (${a.clientCode})?`,
      confirmLabel: 'Reject',
      danger: true,
    });
    if (!ok) return;
    setError('');
    setBusyId(a.id);
    try {
      await rejectApplication(a.id);
      setSelectedId(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reject failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminLayout>
      <h1 className="page-title">Loan Verification</h1>
      <p className="page-sub">
        Review pending applications, then verify KYC and disburse — or reject.
      </p>

      {error && <div className="alert-error">{error}</div>}
      {success && (
        <div className="alert-error" style={{ background: '#e3f5ee', color: '#157a5b', borderColor: '#bfe6d7' }}>
          {success}
        </div>
      )}

      {/* List mode — a compact table of pending applications to pick from. */}
      {!selectedId && rows && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Client ID</th><th>Name</th><th>Center</th><th>Product</th>
                <th>Amount</th><th>Applied</th><th>Flags</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.displayId}</td>
                  <td>{a.clientName}</td>
                  <td>{a.centerName}</td>
                  <td>{a.productName}</td>
                  <td>{inr(a.loanAmount)}</td>
                  <td>{new Date(a.createdAt).toLocaleDateString('en-IN')}</td>
                  <td>{a.warnings.length > 0 ? <span className="badge pending">{a.warnings.length}</span> : '—'}</td>
                  <td>
                    <button className="btn btn-primary btn-sm" onClick={() => { setSelectedId(a.id); setError(''); setSuccess(''); }}>
                      View / Verify
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="empty">No pending applications.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail mode — verify & disburse the selected application. */}
      {selectedId && rows?.filter((a) => a.id === selectedId).map((a) => {
        const d = getDates(a);
        return (
          <div key={a.id}>
            <div style={{ marginBottom: 14 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedId(null)}>← Back to list</button>
            </div>
            <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{a.clientName} <span className="mono" style={{ fontWeight: 400 }}>· {a.displayId} · {a.clientCode}</span></span>
              <span className="badge pending">PENDING</span>
            </div>
            <div className="panel-body">
              <div className="detail-grid" style={{ marginBottom: 18 }}>
                <div className="detail-item"><div className="k">Center</div><div className="v">{a.centerName}</div></div>
                <div className="detail-item"><div className="k">Product</div><div className="v">{a.productName}</div></div>
                <div className="detail-item"><div className="k">Loan Amount</div><div className="v">{inr(a.loanAmount)}</div></div>
                <div className="detail-item"><div className="k">Total Dues</div><div className="v">{a.totalDues}</div></div>
                <div className="detail-item"><div className="k">Purpose</div><div className="v">{a.purposeName}</div></div>
                <div className="detail-item"><div className="k">Applied</div><div className="v">{new Date(a.createdAt).toLocaleDateString('en-IN')}</div></div>
              </div>

              {a.warnings.length > 0 && (
                <div className="warning-box" style={{ marginBottom: 18 }}>
                  <div className="title">Flagged at application time</div>
                  <ul>{a.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </div>
              )}

              <div className="field" style={{ marginBottom: 18 }}>
                <label>Approver Notes</label>
                <textarea
                  className="input"
                  rows={2}
                  maxLength={500}
                  value={getNote(a)}
                  onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [a.id]: e.target.value }))}
                  placeholder="e.g. waiting for updated Aadhaar, center meeting next Tuesday…"
                />
                <div className="form-actions" style={{ marginTop: 8 }}>
                  <button
                    className="btn btn-ghost"
                    disabled={savingNoteId === a.id || getNote(a) === (a.notes ?? '')}
                    onClick={() => saveNote(a)}
                  >
                    {savingNoteId === a.id ? <span className="spinner" /> : 'Save note'}
                  </button>
                </div>
              </div>

              <div className="form-grid" style={{ maxWidth: 420, marginBottom: 4 }}>
                <div className="field">
                  <label>Disbursal date</label>
                  <input
                    type="date"
                    className="input"
                    value={d.disbursalDate}
                    max={workingDate}
                    onChange={(e) => setDate(a, 'disbursalDate', e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Due start date</label>
                  <input
                    type="date"
                    className="input"
                    value={d.dueStartDate}
                    min={d.disbursalDate}
                    onChange={(e) => setDate(a, 'dueStartDate', e.target.value)}
                  />
                </div>
              </div>
              <div className="hint">Both default to today's working date — adjust for a backdated disbursal or a first due on the center's next meeting day.</div>

              <div className="form-actions">
                <button className="btn btn-primary" disabled={busyId === a.id} onClick={() => onDisburse(a)}>
                  {busyId === a.id ? <span className="spinner" /> : 'Disburse'}
                </button>
                <button className="btn btn-danger" disabled={busyId === a.id} onClick={() => onReject(a)}>
                  Reject
                </button>
              </div>
            </div>
            </div>
          </div>
        );
      })}
    </AdminLayout>
  );
}
