import { useEffect, useState, useCallback } from 'react';
import {
  getDashboard, getActivity, getSyncStats,
  clearToken,
  type DashboardData, type ActivityItem, type SyncStats,
} from '../api';

export default function Dashboard() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = useCallback(async () => {
    try {
      const [d, a, s] = await Promise.all([
        getDashboard(),
        getActivity(50),
        getSyncStats(),
      ]);
      setDashboard(d);
      setActivity(a.activity);
      setStats(s);
      setError('');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const handleLogout = () => {
    clearToken();
    window.location.reload();
  };

  const fmtMoney = (v: number) =>
    new Intl.NumberFormat('ar-SD', { minimumFractionDigits: 2 }).format(v / 100);

  const timeSince = (v?: string | null) => {
    if (!v) return '—';
    const diff = Math.floor((Date.now() - new Date(v).getTime()) / 1000);
    if (diff < 60) return `منذ ${diff} ث`;
    if (diff < 3600) return `منذ ${Math.floor(diff / 60)} د`;
    if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`;
    return `منذ ${Math.floor(diff / 86400)} يوم`;
  };

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="text-slate-400">جاري التحميل...</div>
      </div>
    );
  }

  const d = dashboard?.dashboard;

  return (
    <div className="min-h-dvh bg-slate-100" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-primary-700 px-4 py-3 text-white shadow-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-xs font-bold">PMS</div>
            <h1 className="text-base font-bold">لوحة المالك</h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={load} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs transition hover:bg-white/20">تحديث</button>
            <button onClick={handleLogout} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs transition hover:bg-white/20">خروج</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 p-4 pb-8">
        {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

        {/* Sync status */}
        <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${dashboard?.sync.last_sync_at ? 'bg-emerald-500' : 'bg-red-400'}`} />
            <span className="text-sm text-slate-600">{dashboard?.sync.last_sync_at ? 'متصل' : 'غير متصل'}</span>
          </div>
          <div className="text-xs text-slate-400">آخر مزامنة: {timeSince(dashboard?.sync.last_sync_at)}</div>
        </div>

        {!d ? (
          <div className="rounded-xl bg-amber-50 px-4 py-6 text-center text-sm text-amber-700">
            لا توجد بيانات بعد. قم بتشغيل المزامنة من تطبيق الصيدلية.
          </div>
        ) : (
          <>
            {/* ── Today's sales highlight ── */}
            <div className="rounded-2xl bg-primary-700 p-5 text-white shadow-md">
              <p className="text-sm text-white/70">مبيعات اليوم</p>
              <p className="mt-1 text-4xl font-bold tabular-nums">{fmtMoney(d.today_sales_total)}</p>
              <p className="mt-1 text-xs text-white/60">{d.today_sales_count} عملية بيع اليوم</p>
            </div>

            {/* ── Month sales ── */}
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <p className="mb-1 text-xs text-slate-500">مبيعات الشهر الحالي</p>
              <p className="text-2xl font-bold tabular-nums text-slate-800">{fmtMoney(d.month_sales_total)}</p>
              <p className="mt-0.5 text-xs text-slate-400">{d.month_sales_count} فاتورة هذا الشهر</p>
            </div>

            {/* ── Entity counts ── */}
            <div className="grid grid-cols-3 gap-3">
              <KpiCard label="المنتجات" value={String(d.products_count)} />
              <KpiCard label="العملاء" value={String(d.customers_count)} />
              <KpiCard label="الموردون" value={String(d.suppliers_count)} />
            </div>

            {/* ── Financial position ── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500">ذمم العملاء</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-blue-600">{fmtMoney(d.total_receivables)}</p>
                <p className="mt-0.5 text-xs text-slate-400">مستحق للصيدلية</p>
              </div>
              <div className="rounded-xl bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500">ذمم الموردين</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-red-500">{fmtMoney(d.total_payables)}</p>
                <p className="mt-0.5 text-xs text-slate-400">مستحق للموردين</p>
              </div>
            </div>

            {/* ── Stock alerts ── */}
            {(d.low_stock_count > 0 || d.out_of_stock_count > 0 || d.expiring_soon_count > 0) && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 shadow-sm">
                <p className="mb-3 text-sm font-bold text-amber-800">⚠️ تنبيهات المخزون</p>
                <div className="grid grid-cols-3 gap-3">
                  {d.out_of_stock_count > 0 && (
                    <AlertStat label="نفد المخزون" value={String(d.out_of_stock_count)} color="text-red-600" />
                  )}
                  {d.low_stock_count > 0 && (
                    <AlertStat label="مخزون منخفض" value={String(d.low_stock_count)} color="text-amber-600" />
                  )}
                  {d.expiring_soon_count > 0 && (
                    <AlertStat label="تنتهي قريباً" value={String(d.expiring_soon_count)} color="text-orange-600" />
                  )}
                </div>
              </div>
            )}

            {/* ── Sync stats ── */}
            {stats && (
              <div className="rounded-xl bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-sm font-bold text-slate-700">إحصائيات المزامنة</h2>
                <div className="grid grid-cols-3 gap-3">
                  <MiniStat label="إجمالي المزامنات" value={String(stats.total_syncs)} />
                  <MiniStat label="أحداث اليوم" value={String(stats.today_events)} />
                  <MiniStat label="إجمالي الأحداث الأسبوع" value={String(stats.today_events)} />
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Activity feed ── */}
        <div className="rounded-xl bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-700">آخر النشاطات</h2>
          </div>
          {activity.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">لا توجد نشاطات بعد</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {activity.map((item, i) => <ActivityRow key={i} item={item} />)}
            </div>
          )}
        </div>

        <div className="pb-2 text-center text-xs text-slate-400">
          آخر تحديث: {lastRefresh.toLocaleTimeString('ar-SD')} · التحديث التلقائي كل دقيقة
        </div>
      </main>
    </div>
  );
}

/* ── Sub-components ── */

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-slate-800">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2.5 text-center">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-bold text-slate-700 tabular-nums">{value}</div>
    </div>
  );
}

function AlertStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg bg-white p-2.5 text-center shadow-sm">
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}

const EVENT_ICONS: Record<string, string> = {
  sale_created: '💰',
  invoice_sale_created: '🧾',
  return_created: '↩️',
  product_created: '📦',
  product_updated: '📦',
  customer_created: '👤',
  customer_updated: '👤',
  supplier_created: '🏭',
  supplier_updated: '🏭',
  purchase_confirmed: '📋',
  purchase_draft_created: '📋',
  expense_created: '💸',
  pos_session_opened: '🟢',
  pos_session_closed: '🔴',
  stock_take_confirmed: '🗂️',
  supplier_return_confirmed: '↩️',
  snapshot: '📸',
};

function ActivityRow({ item }: { item: ActivityItem }) {
  const icon = EVENT_ICONS[item.event_type] || '📌';
  const time = item.occurred_at?.slice(11, 16) || '';
  const date = item.occurred_at?.slice(0, 10) || '';
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 text-base">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-slate-700">{item.summary}</div>
        <div className="mt-0.5 text-xs text-slate-400">{date} {time}</div>
      </div>
    </div>
  );
}
