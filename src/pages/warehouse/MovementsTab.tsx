import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import { getStockMovements } from '../../api';
import type { StockMovementRow } from '../../types';
import { MOVEMENT_COLORS, fmtDate, EmptyBlock } from './WarehouseShared';
import { productLabel } from '../../utils/productLabel';

interface Props {
  branchId: string;
  openingBranchId?: string;
}

export default function MovementsTab({ branchId }: Props) {
  const { t } = useTranslation();
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [movementType, setMovementType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMovements(await getStockMovements(branchId, undefined, movementType || undefined, dateFrom || undefined, dateTo || undefined, 500));
    } catch (e: unknown) { setError(String(e)); }
    finally { setLoading(false); }
  }, [branchId, movementType, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const types = ['receive', 'sell', 'customer_return', 'supplier_return', 'transfer_in', 'transfer_out', 'adjust', 'dispose'];

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="sales-form-toolbar app-panel flex flex-wrap gap-3 items-end p-4">
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">{t('warehouse.movements.type')}</label>
          <select value={movementType} onChange={e => setMovementType(e.target.value)}
            className="app-input px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100">
            <option value="">{t('warehouse.movements.allTypes')}</option>
            {types.map(tp => <option key={tp} value={tp}>{t(`warehouse.movements.${tp}`, { defaultValue: tp.replace(/_/g, ' ') })}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">{t('warehouse.movements.from')}</label>
          <div className="relative">
            <CalendarDays size={14} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-placeholder" />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="app-input px-3 py-2.5 pe-9 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">{t('warehouse.movements.to')}</label>
          <div className="relative">
            <CalendarDays size={14} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-placeholder" />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="app-input px-3 py-2.5 pe-9 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
          </div>
        </div>
        <button onClick={() => { setMovementType(''); setDateFrom(''); setDateTo(''); }}
          className="px-3 py-2 text-sm text-ink-muted border border-ivory-border rounded-xl hover:bg-ivory-muted">{t('sales.clear')}</button>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <div className="sales-form-table-wrap">
        {loading ? (
          <div className="app-card p-8 text-center text-ink-muted">{t('common.loading')}</div>
        ) : movements.length === 0 ? (
          <div className="app-card"><EmptyBlock title={t('warehouse.movements.noMovements')} subtitle={t('warehouse.movements.type')} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="sales-form-table">
              <thead className="bg-ivory-muted">
                <tr>
                  {[t('warehouse.movements.date'), t('warehouse.movements.product'), t('warehouse.movements.batch'), t('warehouse.movements.type'), t('warehouse.movements.qtyChange'), t('warehouse.movements.before'), t('warehouse.movements.after'), t('warehouse.movements.reference'), t('warehouse.movements.by')].map(h => (
                    <th key={h} className="px-4 py-3 text-start text-sm font-medium text-ink-muted uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {movements.map(m => (
                  <tr key={m.id} className="hover:bg-ivory-muted">
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(m.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{productLabel(m.product_name_ar, m.product_name)}</td>
                    <td className="px-4 py-3 text-gray-500">{m.batch_number || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MOVEMENT_COLORS[m.movement_type] || 'bg-gray-100 text-gray-700'}`}>
                        {t(`warehouse.movements.${m.movement_type}`, { defaultValue: m.movement_type.replace(/_/g, ' ') })}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-semibold ${
                      ['receive', 'customer_return', 'transfer_in'].includes(m.movement_type) ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {['receive', 'customer_return', 'transfer_in'].includes(m.movement_type) ? '+' : '-'}{m.quantity_change}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{m.quantity_before}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{m.quantity_after}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{m.reference_type ? t(`warehouse.movements.refType.${m.reference_type}`, { defaultValue: m.reference_type.replace(/_/g, ' ') }) : '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{m.created_by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
