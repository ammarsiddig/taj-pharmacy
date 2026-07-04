import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
  getStorageLocations, transferStock, searchProductsPos,
} from '../../api';
import type { StorageLocationFull } from '../../types';
import Toast from '../../components/ui/Toast';
import { productLabel } from '../../utils/productLabel';

interface Props {
  branchId: string;
  openingBranchId?: string;
}

export default function TransferTab({ branchId }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [locations, setLocations] = useState<StorageLocationFull[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<{ id: string; trade_name: string; trade_name_ar?: string }[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string } | null>(null);
  const [fromLoc, setFromLoc] = useState('');
  const [toLoc, setToLoc] = useState('');
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);

  useEffect(() => {
    getStorageLocations(branchId).then(locs => {
      const active = locs.filter(l => l.is_active);
      setLocations(active);
      if (active.length > 0) setFromLoc(active[0].id);
      if (active.length > 1) setToLoc(active[1].id);
    }).catch(() => {});
  }, [branchId]);

  useEffect(() => {
    if (!productSearch.trim()) { setProductResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await searchProductsPos(branchId, productSearch);
        setProductResults(res.slice(0, 8).map(p => ({ id: p.product_id, trade_name: p.product_name, trade_name_ar: p.product_name_ar })));
      } catch { setProductResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [productSearch, branchId]);

  const handleTransfer = async () => {
    if (!selectedProduct || !fromLoc || !toLoc || !quantity) return;
    if (fromLoc === toLoc) return;
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) return;
    setSaving(true);
    try {
      await transferStock(branchId, user!.id, selectedProduct.id, fromLoc, toLoc, qty);
      setToast({ msg: t('warehouse.transfer.success'), type: 'success' });
      setQuantity('');
      setSelectedProduct(null);
      setProductSearch('');
    } catch (e: unknown) {
      setToast({ msg: e instanceof Error ? e.message : String(e), type: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const sameLoc = !!fromLoc && fromLoc === toLoc;
  const fromLocName = (() => { const l = locations.find(x => x.id === fromLoc); return l ? (l.name_ar || l.name) : ''; })();
  const toLocName = (() => { const l = locations.find(x => x.id === toLoc); return l ? (l.name_ar || l.name) : ''; })();

  const inp = 'app-input w-full px-3 py-2.5 text-sm';

  return (
    <div className="mx-auto max-w-lg">
      <div className="app-panel p-6 flex flex-col gap-5">
        <h3 className="font-bold text-ink-main text-base">{t('warehouse.transfer.title')}</h3>

        {/* Product search */}
        <div className="relative">
          <label className="mb-1 block text-xs font-medium text-ink-muted">{t('warehouse.transfer.product')}</label>
          {selectedProduct ? (
            <div className="flex items-center justify-between rounded-xl border border-ivory-border bg-ivory-muted px-3 py-2.5">
              <span className="text-sm font-medium text-ink-main">{selectedProduct.name}</span>
              <button onClick={() => { setSelectedProduct(null); setProductSearch(''); }} className="text-xs text-ink-muted hover:text-status-danger">✕</button>
            </div>
          ) : (
            <>
              <input className={inp} placeholder={t('purchases.searchProduct')} value={productSearch} onChange={e => setProductSearch(e.target.value)} />
              {productSearch.trim() && (
                <div className="absolute z-20 mt-1 w-full rounded-xl border border-ivory-border bg-white shadow-[var(--shadow-float)]">
                  {productResults.length > 0 ? (
                    <ul>
                      {productResults.map(p => (
                        <li key={p.id}>
                          <button className="w-full px-3 py-2 text-start text-sm hover:bg-ivory-muted" onClick={() => { setSelectedProduct({ id: p.id, name: productLabel(p.trade_name_ar, p.trade_name) }); setProductSearch(''); setProductResults([]); }}>
                            {productLabel(p.trade_name_ar, p.trade_name)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="px-3 py-3 text-center text-xs text-ink-muted">
                      لا توجد نتائج لـ "{productSearch}"
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* From / To locations — direction made unmistakable */}
        <div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-bold text-ink-main">{t('warehouse.transfer.from')}</label>
              <select className={`${inp} border-status-danger/40`} value={fromLoc} onChange={e => setFromLoc(e.target.value)}>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name_ar || l.name}</option>)}
              </select>
            </div>
            <div className="mb-2 flex h-10 w-8 shrink-0 items-center justify-center text-primary-600">
              <ArrowLeft size={22} />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-bold text-ink-main">{t('warehouse.transfer.to')}</label>
              <select className={`${inp} border-status-success/40`} value={toLoc} onChange={e => setToLoc(e.target.value)}>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name_ar || l.name}</option>)}
              </select>
            </div>
          </div>
          {fromLoc && toLoc && !sameLoc && (
            <div className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-primary-50 px-3 py-2 text-sm text-ink-main">
              <span className="font-semibold">{fromLocName}</span>
              <ArrowLeft size={16} className="text-primary-600" />
              <span className="font-semibold">{toLocName}</span>
            </div>
          )}
          {sameLoc && (
            <p className="mt-2 text-xs font-medium text-status-danger">لا يمكن أن يكون موقع المصدر والوجهة متطابقين</p>
          )}
        </div>

        {/* Quantity */}
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">{t('warehouse.transfer.quantity')}</label>
          <input type="number" min={1} className={inp} placeholder="0" value={quantity} onChange={e => setQuantity(e.target.value)} />
        </div>

        <button
          disabled={saving || !selectedProduct || !fromLoc || !toLoc || !quantity || sameLoc}
          onClick={handleTransfer}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#0FA3A6] py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#0D8B8D] transition-colors"
        >
          <ArrowLeftRight size={16} />
          {saving ? t('common.loading') : t('warehouse.transfer.submit')}
        </button>
      </div>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
