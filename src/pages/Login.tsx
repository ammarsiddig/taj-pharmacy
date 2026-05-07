import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/dashboard', { replace: true });
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
        <div className="bg-ivory-surface rounded-sm shadow-lg p-8 border border-ivory-border">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-[#1C5F6F] rounded-sm mx-auto mb-4 flex items-center justify-center">
              <span className="text-white text-2xl font-bold">TAJ</span>
            </div>
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
              <div className="text-sm text-status-danger bg-status-danger-bg px-3 py-2 rounded-sm">
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
