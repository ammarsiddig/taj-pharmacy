import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getLowStockProducts, formatMoney } from '../../api';
import type { LowStockProduct } from '../../types';

interface Props {
  branchId: string;
  openingBranchId?: string;
}

export default function ReorderAlertsTab({ branchId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<LowStockProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await getLowStockProducts(branchId));
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-ink-main">{t('warehouse.reorder.title')}</h3>
          <p className="text-sm text-ink-muted">{t('warehouse.reorder.subtitle')}</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-xl border border-ivory-border px-3 py-2 text-sm text-ink-muted hover:bg-ivory-muted"
        >
          <AlertTriangle size={14} />
          {t('warehouse.reorder.refresh')}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-status-danger">{error}</div>
      )}

      {loading ? (
        <div className="app-card p-8 text-center text-ink-muted">{t('common.loading')}</div>
      ) : items.length === 0 ? (
        <div className="app-card">
          <div className="py-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600">
              <AlertTriangle size={22} />
            </div>
            <p className="font-semibold text-ink-main">{t('warehouse.reorder.empty')}</p>
            <p className="mt-1 text-sm text-ink-muted">{t('warehouse.reorder.emptyHint')}</p>
          </div>
        </div>
      ) : (
        <div className="app-panel overflow-hidden">
          {/* Summary pill */}
          <div className="flex items-center gap-2 border-b border-ivory-border bg-amber-50 px-4 py-2.5">
            <AlertTriangle size={15} className="text-amber-600" />
            <span className="text-sm font-medium text-amber-800">
              {t(
                items.length === 1 ? 'warehouse.reorder.summaryOne' : 'warehouse.reorder.summaryOther',
                { count: items.length },
              )}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ivory-muted">
                <tr>
                  <th className="px-4 py-3 text-start text-xs font-semibold text-ink-muted">{t('warehouse.reorder.product')}</th>
                  <th className="px-4 py-3 text-start text-xs font-semibold text-ink-muted">{t('warehouse.reorder.category')}</th>
                  <th className="px-4 py-3 text-end text-xs font-semibold text-ink-muted">{t('warehouse.reorder.currentQty')}</th>
                  <th className="px-4 py-3 text-end text-xs font-semibold text-ink-muted">{t('warehouse.reorder.minQty')}</th>
                  <th className="px-4 py-3 text-end text-xs font-semibold text-ink-muted">{t('warehouse.reorder.deficit')}</th>
                  <th className="px-4 py-3 text-end text-xs font-semibold text-ink-muted">{t('warehouse.reorder.lastPrice')}</th>
                  <th className="px-4 py-3 text-start text-xs font-semibold text-ink-muted">{t('warehouse.reorder.supplier')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-ink-muted"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ivory-border">
                {items.map(item => (
                  <tr key={item.product_id} className="hover:bg-ivory-muted/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink-main">{item.product_name_ar || item.product_name}</div>
                      {item.barcode && (
                        <div className="text-xs text-ink-muted mt-0.5">{item.barcode}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{item.category || '—'}</td>
                    <td className="px-4 py-3 text-end">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                        item.current_qty === 0
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {item.current_qty} {item.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums text-ink-muted">{item.min_stock_level}</td>
                    <td className="px-4 py-3 text-end">
                      <span className="font-bold text-status-danger">+{item.deficit}</span>
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums text-ink-muted">
                      {item.last_purchase_price != null
                        ? formatMoney(item.last_purchase_price)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {item.supplier_name ?? t('warehouse.reorder.noSupplier')}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate('/purchases/new', { state: { productId: item.product_id, productName: item.product_name_ar || item.product_name, supplierName: item.supplier_name ?? undefined } })}
                        className="rounded-lg border border-primary-200 px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 whitespace-nowrap"
                      >
                        {t('warehouse.reorder.createPurchase')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
