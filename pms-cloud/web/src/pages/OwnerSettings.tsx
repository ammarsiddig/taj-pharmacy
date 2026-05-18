import { useEffect, useState } from 'react';
import { getSubscription, clearToken, changePassword, type SubscriptionInfo } from '../api';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import InstallBanner from '../components/InstallBanner';

interface Props {
  onLogout: () => void;
}

export default function OwnerSettings({ onLogout }: Props) {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const { canInstall, isIOS, install } = useInstallPrompt();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    getSubscription()
      .then(setSubscription)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    clearToken();
    onLogout();
  };

  const statusColors: Record<string, { bg: string; color: string; label: string }> = {
    active: { bg: '#F0FDF4', color: '#059669', label: 'نشط' },
    expiring: { bg: '#FFFBEB', color: '#D97706', label: 'ينتهي قريباً' },
    expired: { bg: '#FEF2F2', color: '#DC2626', label: 'منتهي' },
    suspended: { bg: '#F3F4F6', color: '#374151', label: 'موقوف' },
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || newPassword.length < 6) return;
    setChangingPassword(true);
    setPasswordMsg(null);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordMsg({ text: 'تم تغيير كلمة المرور بنجاح', ok: true });
      setCurrentPassword('');
      setNewPassword('');
    } catch {
      setPasswordMsg({ text: 'كلمة المرور الحالية غير صحيحة', ok: false });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 pb-20">
      <h1 className="text-xl font-black" style={{ color: 'var(--color-ink-main)' }}>⚙️ الإعدادات</h1>

      {/* Account Card */}
      <div className="app-card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-xl"
            style={{ background: 'var(--color-primary-100)' }}
          >
            🏥
          </div>
          <div className="flex-1">
            <p className="font-bold" style={{ color: 'var(--color-ink-main)' }}>
              {subscription?.pharmacy_name || 'صيدليتك'}
            </p>
            <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>الحساب نشط</p>
          </div>
        </div>
      </div>

      {/* Password Change Card — TASK-507 */}
      <div className="app-card p-5">
        <p className="font-semibold mb-4" style={{ color: 'var(--color-ink-main)' }}>🔑 تغيير كلمة المرور</p>
        <div className="flex flex-col gap-3">
          <input
            type="password"
            placeholder="كلمة المرور الحالية"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="app-input px-3 py-2.5 text-sm"
            autoComplete="current-password"
          />
          <input
            type="password"
            placeholder="كلمة المرور الجديدة (6 أحرف على الأقل)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="app-input px-3 py-2.5 text-sm"
            autoComplete="new-password"
          />
          <button
            onClick={handleChangePassword}
            disabled={changingPassword || !currentPassword || newPassword.length < 6}
            className="rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: 'var(--color-primary-600)' }}
          >
            {changingPassword ? 'جاري التغيير...' : 'تغيير كلمة المرور'}
          </button>
          {passwordMsg && (
            <p className={`text-xs text-center ${passwordMsg.ok ? '' : ''}`} style={{ color: passwordMsg.ok ? '#059669' : '#DC2626' }}>
              {passwordMsg.text}
            </p>
          )}
        </div>
      </div>

      {/* Subscription Card */}
      <div className="app-card p-5">
        <p className="font-semibold mb-4" style={{ color: 'var(--color-ink-main)' }}>📅 الاشتراك</p>
        {loading ? (
          <div className="flex justify-center py-4">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-transparent" style={{ borderTopColor: 'var(--color-primary-600)' }} />
          </div>
        ) : subscription ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>الحالة</span>
              <span
                className="rounded-full px-3 py-1 text-xs font-bold"
                style={{
                  background: statusColors[subscription.status]?.bg || '#F3F4F6',
                  color: statusColors[subscription.status]?.color || '#374151',
                }}
              >
                {statusColors[subscription.status]?.label || subscription.status}
              </span>
            </div>
            {subscription.expires_at && (
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>تاريخ الانتهاء</span>
                <span className="font-mono text-sm" style={{ color: 'var(--color-ink-main)' }}>
                  {new Date(subscription.expires_at).toLocaleDateString('ar')}
                </span>
              </div>
            )}
            {subscription.days_remaining !== null && subscription.days_remaining >= 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>الأيام المتبقية</span>
                <span className="font-bold text-sm" style={{ color: subscription.days_remaining <= 14 ? '#D97706' : 'var(--color-ink-main)' }}>
                  {subscription.days_remaining} يوم
                </span>
              </div>
            )}
            {subscription.status === 'expiring' && (
              <div className="rounded-xl p-3 mt-2" style={{ background: '#FFFBEB', border: '1px solid #FCD34D' }}>
                <p className="text-sm" style={{ color: '#92400E' }}>
                  ⏰ اشتراكك على وشك الانتهاء. تواصل مع الدعم للتجديد.
                </p>
              </div>
            )}
            {subscription.status === 'expired' && (
              <div className="rounded-xl p-3 mt-2" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
                <p className="text-sm" style={{ color: '#DC2626' }}>
                  ⛔ اشتراكك منتهي. يرجى التجديد فوراً للاستمرار في استخدام النظام.
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-center py-4" style={{ color: 'var(--color-ink-muted)' }}>تعذر تحميل معلومات الاشتراك</p>
        )}
      </div>

      {/* Support Card */}
      <div className="app-card p-5">
        <p className="font-semibold mb-3" style={{ color: 'var(--color-ink-main)' }}>💬 الدعم الفني</p>
        <p className="text-sm mb-3" style={{ color: 'var(--color-ink-muted)' }}>
          للمساعدة أو تجديد الاشتراك، تواصل معنا:
        </p>
        <div className="flex flex-col gap-2">
          <a
            href="tel:+249123456789"
            className="flex items-center gap-2 rounded-xl p-3"
            style={{ background: 'var(--color-ivory-muted)' }}
          >
            <span>📞</span>
            <span className="text-sm" dir="ltr">+249 123 456 789</span>
          </a>
          <a
            href="mailto:support@taj-pharmacy.com"
            className="flex items-center gap-2 rounded-xl p-3"
            style={{ background: 'var(--color-ivory-muted)' }}
          >
            <span>✉️</span>
            <span className="text-sm" dir="ltr">support@taj-pharmacy.com</span>
          </a>
        </div>
      </div>

      {/* Version Info */}
      <div className="text-center py-4">
        <p className="text-xs" style={{ color: 'var(--color-ink-placeholder)' }}>TAJ Pharmacy v4.0</p>
        <p className="text-xs mt-1" style={{ color: 'var(--color-ink-placeholder)' }}>© 2025 جميع الحقوق محفوظة</p>
        <div className="mt-3">
          <InstallBanner canInstall={canInstall} isIOS={isIOS} onInstall={install} compact />
        </div>
      </div>

      {/* Logout Button */}
      <button
        onClick={handleLogout}
        className="w-full rounded-xl py-3 text-sm font-bold"
        style={{ background: 'var(--color-status-danger-bg, #fee2e2)', color: 'var(--color-status-danger)' }}
      >
        🚪 تسجيل الخروج
      </button>
    </div>
  );
}
