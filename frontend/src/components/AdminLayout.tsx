import { ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ChangePasswordModal } from './ChangePasswordModal';
import { Logo } from './Logo';
import { SideNav, SideNavItem } from './SideNav';

/** `perm`: nav item shows if the user holds ANY of these keys (undefined = always). */
const ADMIN_NAV: SideNavItem[] = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: '▤', end: true },
  {
    label: 'Employees', icon: '☺', perm: ['employee.manage', 'role.manage'],
    children: [
      { to: '/admin/employees', label: 'Employees', perm: ['employee.manage'] },
      { to: '/admin/roles', label: 'Roles', perm: ['role.manage'] },
    ],
  },
  { to: '/admin/branches', label: 'Branches', icon: '▣', perm: ['branch.manage'] },
  { to: '/admin/centers', label: 'Centers', icon: '⌂', perm: ['center.view'] },
  { to: '/admin/members', label: 'Members', icon: '☺', perm: ['member.view'] },
  { to: '/admin/loan-verification', label: 'Loan Verification', icon: '✓', perm: ['loan.approve'] },
  { to: '/admin/import-loan', label: 'Import Legacy Loan', icon: '↧', perm: ['loan.import'] },
  { to: '/admin/kyc-verification', label: 'KYC Verification', icon: '⚿', perm: ['member.verify'] },
  { to: '/admin/client-transfer', label: 'Client Transfer', icon: '⇄', perm: ['member.transfer'] },
  {
    label: 'Collections', icon: '₹', perm: ['collection.view'],
    children: [
      { to: '/admin/collections', label: 'Demand Collection', end: true, perm: ['collection.post'] },
      { to: '/admin/collections/arrears', label: 'Arrear Collection', perm: ['collection.post'] },
      { to: '/admin/collections/pay-advance', label: 'Advance Collection', perm: ['collection.post'] },
      { to: '/admin/collections/advance', label: 'Loan Advance', perm: ['collection.advance'] },
      { to: '/admin/collections/foreclose', label: 'Foreclosure', perm: ['collection.foreclose'] },
      { to: '/admin/collection-corrections', label: 'Corrections', perm: ['collection.approveCorrection'] },
    ],
  },
  { to: '/admin/savings', label: 'Savings', icon: '◈', perm: ['member.view'] },
  { to: '/admin/eod', label: 'End of Day', icon: '◨', perm: ['eod.view'] },
  { to: '/admin/reports', label: 'Reports', icon: '▦', perm: ['report.monitoring', 'report.portfolio'] },
  { to: '/admin/masters', label: 'Business Settings', icon: '⚙', perm: ['master.manage'] },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const initials = (user?.name ?? '?').slice(0, 2).toUpperCase();

  return (
    <div className="shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <Logo light />
        <SideNav items={ADMIN_NAV} can={can} onNavigate={() => setMenuOpen(false)} />
        <div className="side-foot">{user?.role} · {user?.code}</div>
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
                <div className="who-meta">{user?.role} · Code {user?.code}</div>
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
                // BM signs in at /login (the /admin door only accepts HO —
                // see PORTAL_ROLES in auth.service.ts), even though their
                // session lives under /admin/* once signed in.
                const loginPath = user?.role === 'HO' ? '/admin' : '/login';
                logout();
                navigate(loginPath, { replace: true });
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
