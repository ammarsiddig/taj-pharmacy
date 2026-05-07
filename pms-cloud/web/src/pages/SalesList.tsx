import { useEffect, useState } from 'react';
import { getOwnerSales, type OwnerSale } from '../api';

function fmt(fils: number): string {
  return (fils / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const RANGES = [
  { label: 'اليوم', days: 0 },
  { label: 'أسبوع', days: 7 },
  { label: 'شهر', days: 30 },
];

function dateRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (days > 0) from.setDate(from.getDate() - days);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

interface SalesListProps {
  branch: string;
}

export default function SalesList({ branch }: SalesListProps) {
  const [sales, setSales] = useState<OwnerSale[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const load = (selectedRange: number, selectedPage: number) => {
    setLoading(true);
    const { from, to } = dateRange(selectedRange);
    getOwnerSales(branch, from, to, selectedPage)
      .then((r) => {
        setSales(selectedPage === 1 ? r.sales : (prev) => [...prev, ...r.sales]);
        setGrandTotal(r.grand_total);
        setTotal(r.total);
        setHasMore(selectedPage * r.limit < r.total);
      })
      .catch(() => setError('تعذر تحميل المبيعات'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { setPage(1); load(range, 1); }, [range, branch]);

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    load(range, next);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Range selector */}
      <div className="flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r.days}
            onClick={() => setRange(r.days)}
            className="flex-1 rounded-xl py-2 text-sm font-bold"
            style={{
              background: range === r.days ? 'var(--color-primary-600)' : 'var(--color-surface-secondary)',
              color: range === r.days ? 'white' : 'var(--color-ink-muted)',
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      {!loading && !error && (
        <div className="app-card p-4 flex items-center justify-between">
          <div>
            <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>الإجمالي</p>
            <p className="text-xl font-black tabular-nums" style={{ color: 'var(--color-ink-main)' }}>
              {fmt(grandTotal)} <span className="text-sm font-normal">SDG</span>
            </p>
          </div>
          <div className="text-end">
            <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>عدد الفواتير</p>
            <p className="text-xl font-black tabular-nums" style={{ color: 'var(--color-primary-600)' }}>{total}</p>
          </div>
        </div>
      )}

      {/* List */}
      {error && <p className="py-8 text-center text-sm" style={{ color: 'var(--color-status-danger)' }}>{error}</p>}

      {!error && sales.length === 0 && !loading && (
        <div className="py-10 text-center">
          <p className="text-4xl">🧾</p>
          <p className="mt-2 font-medium" style={{ color: 'var(--color-ink-main)' }}>لا توجد مبيعات</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {sales.map((sale) => (
          <div key={sale.id} className="app-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm" style={{ color: 'var(--color-ink-main)' }}>
                  {sale.sale_number}
                  {sale.is_return && (
                    <span className="ms-2 rounded px-1.5 py-0.5 text-xs" style={{ background: '#fee2e2', color: 'var(--color-status-danger)' }}>إرجاع</span>
                  )}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>
                  {sale.customer_name || 'عميل نقدي'} · {sale.items_count} صنف
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-placeholder)' }}>
                  {new Date(sale.created_at).toLocaleDateString('ar', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="text-end shrink-0">
                <p className="font-bold tabular-nums" style={{ color: 'var(--color-ink-main)' }}>{fmt(sale.total)} SDG</p>
                <span
                  className="rounded-full px-2 py-0.5 text-xs"
                  style={{
                    background: sale.payment_status === 'paid' ? 'var(--color-status-success-bg)' : 'var(--color-status-warning-bg)',
                    color: sale.payment_status === 'paid' ? 'var(--color-status-success)' : 'var(--color-status-warning)',
                  }}
                >
                  {sale.payment_method === 'cash' ? 'نقد' : sale.payment_method === 'credit' ? 'آجل' : sale.payment_method}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-transparent" style={{ borderTopColor: 'var(--color-primary-600)' }} />
        </div>
      )}

      {hasMore && !loading && (
        <button
          onClick={handleLoadMore}
          className="w-full rounded-xl py-3 text-sm font-bold"
          style={{ background: 'var(--color-surface-secondary)', color: 'var(--color-ink-muted)' }}
        >
          تحميل المزيد
        </button>
      )}
    </div>
  );
}
