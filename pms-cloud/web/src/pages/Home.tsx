import { useEffect, useState } from 'react';
import { getDashboard, getDashboardTrend, getSubscription, type DashboardData, type DashboardTrendDay, type SubscriptionInfo } from '../api';
import Icon from '../components/ui/Icon';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';

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
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`;
  return `منذ ${Math.floor(diff / 86400)} يوم`;
}

export default function Home({ branch, onDataLoad, onNavigate }: HomeProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [trend, setTrend] = useState<DashboardTrendDay[] | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getDashboard(branch), getDashboardTrend(branch), getSubscription()])
      .then(([d, t, s]) => { setData(d); setTrend(t.days); setSubscription(s); onDataLoad(d); })
      .catch(() => setError('تعذر تحميل البيانات'))
      .finally(() => setLoading(false));
  }, [branch, onDataLoad]);

  if (loading) return <div className="flex flex-col gap-3 p-4">{[...Array(5)].map((_, i) => <Skeleton key={i} height="80px" rounded="md" />)}</div>;
  if (error || !data) return <EmptyState icon="exclamation" title="تعذر تحميل البيانات" />;

  const d = data.dashboard;
  const hasAlerts = d && (d.out_of_stock_count > 0 || d.low_stock_count > 0 || d.expiring_soon_count > 0);

  return (
    <div className="flex flex-col gap-3 p-4 pb-6">
      {/* Subscription Banner */}
      {subscription && subscription.status !== 'active' && (
        <button onClick={() => onNavigate('settings')}
          className="w-full rounded-xl p-4 text-start flex items-center gap-3"
          style={{
            background: subscription.status === 'expired' ? '#FEF2F2' : subscription.status === 'suspended' ? '#F3F4F6' : '#FFFBEB',
            border: `1px solid ${subscription.status === 'expired' ? '#FECACA' : subscription.status === 'suspended' ? '#E5E7EB' : '#FCD34D'}`,
          }}>
          <Icon name="exclamation" size={24} style={{ color: subscription.status === 'expired' ? '#DC2626' : '#D97706' }} />
          <div className="flex-1">
            <p className="font-bold text-sm" style={{ color: subscription.status === 'expired' ? '#DC2626' : subscription.status === 'suspended' ? '#374151' : '#92400E' }}>
              {subscription.status === 'expired' ? 'الاشتراك منتهي' : subscription.status === 'suspended' ? 'الحساب موقوف' : `الاشتراك ينتهي خلال ${subscription.days_remaining} يوم`}
            </p>
          </div>
          <Icon name="chevron-left" size={16} style={{ color: 'var(--color-ink-muted)' }} />
        </button>
      )}

      {/* Today hero card */}
      <div className="rounded-2xl p-5 text-white overflow-hidden relative" style={{ background: 'linear-gradient(135deg, #1C5F6F 0%, #0FA3A6 100%)', boxShadow: '0 10px 25px -16px rgb(13 32 35 / 0.22)' }}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium opacity-70">مبيعات اليوم</p>
          {d && trend && trend.length >= 2 && (() => {
            const today = trend[trend.length - 1]?.total || 0;
            const yesterday = trend[trend.length - 2]?.total || 0;
            if (yesterday === 0) return null;
            const pct = Math.round(((today - yesterday) / yesterday) * 100);
            const up = pct >= 0;
            return (
              <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: up ? 'rgba(255,255,255,0.2)' : 'rgba(220,38,38,0.3)' }}>
                {up ? '↑' : '↓'} {Math.abs(pct)}% عن أمس
              </span>
            );
          })()}
        </div>
        <p className="t-num text-white">{d ? fmt(d.today_sales_total) : '0.00'} <span className="text-sm opacity-50 font-normal">SDG</span></p>
        <div className="mt-4 pt-4 flex gap-6" style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}>
          <div><p className="text-xs opacity-60">نقد</p><p className="text-base font-bold tabular-nums">{d ? fmt(d.today_cash_sales ?? 0) : '0.00'}</p></div>
          <div><p className="text-xs opacity-60">بنوك</p><p className="text-base font-bold tabular-nums">{d ? fmt(d.today_bank_sales ?? 0) : '0.00'}</p></div>
          <div><p className="text-xs opacity-60">مصروفات</p><p className="text-base font-bold tabular-nums">{d ? fmt(d.today_expenses_total ?? 0) : '0.00'}</p></div>
        </div>
        {/* Mini sparkline */}
        {trend && trend.length > 0 && (
          <svg viewBox={`0 0 ${trend.length * 8} 24`} className="absolute top-0 end-0 w-full opacity-10" preserveAspectRatio="none" style={{ height: '100%', pointerEvents: 'none' }}>
            <defs>
              <linearGradient id="sparkGrad"><stop offset="0" stopColor="white" stopOpacity="0.3" /><stop offset="1" stopColor="white" stopOpacity="0" /></linearGradient>
            </defs>
            {(() => {
              const maxVal = Math.max(...trend.map(t => t.total), 1);
              const pts = trend.map((t, i) => `${i * 8 + 4},${24 - (t.total / maxVal) * 20}`).join(' ');
              return <><polyline points={pts} fill="none" stroke="white" strokeWidth="1.5" /><polygon points={`0,24 ${pts} ${trend.length * 8},24`} fill="url(#sparkGrad)" /></>;
            })()}
          </svg>
        )}
      </div>

      {/* Quick tiles - 3 col grid (Apple Wallet style) */}
      <div className="grid grid-cols-3 gap-2">
        {([
          { icon: 'chart-bar', label: 'الشهر', value: d ? fmt(d.month_sales_total) : '—', sub: d ? `${d.month_sales_count} فاتورة` : '' },
          { icon: 'receipt', label: 'مصروفات', value: d ? fmt(d.month_expenses_total ?? 0) : '—', sub: '' },
          { icon: 'user', label: 'العملاء', value: d ? fmt(d.total_receivables ?? 0) : '—', sub: 'ذمم مدينة', page: 'balances' as Page },
        ]).map(tile => (
          <div key={tile.label} onClick={() => tile.page && onNavigate(tile.page)}
            className={`app-card p-3 text-center flex flex-col items-center gap-1 ${tile.page ? 'cursor-pointer press' : ''}`}>
            <Icon name={tile.icon} size={20} style={{ color: 'var(--color-primary-600)' }} />
            <p className="text-[11px] font-medium" style={{ color: 'var(--color-ink-muted)' }}>{tile.label}</p>
            <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-ink-main)' }}>{tile.value}</p>
            {tile.sub && <p className="text-[10px]" style={{ color: 'var(--color-ink-placeholder)' }}>{tile.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {([
          { icon: 'user-group', label: 'الموردين', value: d ? fmt(d.total_payables ?? 0) : '—', sub: 'ذمم دائنة', page: 'balances' as Page },
          { icon: 'plus-circle', label: 'المبيعات', value: d ? `${d.today_sales_count}` : '0', sub: 'فاتورة اليوم', page: 'sales' as Page },
          { icon: 'check-circle', label: 'المنتجات', value: d ? String(d.products_count) : '0', sub: 'منتج', page: 'products' as Page },
        ]).map(tile => (
          <div key={tile.label} onClick={() => tile.page && onNavigate(tile.page)}
            className={`app-card p-3 text-center flex flex-col items-center gap-1 ${tile.page ? 'cursor-pointer press' : ''}`}>
            <Icon name={tile.icon} size={20} style={{ color: 'var(--color-primary-600)' }} />
            <p className="text-[11px] font-medium" style={{ color: 'var(--color-ink-muted)' }}>{tile.label}</p>
            <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-ink-main)' }}>{tile.value}</p>
            {tile.sub && <p className="text-[10px]" style={{ color: 'var(--color-ink-placeholder)' }}>{tile.sub}</p>}
          </div>
        ))}
      </div>

      {/* Alert tiles */}
      {d && hasAlerts && (
        <div className="grid grid-cols-3 gap-2">
          {d.out_of_stock_count > 0 && (
            <div className="app-card p-3 text-center flex flex-col items-center gap-1 cursor-pointer press" onClick={() => onNavigate('stock')}
              style={{ borderColor: 'var(--color-status-danger)' }}>
              <Icon name="x-circle" size={20} style={{ color: 'var(--color-status-danger)' }} />
              <p className="text-sm font-bold" style={{ color: 'var(--color-status-danger)' }}>{d.out_of_stock_count}</p>
              <p className="text-[10px]" style={{ color: 'var(--color-status-danger)' }}>نفد المخزون</p>
            </div>
          )}
          {d.low_stock_count > 0 && (
            <div className="app-card p-3 text-center flex flex-col items-center gap-1 cursor-pointer press" onClick={() => onNavigate('stock')}
              style={{ borderColor: 'var(--color-status-warning)' }}>
              <Icon name="exclamation" size={20} style={{ color: 'var(--color-status-warning)' }} />
              <p className="text-sm font-bold" style={{ color: 'var(--color-status-warning)' }}>{d.low_stock_count}</p>
              <p className="text-[10px]" style={{ color: 'var(--color-status-warning)' }}>منخفض</p>
            </div>
          )}
          {d.expiring_soon_count > 0 && (
            <div className="app-card p-3 text-center flex flex-col items-center gap-1 cursor-pointer press" onClick={() => onNavigate('stock')}
              style={{ borderColor: '#C2410C' }}>
              <Icon name="clock" size={20} style={{ color: '#C2410C' }} />
              <p className="text-sm font-bold" style={{ color: '#C2410C' }}>{d.expiring_soon_count}</p>
              <p className="text-[10px]" style={{ color: '#C2410C' }}>قارب الانتهاء</p>
            </div>
          )}
        </div>
      )}

      {/* 7-Day trend chart */}
      {trend && trend.length > 0 && (
        <div className="app-card p-4">
          <p className="text-xs mb-3" style={{ color: 'var(--color-ink-muted)' }}>اتجاه المبيعات (آخر ٧ أيام)</p>
          {(() => {
            const maxTotal = Math.max(...trend.map(t => t.total), 1);
            const hasSales = trend.some(t => t.total > 0);
            if (!hasSales) return <p className="text-center text-xs py-6" style={{ color: 'var(--color-ink-placeholder)' }}>لا توجد مبيعات خلال آخر ٧ أيام</p>;
            const chartW = 310; const chartH = 130; const barW = 30; const sectionW = chartW / 7;
            const arMonths = ['يناير','فبراير','مارس','إبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
            const fmtDate = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${arMonths[d.getMonth()]}`; };
            return (
              <svg viewBox="0 0 320 185" className="w-full" style={{ overflow: 'visible' }}>
                <line x1="5" y1="150" x2="315" y2="150" stroke="var(--color-ivory-border)" strokeWidth="1" />
                {trend.map((day, i) => {
                  const cx = 5 + sectionW * i + sectionW / 2;
                  const barX = cx - barW / 2;
                  const barH = Math.max((day.total / maxTotal) * chartH, day.total > 0 ? 4 : 0);
                  const barY = 150 - barH;
                  const isMax = day.total === maxTotal && maxTotal > 0;
                  return (
                    <g key={day.date}>
                      <rect x={barX} y={barY} width={barW} height={barH} rx="3" fill={isMax ? 'var(--color-primary-300)' : 'var(--color-primary-500)'}>
                        <animate attributeName="height" from="0" to={String(barH)} dur="0.6s" fill="freeze" />
                        <animate attributeName="y" from="150" to={String(barY)} dur="0.6s" fill="freeze" />
                      </rect>
                      <text x={cx} y={barY - 6} textAnchor="middle" fontSize="9" fill="var(--color-ink-main)">{(day.total / 100).toFixed(1)}</text>
                      <text x={cx} y="168" textAnchor="middle" fontSize="9" fill="var(--color-ink-muted)">{fmtDate(day.date)}</text>
                    </g>
                  );
                })}
              </svg>
            );
          })()}
        </div>
      )}

      {/* Quick actions list */}
      <div className="app-card">
        {([
          { page: 'sales' as Page, icon: 'receipt', label: 'المبيعات', sub: d ? `${d.today_sales_count} فاتورة اليوم` : '' },
          { page: 'activity' as Page, icon: 'clock', label: 'سجل النشاط', sub: '' },
          { page: 'sync' as Page, icon: 'sync', label: 'المزامنة', sub: relativeTime(data.sync.last_sync_at) },
        ]).map((item, i, arr) => (
          <button key={item.page} onClick={() => onNavigate(item.page)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-start"
            style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--color-ivory-border)' : 'none' }}>
            <Icon name={item.icon} size={20} style={{ color: 'var(--color-primary-600)' }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--color-ink-main)' }}>{item.label}</p>
              {item.sub && <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>{item.sub}</p>}
            </div>
            <Icon name="chevron-left" size={14} style={{ color: 'var(--color-ink-muted)' }} />
          </button>
        ))}
      </div>

      <p className="text-center text-xs" style={{ color: 'var(--color-ink-placeholder)' }}>
        آخر مزامنة: {relativeTime(data.sync.last_sync_at)}
      </p>
    </div>
  );
}
