/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { AuthState } from '../types';
import { login as apiLogin, getAuthState, setAuthState, clearAuthState } from '../api';

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
