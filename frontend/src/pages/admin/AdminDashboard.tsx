import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Logo } from '../../components/Logo';

/** Minimal admin portal landing. The full BM/HO portal is a later phase. */
export function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="main">
      <header className="topbar">
        <Logo />
        <div className="who">
          <span className="avatar">{(user?.name ?? '?').slice(0, 2).toUpperCase()}</span>
          <div>
            <div className="who-name">{user?.name}</div>
            <div className="who-meta">{user?.role} · Code {user?.code}</div>
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => {
              logout();
              navigate('/admin', { replace: true });
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <div className="content">
        <h1 className="page-title">Admin Portal</h1>
        <p className="page-sub">Branch Manager &amp; Head Office tools.</p>
        <div className="panel">
          <div className="panel-body">
            <div className="empty">
              🚧 The Admin portal (verification, EOD, masters, monitoring, reports) is
              scheduled after the Employee portal. You are signed in as {user?.role}.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
