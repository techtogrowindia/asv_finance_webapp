import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { api, tokenStore } from '../lib/api';

export type Role = 'FDO' | 'BM' | 'HO';
export type Portal = 'employee' | 'admin';

export interface User {
  id: string;
  name: string;
  code: string;
  role: Role;
  branchId: string | null;
  permissions: string[];
  workingDate: string;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: Omit<User, 'workingDate' | 'permissions'>;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (portal: Portal, login: string, password: string) => Promise<User>;
  logout: () => void;
  /** True if the signed-in user holds the given permission key. */
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on load.
  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => {
        tokenStore.clear();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      can: (permission: string) => !!user?.permissions?.includes(permission),
      async login(portal, login, password) {
        const res = await api<LoginResponse>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ login, password, portal }),
        });
        tokenStore.set(res.accessToken, res.refreshToken);
        // /auth/login doesn't include workingDate; fetch the full profile once.
        const full = await api<User>('/auth/me');
        setUser(full);
        return full;
      },
      logout() {
        tokenStore.clear();
        setUser(null);
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
