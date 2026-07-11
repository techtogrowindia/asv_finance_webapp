import { AdminLayout } from '../../components/AdminLayout';

/** Minimal admin portal landing. The full BM/HO portal is a later phase. */
export function AdminDashboard() {
  return (
    <AdminLayout>
      <h1 className="page-title">Admin Portal</h1>
      <p className="page-sub">Branch Manager &amp; Head Office tools.</p>
      <div className="panel">
        <div className="panel-body">
          <div className="empty">
            🚧 Full verification, EOD, monitoring, and reports are scheduled after the
            Employee portal. Master data management is available now under <b>Masters</b>.
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
