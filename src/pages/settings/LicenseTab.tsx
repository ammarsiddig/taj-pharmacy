import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../../api';
import type { LicenseHistoryRow } from '../../types';
import type { UpdateCheckResult } from '../../api';
import { useLicense } from '../../hooks/useLicense';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Toast from '../../components/ui/Toast';

function UpdateSection() {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    setChecking(true);
    setError(null);
    setResult(null);
    try { setResult(await api.checkForUpdate()); }
    catch (e) { setError(String(e)); }
    finally { setChecking(false); }
  };

  const handleInstall = async () => {
    setInstalling(true);
    setError(null);
    try { await api.installUpdate(); }
    catch (e) { setError(String(e)); setInstalling(false); }
    // If successful, the app restarts — we never reach the finally block
  };

  return (
    <div className="app-card space-y-3 p-5">
      <div>
        <h4 className="text-sm font-bold text-ink-main">{t('settings.license.updates.title')}</h4>
        <p className="mt-0.5 text-xs text-ink-muted">{t('settings.license.updates.description')}</p>
      </div>
      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger/5 px-3 py-2 text-xs text-status-danger">{error}</div>
      )}
      {result && !error && (
        <div className={`rounded-lg border px-3 py-2 text-xs ${
          result.available ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-ivory-border bg-surface-secondary text-ink-muted'
        }`}>
          {!result.configured
            ? t('settings.license.updates.notConfigured')
            : result.available
              ? t('settings.license.updates.available', { version: result.version })
              : t('settings.license.updates.upToDate', { version: result.current_version })}
          {result.available && result.notes && (
            <p className="mt-1 whitespace-pre-wrap text-xs opacity-80">{result.notes}</p>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <Button onClick={handleCheck} disabled={checking || installing}>
          {checking ? t('settings.license.updates.checking') : t('settings.license.updates.checkButton')}
        </Button>
        {result?.available && (
          <Button onClick={handleInstall} disabled={installing}>
            {installing ? t('settings.license.updates.installing') : t('settings.license.updates.installButton')}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function LicenseTab() {
  const { t } = useTranslation();
  const { license, loading, refresh } = useLicense();
  const [history, setHistory] = useState<LicenseHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);

  // Unified key action state
  const [hasToken, setHasToken] = useState<boolean | null>(null); // null = still loading
  const [licKey, setLicKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.getLicenseHistory()
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));

    api.getSyncConfig()
      .then(cfg => setHasToken(!!cfg.token))
      .catch(() => setHasToken(false));
  }, []);

  const handleSubmit = async () => {
    if (!licKey.trim()) return;
    setSubmitting(true);
    try {
      if (hasToken) {
        // Already activated — just renew
        await api.renewLicenseCloud({ key: licKey.trim() });
      } else {
        // First-time activation
        if (!email.trim() || !password) {
          setToast({ msg: t('settings.license.activateEmailRequired'), type: 'danger' });
          return;
        }
        await api.activateLicenseCloud({
          key: licKey.trim(),
          email: email.trim(),
          password,
          pharmacy_name: '',
        });
        setHasToken(true);
      }
      await refresh();
      api.getLicenseHistory().then(setHistory).catch(() => {});
      setLicKey('');
      setEmail('');
      setPassword('');
      setToast({ msg: t('settings.license.activateSuccess'), type: 'success' });
    } catch (e: unknown) {
      setToast({ msg: `${t('settings.license.activateError')}: ${e}`, type: 'danger' });
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="py-12 text-center text-ink-muted">{t('common.loading')}</div>;

  const statusBadgeVariant = () => {
    if (!license) return 'neutral' as const;
    if (license.in_grace_period) return 'warning' as const;
    if (!license.is_valid) return 'danger' as const;
    return 'success' as const;
  };

  const statusLabel = () => {
    if (!license) return '—';
    if (license.in_grace_period) return t('settings.license.inGrace');
    if (!license.is_valid) return t('settings.license.invalid');
    return t('settings.license.valid');
  };

  return (
    <div className="max-w-3xl space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Expiry Warning Banner */}
      {license && (license.days_until_expiry !== undefined && license.days_until_expiry !== null) && (
        (license.days_until_expiry <= 14 || license.in_grace_period) && (
          <div className={`rounded-xl border px-4 py-3 ${
            license.days_until_expiry <= 7 || !license.is_valid
              ? 'border-status-danger/30 bg-status-danger/10'
              : 'border-amber-400/30 bg-amber-50'
          }`}>
            <div className="flex items-start gap-3">
              <span className="text-xl">{license.is_valid ? '⏰' : '⛔'}</span>
              <div className="flex-1">
                <p className={`font-bold text-sm ${
                  license.days_until_expiry <= 7 || !license.is_valid ? 'text-status-danger' : 'text-amber-700'
                }`}>
                  {license.in_grace_period
                    ? t('settings.license.graceWarning')
                    : license.days_until_expiry <= 7
                      ? t('settings.license.expiryUrgent')
                      : t('settings.license.expiryWarning')}
                </p>
                <p className="text-xs mt-1 text-ink-muted">
                  {t('settings.license.renewPrompt')}
                </p>
              </div>
            </div>
          </div>
        )
      )}

      <div className="app-card space-y-3 p-5">
        <h3 className="text-base font-bold text-ink-main">{t('settings.license.title')}</h3>
        {license ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-ink-muted">{t('settings.license.currentPlan')}</span>
                <span className="font-semibold text-ink-main capitalize">{t(`settings.license.plans.${license.plan}` as Parameters<typeof t>[0], { defaultValue: license.plan })}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-ink-muted">{t('settings.license.status')}</span>
                <Badge variant={statusBadgeVariant()}>{statusLabel()}</Badge>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-ink-muted">{t('settings.license.expiry')}</span>
                <span className="text-ink-main">{license.expiry || t('settings.license.noExpiry')}</span>
              </div>
              {license.days_until_expiry !== undefined && license.days_until_expiry !== null && !license.in_grace_period && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-ink-muted">{t('settings.license.daysLeft')}</span>
                  <span className={`font-semibold ${
                    license.days_until_expiry <= 7 ? 'text-status-danger'
                    : license.days_until_expiry <= 14 ? 'text-amber-500'
                    : 'text-ink-main'
                  }`}>{license.days_until_expiry}</span>
                </div>
              )}
              {license.in_grace_period && license.grace_days_remaining !== undefined && license.grace_days_remaining !== null && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-ink-muted">{t('settings.license.graceDaysLeft')}</span>
                  <span className="font-semibold text-amber-600">{license.grace_days_remaining}</span>
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-ink-muted">{t('settings.license.maxBranches')}</span>
                <span className="text-ink-main">{license.max_branches}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-ink-muted">{t('settings.license.maxUsers')}</span>
                <span className="text-ink-main">{license.max_users}</span>
              </div>
            </div>
            {license.is_read_only && (
              <div className="rounded-xl border border-status-danger/20 bg-status-danger/5 px-3 py-2 text-xs text-status-danger">
                {t('settings.license.readOnlyMode')}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">{t('settings.license.noLicense')}</p>
        )}
      </div>

      {/* Unified license key action */}
      <div className="app-card space-y-4 p-5">
        <div>
          <h4 className="text-sm font-bold text-ink-main">
            {hasToken ? t('settings.license.renewTitle') : t('settings.license.activateTitle')}
          </h4>
          {!hasToken && hasToken !== null && (
            <p className="mt-0.5 text-xs text-ink-muted">{t('settings.license.activateDescription')}</p>
          )}
        </div>

        <div>
          <label className="block text-xs text-ink-muted mb-1">{t('settings.license.licenseKey')}</label>
          <input
            className="app-input w-full px-3 py-2.5 text-sm font-mono text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            value={licKey}
            onChange={e => setLicKey(e.target.value)}
            placeholder="PMS-XXXX-XXXX-XXXX"
            dir="ltr"
          />
        </div>

        {/* Only shown on first-time activation (no token yet) */}
        {!hasToken && hasToken !== null && (
          <>
            <div>
              <label className="block text-xs text-ink-muted mb-1">{t('settings.license.ownerEmail')}</label>
              <input
                type="email"
                className="app-input w-full px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="owner@example.com"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-muted mb-1">{t('settings.license.ownerPassword')}</label>
              <input
                type="password"
                className="app-input w-full px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </>
        )}

        <Button onClick={handleSubmit} disabled={submitting || !licKey.trim() || hasToken === null}>
          {submitting
            ? t('settings.license.activating')
            : hasToken
              ? t('settings.license.renew')
              : t('settings.license.activate')}
        </Button>
      </div>

      <div className="app-card overflow-hidden">
        <div className="border-b border-ivory-border px-5 py-3">
          <h4 className="text-sm font-bold text-ink-main">{t('settings.license.history')}</h4>
        </div>
        {historyLoading ? (
          <div className="py-8 text-center text-sm text-ink-muted">{t('common.loading')}</div>
        ) : history.length === 0 ? (
          <div className="py-8 text-center text-sm text-ink-muted">{t('settings.license.noHistory')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ivory-border bg-surface-secondary text-xs text-ink-muted">
                <th className="px-4 py-2.5 text-right font-medium">{t('settings.license.currentPlan')}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t('common.date')}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t('settings.license.expiry')}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t('settings.license.maxBranches')}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t('settings.license.maxUsers')}</th>
              </tr>
            </thead>
            <tbody>
              {history.map(row => (
                <tr key={row.id} className="border-b border-ivory-border last:border-0 hover:bg-primary-100/40">
                  <td className="px-4 py-2.5 font-medium capitalize text-ink-main">{t(`settings.license.plans.${row.plan}` as Parameters<typeof t>[0], { defaultValue: row.plan })}</td>
                  <td className="px-4 py-2.5 text-ink-muted">{row.activated_at.slice(0, 10)}</td>
                  <td className="px-4 py-2.5 text-ink-muted">{row.expires_at?.slice(0, 10) || t('settings.license.noExpiry')}</td>
                  <td className="px-4 py-2.5 text-center text-ink-muted">{row.max_branches}</td>
                  <td className="px-4 py-2.5 text-center text-ink-muted">{row.max_users}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <UpdateSection />
    </div>
  );
}
