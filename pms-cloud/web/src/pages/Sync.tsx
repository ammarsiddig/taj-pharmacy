import { useEffect, useState } from 'react';
import { getSyncStats, type SyncStats } from '../api';


function relativeTime(iso: string | null): string {
  if (!iso) return 'لم يتم بعد';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return 'منذ لحظات';
  if (diff < 3600)  return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
  return `منذ ${Math.floor(diff / 86400)} يوم`;
}

export default function Sync() {
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    getSyncStats()
      .then(setStats)
      .catch(() => setError('تعذر تحميل بيانات المزامنة'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const isOnline = stats?.last_sync_at
    ? Date.now() - new Date(stats.last_sync_at).getTime() < 24 * 60 * 60 * 1000
    : false;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold" style={{ color: 'var(--color-ink-main)' }}>حالة المزامنة</h2>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium"
          style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-700)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          تحديث
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-transparent" style={{ borderTopColor: 'var(--color-primary-600)' }} />
        </div>
      )}

      {!loading && error && (
        <div className="py-12 text-center">
          <p className="text-4xl">⚠️</p>
          <p className="mt-2 font-medium" style={{ color: 'var(--color-ink-main)' }}>{error}</p>
        </div>
      )}

      {!loading && stats && (
        <>
          {/* Status badge */}
          <div
            className="app-card flex items-center gap-4 p-5"
          >
            <div
              className="h-4 w-4 rounded-full"
              style={{
                background: isOnline ? 'var(--color-status-success)' : 'var(--color-status-danger)',
                boxShadow: isOnline ? '0 0 0 4px #d1fae5' : '0 0 0 4px #fee2e2',
              }}
            />
            <div>
              <p className="font-semibold" style={{ color: 'var(--color-ink-main)' }}>
                {isOnline ? 'متصل' : 'غير متصل'}
              </p>
              <p className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>
                آخر مزامنة: {relativeTime(stats.last_sync_at)}
              </p>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="app-card p-4 text-center">
              <p className="text-3xl font-black tabular-nums" style={{ color: 'var(--color-ink-main)' }}>
                {stats.total_syncs.toLocaleString('en')}
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--color-ink-muted)' }}>إجمالي المزامنات</p>
            </div>
            <div className="app-card p-4 text-center">
              <p className="text-3xl font-black tabular-nums" style={{ color: 'var(--color-primary-600)' }}>
                {stats.today_events.toLocaleString('en')}
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--color-ink-muted)' }}>أحداث اليوم</p>
            </div>
          </div>

          {/* Table sync state */}
          {stats.tables.length > 0 && (
            <div className="app-panel overflow-hidden">
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-ivory-border)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-ink-main)' }}>جداول البيانات</p>
              </div>
              {stats.tables.map((row, i) => (
                <div
                  key={row.table_name}
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderBottom: i < stats.tables.length - 1 ? '1px solid var(--color-ivory-border)' : 'none' }}
                >
                  <span className="text-sm" style={{ color: 'var(--color-ink-main)' }} dir="ltr">
                    {row.table_name.replace('snapshot_', '')}
                  </span>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums"
                    style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-700)' }}
                  >
                    {row.row_count.toLocaleString('en')} صف
                  </span>
                </div>
              ))}
            </div>
          )}

          <div
            className="rounded-2xl p-4"
            style={{ background: 'var(--color-surface-secondary)', border: '1px solid var(--color-ivory-border)' }}
          >
            <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>
              🔄 المزامنة تتم تلقائياً كل 5 دقائق من تطبيق الصيدلية على الحاسب. لا حاجة لأي إجراء يدوي.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
