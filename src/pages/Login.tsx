import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, isAuthenticated, permissions } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (permissions.includes('reports.financial')) {
      navigate('/dashboard', { replace: true });
    } else {
      navigate('/pos', { replace: true });
    }
  }, [isAuthenticated, permissions, navigate]);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      // Redirect handled by useEffect watching isAuthenticated + permissions
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth.loginError');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ivory-app flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-ivory-surface rounded-2xl shadow-lg p-8 border border-ivory-border">
          {/* Logo */}
          <div className="text-center mb-8">
            <img src="/taj-logo.svg" alt="TAJ Pharmacy" className="mx-auto mb-4 h-28 w-28 object-contain" />
            <h1 className="text-xl font-bold text-ink-main">TAJ Pharmacy</h1>
            <p className="text-sm text-ink-muted mt-1">{t('app.title')}</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              ref={usernameRef}
              name="username"
              label={t('auth.username')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
            <Input
              name="password"
              label={t('auth.password')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />

            {error && (
              <div className="text-sm text-status-danger bg-status-danger-bg px-3 py-2 rounded-xl">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" disabled={loading} className="w-full mt-2">
              {loading ? t('common.loading') : t('auth.loginButton')}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
