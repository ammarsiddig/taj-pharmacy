import type { PosProduct, CartItem } from '../../types';
import type { TFunction } from 'i18next';
import { productLabel } from '../../utils/productLabel';
import { getProductAvailableQuantity } from '../../utils/posSearch';

interface SearchResultsProps {
  results: PosProduct[];
  cart: CartItem[];
  subsFor: string | null;
  subsResults: PosProduct[];
  subsLoading: boolean;
  highlightedResultIdx: number;
  onAddToCart: (item: PosProduct) => void;
  onShowSubs: (productId: string) => void;
  t: TFunction;
  formatMoney: (n: number) => string;
}

export default function SearchResults({
  results,
  cart,
  subsFor,
  subsResults,
  subsLoading,
  highlightedResultIdx,
  onAddToCart,
  onShowSubs,
  t,
  formatMoney,
}: SearchResultsProps) {
  return (
    <div className="absolute inset-x-4 top-full z-20 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-ivory-border bg-white shadow-[var(--shadow-float)]">
      {results.map((p, resultIdx) => {
        const backendStock = getProductAvailableQuantity(p);
        const cartQty = cart
          .filter(c => c.product_id === p.product_id)
          .reduce((sum, item) => sum + item.quantity, 0);
        const effectiveStock = Math.max(0, backendStock - cartQty);
        const outOfStock = effectiveStock === 0;
        const lowStock = !outOfStock && effectiveStock <= 5;
        return (
          <div key={p.product_id} className={`border-b border-ivory-border last:border-0 ${outOfStock ? 'bg-ivory-muted/50' : ''}`}>
            <button
              onClick={() => !outOfStock && onAddToCart(p)}
                className={`w-full text-right px-4 py-3 text-sm flex justify-between items-center ${outOfStock ? 'cursor-default opacity-70' : 'hover:bg-ivory-muted'} ${highlightedResultIdx === resultIdx ? 'bg-primary-50 outline-none ring-2 ring-inset ring-primary-300' : ''}`}
              >
                <span className="text-ink-main font-medium">{productLabel(p.product_name_ar, p.product_name)}</span>
                <span className="flex items-center gap-2 text-ink-muted text-xs">
                  <span>{formatMoney(p.sale_price)}</span>
                  {outOfStock ? (
                    <span className="rounded-full bg-status-danger/10 px-2 py-0.5 text-xs font-medium text-status-danger">{t('pos.outOfStock')}</span>
                  ) : (
                    <span>المتاح للبيع: {effectiveStock}{cartQty > 0 ? ` (${t('pos.inCart')}: ${cartQty})` : ''}</span>
                )}
                {lowStock && (
                  <span className="rounded-full bg-status-warning/10 px-2 py-0.5 text-xs font-medium text-status-warning">{t('pos.lowStockAlert')}</span>
                )}
                {outOfStock && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onShowSubs(p.product_id); }}
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${subsFor === p.product_id ? 'border-primary-600 bg-primary-600 text-white' : 'border-primary-400 text-primary-700 hover:bg-primary-50'}`}
                  >
                    {t('pos.substitutes')}
                  </button>
                )}
              </span>
            </button>
            {subsFor === p.product_id && (
              <div className="border-t border-ivory-border bg-primary-50/50 px-4 py-2">
                {subsLoading ? (
                  <p className="text-xs text-ink-muted py-1">{t('common.loading')}</p>
                ) : subsResults.length === 0 ? (
                  <p className="text-xs text-ink-muted py-1">{t('products.noSubstitutes')}</p>
                ) : (
                  <ul className="space-y-1">
                    {subsResults.map(sub => {
                      const subStock = getProductAvailableQuantity(sub);
                      return (
                        <li key={sub.product_id}>
                          <button
                            type="button"
                            onClick={() => { if (subStock > 0) onAddToCart(sub); }}
                            className={`w-full flex justify-between items-center rounded-lg px-2 py-1.5 text-xs ${subStock > 0 ? 'hover:bg-primary-100 cursor-pointer' : 'opacity-60 cursor-default'}`}
                          >
                            <span className="font-medium text-ink-main">{productLabel(sub.product_name_ar, sub.product_name)}</span>
                            <span className={`font-medium ${subStock > 0 ? 'text-status-success' : 'text-status-danger'}`}>
                              {subStock > 0 ? `${t('pos.available')}: ${subStock}` : t('pos.outOfStock')}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
