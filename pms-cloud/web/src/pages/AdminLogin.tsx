import { useState } from 'react';
import { setAdminToken, validateAdminToken } from '../api';

interface AdminLoginProps {
  onLogin: () => void;
}

export default function AdminLogin({ onLogin }: AdminLoginProps) {
  const [token, setTokenValue] = useState('');
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    try {
      const valid = await validateAdminToken(trimmed);
      if (valid) {
        setAdminToken(trimmed);
        onLogin();
      } else {
        setError('رمز الإدارة غير صحيح');
      }
    } catch {
      setError('تعذر الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center p-6"
      style={{ background: 'var(--color-primary-950)' }}
    >
      <div className="app-card w-full max-w-sm p-8">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src="/taj-logo.svg" alt="TAJ Pharmacy" className="h-24 w-24 object-contain" />
          <div className="text-center">
            <h1 className="text-xl font-bold" style={{ color: 'var(--color-ink-main)' }}>
              لوحة إدارة النظام
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-ink-muted)' }}>
              للمطورين والمسؤولين فقط
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="admin-token"
              className="text-sm font-medium"
              style={{ color: 'var(--color-ink-main)' }}
            >
              رمز الإدارة
            </label>
            <div className="relative">
              <input
                id="admin-token"
                type={visible ? 'text' : 'password'}
                value={token}
                onChange={(e) => setTokenValue(e.target.value)}
                placeholder="أدخل رمز الإدارة..."
                dir="ltr"
                autoFocus
                className="w-full rounded-xl border py-3 pe-4 ps-11 text-sm outline-none"
                style={{
                  background: 'var(--color-surface-secondary)',
                  borderColor: 'var(--color-ivory-border)',
                  color: 'var(--color-ink-main)',
                }}
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                className="absolute inset-y-0 start-0 flex items-center ps-3"
                style={{ color: 'var(--color-ink-muted)' }}
                tabIndex={-1}
              >
                {visible ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--color-status-danger-bg)', color: 'var(--color-status-danger)' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !token.trim()}
            className="rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: 'var(--color-primary-700)', minHeight: '48px' }}
          >
            {loading ? 'جاري التحقق...' : 'دخول للوحة الإدارة'}
          </button>
        </form>
      </div>
    </div>
  );
}
