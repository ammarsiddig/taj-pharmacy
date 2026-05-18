import { useEffect, useState } from 'react';
import { getActivity, type ActivityItem } from '../api';
import Icon from '../components/ui/Icon';
import Skeleton from '../components/ui/Skeleton';

const EVENT_ICON: Record<string, string> = {
  sale_created: 'receipt',
  sale_deleted: 'trash',
  return_created: 'refresh',
  product_created: 'package',
  product_updated: 'pencil',
  customer_created: 'user',
  supplier_created: 'user-group',
  snapshot: 'database',
  refresh_request: 'sync',
  expense_created: 'credit-card',
  payment_received: 'banknotes',
};

const FILTER_TYPES = [
  { key: '', label: 'الكل' },
  { key: 'sale_created', label: 'مبيعات' },
  { key: 'return_created', label: 'مرتجعات' },
  { key: 'product_created,product_updated', label: 'منتجات' },
  { key: 'expense_created', label: 'مصروفات' },
  { key: 'payment_received', label: 'مدفوعات' },
];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const dStr = d.toDateString();
  if (dStr === today.toDateString()) return 'اليوم';
  if (dStr === yesterday.toDateString()) return 'أمس';
  return d.toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'short' });
}

function groupByDate(items: ActivityItem[]) {
  const map = new Map<string, ActivityItem[]>();
  for (const item of items) {
    const key = new Date(item.received_at).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries()).map(([key, items]) => ({ date: formatDate(new Date(key).toISOString()), items }));
}

interface Props { branch: string; }

export default function Activity({ branch }: Props) {
  const [groups, setGroups] = useState<{ date: string; items: ActivityItem[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    getActivity(100, branch)
      .then(res => setGroups(groupByDate(res.activity)))
      .catch(() => setError('تعذر تحميل النشاطات'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [branch]);

  const filteredGroups = !filter ? groups : groups.map(g => ({
    ...g,
    items: g.items.filter(item => filter.split(',').includes(item.event_type)),
  })).filter(g => g.items.length > 0);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <h2 className="text-lg font-bold" style={{ color: 'var(--color-ink-main)' }}>آخر النشاطات</h2>
        <button onClick={load} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium"
          style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-700)' }}>
          <Icon name="refresh" size={14} /> تحديث
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-1 px-4 pb-3 flex-wrap">
        {FILTER_TYPES.map(f => (
          <button key={f.key} onClick={() => setFilter(filter === f.key ? '' : f.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${filter === f.key ? 'bg-primary-600 text-white' : ''}`}
            style={{ background: filter === f.key ? 'var(--color-primary-600)' : 'var(--color-ivory-muted)', color: filter === f.key ? 'white' : 'var(--color-ink-muted)' }}>
            {f.label}
          </button>
        ))}
      </div>

      {loading && <div className="flex flex-col gap-3 px-4">{[...Array(5)].map((_, i) => <Skeleton key={i} height="64px" rounded="md" />)}</div>}

      {!loading && error && (
        <div className="px-4 py-12 text-center">
          <Icon name="exclamation" size={40} style={{ color: 'var(--color-ink-placeholder)' }} />
          <p className="mt-2 font-medium" style={{ color: 'var(--color-ink-main)' }}>{error}</p>
        </div>
      )}

      {!loading && !error && filteredGroups.length === 0 && (
        <div className="px-4 py-16 text-center">
          <Icon name="clock" size={40} style={{ color: 'var(--color-ink-placeholder)' }} />
          <p className="mt-3 font-semibold" style={{ color: 'var(--color-ink-main)' }}>لا توجد نشاطات</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-ink-muted)' }}>ستظهر النشاطات هنا بعد المزامنة</p>
        </div>
      )}

      {filteredGroups.map(group => (
        <div key={group.date} className="mb-2">
          <div className="sticky top-0 z-10 px-4 pb-2 pt-3" style={{ background: 'var(--color-ivory-app)' }}>
            <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: 'var(--color-ivory-border)', color: 'var(--color-ink-muted)' }}>{group.date}</span>
          </div>
          <div className="app-panel mx-4 overflow-hidden">
            {group.items.map((item, i) => (
              <div key={`${item.entity_id}-${item.occurred_at}-${i}`} className="flex items-start gap-3 px-4 py-3"
                style={{ borderBottom: i < group.items.length - 1 ? '1px solid var(--color-ivory-border)' : 'none' }}>
                <div className="rounded-xl w-8 h-8 flex items-center justify-center mt-0.5 shrink-0" style={{ background: 'var(--color-primary-50)' }}>
                  <Icon name={EVENT_ICON[item.event_type] || 'information-circle'} size={16} style={{ color: 'var(--color-primary-600)' }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug" style={{ color: 'var(--color-ink-main)' }}>
                    {item.summary || item.event_type}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--color-ink-muted)' }}>{item.entity_type}</p>
                </div>
                <span className="mt-0.5 shrink-0 rounded-lg px-2 py-0.5 text-xs tabular-nums" style={{ background: 'var(--color-surface-secondary)', color: 'var(--color-ink-muted)' }}>
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
