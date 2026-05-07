import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../../api';
import type { NotificationSettingRow, NotificationSettingUpdate } from '../../types';
import Toast from '../../components/ui/Toast';

export default function NotificationsTab() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<NotificationSettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);

  useEffect(() => {
    (async () => {
      try { setSettings(await api.getNotificationSettings()); }
      catch (e: unknown) { setToast({ msg: String(e), type: 'danger' }); }
      finally { setLoading(false); }
    })();
  }, []);

  const handleToggle = async (s: NotificationSettingRow) => {
    const updated: NotificationSettingUpdate = { notification_type: s.notification_type, is_enabled: !s.is_enabled, threshold_value: s.threshold_value };
    try {
      await api.updateNotificationSetting(updated);
      setSettings(prev => prev.map(x => x.id === s.id ? { ...x, is_enabled: !x.is_enabled } : x));
      setToast({ msg: t('settings.notificationSettings.saveSuccess'), type: 'success' });
    } catch (e: unknown) { setToast({ msg: String(e), type: 'danger' }); }
  };

  const handleThreshold = async (s: NotificationSettingRow, val: number) => {
    const updated: NotificationSettingUpdate = { notification_type: s.notification_type, is_enabled: s.is_enabled, threshold_value: val || undefined };
    try {
      await api.updateNotificationSetting(updated);
      setSettings(prev => prev.map(x => x.id === s.id ? { ...x, threshold_value: val } : x));
    } catch (e: unknown) { setToast({ msg: String(e), type: 'danger' }); }
  };

  if (loading) return <div className="py-12 text-center text-ink-muted">{t('common.loading')}</div>;

  return (
    <div className="app-card max-w-3xl space-y-4 p-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <h3 className="text-base font-bold text-ink-main">{t('settings.notificationSettings.title')}</h3>
      <p className="text-sm text-ink-muted">{t('settings.notificationSettings.description')}</p>
      <div className="app-card overflow-hidden shadow-none">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-ivory-border bg-surface-secondary">
            <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.notificationSettings.type')}</th>
            <th className="px-4 py-2.5 text-center font-medium text-ink-muted">{t('settings.notificationSettings.enabled')}</th>
            <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.notificationSettings.threshold')}</th>
          </tr></thead>
          <tbody>
            {settings.map(s => {
              const unit = t(`settings.notificationSettings.thresholdUnits.${s.notification_type}` as Parameters<typeof t>[0]) || '';
              const hasThreshold = !!unit;
              return (
                <tr key={s.id} className="border-b border-ivory-border bg-white">
                  <td className="px-4 py-2.5 text-ink-main">{t(`settings.notificationSettings.types.${s.notification_type}` as Parameters<typeof t>[0])}</td>
                  <td className="px-4 py-2.5 text-center">
                    <input type="checkbox" checked={s.is_enabled} onChange={() => handleToggle(s)} className="w-4 h-4 accent-primary-600" />
                  </td>
                  <td className="px-4 py-2.5">
                    {hasThreshold ? (
                      <div className="flex items-center gap-2">
                        <input type="number" className="app-input w-20 px-2 py-1.5 text-sm text-ink-main"
                          value={s.threshold_value ?? ''} onChange={e => handleThreshold(s, parseInt(e.target.value) || 0)} />
                        <span className="text-xs text-ink-muted">{unit}</span>
                      </div>
                    ) : <span className="text-ink-muted">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
