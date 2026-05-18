import { useEffect, useState, useRef } from 'react';
import { getOwnerSales, type OwnerSale } from '../api';
import Icon from '../components/ui/Icon';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';

function fmt(fils: number): string {
  return (fils / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const RANGES = [
  { label: 'اليوم', days: 0 },
  { label: 'أسبوع', days: 7 },
  { label: 'شهر', days: 30 },
];

function dateRange(days: number) {
  const to = new Date();
  const from = new Date();
  if (days > 0) from.setDate(from.getDate() - days);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function groupByDate(sales: OwnerSale[]) {
  const groups = new Map<string, OwnerSale[]>();
  for (const s of sales) {
    const key = s.created_at?.slice(0, 10) || '—';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  return Array.from(groups.entries());
}

interface Props { branch: string; }

export default function SalesList({ branch }: Props) {
  const [sales, setSales] = useState<OwnerSale[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const observerRef = useRef<HTMLDivElement | null>(null);

  const load = (selectedRange: number, selectedPage: number) => {
    setLoading(true);
    const { from, to } = dateRange(selectedRange);
    getOwnerSales(branch, from, to, selectedPage)
      .then(r => {
        setSales(selectedPage === 1 ? r.sales : prev => [...prev, ...r.sales]);
        setTotal(r.total);
        setHasMore(selectedPage * r.limit < r.total);
      })
      .catch(() => setError('تعذر تحميل المبيعات'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { setPage(1); load(range, 1); }, [range, branch]);

  useEffect(() => {
    if (!observerRef.current || !hasMore || loading) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setPage(p => p + 1); load(range, page + 1); } }, { threshold: 0.1 });
    obs.observe(observerRef.current);
    return () => obs.disconnect();
  }, [hasMore, loading, range, page]);

  const groups = groupByDate(sales);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* SegmentedControl */}
      <div className="flex rounded-xl p-1" style={{ background: 'var(--color-ivory-muted)' }}>
        {RANGES.map(r => (
          <button key={r.days} onClick={() => setRange(r.days)}
            className={`flex-1 rounded-lg py-2 text-sm font-bold transition-colors ${range === r.days ? 'bg-white shadow-sm text-ink-main' : ''}`}
            style={{ color: range === r.days ? 'var(--color-ink-main)' : 'var(--color-ink-muted)' }}>
            {r.label}
          </button>
        ))}
      </div>

      {loading && sales.length === 0 && (
        <div className="flex flex-col gap-3">{[...Array(5)].map((_, i) => <Skeleton key={i} height="64px" rounded="md" />)}</div>
      )}

      {error && !loading && <EmptyState icon="exclamation" title={error} />}

      {!loading && !error && sales.length === 0 && <EmptyState icon="receipt" title="لا توجد مبيعات" />}

      {groups.map(([date, items]) => (
        <div key={date}>
          <p className="sticky top-0 z-10 px-2 py-2 text-xs font-bold" style={{ background: 'var(--color-ivory-app)', color: 'var(--color-ink-muted)' }}>{date}</p>
          <div className="flex flex-col gap-2">
            {items.map(sale => (
              <div key={sale.id} className="app-card p-4 flex items-center gap-3">
                <div className="rounded-xl w-10 h-10 flex items-center justify-center" style={{ background: 'var(--color-primary-50)' }}>
                  <Icon name="receipt" size={18} style={{ color: 'var(--color-primary-600)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold tabular-nums" style={{ color: 'var(--color-ink-main)' }}>{fmt(sale.total)}</p>
                    <span className="text-xs rounded-full px-2 py-0.5" style={{ background: sale.payment_method === 'cash' ? '#F0FDF4' : '#EFF6FF', color: sale.payment_method === 'cash' ? '#059669' : '#2563EB' }}>
                      {sale.payment_method === 'cash' ? 'نقد' : sale.payment_method === 'bank_transfer' ? 'بنك' : sale.payment_method}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>
                    {sale.sale_number || `فاتورة #${sale.id.slice(0, 6)}`} · {sale.items_count} منتج
                  </p>
                </div>
                <p className="text-xs font-mono" style={{ color: 'var(--color-ink-placeholder)' }}>{sale.created_at?.slice(11, 16)}</p>
              </div>
            ))}
          </div>
        </div>
      ))}

      {loading && sales.length > 0 && <Skeleton height="40px" rounded="sm" />}

      <div ref={observerRef} style={{ height: 1 }} />
      <p className="text-center text-xs" style={{ color: 'var(--color-ink-placeholder)' }}>{total} فاتورة</p>
    </div>
  );
}
