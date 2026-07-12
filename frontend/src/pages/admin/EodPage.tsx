import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/AdminLayout';
import { useAuth } from '../../auth/AuthContext';
import { useConfirm } from '../../components/ConfirmProvider';
import { closeEod, EodHistoryRow, EodPreview, getEodHistory, getEodPreview } from '../../api/eod';
import { BranchLite, listAdminBranches } from '../../api/employeesAdmin';

const inr = (v: string | number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));
const date = (v: string) => new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTime = (v: string) => new Date(v).toLocaleString('en-IN');

export function EodPage() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const isHO = user?.role === 'HO';

  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [branchId, setBranchId] = useState('');
  const [preview, setPreview] = useState<EodPreview | null>(null);
  const [history, setHistory] = useState<EodHistoryRow[] | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isHO) listAdminBranches().then(setBranches).catch((e) => setError(e.message));
  }, [isHO]);

  function refresh(forBranchId?: string) {
    const bid = forBranchId ?? branchId ?? undefined;
    if (isHO && !bid) return;
    setError('');
    getEodPreview(bid).then(setPreview).catch((e) => setError(e.message));
    getEodHistory(bid).then(setHistory).catch((e) => setError(e.message));
  }

  useEffect(() => {
    if (!isHO) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHO]);

  useEffect(() => {
    if (isHO && branchId) refresh(branchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  async function onClose() {
    if (!preview) return;
    const ok = await confirm({
      title: 'Close the day?',
      message: `Close ${date(preview.workingDate)} for ${preview.branchName}? Closing balance ${inr(preview.closingBalance)} will be recorded, and the branch's working date will advance to the next day. This cannot be undone.`,
      confirmLabel: 'Close day',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await closeEod(isHO ? branchId : undefined);
      setSuccess(`Day closed. Closing balance ${inr(result.closingBalance)}. Working date is now ${date(result.nextWorkingDate)}.`);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Close failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminLayout>
      <h1 className="page-title">End of Day</h1>
      <p className="page-sub">Reconcile the branch's cash position and close the working day.</p>

      {isHO && (
        <div className="field" style={{ maxWidth: 320, marginBottom: 18 }}>
          <label>Branch</label>
          <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Select branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.code} - {b.name}</option>
            ))}
          </select>
        </div>
      )}

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-error" style={{ background: '#e3f5ee', color: '#157a5b', borderColor: '#bfe6d7' }}>{success}</div>}

      {preview && (
        <>
          <div className="toolbar">
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>{preview.branchName}</h2>
              <p className="page-sub" style={{ margin: 0 }}>Working date: {date(preview.workingDate)}</p>
            </div>
            <div className="toolbar-actions">
              {preview.alreadyClosed ? (
                <span className="badge active">Already closed today</span>
              ) : (
                <button className="btn btn-primary" disabled={busy} onClick={onClose}>
                  {busy ? <span className="spinner" /> : 'Close day'}
                </button>
              )}
            </div>
          </div>

          <div className="cards">
            <Stat icon="◧" tone="teal" label="Opening Balance" value={inr(preview.openingBalance)} />
            <Stat icon="↓" tone="teal" label="Total Receipts" value={inr(preview.totalReceipts)} />
            <Stat icon="↑" tone="amber" label="Total Payments" value={inr(preview.totalPayments)} />
            <Stat icon="◨" tone="amber" label="Closing Balance" value={inr(preview.closingBalance)} />
          </div>
        </>
      )}

      <div className="panel">
        <div className="panel-head">Closing History</div>
        <div className="panel-body">
          {history && history.length > 0 ? (
            <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th><th>Opening</th><th>Receipts</th><th>Payments</th><th>Closing</th><th>Done At</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td>{date(h.eodDate)}</td>
                      <td>{inr(h.openingBalance)}</td>
                      <td>{inr(h.totalReceipts)}</td>
                      <td>{inr(h.totalPayments)}</td>
                      <td>{inr(h.closingBalance)}</td>
                      <td>{dateTime(h.doneAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">{isHO && !branchId ? 'Select a branch to see its EOD history.' : 'No days closed yet.'}</div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

function Stat({ icon, tone, label, value }: { icon: string; tone: 'teal' | 'amber'; label: string; value: string }) {
  return (
    <div className="card">
      <div className={`card-ico ${tone}`}>{icon}</div>
      <div>
        <div className="card-label">{label}</div>
        <div className="card-value">{value}</div>
      </div>
    </div>
  );
}
