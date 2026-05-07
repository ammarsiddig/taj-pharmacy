import { useEffect, useState } from 'react';
import { getDashboard, getSubscription, type DashboardData, type SubscriptionInfo } from '../api';

type Page = 'home' | 'sales' | 'products' | 'stock' | 'balances' | 'activity' | 'sync' | 'settings';

interface HomeProps {
  branch: string;
  onDataLoad: (data: DashboardData) => void;
  onNavigate: (page: Page) => void;
}

function fmt(fils: number): string {
  return (fils / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'غير متاح';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return 'الآن';
  if (diff < 3600)  return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
  return `منذ ${Math.floor(diff / 86400)} يوم`;
}

export default function Home({ branch, onDataLoad, onNavigate }: HomeProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getDashboard(branch), getSubscription()])
      .then(([d, s]) => { setData(d); setSubscription(s); onDataLoad(d); })
      .catch(() => setError('تعذر تحميل البيانات'))
      .finally(() => setLoading(false));
  }, [branch, onDataLoad]);

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-transparent" style={{ borderTopColor: 'var(--color-primary-600)' }} />
          <span className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>جاري التحميل...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-64 items-center justify-center px-6">
        <div className="text-center">
          <div className="mb-2 text-4xl">⚠️</div>
          <p className="font-medium" style={{ color: 'var(--color-ink-main)' }}>تعذر تحميل البيانات</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-ink-muted)' }}>تحقق من الاتصال وحاول مجدداً</p>
        </div>
      </div>
    );
  }

  const d = data.dashboard;
  const hasAlerts = d && (d.out_of_stock_count > 0 || d.low_stock_count > 0 || d.expiring_soon_count > 0);

  const ChevronLeft = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--color-ink-muted)', transform: 'scaleX(-1)', flexShrink: 0 }}>
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );

  return (
    <div className="flex flex-col gap-3 p-4 pb-6">

      {/* Subscription Banner */}
      {subscription && subscription.status !== 'active' && (
        <button
          onClick={() => onNavigate('settings')}
          className="w-full rounded-xl p-4 text-start flex items-center gap-3"
          style={{
            background: subscription.status === 'expired' ? '#FEF2F2' : subscription.status === 'suspended' ? '#F3F4F6' : '#FFFBEB',
            border: `1px solid ${subscription.status === 'expired' ? '#FECACA' : subscription.status === 'suspended' ? '#E5E7EB' : '#FCD34D'}`,
          }}
        >
          <span className="text-2xl">{subscription.status === 'expired' ? '⛔' : subscription.status === 'suspended' ? '🚫' : '⏰'}</span>
          <div className="flex-1">
            <p className="font-bold text-sm" style={{ color: subscription.status === 'expired' ? '#DC2626' : subscription.status === 'suspended' ? '#374151' : '#92400E' }}>
              {subscription.status === 'expired' ? 'الاشتراك منتهي' : subscription.status === 'suspended' ? 'الحساب موقوف' : `الاشتراك ينتهي خلال ${subscription.days_remaining} يوم`}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>
              {subscription.status === 'expired' ? 'يرجى تجديد الاشتراك للاستمرار' : subscription.status === 'suspended' ? 'تواصل مع الدعم' : 'تجديد مبكر يضمن عدم انقطاع الخدمة'}
            </p>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--color-ink-muted)' }}>
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      )}

      {/* Today hero */}
      <div
        className="rounded-2xl p-5 text-white"
        style={{ background: 'linear-gradient(135deg, #1C5F6F 0%, #0FA3A6 100%)', boxShadow: '0 10px 25px -16px rgb(13 32 35 / 0.22)' }}
      >
        <p className="text-xs font-medium opacity-70 mb-1">مبيعات اليوم</p>
        <p className="text-4xl font-black tabular-nums leading-none">
          {d ? fmt(d.today_sales_total) : '0.00'}
        </p>
        <p className="mt-1.5 text-sm opacity-70">
          {d ? d.today_sales_count : 0} فاتورة · SDG
        </p>
        <div className="mt-4 pt-4 flex gap-6" style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}>
          <div>
            <p className="text-xs opacity-60">نقد</p>
            <p className="text-base font-bold tabular-nums">{d ? fmt(d.today_cash_sales ?? 0) : '0.00'}</p>
          </div>
          <div>
            <p className="text-xs opacity-60">بنوك</p>
            <p className="text-base font-bold tabular-nums">{d ? fmt(d.today_bank_sales ?? 0) : '0.00'}</p>
          </div>
          <div>
            <p className="text-xs opacity-60">مصروفات اليوم</p>
            <p className="text-base font-bold tabular-nums">{d ? fmt(d.today_expenses_total ?? 0) : '0.00'}</p>
          </div>
        </div>
      </div>

      {/* Month + Expenses */}
      {d && (
        <div className="grid grid-cols-2 gap-3">
          <div className="app-card p-4">
            <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>مبيعات الشهر</p>
            <p className="mt-1 text-xl font-black tabular-nums" style={{ color: 'var(--color-ink-main)' }}>{fmt(d.month_sales_total)}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>{d.month_sales_count} فاتورة · SDG</p>
          </div>
          <div className="app-card p-4">
            <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>مصروفات الشهر</p>
            <p className="mt-1 text-xl font-black tabular-nums" style={{ color: 'var(--color-status-danger)' }}>{fmt(d.month_expenses_total ?? 0)}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>SDG</p>
          </div>
          <div className="app-card p-4" onClick={() => onNavigate('balances')} style={{ cursor: 'pointer' }}>
            <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>ذمم العملاء</p>
            <p className="mt-1 text-xl font-black tabular-nums" style={{ color: 'var(--color-status-danger)' }}>{fmt(d.total_receivables ?? 0)}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>SDG</p>
          </div>
          <div className="app-card p-4" onClick={() => onNavigate('balances')} style={{ cursor: 'pointer' }}>
            <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>ذمم الموردين</p>
            <p className="mt-1 text-xl font-black tabular-nums" style={{ color: 'var(--color-status-danger)' }}>{fmt(d.total_payables ?? 0)}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>SDG</p>
          </div>
        </div>
      )}

      {/* Quick nav shortcuts */}
      <div style={{ background: 'var(--color-ivory-surface)', border: '1px solid var(--color-ivory-border)', borderRadius: '16px', boxShadow: 'var(--shadow-card)' }}>
        {([
          { page: 'sales'    as Page, icon: '🧾', label: 'المبيعات',   sub: d ? `${d.today_sales_count} اليوم` : '' },
          { page: 'products' as Page, icon: '💊', label: 'المنتجات',   sub: d ? `${d.products_count} منتج` : '' },
          { page: 'stock'    as Page, icon: '📦', label: 'المخزون',    sub: hasAlerts ? '⚠️ تنبيهات' : 'سليم' },
          { page: 'balances' as Page, icon: '💰', label: 'الأرصدة',    sub: d ? `${d.customers_count} عميل` : '' },
          { page: 'activity' as Page, icon: '📋', label: 'سجل النشاط', sub: '' },
          { page: 'sync'     as Page, icon: '🔄', label: 'المزامنة',   sub: relativeTime(data.sync.last_sync_at) },
        ]).map((item, i, arr) => (
          <button
            key={item.page}
            onClick={() => onNavigate(item.page)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-start"
            style={{
              borderBottom: i < arr.length - 1 ? '1px solid var(--color-ivory-border)' : 'none',
              borderRadius: i === 0 ? '16px 16px 0 0' : i === arr.length - 1 ? '0 0 16px 16px' : '0',
              background: 'transparent',
            }}
          >
            <span className="text-xl w-7 text-center">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--color-ink-main)' }}>{item.label}</p>
              {item.sub && <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>{item.sub}</p>}
            </div>
            <ChevronLeft />
          </button>
        ))}
      </div>

      {/* Stock alerts */}
      {d && hasAlerts && (
        <button
          className="app-card flex w-full items-center gap-3 p-4 text-start"
          onClick={() => onNavigate('stock')}
        >
          <span className="text-2xl">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--color-ink-main)' }}>تنبيهات المخزون</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {d.out_of_stock_count > 0 && (
                <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: 'var(--color-status-danger-bg)', color: 'var(--color-status-danger)' }}>{d.out_of_stock_count} نفد</span>
              )}
              {d.low_stock_count > 0 && (
                <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: 'var(--color-status-warning-bg)', color: 'var(--color-status-warning)' }}>{d.low_stock_count} منخفض</span>
              )}
              {d.expiring_soon_count > 0 && (
                <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: '#FFF7ED', color: '#C2410C' }}>{d.expiring_soon_count} قارب الانتهاء</span>
              )}
            </div>
          </div>
          <ChevronLeft />
        </button>
      )}

      <p className="text-center text-xs" style={{ color: 'var(--color-ink-placeholder)' }}>
        آخر مزامنة: {relativeTime(data.sync.last_sync_at)}
      </p>
    </div>
  );
}
