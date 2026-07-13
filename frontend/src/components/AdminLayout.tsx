import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Logo } from './Logo';

const ADMIN_NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: '▤' },
  { to: '/admin/employees', label: 'Employees', icon: '☺' },
  { to: '/admin/centers', label: 'Centers', icon: '⌂' },
  { to: '/admin/loan-verification', label: 'Loan Verification', icon: '✓' },
  { to: '/admin/eod', label: 'End of Day', icon: '◨' },
  { to: '/admin/reports', label: 'Reports', icon: '▦' },
  { to: '/admin/masters', label: 'Masters', icon: '⚙' },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initials = (user?.name ?? '?').slice(0, 2).toUpperCase();

  return (
    <div className="shell">
      <aside className="sidebar">
        <Logo light />
        <nav className="side-nav">
          {ADMIN_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}
            >
              <span className="side-ico">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">{user?.role} · {user?.code}</div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="who">
            <span className="avatar">{initials}</span>
            <div>
              <div className="who-name">{user?.name}</div>
              <div className="who-meta">{user?.role} · Code {user?.code}</div>
            </div>
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
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
