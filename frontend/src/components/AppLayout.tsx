import { ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Logo } from './Logo';

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

/** Employee (Field Officer) portal shell. Nav is task-oriented, not a clone. */
const EMPLOYEE_NAV: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: '▤' },
  { to: '/app/clients', label: 'Members', icon: '☺' },
  { to: '/app/enroll', label: 'Enroll Member', icon: '＋' },
  { to: '/app/loans', label: 'Loans', icon: '₹' },
  { to: '/app/collections', label: 'Collections', icon: '✓' },
  { to: '/app/reports', label: 'Reports', icon: '▦' },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = (user?.name ?? '?').slice(0, 2).toUpperCase();

  return (
    <div className="shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <Logo light />
        <nav className="side-nav">
          {EMPLOYEE_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/app'}
              className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              <span className="side-ico">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">Field Officer · {user?.code}</div>
      </aside>

      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="menu-btn" aria-label="Menu" onClick={() => setMenuOpen((v) => !v)}>☰</button>
            <div className="who">
              <span className="avatar">{initials}</span>
              <div>
                <div className="who-name">{user?.name}</div>
                <div className="who-meta">Field Officer · Code {user?.code}</div>
              </div>
            </div>
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => {
              logout();
              navigate('/login', { replace: true });
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
