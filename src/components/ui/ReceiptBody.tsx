import { useTranslation } from 'react-i18next';
import * as api from '../../api';
import type { SalePayment } from '../../types';
import type { ReceiptPreferences } from '../../pages/pos/workspaceState';

export interface ReceiptItem {
  id?: string;
  product_name?: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export type LogoPosition = 'center' | 'right' | 'left';
export type LogoSize = 'small' | 'medium' | 'large';

export interface ReceiptBodyProps {
  saleNumber: string;
  date: string;
  items: ReceiptItem[];
  subtotal?: number;
  total: number;
  discount?: number;
  taxAmount?: number;
  paymentMethod: string;
  paymentMethodName?: string;
  amountPaid?: number;
  changeAmount?: number;
  customerName?: string;
  cashierName?: string;
  notes?: string;
  splitPayments?: SalePayment[];
  // Resolved tenant identity (loaded by the caller).
  pharmacyName: string;
  pharmacyNameAr?: string;
  licenseNumber?: string;
  phone?: string;
  address?: string;
  header?: string;
  footer: string;
  // Logo presentation.
  logoUrl?: string | null;
  showLogo: boolean;
  logoPosition?: LogoPosition;
  logoSize?: LogoSize;
  preferences?: ReceiptPreferences;
}

// Size mapping shared by print + preview so they always match.
function logoMaxHeight(size: LogoSize): number {
  if (size === 'small') return 28;
  if (size === 'large') return 56;
  return 40; // medium (legacy default)
}

// Position uses logical margins so right/left stay RTL-safe.
function logoPositionClass(position: LogoPosition): string {
  if (position === 'right') return 'ms-auto';
  if (position === 'left') return 'me-auto';
  return 'mx-auto';
}

/**
 * The receipt body — the single source of truth for what a printed sale looks
 * like. Rendered both by PrintReceipt (inside the hidden print wrapper) and by
 * the POS Receipt Customizer preview, so the preview can never drift from the
 * real output. It renders plain content only — no print/positioning wrappers.
 */
export default function ReceiptBody({
  saleNumber, date, items, subtotal, total, discount, taxAmount, paymentMethod,
  paymentMethodName, amountPaid, changeAmount, customerName, cashierName, notes, splitPayments,
  pharmacyName, pharmacyNameAr, licenseNumber, phone, address, header, footer,
  logoUrl, showLogo, logoPosition = 'center', logoSize = 'medium', preferences,
}: ReceiptBodyProps) {
  const { t } = useTranslation();

  const receiptPreferences: ReceiptPreferences = {
    showCustomer: true,
    showCashier: true,
    showNotes: true,
    showPaymentBreakdown: true,
    compactMode: false,
    ...preferences,
  };

  const computedSubtotal = subtotal ?? items.reduce((s, i) => s + i.subtotal, 0);

  function fmtDate(iso: string) {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  function pmLabel(method: string) {
    if (paymentMethodName) return paymentMethodName;
    if (method === 'cash') return t('pos.cash');
    if (method === 'bank_transfer') return t('pos.bankTransfer');
    if (method === 'credit') return t('pos.credit');
    if (method === 'partial') return t('pos.splitPayment');
    return method;
  }

  const showPaymentBreakdown = receiptPreferences.showPaymentBreakdown && splitPayments && splitPayments.length > 0;

  return (
    <>
      {/* Header */}
      <div className="text-center mb-2">
        {showLogo && logoUrl && (
          <img src={logoUrl} alt={t('common.logo')} className={`block ${logoPositionClass(logoPosition)} mb-1`} style={{ maxHeight: `${logoMaxHeight(logoSize)}px`, maxWidth: '60mm' }} />
        )}
        <div className="text-sm font-bold">{pharmacyName}</div>
        {pharmacyNameAr && <div className="text-xs">{pharmacyNameAr}</div>}
        {licenseNumber && <div className="text-[9px] opacity-70">{t('pos.receiptLicense')}: {licenseNumber}</div>}
        {address && <div className="text-[9px] opacity-70">{address}</div>}
        {phone && <div className="text-[9px] opacity-70">{phone}</div>}
        {header && <div className="text-[9px] mt-1 whitespace-pre-line">{header}</div>}
      </div>

      <div className="border-t border-dashed border-black border-[1.5px] my-1" />

      {/* Sale info */}
      <div className="flex justify-between text-[10px]">
        <span>{saleNumber}</span>
        <span>{fmtDate(date)}</span>
      </div>
      {receiptPreferences.showCashier && cashierName && (
        <div className="text-[10px] opacity-70">{t('pos.cashier')}: {cashierName}</div>
      )}
      {receiptPreferences.showCustomer && customerName && (
        <div className="text-[10px] opacity-70">{t('pos.customer')}: {customerName}</div>
      )}
      {receiptPreferences.showNotes && notes && (
        <div className="text-[10px] opacity-70">{t('pos.notes')}: {notes}</div>
      )}

      <div className="border-t border-dashed border-black border-[1.5px] my-1" />

      {/* Items table */}
      <table className={`w-full ${receiptPreferences.compactMode ? 'text-[9px]' : 'text-[10px]'}`}>
        <thead>
          <tr className="border-b border-black bg-gray-100">
            <th className="text-right py-0.5 text-[11px]">{t('pos.product')}</th>
            <th className="text-center py-0.5 w-8 text-[11px]">{t('pos.qty')}</th>
            <th className="text-right py-0.5 w-14 text-[11px]">{t('pos.price')}</th>
            <th className="text-right py-0.5 w-14 text-[11px]">{t('pos.total')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id || idx} className="border-b border-dotted border-gray-300">
              <td className="py-0.5" style={{ maxWidth: '30mm', wordBreak: 'break-word' }}>{item.product_name || '—'}</td>
              <td className="text-center py-0.5">{item.quantity}</td>
              <td className="text-right py-0.5 tabular-nums">{api.formatMoney(item.unit_price)}</td>
              <td className="text-right py-0.5 tabular-nums">{api.formatMoney(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-t border-dashed border-black border-[1.5px] my-1" />

      {/* Subtotal */}
      <div className="flex justify-between text-[10px]">
        <span>{t('pos.subtotal')}</span>
        <span className="tabular-nums">{api.formatMoney(computedSubtotal)}</span>
      </div>

      {/* Discount */}
      {discount != null && discount > 0 && (
        <div className="flex justify-between text-[10px]">
          <span>{t('pos.discount')}</span>
          <span className="tabular-nums">-{api.formatMoney(discount)}</span>
        </div>
      )}

      {/* Tax */}
      {taxAmount != null && taxAmount > 0 && (
        <div className="flex justify-between text-[10px]">
          <span>{t('pos.tax')}</span>
          <span className="tabular-nums">{api.formatMoney(taxAmount)}</span>
        </div>
      )}

      {/* Grand total */}
      <div className="flex justify-between text-sm font-bold mt-1 pt-1 border-t-2 border-black border-double">
        <span>{t('pos.grandTotal')}</span>
        <span className="tabular-nums">{api.formatMoney(total)}</span>
      </div>

      {/* Payment */}
      <div className="flex justify-between text-[10px] mt-0.5">
        <span>{pmLabel(paymentMethod)}</span>
        {amountPaid !== undefined && <span>{t('pos.paid')}: {api.formatMoney(amountPaid)}</span>}
      </div>
      {showPaymentBreakdown && splitPayments!.map((payment) => (
        <div key={payment.id} className="flex justify-between text-[10px]">
          <span>
            {payment.payment_method === 'cash'
              ? t('pos.cash')
              : payment.payment_method_name || t('pos.bankTransfer')}
          </span>
          <span className="tabular-nums">{api.formatMoney(payment.amount)}</span>
        </div>
      ))}
      {changeAmount !== undefined && changeAmount > 0 && (
        <div className="flex justify-between text-[10px]">
          <span>{t('pos.change')}</span>
          <span className="tabular-nums">{api.formatMoney(changeAmount)}</span>
        </div>
      )}

      <div className="border-t border-dashed border-black border-[1.5px] my-3" />

      {/* Footer */}
      <div className="text-center text-[9px] opacity-70 whitespace-pre-line">{footer}</div>
    </>
  );
}
