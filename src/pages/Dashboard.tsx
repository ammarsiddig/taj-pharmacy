import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PackageOpen, TrendingUp, DollarSign, Activity, ShoppingCart, CreditCard, Banknote, CalendarX, Cloud, CloudOff, RefreshCw } from 'lucide-react';
import * as api from '../api';
import type { DashboardStats, AuditLogRow } from '../types';
import Badge from '../components/ui/Badge';
import Toast from '../components/ui/Toast';

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [backupStatus, setBackupStatus] = useState<api.BackupLogRow | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [backupError, setBackupError] = useState('');
  const isRtl = i18n.dir() === 'rtl';
  const salesTrend = useMemo(() => (data?.last_7_days_sales ?? []).map((d) => d.total), [data?.last_7_days_sales]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [stats, logs, backup] = await Promise.all([
        api.getDashboardStats(api.getBranchId()),
        api.getAuditLog(undefined, undefined, undefined, 10),
        api.getAutoBackupStatus().catch(() => null),
      ]);
      setData(stats);
      setActivity(logs);
      setBackupStatus(backup);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="app-card p-6 text-center text-base text-ink-muted">{t('common.loading')}</div>;

  return (
    <div className="dashboard-readable space-y-6">
      {error && <Toast message={error} type="danger" onClose={() => setError('')} />}
      {backupError && <Toast message={backupError} type="danger" onClose={() => setBackupError('')} />}

      <div>
        <h2 className="text-2xl font-bold text-ink-main">{t('dashboard.title')}</h2>
        <p className="mt-1 text-base text-ink-muted">{t('dashboard.todaySales')}، {t('dashboard.recentActivity')}، {t('dashboard.stockAlerts')}</p>
      </div>

      {/* Getting Started Checklist — TASK-506 */}
      {data && data.today_sales_count === 0 && data.today_sales_total === 0
        && (data.month_net_profit === 0 || data.month_net_profit === null)
        && (data.customer_receivables === 0 || data.customer_receivables === null)
        && (
        <GettingStarted />
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          label={t('dashboard.todaySales')}
          value={api.formatMoney(data?.today_sales_total ?? 0)}
          sub={`${data?.today_sales_count ?? 0} ${t('dashboard.salesCount')}`}
          change={data?.sales_change_pct ?? 0}
          changeLabel={t('dashboard.vsYesterday')}
          accent="forest"
          trendValues={salesTrend}
          rtl={isRtl}
        />
        <KpiCard
          label={t('dashboard.netProfit')}
          value={api.formatMoney(data?.month_net_profit ?? 0)}
          sub={t('dashboard.thisMonth')}
          accent="forest"
        />
        <KpiCard
          label={t('dashboard.customerReceivables')}
          value={api.formatMoney(data?.customer_receivables ?? 0)}
          accent="warning"
        />
        <KpiCard
          label={t('dashboard.supplierPayables')}
          value={api.formatMoney(data?.supplier_payables ?? 0)}
          accent="danger"
        />
      </div>

      {/* Cloud Backup Indicator — TASK-304 */}
      <BackupIndicator
        status={backupStatus}
        backingUp={backingUp}
        onBackupNow={async () => {
          setBackingUp(true);
          setBackupError('');
          try {
            await api.uploadBackupToCloud(api.getUserId());
            const updated = await api.getAutoBackupStatus();
            setBackupStatus(updated);
          } catch {
            setBackupError('فشل رفع النسخة الاحتياطية. تحقق من إعدادات المزامنة.');
          }
          setBackingUp(false);
        }}
        rtl={isRtl}
      />

      {/* Stock Alerts */}
      {((data?.low_stock_count ?? 0) > 0 || (data?.out_of_stock_count ?? 0) > 0 ||
        (data?.expired_count ?? 0) > 0 || (data?.expiring_30_count ?? 0) > 0) && (
        <div className="glass-warning rounded-2xl p-4">
          <h3 className="text-base font-bold text-ink-main mb-2">{t('dashboard.stockAlerts')}</h3>
          <div className="flex flex-wrap gap-2 text-sm">
            {(data?.out_of_stock_count ?? 0) > 0 && (
              <AlertItem label={t('dashboard.outOfStock')} count={data!.out_of_stock_count} variant="danger" />
            )}
            {(data?.low_stock_count ?? 0) > 0 && (
              <AlertItem label={t('dashboard.lowStock')} count={data!.low_stock_count} variant="warning" />
            )}
            {(data?.expired_count ?? 0) > 0 && (
              <AlertItem label={t('dashboard.expired')} count={data!.expired_count} variant="danger" />
            )}
            {(data?.expiring_30_count ?? 0) > 0 && (
              <AlertItem label={t('dashboard.expiringSoon')} count={data!.expiring_30_count} variant="warning" />
            )}
          </div>
        </div>
      )}

      {/* Last 7 Days Chart + Open Sessions */}
      <div className="grid grid-cols-3 gap-4">
        <div className="app-card col-span-2 p-4">
          <h3 className="text-base font-bold text-ink-main mb-3">{t('dashboard.last7Days')}</h3>
          <DailySalesChart days={data?.last_7_days_sales ?? []} rtl={isRtl} />
        </div>
        <div className="app-card p-4">
          <h3 className="text-base font-bold text-ink-main mb-3">{t('dashboard.openSessions')}</h3>
          {(data?.open_sessions ?? []).length === 0 ? (
            <DashboardEmptyState title={t('dashboard.noOpenSessions')} tip={t('dashboard.emptyOpenSessionsTip')} icon={PackageOpen} />
          ) : (
            <div className="space-y-2">
              {data!.open_sessions.map((s, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b border-ivory-border pb-2 last:border-0">
                  <div>
                    <span className="font-medium text-ink-main">{s.cashier_name}</span>
                    <span className="text-ink-muted ms-2">{s.opened_at.slice(11, 16)}</span>
                  </div>
                  <div className="text-end">
                    <span className="font-bold text-ink-main tabular-nums">{api.formatMoney(s.total_sales)}</span>
                    <span className="text-ink-muted ms-1">({s.sales_count})</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top Products + Recent Sales */}
      <div className="grid grid-cols-2 gap-4">
        <div className="app-card p-4">
          <h3 className="text-base font-bold text-ink-main mb-3">{t('dashboard.topProducts')}</h3>
          {(data?.top_products ?? []).length === 0 ? (
            <DashboardEmptyState title={t('reports.noData')} tip={t('dashboard.emptyTopProductsTip')} icon={TrendingUp} />
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {data!.top_products.map((p, i) => (
                  <tr key={i} className="border-b border-ivory-border last:border-0">
                    <td className="py-1.5 text-ink-main">{p.product_name}</td>
                    <td className="py-1.5 text-ink-muted text-end tabular-nums">{p.total_qty}</td>
                    <td className="py-1.5 text-ink-main text-end tabular-nums font-medium">{api.formatMoney(p.total_revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="app-card p-4">
          <h3 className="text-base font-bold text-ink-main mb-3">{t('dashboard.recentSales')}</h3>
          {(data?.recent_sales ?? []).length === 0 ? (
            <DashboardEmptyState title={t('reports.noData')} tip={t('dashboard.emptyRecentSalesTip')} icon={DollarSign} />
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {data!.recent_sales.map((s, i) => (
                  <tr key={i} className="border-b border-ivory-border last:border-0">
                    <td className="py-1.5 text-ink-main font-medium">{s.sale_number}</td>
                    <td className="py-1.5 text-ink-muted">{s.created_at.slice(11, 16)}</td>
                    <td className="py-1.5"><Badge variant={s.payment_method === 'credit' ? 'warning' : 'success'}>{s.payment_method === 'cash' ? t('pos.cash') : s.payment_method === 'bank_transfer' ? t('pos.bankTransfer') : t('pos.credit')}</Badge></td>
                    <td className="py-1.5 text-ink-main text-end tabular-nums font-medium">{api.formatMoney(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Overdue Suppliers */}
      {(data?.overdue_suppliers ?? []).length > 0 && (
        <div className="app-card p-4">
          <h3 className="text-base font-bold text-ink-main mb-3">{t('dashboard.overdueSuppliers')}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-ink-muted border-b border-ivory-border">
                <th className="text-start py-1.5 font-medium">{t('reports.supplier')}</th>
                <th className="text-end py-1.5 font-medium">{t('reports.balance')}</th>
                <th className="text-end py-1.5 font-medium">{t('dashboard.daysOverdue')}</th>
              </tr>
            </thead>
            <tbody>
              {data!.overdue_suppliers.map((s, i) => (
                <tr key={i} className="border-b border-ivory-border last:border-0">
                  <td className="py-1.5 text-ink-main">{s.supplier_name}</td>
                  <td className="py-1.5 text-end tabular-nums text-status-danger font-medium">{api.formatMoney(s.balance_due)}</td>
                  <td className="py-1.5 text-end tabular-nums text-ink-muted">{s.days_overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent Activity Feed */}
        <div className="app-card p-4">
        <h3 className="text-base font-bold text-ink-main mb-3">{t('dashboard.recentActivity')}</h3>
        {activity.length === 0 ? (
          <DashboardEmptyState title={t('dashboard.activityEmpty')} tip={t('dashboard.emptyActivityTip')} icon={Activity} />
        ) : (
          <div className="space-y-2">
            {activity.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between text-sm border-b border-ivory-border pb-2 last:border-0">
                <div className="flex items-center gap-2">
                  <Badge variant={entry.action === 'create' ? 'success' : entry.action === 'delete' ? 'danger' : 'neutral'}>
                    {t(`settings.audit.actions.${entry.action}`, entry.action)}
                  </Badge>
                  <span className="text-ink-main">{entry.entity_type.replace(/_/g, ' ')}</span>
                  {entry.user_name && <span className="text-ink-muted">— {entry.user_name}</span>}
                </div>
                <span className="text-ink-muted tabular-nums">{entry.created_at.slice(5, 16).replace('T', ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-ivory-border bg-white p-4 shadow-[var(--shadow-soft)]">
        <span className="text-sm font-medium text-ink-muted me-2">{t('dashboard.quickActions')}:</span>
        <button onClick={() => navigate('/pos')} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
          <Banknote size={16} /> {t('dashboard.newSale')}
        </button>
        <button onClick={() => navigate('/purchases/new')} className="inline-flex items-center gap-2 rounded-xl border border-ivory-border bg-ivory-surface px-4 py-2 text-sm font-medium text-ink-main hover:bg-ivory-muted">
          <ShoppingCart size={16} /> {t('dashboard.newPurchase')}
        </button>
        <button onClick={() => navigate('/expenses')} className="inline-flex items-center gap-2 rounded-xl border border-ivory-border bg-ivory-surface px-4 py-2 text-sm font-medium text-ink-main hover:bg-ivory-muted">
          <CreditCard size={16} /> {t('dashboard.newExpense')}
        </button>
        <div className="ms-auto flex items-center gap-4 text-sm">
          <span className="text-ink-muted">{t('accounts.cash')}: <b className="text-ink-main tabular-nums">{api.formatMoney(data?.total_cash_balance ?? 0)}</b></span>
          <span className="text-ink-muted">{t('accounts.bank')}: <b className="text-ink-main tabular-nums">{api.formatMoney(data?.total_bank_balance ?? 0)}</b></span>
        </div>
      </div>
    </div>
  );
}

/* ---- Sub-components ---- */

function KpiCard({ label, value, sub, change, changeLabel, accent, trendValues, rtl }: {
  label: string; value: string; sub?: string; change?: number; changeLabel?: string;
  accent: 'forest' | 'warning' | 'danger'; trendValues?: number[]; rtl?: boolean;
}) {
  const { t } = useTranslation();
  const borderColor = accent === 'forest' ? 'border-t-primary-600' : accent === 'warning' ? 'border-t-status-warning' : 'border-t-status-danger';
  return (
    <div className={`app-card border-t-2 p-4 ${borderColor}`}>
      <p className="text-sm text-ink-muted mb-1">{label}</p>
      <p className="text-2xl font-bold text-ink-main tabular-nums">{value} <span className="text-sm font-normal text-ink-muted">{t('common.currency')}</span></p>
      {sub && <p className="text-sm text-ink-muted mt-1">{sub}</p>}
      {trendValues && trendValues.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <SalesSparkline values={trendValues} rtl={rtl} />
          <span className="text-xs text-ink-muted">{t('dashboard.last7Days')}</span>
        </div>
      )}
      {change !== undefined && (
        <p className={`text-sm mt-1 ${change >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
          {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}% {changeLabel}
        </p>
      )}
    </div>
  );
}

function AlertItem({ label, count, variant }: { label: string; count: number; variant: 'warning' | 'danger' }) {
  const cls = variant === 'danger'
    ? 'bg-status-danger/10 border-status-danger/25 text-status-danger'
    : 'bg-status-warning-bg border-status-warning/25 text-status-warning';
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 ${cls}`}>
      <span className="text-xs font-semibold">{label}</span>
      <span className="rounded-full bg-white/90 px-1.5 py-0.5 text-xs font-bold tabular-nums">{count}</span>
    </span>
  );
}

function DashboardEmptyState({ title, tip, icon: Icon }: { title: string; tip: string; icon: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <div className="rounded-xl border border-dashed border-ivory-border bg-ivory-surface px-4 py-6 text-center">
      <div className="flex justify-center text-ink-muted/50" aria-hidden><Icon size={24} /></div>
      <p className="mt-2 text-sm font-medium text-ink-main">{title}</p>
      <p className="mt-1 text-xs text-ink-muted">{tip}</p>
    </div>
  );
}

function SalesSparkline({ values, rtl }: { values: number[]; rtl?: boolean }) {
  if (values.length === 0) return null;
  const width = 84;
  const height = 24;
  const max = Math.max(...values, 1);
  const ordered = rtl ? [...values].reverse() : values;
  const step = ordered.length > 1 ? width / (ordered.length - 1) : width;
  const points = ordered.map((v, i) => `${i * step},${height - (v / max) * (height - 2) - 1}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="text-primary-700" aria-hidden>
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DailySalesChart({ days, rtl }: { days: { date: string; total: number }[]; rtl?: boolean }) {
  const { t } = useTranslation();
  if (days.length === 0) {
    return <DashboardEmptyState title={t('reports.noData')} tip={t('dashboard.emptySalesTrendTip')} icon={CalendarX} />;
  }
  const ordered = rtl ? [...days].reverse() : days;
  const max = Math.max(...ordered.map(d => d.total), 1);
  return (
    <div className="flex items-end gap-2 h-32">
      {ordered.map((d) => (
        <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full bg-primary-600 rounded-t-sm min-h-[2px]"
            style={{ height: `${(d.total / max) * 100}%` }}
            title={api.formatMoney(d.total)}
          />
          <span className="text-xs text-ink-muted">{d.date.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

function BackupIndicator({ status, backingUp, onBackupNow, rtl }: { status: api.BackupLogRow | null; backingUp: boolean; onBackupNow: () => void; rtl?: boolean }) {
  const { t } = useTranslation();
  const now = Date.now();
  const lastAt = status?.completed_at ? new Date(status.completed_at).getTime() : null;
  const hoursAgo = lastAt ? Math.round((now - lastAt) / 3600000) : null;
  const daysAgo = hoursAgo ? Math.round(hoursAgo / 24) : null;
  const isSuccess = status?.status === 'success' || status?.status === 'completed';
  const isFailed = status?.status === 'failed' || status?.status === 'error';

  let colorClass = 'text-ink-muted bg-ivory-surface border-ivory-border';
  let icon = CloudOff;
  let label = t('dashboard.backupNever');
  let detail = '';
  if (isSuccess && hoursAgo !== null) {
    if (hoursAgo < 24) { colorClass = 'text-primary-700 bg-primary-50 border-primary-300'; icon = Cloud; }
    else if (daysAgo && daysAgo < 7) { colorClass = 'text-yellow-700 bg-yellow-50 border-yellow-300'; icon = Cloud; }
    else { colorClass = 'text-red-700 bg-red-50 border-red-300'; icon = CloudOff; }
    label = daysAgo && daysAgo >= 1 ? t('dashboard.backupAgoDays', { days: daysAgo }) : t('dashboard.backupAgoHours', { hours: hoursAgo });
    detail = status.file_size ? `${(status.file_size / 1024).toFixed(0)} KB` : '';
  } else if (isFailed) {
    colorClass = 'text-red-700 bg-red-50 border-red-300';
    label = t('dashboard.backupFailed');
  }

  return (
    <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${colorClass}`}>
      <div className="flex items-center gap-3" dir={rtl ? 'rtl' : 'ltr'}>
        <icon size={20} />
        <div>
          <p className="text-sm font-semibold">{t('dashboard.lastCloudBackup')}</p>
          <p className="text-xs opacity-80">{label}{detail ? ` • ${detail}` : ''}</p>
        </div>
      </div>
      <button
        onClick={onBackupNow}
        disabled={backingUp}
        className="flex items-center gap-1 rounded-lg bg-white/70 px-3 py-1.5 text-xs font-semibold shadow-sm hover:bg-white disabled:opacity-50"
      >
        <RefreshCw size={14} className={backingUp ? 'animate-spin' : ''} />
        {backingUp ? '...' : t('dashboard.backupNow')}
      </button>
    </div>
  );
}

function GettingStarted() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const steps = [
    { key: 'addProduct', label: t('dashboard.checklist.addProduct'), href: '/products' },
    { key: 'addSupplier', label: t('dashboard.checklist.addSupplier'), href: '/suppliers' },
    { key: 'purchaseInvoice', label: t('dashboard.checklist.purchaseInvoice'), href: '/purchases/new' },
    { key: 'firstSale', label: t('dashboard.checklist.firstSale'), href: '/pos' },
  ];
  return (
    <div className="app-card mb-5 p-4 border border-primary-200 bg-primary-50/50">
      <h3 className="text-sm font-bold text-ink-main mb-3">{t('dashboard.checklist.title')}</h3>
      <div className="flex flex-wrap gap-2">
        {steps.map((s) => (
          <button
            key={s.key}
            onClick={() => navigate(s.href)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-ivory-border px-3 py-1.5 text-xs font-medium text-ink-main hover:border-primary-400 hover:text-primary-700 transition-colors"
          >
            <span className="w-4 h-4 rounded-full border-2 border-primary-300 flex items-center justify-center text-[10px] text-primary-500">○</span>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
