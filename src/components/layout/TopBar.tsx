import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { getSystemAlerts, getBranchId, dismissSystemAlert, undismissAllSystemAlerts, checkPendingUpdate } from '../../api';
import { installUpdate } from '../../api/system';
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
  supplier_overdue: '📅',
  license_suspended: '🔒',
  license_expired: '❌',
  license_expiring_7: '⏳',
  license_expiring_30: '📋',
  update_available: '⬆️',
};

const CATEGORY_GROUPS: { label: string; labelAr: string; types: string[] }[] = [
  { label: 'Inventory', labelAr: 'المخزون', types: ['low_stock', 'out_of_stock', 'expiring_soon', 'expired'] },
  { label: 'Payments', labelAr: 'المدفوعات', types: ['overdue_payables', 'supplier_overdue'] },
  { label: 'License', labelAr: 'الترخيص', types: ['license_suspended', 'license_expired', 'license_expiring_7', 'license_expiring_30'] },
  { label: 'System', labelAr: 'النظام', types: ['update_available'] },
];

function getAlertCategory(type: string): string | null {
  for (const g of CATEGORY_GROUPS) {
    if (g.types.includes(type)) return g.label;
  }
  return null;
}

function getAlertActionLabel(type: string): string {
  switch (type) {
    case 'low_stock':
    case 'out_of_stock': return 'viewProducts';
    case 'expiring_soon':
    case 'expired': return 'viewWarehouse';
    case 'overdue_payables':
    case 'supplier_overdue': return 'viewPurchases';
    case 'license_suspended':
    case 'license_expired':
    case 'license_expiring_7':
    case 'license_expiring_30': return 'viewLicense';
    default: return 'view';
  }
}

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
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
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
    const timer = setInterval(loadAlerts, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [user, loadAlerts]);

  useEffect(() => {
    if (!user) return;
    const check = () => { checkPendingUpdate().then(() => loadAlerts()).catch(() => {}); };
    check();
    const timer = setInterval(check, 24 * 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [user, loadAlerts]);

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

  function handleAlertClick(alert: NotificationRow) {
    setReadIds(prev => new Set(prev).add(alert.id));
    if (alert.reference_type === 'settings' && alert.reference_id === 'license') {
      navigate('/settings', { state: { tab: 'license' } });
      setOpen(false);
    } else if (alert.reference_type === 'products') {
      navigate('/products');
      setOpen(false);
    } else if (alert.reference_type === 'batches') {
      navigate('/warehouse');
      setOpen(false);
    } else if (alert.reference_type === 'suppliers' || alert.reference_type === 'supplier_invoices') {
      navigate('/purchases');
      setOpen(false);
    } else if (alert.reference_type === 'license') {
      navigate('/settings', { state: { tab: 'license' } });
      setOpen(false);
    }
  }

  async function handleDismiss(alertType: string) {
    await dismissSystemAlert(alertType);
    loadAlerts();
  }

  async function handleDismissAll() {
    await undismissAllSystemAlerts();
    loadAlerts();
  }

  // Group alerts by category
  const groupedAlerts: { category: string | null; alerts: NotificationRow[] }[] = [];
  const categorizedAlerts = new Map<string | null, NotificationRow[]>();
  for (const alert of alerts) {
    const cat = getAlertCategory(alert.notification_type);
    if (!categorizedAlerts.has(cat)) categorizedAlerts.set(cat, []);
    categorizedAlerts.get(cat)!.push(alert);
  }

  const categoryOrder = ['Inventory', 'Payments', 'License', 'System'];
  for (const cat of categoryOrder) {
    const catAlerts = categorizedAlerts.get(cat);
    if (catAlerts && catAlerts.length > 0) {
      groupedAlerts.push({ category: cat, alerts: catAlerts });
      categorizedAlerts.delete(cat);
    }
  }
  // Any uncategorized at the end
  for (const [cat, catAlerts] of categorizedAlerts) {
    if (catAlerts.length > 0) groupedAlerts.push({ category: cat, alerts: catAlerts });
  }

  function categoryLabel(cat: string | null) {
    if (!cat) return '';
    const group = CATEGORY_GROUPS.find(g => g.label === cat);
    if (!group) return cat;
    // Check if i18n locale is Arabic (simple heuristic: RTL)
    return document.documentElement.dir === 'rtl' ? group.labelAr : group.label;
  }

  return (
    <header className="h-16 bg-white/92 backdrop-blur-sm border-b border-ivory-border flex items-center px-5 shrink-0 shadow-[0_8px_24px_-20px_rgb(15_23_42_/_0.35)] z-[60] relative">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <img src="/taj-logo.svg" alt="TAJ Pharmacy" className="h-8 w-8 object-contain" />
          <span className="text-base font-bold text-brand-600">TAJ Pharmacy</span>
        </div>
        <PharmacySwitcher />
      </div>

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
              <span className={`absolute -top-0.5 -end-0.5 min-w-[16px] h-4 px-0.5 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${errorCount > 0 ? 'bg-red-500' : 'bg-yellow-500'}`}>
                {alerts.length}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute start-0 top-full mt-2 w-80 bg-white border border-ivory-border rounded-2xl shadow-[var(--shadow-float)] z-[70] overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="font-semibold text-gray-900 text-sm">{t('notifications.title')}</span>
                <div className="flex items-center gap-2">
                  {hasAlerts && (
                    <button onClick={handleDismissAll} className="text-xs text-ink-muted hover:text-status-danger transition-colors">
                      {t('notifications.dismissAll')}
                    </button>
                  )}
                  <button onClick={loadAlerts} className="text-xs text-primary-600 hover:underline">{t('notifications.refresh')}</button>
                </div>
              </div>
              {alerts.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-gray-400">
                  <div className="text-2xl mb-1">✅</div>
                  {t('notifications.allClear')}
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  {groupedAlerts.map(group => (
                    <div key={group.category || 'other'}>
                      <div className="px-4 py-1.5 bg-ivory-muted/50 border-b border-gray-50 text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
                        {categoryLabel(group.category)}
                      </div>
                      {group.alerts.map(alert => (
                        <div
                          key={alert.id}
                          className={`group px-4 py-3 border-b last:border-0 ${alert.reference_type ? 'cursor-pointer hover:brightness-95' : ''} ${SEVERITY_COLORS[alert.severity] || ''} ${readIds.has(alert.id) ? 'opacity-60' : ''}`}
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-base leading-none mt-0.5 flex-shrink-0">{TYPE_ICONS[alert.notification_type] || '🔔'}</span>
                            <div
                              className="flex-1 min-w-0"
                              onClick={() => handleAlertClick(alert)}
                            >
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_DOT[alert.severity]}`} />
                                <span className="font-medium text-sm leading-tight">{alert.title_ar || alert.title}</span>
                              </div>
                              <p className="text-xs mt-0.5 opacity-80 leading-snug">{alert.message_ar || alert.message}</p>
                              <span className="text-xs opacity-60 mt-0.5 block">{timeAgo(alert.created_at)}</span>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDismiss(alert.notification_type); }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10 flex-shrink-0 mt-0.5"
                              title={t('notifications.dismiss')}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M18 6L6 18M6 6l12 12" />
                              </svg>
                            </button>
                            {alert.notification_type !== 'update_available' && alert.reference_type && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleAlertClick(alert); }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-0.5 text-[10px] font-medium rounded border border-current flex-shrink-0 mt-0.5"
                              >
                                {t(`notifications.${getAlertActionLabel(alert.notification_type)}`)}
                              </button>
                            )}
                            {alert.notification_type === 'update_available' && (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setInstalling(true);
                                  try { await installUpdate(); } catch {}
                                  setInstalling(false);
                                }}
                                disabled={installing}
                                className="px-2 py-1 text-xs font-medium rounded-md bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 flex-shrink-0 mt-0.5"
                              >
                                {installing ? t('notifications.installing') : t('notifications.installUpdate')}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
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
