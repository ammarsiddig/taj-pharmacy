import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../../api';
import type { SalePayment, TenantSettings } from '../../types';
import type { ReceiptPreferences } from '../../pages/pos/workspaceState';

interface ReceiptItem {
  id?: string;
  product_name?: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface PrintReceiptProps {
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
  preferences?: ReceiptPreferences;
}

export default function PrintReceipt({
  saleNumber, date, items, subtotal, total, discount, taxAmount, paymentMethod,
  paymentMethodName, amountPaid, changeAmount, customerName, cashierName, notes, splitPayments, preferences,
}: PrintReceiptProps) {
  const { t } = useTranslation();
  const [tenant, setTenant] = useState<TenantSettings | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    api.getTenantSettings().then(setTenant).catch(() => { /* non-critical: receipt prints with fallback pharmacy name */ });
    api.getPharmacyLogo().then(setLogoUrl).catch(() => { /* non-critical: receipt prints without logo */ });
  }, []);

  const pharmacyName = tenant?.name || t('pos.receiptPharmacyName');
  const pharmacyNameAr = tenant?.name_ar || '';
  const licenseNumber = tenant?.license_number || '';
  const phone = tenant?.phone || '';
  const address = tenant?.address || '';
  const header = tenant?.receipt_header || '';
  const footer = tenant?.receipt_footer || t('pos.receiptFooter');
  const showLogo = tenant?.print_logo !== false;
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
    <div className="print-receipt hidden print:block fixed top-0 left-0 z-[999] bg-white p-2 text-black" style={{ width: '80mm' }}>
      {/* Header */}
      <div className="text-center mb-2">
        {showLogo && logoUrl && (
          <img src={logoUrl} alt={t('common.logo')} className="mx-auto mb-1" style={{ maxHeight: '40px', maxWidth: '60mm' }} />
        )}
        <div className="text-sm font-bold">{pharmacyName}</div>
        {pharmacyNameAr && <div className="text-xs">{pharmacyNameAr}</div>}
        {licenseNumber && <div className="text-[9px] opacity-70">{t('pos.receiptLicense')}: {licenseNumber}</div>}
        {address && <div className="text-[9px] opacity-70">{address}</div>}
        {phone && <div className="text-[9px] opacity-70">{phone}</div>}
        {header && <div className="text-[9px] mt-1 whitespace-pre-line">{header}</div>}
      </div>

      <div className="border-t border-dashed border-black my-1" />

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

      <div className="border-t border-dashed border-black my-1" />

      {/* Items table */}
      <table className={`w-full ${receiptPreferences.compactMode ? 'text-[9px]' : 'text-[10px]'}`}>
        <thead>
          <tr className="border-b border-black">
            <th className="text-right py-0.5">{t('pos.product')}</th>
            <th className="text-center py-0.5 w-8">{t('pos.qty')}</th>
            <th className="text-right py-0.5 w-14">{t('pos.price')}</th>
            <th className="text-right py-0.5 w-14">{t('pos.total')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id || idx} className="border-b border-dotted border-gray-300">
              <td className="py-0.5">{item.product_name || '—'}</td>
              <td className="text-center py-0.5">{item.quantity}</td>
              <td className="text-right py-0.5 tabular-nums">{api.formatMoney(item.unit_price)}</td>
              <td className="text-right py-0.5 tabular-nums">{api.formatMoney(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-t border-dashed border-black my-1" />

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
      <div className="flex justify-between text-xs font-bold mt-0.5">
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

      <div className="border-t border-dashed border-black my-2" />

      {/* Footer */}
      <div className="text-center text-[9px] opacity-70 whitespace-pre-line">{footer}</div>
    </div>
  );
}
