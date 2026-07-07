import { useState } from 'react';
import { ownerLogin, setJwt } from '../api';
import Icon from '../components/ui/Icon';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import InstallBanner from '../components/InstallBanner';

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [capsLock, setCapsLock] = useState(false);
  const { canInstall, isIOS, install } = useInstallPrompt();

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
    } finally { setLoading(false); }
  };

  const inputStyle = {
    background: 'var(--color-surface-secondary)',
    borderColor: 'var(--color-ivory-border)',
    color: 'var(--color-ink-main)',
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6" style={{ background: 'var(--color-ivory-app)' }} dir="rtl">
      <div className="app-card w-full max-w-sm p-8">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src="/header-logo-color.svg" alt="TAJ Pharmacy" className="h-14 w-auto max-w-[220px] object-contain" />
          <div className="text-center">
            <h1 className="text-xl font-bold" style={{ color: 'var(--color-ink-main)' }}>لوحة المالك</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-ink-muted)' }}>سجّل الدخول للمتابعة</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="relative">
            <input
              id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="البريد الإلكتروني" dir="ltr" autoComplete="email" autoFocus required
              className="peer w-full rounded-xl border px-4 pt-6 pb-2 text-sm outline-none"
              style={inputStyle}
            />
            <label htmlFor="email"
              className="absolute start-4 top-2 text-xs transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-sm"
              style={{ color: 'var(--color-ink-placeholder)' }}>
              البريد الإلكتروني
            </label>
          </div>

          <div className="relative">
            <input
              id="password" type={visible ? 'text' : 'password'} value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => setCapsLock(e.getModifierState('CapsLock'))}
              onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
              placeholder="كلمة المرور" dir="ltr" autoComplete="current-password" required
              className="peer w-full rounded-xl border pe-10 ps-4 pt-6 pb-2 text-sm outline-none"
              style={inputStyle}
            />
            <label htmlFor="password"
              className="absolute start-4 top-2 text-xs transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-sm"
              style={{ color: 'var(--color-ink-placeholder)' }}>
              كلمة المرور
            </label>
            <button type="button" onClick={() => setVisible((v) => !v)}
              className="absolute end-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-ink-muted)' }}
              tabIndex={-1} aria-label={visible ? 'إخفاء' : 'إظهار'}>
              <Icon name={visible ? 'eye-off' : 'eye'} size={18} />
            </button>
            {capsLock && (
              <p className="absolute -bottom-5 start-0 text-[11px]" style={{ color: 'var(--color-status-warning)' }}>
                Caps Lock مفعل
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--color-status-danger-bg)', color: 'var(--color-status-danger)' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading || !email.trim() || !password}
            className="rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50 touch-target"
            style={{ background: '#0FA3A6' }}>
            {loading ? 'جاري التحقق...' : 'دخول'}
          </button>
        </form>
      </div>

      {canInstall && (
        <div className="mt-4 w-full max-w-sm">
          <InstallBanner canInstall={canInstall} isIOS={isIOS} onInstall={install} compact />
        </div>
      )}
    </div>
  );
}
