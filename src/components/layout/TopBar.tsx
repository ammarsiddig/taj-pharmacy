import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { getSystemAlerts, getBranchId } from '../../api';
import type { NotificationRow } from '../../types';
import PharmacySwitcher from '../PharmacySwitcher';

const SEVERITY_COLORS: Record<string, string> = {
  error: 'text-red-600 bg-red-50 border-red-100',
  warning: 'text-yellow-700 bg-yellow-50 border-yellow-100',
  info: 'text-blue-600 bg-blue-50 border-blue-100',
  success: 'text-green-600 bg-green-50 border-green-100',
};

const SEVERITY_DOT: Record<string, string> = {
  error: 'bg-red-500',
  warning: 'bg-yellow-500',
  info: 'bg-blue-500',
  success: 'bg-green-500',
};

const TYPE_ICONS: Record<string, string> = {
  low_stock: '📦',
  out_of_stock: '⚠️',
  expiring_soon: '⏰',
  expired: '🚫',
  overdue_payables: '💰',
};

function useTimeAgo() {
  const { t } = useTranslation();
  return (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('notifications.justNow');
    if (mins < 60) return `${mins}${t('notifications.minutesAgo')}`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}${t('notifications.hoursAgo')}`;
    return `${Math.floor(hrs / 24)}${t('notifications.daysAgo')}`;
  };
}

export default function TopBar() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [alerts, setAlerts] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const branchId = getBranchId();

  const loadAlerts = useCallback(async () => {
    try {
      const data = await getSystemAlerts(branchId);
      setAlerts(data);
    } catch {
      // silently ignore
    }
  }, [branchId]);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAlerts();
    const timer = setInterval(loadAlerts, 5 * 60 * 1000); // poll every 5 min
    return () => clearInterval(timer);
  }, [user, loadAlerts]);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const timeAgo = useTimeAgo();
  const errorCount = alerts.filter(a => a.severity === 'error').length;
  const hasAlerts = alerts.length > 0;

  return (
    <header className="h-16 bg-white/92 backdrop-blur-sm border-b border-ivory-border flex items-center px-5 shrink-0 shadow-[0_8px_24px_-20px_rgb(15_23_42_/_0.35)] z-[60] relative">
      {/* Left: pharmacy name + switcher */}
      <div className="flex items-center gap-4">
        <span className="text-base font-bold text-brand-600">TAJ Pharmacy</span>
        <PharmacySwitcher />
      </div>

      {/* Right: controls */}
      <div className="me-auto flex items-center gap-3">
        {/* Notification bell */}
        <div className="relative" ref={dropRef}>
          <button
            onClick={() => setOpen(v => !v)}
            className={`relative p-2.5 rounded-xl border transition-colors ${open ? 'bg-white text-gray-700 border-ivory-border shadow-[var(--shadow-soft)]' : 'text-gray-500 hover:text-gray-700 bg-ivory-muted border-ivory-border hover:bg-white'}`}
            aria-label={t('notifications.title')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {hasAlerts && (
              <span className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${errorCount > 0 ? 'bg-red-500' : 'bg-yellow-500'}`}>
                {alerts.length}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute left-0 top-full mt-2 w-80 bg-white border border-ivory-border rounded-2xl shadow-[var(--shadow-float)] z-[70] overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="font-semibold text-gray-900 text-sm">{t('notifications.title')}</span>
                <button onClick={loadAlerts} className="text-xs text-primary-600 hover:underline">{t('notifications.refresh')}</button>
              </div>
              {alerts.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-gray-400">
                  <div className="text-2xl mb-1">✅</div>
                  {t('notifications.allClear')}
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  {alerts.map(alert => (
                    <div key={alert.id} className={`px-4 py-3 border-b last:border-0 ${SEVERITY_COLORS[alert.severity] || ''}`}>
                      <div className="flex items-start gap-2">
                        <span className="text-base leading-none mt-0.5">{TYPE_ICONS[alert.notification_type] || '🔔'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_DOT[alert.severity]}`} />
                            <span className="font-medium text-sm leading-tight">{alert.title_ar || alert.title}</span>
                          </div>
                          <p className="text-xs mt-0.5 opacity-80 leading-snug">{alert.message_ar || alert.message}</p>
                          <span className="text-xs opacity-60 mt-0.5 block">{timeAgo(alert.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="px-4 py-2 border-t border-gray-100 text-center">
                <span className="text-xs text-gray-400">{t('notifications.autoRefresh')}</span>
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-ink-main font-medium">{user?.full_name_ar || user?.full_name}</span>
          <button
            onClick={logout}
            className="text-ink-muted hover:text-status-danger text-xs px-3 py-1.5 rounded-xl hover:bg-status-danger-bg"
          >
            {t('auth.logout')}
          </button>
        </div>
      </div>
    </header>
  );
}
