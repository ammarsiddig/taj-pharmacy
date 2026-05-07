import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Minus, Plus, DollarSign, Smartphone, X } from 'lucide-react';
import * as api from '../../api';
import type { PosSession, Sale, SessionSaleRow } from '../../types';
import Button from '../../components/ui/Button';

interface Props {
  session: PosSession | null;
  onClose: () => void;
  onSuccess: () => void;
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export default function ReturnModal({ session, onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const [returnSaleSearch, setReturnSaleSearch] = useState('');
  const [returnSaleResults, setReturnSaleResults] = useState<SessionSaleRow[]>([]);
  const [returnSale, setReturnSale] = useState<Sale | null>(null);
  const [returnItems, setReturnItems] = useState<Record<string, number>>({});
  const [returnRefundMethod, setReturnRefundMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [returnReason, setReturnReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      api.getSessionSales(session.id)
        .then(setReturnSaleResults)
        .catch(() => setReturnSaleResults(/* non-critical: if fails, user can still search by sale number */[]));
    }
  }, [session]);

  const searchSaleByNumber = async () => {
    if (!returnSaleSearch.trim()) return;
    try {
      const sale = await api.getSaleByNumber(returnSaleSearch.trim());
      setReturnSale(sale);
      const init: Record<string, number> = {};
      sale.items.forEach(item => { init[item.id] = 0; });
      setReturnItems(init);
    } catch {
      setError(t('pos.saleNotFound'));
    }
  };

  const selectSaleForReturn = async (saleId: string) => {
    try {
      const sale = await api.getSaleDetail(saleId);
      setReturnSale(sale);
      const init: Record<string, number> = {};
      sale.items.forEach(item => { init[item.id] = 0; });
      setReturnItems(init);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  };

  const handleCreateReturn = async () => {
    if (!returnSale) return;
    const itemsToReturn = returnSale.items
      .filter(item => (returnItems[item.id] || 0) > 0)
      .map(item => ({
        sale_item_id: item.id,
        product_id: item.product_id,
        batch_id: item.batch_id,
        quantity: returnItems[item.id],
        unit_price: item.unit_price,
      }));
    if (itemsToReturn.length === 0) { setError(t('pos.noItemsToReturn')); return; }
    const isFullReturn = returnSale.items.every(item => (returnItems[item.id] || 0) === item.quantity);
    setSaving(true);
    try {
      const auth = api.getAuthState();
      await api.createReturn({
        saleId: returnSale.id,
        sessionId: session?.id,
        returnType: isFullReturn ? 'full' : 'partial',
        refundMethod: returnRefundMethod,
        reason: returnReason || undefined,
        items: itemsToReturn,
      }, auth.user!.id);
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const returnTotal = returnSale
    ? returnSale.items.reduce((sum, item) => sum + (returnItems[item.id] || 0) * item.unit_price, 0)
    : 0;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40"
      onClick={onClose}
      tabIndex={-1}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        className="w-full max-w-lg mx-4 max-h-[85vh] flex flex-col rounded-2xl border border-ivory-border bg-white shadow-[var(--shadow-float)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-ivory-border flex justify-between items-center">
          <h3 className="text-lg font-bold text-ink-main">{t('pos.createReturn')}</h3>
          <button onClick={onClose} className="p-1 text-ink-muted hover:text-ink-main"><X size={18} /></button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {error && (
            <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-status-danger">{error}</div>
          )}

          {!returnSale ? (
            <>
              <label className="block text-xs text-ink-muted mb-2">{t('pos.selectSale')}</label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={returnSaleSearch}
                  onChange={e => { setReturnSaleSearch(e.target.value); setError(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') searchSaleByNumber(); }}
                  placeholder={t('pos.lookupSaleHint')}
                  className="app-input flex-1 px-3 py-2 text-sm text-ink-main placeholder:text-ink-placeholder focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                />
                <Button onClick={searchSaleByNumber} className="px-4"><Search size={14} /></Button>
              </div>
              {returnSaleResults.length > 0 && (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {returnSaleResults
                    .filter(s => !returnSaleSearch || s.sale_number.toLowerCase().includes(returnSaleSearch.toLowerCase()))
                    .map(sale => (
                      <button key={sale.id} onClick={() => selectSaleForReturn(sale.id)}
                        className="w-full text-right p-3 bg-ivory-muted border border-ivory-border rounded-xl hover:bg-primary-100 flex justify-between items-center text-sm">
                        <div>
                          <span className="font-medium text-ink-main">{sale.sale_number}</span>
                          <span className="text-ink-muted text-xs me-2">({sale.items_count} {t('pos.items')})</span>
                        </div>
                        <span className="tabular-nums font-bold">{api.formatMoney(sale.total)}</span>
                      </button>
                    ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="mb-4 rounded-xl border border-primary-100 bg-primary-100 p-3">
                <div className="flex justify-between items-center text-sm">
                  <div>
                    <span className="font-bold text-ink-main">{returnSale.sale_number}</span>
                    <span className="text-ink-muted text-xs me-2">{formatDateTime(returnSale.created_at)}</span>
                  </div>
                  <button onClick={() => { setReturnSale(null); setError(null); }} className="text-xs text-primary-600 hover:underline">
                    {t('common.back')}
                  </button>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                {returnSale.items.map(item => (
                  <div key={item.id} className="rounded-xl border border-ivory-border bg-ivory-muted p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-ink-main">{item.product_name}</span>
                      <span className="text-xs text-ink-muted">{t('pos.maxReturnQty')}: {item.quantity}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-ink-muted">{t('pos.returnQty')}:</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setReturnItems(prev => ({ ...prev, [item.id]: Math.max(0, (prev[item.id] || 0) - 1) }))}
                          className="p-1 text-ink-muted hover:text-status-danger rounded"
                        ><Minus size={14} /></button>
                        <span className="w-8 text-center tabular-nums text-sm font-medium">{returnItems[item.id] || 0}</span>
                        <button
                          onClick={() => setReturnItems(prev => ({ ...prev, [item.id]: Math.min(item.quantity, (prev[item.id] || 0) + 1) }))}
                          className="p-1 text-ink-muted hover:text-primary-600 rounded"
                        ><Plus size={14} /></button>
                      </div>
                      <span className="me-auto text-xs tabular-nums text-ink-muted">
                        = {api.formatMoney((returnItems[item.id] || 0) * item.unit_price)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mb-3">
                <label className="block text-xs text-ink-muted mb-1">{t('pos.refundMethod')}</label>
                <div className="flex gap-2">
                  <button onClick={() => setReturnRefundMethod('cash')}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border flex items-center justify-center gap-2 ${
                      returnRefundMethod === 'cash' ? 'bg-primary-600 text-ivory-surface border-primary-600' : 'bg-ivory-surface text-ink-muted border-ivory-border'
                    }`}><DollarSign size={14} />{t('pos.cash')}</button>
                  <button onClick={() => setReturnRefundMethod('bank_transfer')}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border flex items-center justify-center gap-2 ${
                      returnRefundMethod === 'bank_transfer' ? 'bg-primary-600 text-ivory-surface border-primary-600' : 'bg-ivory-surface text-ink-muted border-ivory-border'
                    }`}><Smartphone size={14} />{t('pos.bankTransfer')}</button>
                </div>
              </div>

              <div className="mb-3">
                <label className="block text-xs text-ink-muted mb-1">{t('pos.returnReason')}</label>
                <input type="text" value={returnReason} onChange={e => setReturnReason(e.target.value)}
                  className="app-input w-full px-3 py-2 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
              </div>

              {returnTotal > 0 && (
                <div className="mb-4 flex items-center justify-between rounded-xl border border-status-warning/20 bg-status-warning-bg p-3">
                  <span className="text-sm font-medium text-status-warning">{t('pos.totalReturns')}</span>
                  <span className="text-lg font-bold tabular-nums text-status-warning">{api.formatMoney(returnTotal)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {returnSale && (
          <div className="p-4 border-t border-ivory-border flex gap-3 justify-end">
            <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button onClick={handleCreateReturn} disabled={saving || returnTotal === 0}>
              {saving ? t('common.loading') : t('pos.confirmReturn')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
