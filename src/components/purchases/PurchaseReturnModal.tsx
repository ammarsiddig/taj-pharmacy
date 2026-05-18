import { useTranslation } from 'react-i18next';
import { Undo2 } from 'lucide-react';
import * as api from '../../api';
import type { AccountRow, BatchRow } from '../../types';
import Button from '../ui/Button';

interface Props {
  open: boolean;
  invoiceNumber: string;
  returnBatches: BatchRow[];
  returnQtys: Record<string, number>;
  returnDate: string;
  returnReason: string;
  returnAccountId: string;
  accounts: AccountRow[];
  returningPurchase: boolean;
  onClose: () => void;
  onDateChange: (d: string) => void;
  onReasonChange: (r: string) => void;
  onAccountChange: (id: string) => void;
  onQtyChange: (batchId: string, qty: number) => void;
  onReturn: () => void;
}

export default function PurchaseReturnModal({
  open,
  invoiceNumber,
  returnBatches,
  returnQtys,
  returnDate,
  returnReason,
  returnAccountId,
  accounts,
  returningPurchase,
  onClose,
  onDateChange,
  onReasonChange,
  onAccountChange,
  onQtyChange,
  onReturn,
}: Props) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-xl rounded-2xl border border-ivory-border bg-white shadow-[var(--shadow-float)] flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-ivory-border flex items-center gap-3">
          <Undo2 size={18} className="text-primary-600" />
          <div>
            <h3 className="font-semibold text-ink-main">{t('purchases.returnTitle')}</h3>
            <p className="text-xs text-ink-muted mt-0.5">{invoiceNumber}</p>
          </div>
        </div>
        <div className="p-6 flex flex-col gap-4 overflow-y-auto">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.returnDate')}</label>
              <input type="date" value={returnDate} onChange={e => onDateChange(e.target.value)} className="app-input w-full px-3 py-2 text-sm" />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.returnAccount')}</label>
              <select value={returnAccountId} onChange={e => onAccountChange(e.target.value)} className="app-input w-full px-3 py-2 text-sm">
                <option value="">{t('common.none')}</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">{t('purchases.returnReason')}</label>
            <input value={returnReason} onChange={e => onReasonChange(e.target.value)} placeholder={t('purchases.returnReasonPlaceholder')} className="app-input w-full px-3 py-2 text-sm" />
          </div>
          {returnBatches.length === 0 ? (
            <p className="text-center text-sm text-ink-muted py-4">{t('warehouse.inventory.emptyBatches')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ivory-border bg-ivory-muted">
                    <th className="px-3 py-2 text-start text-xs font-medium text-ink-muted">{t('purchases.productName')}</th>
                    <th className="px-3 py-2 text-start text-xs font-medium text-ink-muted">{t('purchases.batchNumber')}</th>
                    <th className="px-3 py-2 text-end text-xs font-medium text-ink-muted">{t('purchases.returnAvailableQty')}</th>
                    <th className="px-3 py-2 text-end text-xs font-medium text-ink-muted">{t('purchases.returnQty')}</th>
                  </tr>
                </thead>
                <tbody>
                  {returnBatches.map(b => (
                    <tr key={b.id} className="border-b border-ivory-border">
                      <td className="px-3 py-2 text-ink-main">{b.product_name_ar || b.product_name}</td>
                      <td className="px-3 py-2 text-ink-muted">{b.batch_number ?? '\u2014'}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{b.quantity_current}</td>
                      <td className="px-3 py-2 text-end">
                        <input
                          type="number" min={0} max={b.quantity_current}
                          value={returnQtys[b.id] ?? 0}
                          onChange={e => onQtyChange(b.id, Math.min(b.quantity_current, Math.max(0, parseInt(e.target.value) || 0)))}
                          className="app-input w-20 px-2 py-1 text-sm text-end"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(() => {
            const total = returnBatches.reduce((sum, b) => sum + (returnQtys[b.id] ?? 0) * (b.unit_cost ?? 0), 0);
            return total > 0 ? (
              <div className="flex justify-end gap-2 text-sm font-semibold">
                <span className="text-ink-muted">{t('purchases.returnTotal')}:</span>
                <span className="text-status-danger">{api.formatMoney(total)}</span>
              </div>
            ) : null;
          })()}
        </div>
        <div className="px-6 py-4 border-t border-ivory-border flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-ivory-border py-2 text-sm text-ink-muted hover:bg-ivory-muted">{t('common.cancel')}</button>
          <Button onClick={onReturn} disabled={returningPurchase}>
            {returningPurchase ? t('common.loading') : t('purchases.returnConfirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
