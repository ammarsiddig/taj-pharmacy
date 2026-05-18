import { useEffect, useState, useRef } from 'react';
import { getOwnerProducts, type OwnerProduct } from '../api';
import Icon from '../components/ui/Icon';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';

function fmt(fils: number): string { return (fils / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

const EXPIRY_WARN_DAYS = 60;

function expiryBadge(iso: string | null) {
  if (!iso) return null;
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { text: 'منتهي', color: 'var(--color-status-danger)' };
  if (days <= EXPIRY_WARN_DAYS) return { text: `${days} يوم`, color: '#C2410C' };
  return null;
}

const FILTERS = [
  { key: '', label: 'الكل' },
  { key: 'out', label: 'نفد' },
  { key: 'low', label: 'منخفض' },
  { key: 'expiring', label: 'قارب الانتهاء' },
];

interface Props { branch: string; }

export default function Products({ branch }: Props) {
  const [products, setProducts] = useState<OwnerProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selectedPid, setSelectedPid] = useState<string | null>(null);
  const observerRef = useRef<HTMLDivElement | null>(null);

  const selected = products.find(p => p.id === selectedPid);

  const load = (q: string, p: number) => {
    setLoading(true);
    getOwnerProducts(branch, q || undefined, p)
      .then(r => {
        setProducts(p === 1 ? r.products : prev => [...prev, ...r.products]);
        setTotal(r.total);
        setHasMore(p * r.limit < r.total);
      })
      .catch(() => setError('تعذر تحميل المنتجات'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setPage(1);
    const t = setTimeout(() => load(search, 1), 300);
    return () => clearTimeout(t);
  }, [search, branch]);

  useEffect(() => {
    if (!observerRef.current || !hasMore || loading) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setPage(p => p + 1); load(search, page + 1); } }, { threshold: 0.1 });
    obs.observe(observerRef.current);
    return () => obs.disconnect();
  }, [hasMore, loading, page]);

  const filtered = (() => {
    switch (filter) {
      case 'out': return products.filter(p => p.current_stock <= 0);
      case 'low': return products.filter(p => p.current_stock > 0 && p.current_stock <= p.min_stock);
      case 'expiring': return products.filter(p => p.nearest_expiry && new Date(p.nearest_expiry).getTime() - Date.now() < EXPIRY_WARN_DAYS * 86_400_000);
      default: return products;
    }
  })();

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="relative">
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في المنتجات..."
          className="w-full rounded-xl border px-4 py-3 text-sm outline-none pe-10"
          style={{ background: 'var(--color-ivory-surface)', borderColor: 'var(--color-ivory-border)' }} />
        <span className="absolute end-3 top-1/2 -translate-y-1/2"><Icon name="search" size={16} style={{ color: 'var(--color-ink-muted)' }} /></span>
      </div>

      <div className="flex gap-1 flex-wrap">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${filter === f.key ? 'bg-primary-600 text-white' : ''}`}
            style={{ background: filter === f.key ? 'var(--color-primary-600)' : 'var(--color-ivory-muted)', color: filter === f.key ? 'white' : 'var(--color-ink-muted)' }}>
            {f.label}
          </button>
        ))}
      </div>

      {loading && products.length === 0 && <div className="flex flex-col gap-3">{[...Array(5)].map((_, i) => <Skeleton key={i} height="60px" rounded="md" />)}</div>}
      {error && !loading && <EmptyState icon="exclamation" title={error} />}
      {!loading && !error && filtered.length === 0 && <EmptyState icon="package" title={search ? 'لا توجد نتائج' : 'لا توجد منتجات'} />}

      <div className="flex flex-col gap-2">
        {filtered.map(p => {
          const exp = expiryBadge(p.nearest_expiry);
          return (
            <div key={p.id} onClick={() => setSelectedPid(p.id)} className="app-card flex items-center gap-3 p-3 cursor-pointer">
              <div className="w-1 h-10 rounded-full shrink-0" style={{ background: p.current_stock <= 0 ? 'var(--color-status-danger)' : p.current_stock <= p.min_stock ? 'var(--color-status-warning)' : 'var(--color-primary-400)' }} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate" style={{ color: 'var(--color-ink-main)' }}>{p.name_ar || p.name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>
                  {p.barcode || '—'} · {fmt(p.sale_price)} SDG · المخزون: <span style={{ color: p.current_stock <= p.min_stock ? 'var(--color-status-danger)' : 'inherit' }}>{p.current_stock}</span>
                </p>
              </div>
              <div className="text-end shrink-0">
                {exp && <span className="text-[10px] rounded-full px-2 py-0.5 font-bold" style={{ background: exp.color === 'var(--color-status-danger)' ? '#FEF2F2' : '#FFF7ED', color: exp.color }}>{exp.text}</span>}
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-ink-placeholder)' }}>{p.category || ''}</p>
              </div>
            </div>
          );
        })}
      </div>

      {loading && products.length > 0 && <Skeleton height="40px" rounded="sm" />}
      <div ref={observerRef} style={{ height: 1 }} />

      {/* Product detail bottom sheet */}
      {selected && (
        <Modal open={!!selectedPid} onClose={() => setSelectedPid(null)} size="sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-12 rounded-full" style={{ background: 'var(--color-primary-500)' }} />
            <div>
              <h3 className="font-bold text-lg" style={{ color: 'var(--color-ink-main)' }}>{selected.name_ar || selected.name}</h3>
              {selected.barcode && <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>{selected.barcode}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl p-3" style={{ background: 'var(--color-ivory-muted)' }}>
              <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>السعر</p>
              <p className="font-bold tabular-nums" style={{ color: 'var(--color-ink-main)' }}>{fmt(selected.sale_price)}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'var(--color-ivory-muted)' }}>
              <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>المخزون</p>
              <p className="font-bold tabular-nums" style={{ color: selected.current_stock <= selected.min_stock ? 'var(--color-status-danger)' : 'var(--color-ink-main)' }}>{selected.current_stock}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'var(--color-ivory-muted)' }}>
              <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>الحد الأدنى</p>
              <p className="font-bold" style={{ color: 'var(--color-ink-main)' }}>{selected.min_stock}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'var(--color-ivory-muted)' }}>
              <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>انتهاء الصلاحية</p>
              <p className="font-bold text-sm" style={{ color: selected.nearest_expiry && new Date(selected.nearest_expiry) < new Date() ? 'var(--color-status-danger)' : 'var(--color-ink-main)' }}>
                {selected.nearest_expiry ? new Date(selected.nearest_expiry).toLocaleDateString('ar') : '—'}
              </p>
            </div>
          </div>
        </Modal>
      )}

      <p className="text-center text-xs" style={{ color: 'var(--color-ink-placeholder)' }}>{total} منتج</p>
    </div>
  );
}
