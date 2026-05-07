import { useState } from 'react';
import { ownerLogin, setJwt } from '../api';

interface LoginProps {
  onLogin: () => void;
}

const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);
const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      const result = await ownerLogin(email.trim(), password);
      setJwt(result.token);
      onLogin();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'تعذر الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    background: 'var(--color-surface-secondary)',
    borderColor: 'var(--color-ivory-border)',
    color: 'var(--color-ink-main)',
  };

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center p-6"
      style={{ background: 'var(--color-ivory-app)' }}
      dir="rtl"
    >
      <div className="app-card w-full max-w-sm p-8">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl text-white"
            style={{ background: '#0FA3A6' }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold" style={{ color: 'var(--color-ink-main)' }}>
              لوحة المالك
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-ink-muted)' }}>
              سجّل الدخول بالبريد الإلكتروني وكلمة المرور
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium" style={{ color: 'var(--color-ink-main)' }}>
              البريد الإلكتروني
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@pharmacy.com"
              dir="ltr"
              autoComplete="email"
              autoFocus
              required
              className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
              style={inputStyle}
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium" style={{ color: 'var(--color-ink-main)' }}>
              كلمة المرور
            </label>
            <div className="relative">
              <input
                id="password"
                type={visible ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                dir="ltr"
                autoComplete="current-password"
                required
                className="w-full rounded-xl border py-3 pe-4 ps-11 text-sm outline-none"
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                className="absolute inset-y-0 start-0 flex items-center ps-3"
                style={{ color: 'var(--color-ink-muted)' }}
                tabIndex={-1}
                aria-label={visible ? 'إخفاء' : 'إظهار'}
              >
                {visible ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          {error && (
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{ background: 'var(--color-status-danger-bg)', color: 'var(--color-status-danger)' }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim() || !password}
            className="rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: '#0FA3A6', minHeight: '48px' }}
          >
            {loading ? 'جاري التحقق...' : 'دخول'}
          </button>
        </form>
      </div>

      <p className="mt-6 text-xs" style={{ color: 'var(--color-ink-muted)' }}>
        TAJ Pharmacy — نظام إدارة الصيدليات
      </p>
    </div>
  );
}
