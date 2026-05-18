import { useEffect, useState } from 'react';
import { getSyncStats, type SyncStats } from '../api';
import Icon from '../components/ui/Icon';
import Skeleton from '../components/ui/Skeleton';

function relativeTime(iso: string | null): string {
  if (!iso) return 'لم يتم بعد';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'منذ لحظات';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
  return `منذ ${Math.floor(diff / 86400)} يوم`;
}

function healthLabel(health: string): string {
  if (health === 'green') return 'ممتاز — آخر مزامنة حديثة';
  if (health === 'yellow') return 'تحذير — آخر مزامنة قديمة';
  return 'خطر — المزامنة متوقفة';
}

export default function Sync({ branch }: { branch?: string }) {
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true); setError('');
    getSyncStats(branch).then(setStats).catch(() => setError('تعذر تحميل بيانات المزامنة')).finally(() => setLoading(false));
  };

  useEffect(load, [branch]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold" style={{ color: 'var(--color-ink-main)' }}>حالة المزامنة</h2>
        <button onClick={load} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium" style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-700)' }}>
          <Icon name="refresh" size={14} /> تحديث
        </button>
      </div>

      {loading && <div className="flex flex-col gap-3">{[...Array(4)].map((_, i) => <Skeleton key={i} height="80px" rounded="md" />)}</div>}

      {!loading && error && (
        <div className="py-12 text-center">
          <Icon name="exclamation" size={40} style={{ color: 'var(--color-ink-placeholder)' }} />
          <p className="mt-2 font-medium" style={{ color: 'var(--color-ink-main)' }}>{error}</p>
        </div>
      )}

      {!loading && stats && (
        <>
          <div className="app-card flex items-center gap-4 p-5" style={{
            borderInlineStart: `4px solid ${(stats.health ?? 'red') === 'green' ? 'var(--color-status-success)' : (stats.health ?? 'red') === 'yellow' ? '#f59e0b' : 'var(--color-status-danger)'}`
          }}>
            <div className="flex h-10 w-10 items-center justify-center rounded-full text-lg" style={{
              background: (stats.health ?? 'red') === 'green' ? '#d1fae5' : (stats.health ?? 'red') === 'yellow' ? '#fef3c7' : '#fee2e2',
              color: (stats.health ?? 'red') === 'green' ? 'var(--color-status-success)' : (stats.health ?? 'red') === 'yellow' ? '#d97706' : 'var(--color-status-danger)',
            }}>
              <Icon name={(stats.health ?? 'red') === 'green' ? 'check-circle' : (stats.health ?? 'red') === 'yellow' ? 'exclamation' : 'x-circle'} size={20} />
            </div>
            <div>
              <p className="font-semibold" style={{ color: 'var(--color-ink-main)' }}>{healthLabel(stats.health ?? 'red')}</p>
              <p className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>
                آخر مزامنة: {relativeTime(stats.last_sync_at)}
                {stats.branch && stats.branch !== 'main-branch' && <span> · {stats.branch}</span>}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'إجمالي المزامنات', value: stats.total_syncs.toLocaleString('en') },
              { label: 'إجمالي السجلات', value: (stats.total_rows ?? 0).toLocaleString('en') },
              { label: 'أحداث اليوم', value: stats.today_events.toLocaleString('en') },
              { label: 'جداول البيانات', value: String(stats.tables.length) },
            ].map(s => (
              <div key={s.label} className="app-card p-4 text-center">
                <p className="text-2xl font-black tabular-nums" style={{ color: 'var(--color-primary-600)' }}>{s.value}</p>
                <p className="mt-1 text-xs" style={{ color: 'var(--color-ink-muted)' }}>{s.label}</p>
              </div>
            ))}
          </div>

          {stats.tables.length > 0 && (
            <div className="app-panel overflow-hidden">
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-ivory-border)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-ink-main)' }}>جداول البيانات</p>
              </div>
              {stats.tables.map((row, i) => (
                <div key={row.table_name} className="flex items-center justify-between px-4 py-3"
                  style={{ borderBottom: i < stats.tables.length - 1 ? '1px solid var(--color-ivory-border)' : 'none' }}>
                  <div>
                    <span className="text-sm" style={{ color: 'var(--color-ink-main)' }} dir="ltr">{row.table_name.replace(/^snapshot_/, '')}</span>
                    {row.last_sync_at && <span className="text-xs block" style={{ color: 'var(--color-ink-muted)' }}>{relativeTime(row.last_sync_at)}</span>}
                  </div>
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-700)' }}>{row.row_count.toLocaleString('en')} صف</span>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-secondary)', border: '1px solid var(--color-ivory-border)' }}>
            <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>
              <Icon name="sync" size={14} className="inline" style={{ color: 'var(--color-ink-muted)' }} /> المزامنة تتم تلقائياً كل 5 دقائق من تطبيق الصيدلية.
              {(stats.minutes_since_sync ?? -1) >= 0 && <span> آخر تحديث منذ {stats.minutes_since_sync} دقيقة.</span>}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
