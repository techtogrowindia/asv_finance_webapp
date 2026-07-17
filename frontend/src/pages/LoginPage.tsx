import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Portal, useAuth } from '../auth/AuthContext';
import { Logo } from '../components/Logo';

interface Props {
  portal: Portal;
}

const COPY: Record<Portal, { tag: string; title: string; sub: string; redirect: string }> = {
  employee: {
    tag: 'Field Officer Portal',
    title: 'Serve your centers, on the ground.',
    sub: 'Sign in to enroll members, apply for loans, and record collections.',
    redirect: '/app',
  },
  admin: {
    tag: 'Admin Portal',
    title: 'Run your branch with confidence.',
    sub: 'Sign in to verify, monitor collections, and close the day.',
    redirect: '/admin/dashboard',
  },
};

export function LoginPage({ portal }: Props) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const copy = COPY[portal];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(portal, loginId.trim(), password);
      navigate(copy.redirect, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <aside className="auth-hero">
        <Logo light />
        <div>
          <h1>{copy.title}</h1>
          <p>{copy.sub}</p>
          <ul className="hero-points">
            <li><span className="hero-dot">◆</span> Women's self-help group lending</li>
            <li><span className="hero-dot">◆</span> Weekly center collections, made simple</li>
            <li><span className="hero-dot">◆</span> Secure, private, and audit-ready</li>
          </ul>
        </div>
        <span style={{ color: '#8fb8af', fontSize: 13 }}>© {new Date().getFullYear()} ASV Finance</span>
      </aside>

      <main className="auth-panel">
        <div className="auth-card">
          <span className={`portal-tag ${portal === 'admin' ? 'admin' : ''}`}>{copy.tag}</span>
          <h2>Welcome back</h2>
          <p className="auth-sub">Enter your credentials to continue.</p>

          {error && <div className="alert-error">{error}</div>}

          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="login">Login ID</label>
              <input
                id="login"
                className="input"
                autoComplete="username"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="password-field">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  <EyeIcon off={showPassword} />
                </button>
              </div>
            </div>
            <button className="btn btn-primary btn-block" disabled={busy} type="submit">
              {busy ? <span className="spinner" /> : 'Sign in'}
            </button>
          </form>

          <p className="auth-foot">
            {portal === 'employee'
              ? 'Branch staff? Use the admin portal at /admin'
              : 'Field officer? Use the field portal at /login'}
          </p>
        </div>
      </main>
    </div>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  if (off) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.3 20.3 0 0 1-3.22 4.5M14.12 14.12a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
