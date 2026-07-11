import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Role, useAuth } from './AuthContext';

/**
 * Guards a route. If not logged in, redirects to the given portal's login.
 * If logged in but the role is not allowed, sends them to their own portal.
 */
export function RequireAuth({
  children,
  roles,
  loginPath,
}: {
  children: ReactNode;
  roles: Role[];
  loginPath: string;
}) {
  const { user, loading } = useAuth();

  if (loading) return <FullscreenSpinner />;
  if (!user) return <Navigate to={loginPath} replace />;
  if (!roles.includes(user.role)) {
    return <Navigate to={user.role === 'FDO' ? '/app' : '/admin/dashboard'} replace />;
  }
  return <>{children}</>;
}

function FullscreenSpinner() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <div className="spinner" style={{ borderColor: '#cbd5d1', borderTopColor: '#0d6e5e' }} />
    </div>
  );
}
