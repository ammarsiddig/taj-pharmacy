import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import * as api from '../../api';
import type { Product, ProductSubstitute } from '../../types';
import Toast from '../ui/Toast';

interface SubstitutesSectionProps {
  product: Product;
}

export default function SubstitutesSection({ product }: SubstitutesSectionProps) {
  const { t } = useTranslation();
  const [substitutes, setSubstitutes] = useState<ProductSubstitute[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);

  const existingIds = useMemo(() => new Set(substitutes.map(s => s.substitute_id)), [substitutes]);

  const loadSubstitutes = useCallback(async () => {
    setLoading(true);
    try {
      setSubstitutes(await api.getProductSubstitutes(product.id));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [product.id]);

  useEffect(() => { loadSubstitutes(); }, [loadSubstitutes]);

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const results = await api.getProducts(q, undefined, true);
      setSearchResults(results.filter(p => p.id !== product.id && !existingIds.has(p.id)));
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  }, [product.id, existingIds]);

  const handleAdd = async (substituteId: string) => {
    try {
      await api.addProductSubstitute(product.id, substituteId);
      setSearchQuery('');
      setSearchResults([]);
      setToast({ msg: t('products.substituteAdded'), type: 'success' });
      loadSubstitutes();
    } catch (e: unknown) {
      setToast({ msg: e instanceof Error ? e.message : t('common.error'), type: 'danger' });
    }
  };

  const handleRemove = async (substituteId: string) => {
    try {
      await api.removeProductSubstitute(product.id, substituteId);
      setToast({ msg: t('products.substituteRemoved'), type: 'success' });
      loadSubstitutes();
    } catch (e: unknown) {
      setToast({ msg: e instanceof Error ? e.message : t('common.error'), type: 'danger' });
    }
  };

  const inp = 'app-input w-full ps-10 pe-3 py-2 text-sm text-ink-main placeholder:text-ink-placeholder focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100';

  return (
    <div>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('products.substitutes')}</h4>
        <button type="button" onClick={loadSubstitutes} className="p-1 text-ink-muted hover:text-ink-main" title={t('common.loading')}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <p className="mb-3 text-xs text-ink-muted">{t('common.loading')}</p>
      ) : substitutes.length === 0 ? (
        <p className="mb-3 text-xs text-ink-muted">{t('products.noSubstitutes')}</p>
      ) : (
        <ul className="mb-3 space-y-1.5">
          {substitutes.map(s => (
            <li key={s.id} className="flex items-center justify-between rounded-xl border border-ivory-border bg-white px-3 py-2">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-ink-main">{s.trade_name}</span>
                {s.trade_name_ar && (
                  <span className="me-1.5 text-sm text-ink-muted"> — {s.trade_name_ar}</span>
                )}
                {s.generic_name && (
                  <span className="text-xs text-ink-muted">({s.generic_name})</span>
                )}
                <span className={`ms-2 text-xs font-medium ${s.total_stock > 0 ? 'text-status-success' : 'text-status-danger'}`}>
                  · {s.total_stock} {s.total_stock > 0 ? '✓' : '✗'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(s.substitute_id)}
                className="ms-3 shrink-0 rounded-lg border border-ivory-border px-2 py-1 text-xs text-status-danger hover:bg-status-danger-bg"
              >
                {t('common.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={e => handleSearch(e.target.value)}
          placeholder={t('products.searchToAddSubstitute')}
          className={inp}
        />
        {searching && (
          <RefreshCw size={13} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 animate-spin text-ink-muted" />
        )}
        {searchResults.length > 0 ? (
          <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border border-ivory-border bg-white shadow-[var(--shadow-float)]">
            {searchResults.slice(0, 8).map(p => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => handleAdd(p.id)}
                  className="flex w-full items-center justify-between border-b border-ivory-border px-3 py-2 text-sm last:border-0 hover:bg-ivory-muted"
                >
                  <span className="font-medium text-ink-main">{p.trade_name}</span>
                  <span className="text-xs text-ink-muted">{p.trade_name_ar}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : searchQuery.trim() && !searching ? (
          <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-xl border border-ivory-border bg-white shadow-[var(--shadow-float)] px-3 py-3 text-center text-xs text-ink-muted">
            لا توجد نتائج لـ "{searchQuery}"
          </div>
        ) : null}
      </div>
    </div>
  );
}
