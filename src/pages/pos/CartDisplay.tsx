import { AlertTriangle, Minus, Plus, Trash2, ShoppingCart } from 'lucide-react';
import type { CartItem } from '../../types';
import type { TFunction } from 'i18next';
import Numpad from '../../components/ui/Numpad';
import { productLabel } from '../../utils/productLabel';

interface CartDisplayProps {
  cart: CartItem[];
  onIncrement: (index: number) => void;
  onDecrement: (index: number) => void;
  onRemove: (index: number) => void;
  selectedBatch: string | null;
  onSelectBatch: (batchId: string) => void;
  editingQtyBatch: string | null;
  onEditQty: (batchId: string | null) => void;
  onSetQuantity: (batchId: string, quantity: number) => void;
  t: TFunction;
  formatMoney: (n: number) => string;
}

export default function CartDisplay({
  cart,
  onIncrement,
  onDecrement,
  onRemove,
  selectedBatch,
  onSelectBatch,
  editingQtyBatch,
  onEditQty,
  onSetQuantity,
  t,
  formatMoney,
}: CartDisplayProps) {
  return (
    <div className="app-card flex-1 overflow-y-auto min-h-0">
      {cart.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mb-4">
            <ShoppingCart size={28} className="text-primary-400" />
          </div>
          <p className="text-base font-medium text-ink-muted">{t('pos.emptyCart')}</p>
          <p className="text-sm text-ink-placeholder mt-1">ابحث عن منتج أو امسح الباركود للبدء</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="sticky top-0">
            <tr className="bg-ivory-app border-b border-ivory-border">
              <th className="px-3 py-2 text-right font-medium text-ink-muted">{t('pos.product')}</th>
              <th className="px-3 py-2 text-right font-medium text-ink-muted w-[100px]">{t('pos.price')}</th>
              <th className="px-3 py-2 text-center font-medium text-ink-muted w-[130px]">{t('pos.quantity')}</th>
              <th className="px-3 py-2 text-right font-medium text-ink-muted w-[100px]">{t('pos.total')}</th>
              <th className="px-3 py-2 w-[40px]"></th>
            </tr>
          </thead>
          <tbody>
            {cart.map((item, idx) => (
              <tr
                key={item.batch_id}
                onClick={() => onSelectBatch(item.batch_id)}
                className={`border-b border-ivory-border cursor-pointer ${
                  selectedBatch === item.batch_id
                    ? 'bg-primary-50 ring-2 ring-inset ring-primary-300'
                    : 'bg-white hover:bg-ivory-muted'
                }`}
              >
                <td className="px-3 py-2 text-ink-main font-medium">
                  <div>{productLabel(item.product_name_ar, item.product_name)}</div>
                  {item.max_quantity - item.quantity <= 2 && (
                    <span className="mt-0.5 inline-flex items-center gap-0.5 rounded-full bg-status-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-status-warning">
                      <AlertTriangle size={9} />{t('pos.lowStockAlert')}
                    </span>
                  )}
                  {item.expiry_date && (() => {
                    const exp = new Date(item.expiry_date);
                    const now = new Date();
                    const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
                    if (daysLeft <= 0) return (
                      <span className="mt-0.5 inline-flex items-center gap-0.5 rounded-full bg-status-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-status-danger">
                        <AlertTriangle size={9} />{t('pos.expired')}
                      </span>
                    );
                    if (daysLeft <= 90) return (
                      <span className="mt-0.5 inline-flex items-center gap-0.5 rounded-full bg-status-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-status-warning">
                        <AlertTriangle size={9} />{t('pos.expiresInDays', { days: daysLeft })}
                      </span>
                    );
                    return null;
                  })()}
                </td>
                <td className="px-3 py-2 tabular-nums text-ink-muted">{formatMoney(item.unit_price)}</td>
                <td className="relative px-3 py-2">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => onDecrement(idx)} className="p-1.5 text-ink-muted hover:text-status-danger rounded active:bg-status-danger-bg"><Minus size={14} /></button>
                    <button
                      onClick={() => onEditQty(editingQtyBatch === item.batch_id ? null : item.batch_id)}
                      className="w-10 text-center tabular-nums text-ink-main font-medium py-1 rounded hover:bg-primary-100 active:bg-primary-100"
                    >{item.quantity}</button>
                    <button onClick={() => onIncrement(idx)} className="p-1.5 text-ink-muted hover:text-primary-600 rounded active:bg-primary-100"><Plus size={14} /></button>
                  </div>
                  {editingQtyBatch === item.batch_id && (
                    <div className="absolute end-0 top-full z-40 mt-1">
                      <Numpad
                        initialValue={item.quantity}
                        maxValue={item.max_quantity}
                        decimals={0}
                        onConfirm={v => onSetQuantity(item.batch_id, v)}
                        onCancel={() => onEditQty(null)}
                      />
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums text-ink-main font-medium">{formatMoney(item.quantity * item.unit_price)}</td>
                <td className="px-1 py-2">
                  <button onClick={() => onRemove(idx)} className="p-1 text-ink-muted hover:text-status-danger"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
