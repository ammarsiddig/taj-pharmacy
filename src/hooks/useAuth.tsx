/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { AuthState } from '../types';
import { login as apiLogin, getAuthState, setAuthState, clearAuthState } from '../api';
import { refreshSession } from '../api/system';
import { invoke } from '../lib/tauri';

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(getAuthState);

  useEffect(() => {
    setAuthState(state);
  }, [state]);

  // On app start, refresh the session from the backend so any permissions
  // added by a migration (e.g. dashboard.view in TASK-925) become available
  // without forcing a manual log-out + log-in. Also re-populates the
  // backend's in-memory AuthSessionState which is reset on every restart.
  useEffect(() => {
    const stored = getAuthState();
    if (!stored.isAuthenticated || !stored.token) return;
    refreshSession(stored.token)
      .then((res) => {
        setState({
          user: res.user,
          role: res.role,
          permissions: res.permissions,
          token: res.token,
          tenant_id: res.user.tenant_id,
          isAuthenticated: true,
        });
      })
      .catch(() => {
        // Token invalid (e.g. password reset, user deleted) — wipe and force re-login
        clearAuthState();
        setState({
          user: null, role: null, permissions: [], token: null,
          tenant_id: '', isAuthenticated: false,
        });
      });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiLogin(username, password);
    const newState: AuthState = {
      user: res.user,
      role: res.role,
      permissions: res.permissions,
      token: res.token,
      tenant_id: res.user.tenant_id,
      isAuthenticated: true,
    };
    setState(newState);
  }, []);

  const logout = useCallback(() => {
    invoke('clear_auth_session').catch(() => {});
    clearAuthState();
    setState({
      user: null,
      role: null,
      permissions: [],
      token: null,
      tenant_id: '',
      isAuthenticated: false,
    });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
