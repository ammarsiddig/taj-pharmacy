import { useEffect, useState, useCallback } from 'react';
import { getOwnerProducts, type OwnerProduct } from '../api';

function fmt(fils: number): string {
  return (fils / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const EXPIRY_WARN_DAYS = 60;

function expiryBadge(iso: string | null): { text: string; bg: string; color: string } | null {
  if (!iso) return null;
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { text: 'منتهي', bg: '#fee2e2', color: 'var(--color-status-danger)' };
  if (days <= EXPIRY_WARN_DAYS) return { text: `${days} يوم`, bg: '#FFF7ED', color: '#C2410C' };
  return null;
}

interface ProductsProps {
  branch: string;
}

export default function Products({ branch }: ProductsProps) {
  const [products, setProducts] = useState<OwnerProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback((q: string, p: number) => {
    setLoading(true);
    getOwnerProducts(branch, q || undefined, p)
      .then((r) => {
        setProducts(p === 1 ? r.products : (prev) => [...prev, ...r.products]);
        setTotal(r.total);
        setHasMore(p * r.limit < r.total);
      })
      .catch(() => setError('تعذر تحميل المنتجات'))
      .finally(() => setLoading(false));
  }, [branch]);

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(search, 1); }, 300);
    return () => clearTimeout(t);
  }, [search, load]);

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    load(search, next);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Search */}
      <div className="relative">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث عن منتج، باركود..."
          className="w-full rounded-xl border px-4 py-3 text-sm outline-none pe-10"
          style={{ background: 'var(--color-surface-secondary)', borderColor: 'var(--color-ivory-border)', color: 'var(--color-ink-main)' }}
        />
        <span className="absolute end-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-ink-muted)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </span>
      </div>

      {/* Total count */}
      {!loading && !error && (
        <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>{total.toLocaleString('en')} منتج</p>
      )}

      {error && <p className="py-8 text-center text-sm" style={{ color: 'var(--color-status-danger)' }}>{error}</p>}

      {!error && products.length === 0 && !loading && (
        <div className="py-10 text-center">
          <p className="text-4xl">💊</p>
          <p className="mt-2 font-medium" style={{ color: 'var(--color-ink-main)' }}>لا توجد منتجات</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {products.map((p) => {
          const badge = expiryBadge(p.nearest_expiry);
          const outOfStock = p.total_stock <= 0;
          const lowStock = !outOfStock && p.total_stock <= p.min_stock;
          return (
            <div key={p.id} className="app-card p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm leading-tight" style={{ color: 'var(--color-ink-main)' }}>{p.name}</p>
                  {p.name_ar && <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>{p.name_ar}</p>}
                  <p className="text-xs mt-1" style={{ color: 'var(--color-ink-muted)' }}>
                    {p.category || '—'} {p.barcode ? `· ${p.barcode}` : ''}
                  </p>
                </div>
                <div className="text-end shrink-0 flex flex-col items-end gap-1">
                  <p className="font-bold tabular-nums text-sm" style={{ color: 'var(--color-ink-main)' }}>{fmt(p.sale_price)} SDG</p>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-bold"
                    style={{
                      background: outOfStock ? '#fee2e2' : lowStock ? 'var(--color-status-warning-bg)' : 'var(--color-status-success-bg)',
                      color: outOfStock ? 'var(--color-status-danger)' : lowStock ? 'var(--color-status-warning)' : 'var(--color-status-success)',
                    }}
                  >
                    {p.total_stock.toLocaleString('en')} وحدة
                  </span>
                  {badge && (
                    <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: badge.bg, color: badge.color }}>
                      {badge.text}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
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
