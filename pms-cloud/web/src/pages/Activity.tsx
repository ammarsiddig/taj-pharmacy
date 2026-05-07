import { useEffect, useState } from 'react';
import { getActivity, type ActivityItem } from '../api';

const EVENT_EMOJI: Record<string, string> = {
  sale_created:      '🛒',
  sale_deleted:      '🗑️',
  return_created:    '↩️',
  product_created:   '💊',
  product_updated:   '✏️',
  customer_created:  '👤',
  supplier_created:  '🏭',
  snapshot:          '📸',
  refresh_request:   '🔄',
  expense_created:   '💸',
  payment_received:  '💰',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const dStr = d.toDateString();
  if (dStr === today.toDateString())     return 'اليوم';
  if (dStr === yesterday.toDateString()) return 'أمس';
  return d.toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'short' });
}

function groupByDate(items: ActivityItem[]): { date: string; items: ActivityItem[] }[] {
  const map = new Map<string, ActivityItem[]>();
  for (const item of items) {
    const key = new Date(item.received_at).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries()).map(([key, items]) => ({
    date: formatDate(new Date(key).toISOString()),
    items,
  }));
}

interface ActivityProps {
  branch: string;
}

export default function Activity({ branch }: ActivityProps) {
  const [groups, setGroups] = useState<{ date: string; items: ActivityItem[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    getActivity(100, branch)
      .then((res) => setGroups(groupByDate(res.activity)))
      .catch(() => setError('تعذر تحميل النشاطات'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [branch]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <h2 className="text-lg font-bold" style={{ color: 'var(--color-ink-main)' }}>آخر النشاطات</h2>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium"
          style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-700)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
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
        <div className="px-4 py-12 text-center">
          <p className="text-4xl">⚠️</p>
          <p className="mt-2 font-medium" style={{ color: 'var(--color-ink-main)' }}>{error}</p>
        </div>
      )}

      {!loading && !error && groups.length === 0 && (
        <div className="px-4 py-16 text-center">
          <p className="text-5xl">📋</p>
          <p className="mt-3 font-semibold" style={{ color: 'var(--color-ink-main)' }}>لا توجد نشاطات بعد</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-ink-muted)' }}>ستظهر النشاطات هنا بعد المزامنة</p>
        </div>
      )}

      {!loading && groups.map((group) => (
        <div key={group.date} className="mb-2">
          <div className="px-4 pb-2 pt-3">
            <span
              className="rounded-full px-3 py-1 text-xs font-bold"
              style={{ background: 'var(--color-ivory-border)', color: 'var(--color-ink-muted)' }}
            >
              {group.date}
            </span>
          </div>
          <div className="app-panel mx-4 overflow-hidden">
            {group.items.map((item, i) => (
              <div
                key={`${item.entity_id}-${item.occurred_at}-${i}`}
                className="flex items-start gap-3 px-4 py-3"
                style={{ borderBottom: i < group.items.length - 1 ? '1px solid var(--color-ivory-border)' : 'none' }}
              >
                <span className="mt-0.5 text-xl">{EVENT_EMOJI[item.event_type] || '📌'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug" style={{ color: 'var(--color-ink-main)' }}>
                    {item.summary || item.event_type}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--color-ink-muted)' }}>
                    {item.entity_type}
                  </p>
                </div>
                <span
                  className="mt-0.5 shrink-0 rounded-lg px-2 py-0.5 text-xs tabular-nums"
                  style={{ background: 'var(--color-surface-secondary)', color: 'var(--color-ink-muted)' }}
                >
                  {formatTime(item.received_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
