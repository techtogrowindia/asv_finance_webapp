import { ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ChangePasswordModal } from './ChangePasswordModal';
import { Logo } from './Logo';
import { SideNav, SideNavItem } from './SideNav';

/** Employee (Field Officer) portal shell. Nav is task-oriented, not a clone.
 *  `perm`: item shows if the user holds ANY of these keys (undefined = always). */
const EMPLOYEE_NAV: SideNavItem[] = [
  { to: '/app', label: 'Dashboard', icon: '▤', end: true },
  { to: '/app/clients', label: 'Members', icon: '☺', perm: ['member.view'] },
  { to: '/app/enroll', label: 'Enroll Member', icon: '＋', perm: ['member.create'] },
  { to: '/app/loans', label: 'Loans', icon: '₹', perm: ['loan.apply', 'loan.view'] },
  {
    label: 'Savings', icon: '◈', perm: ['member.view', 'savings.refundInitiate', 'savings.refundSettle'],
    children: [
      { to: '/app/savings', label: 'Passbooks', end: true, perm: ['member.view'] },
      { to: '/app/savings/refunds', label: 'Savings Refunds', perm: ['savings.refundInitiate', 'savings.refundSettle'] },
    ],
  },
  {
    label: 'Collections', icon: '✓', perm: ['collection.view'],
    children: [
      { to: '/app/collections', label: 'Demand Collection', end: true, perm: ['collection.post'] },
      { to: '/app/collections/arrears', label: 'Arrear Collection', perm: ['collection.post'] },
      { to: '/app/collections/pay-advance', label: 'Advance Collection', perm: ['collection.post'] },
      { to: '/app/collections/advance', label: 'Loan Advance', perm: ['collection.advance'] },
      { to: '/app/collections/foreclose', label: 'Foreclosure', perm: ['collection.foreclose'] },
    ],
  },
  { to: '/app/reports', label: 'Reports', icon: '▦', perm: ['report.monitoring', 'report.portfolio'] },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const initials = (user?.name ?? '?').slice(0, 2).toUpperCase();

  return (
    <div className="shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <Logo light />
        <SideNav items={EMPLOYEE_NAV} can={can} onNavigate={() => setMenuOpen(false)} />
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setShowChangePassword(true)}>
              Change password
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
            >
              Sign out
            </button>
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}
