import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { searchProductsPos } from '../api';
import { productLabel } from '../utils/productLabel';

export interface PickedProduct {
  id: string;
  name: string;
  name_ar?: string;
}

interface Props {
  branchId: string;
  onPick: (product: PickedProduct) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * Debounced, keyboard-friendly product search box.
 * Mirrors the TransferTab pattern (searchProductsPos -> results -> pick) and is
 * reused wherever a searchable product picker is needed instead of a giant
 * <select> (e.g. the purchase-invoice rows). Each instance owns its own state,
 * so it works independently per row.
 */
export default function ProductSearchBox({ branchId, onPick, placeholder, autoFocus }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickedProduct[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await searchProductsPos(branchId, query);
        setResults(res.slice(0, 8).map(p => ({ id: p.product_id, name: p.product_name, name_ar: p.product_name_ar })));
        setHighlighted(-1);
      } catch { setResults([]); }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, branchId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pick = (p: PickedProduct) => {
    onPick(p);
    setQuery('');
    setResults([]);
    setOpen(false);
    setHighlighted(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const idx = highlighted >= 0 ? highlighted : 0; if (results[idx]) pick(results[idx]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div className="relative" ref={boxRef}>
      <input
        className="app-input w-full px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        placeholder={placeholder ?? t('purchases.searchProduct')}
        value={query}
        autoFocus={autoFocus}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { if (query.trim()) setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      {open && query.trim() && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-ivory-border bg-white shadow-[var(--shadow-float)] max-h-64 overflow-y-auto">
          {results.length > 0 ? (
            <ul>
              {results.map((p, idx) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlighted(idx)}
                    onClick={() => pick(p)}
                    className={`w-full px-3 py-2 text-start text-sm hover:bg-ivory-muted ${highlighted === idx ? 'bg-primary-50' : ''}`}
                  >
                    {productLabel(p.name_ar, p.name)}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-3 text-center text-xs text-ink-muted">لا توجد نتائج لـ "{query}"</div>
          )}
        </div>
      )}
    </div>
  );
}
