import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../../api';
import type { TenantSettings } from '../../types';

interface InvoiceItem {
  id?: string;
  product_name: string;
  batch_number?: string;
  expiry_date?: string;
  quantity: number;
  unit_cost?: number;
  unit_price?: number;
  sale_price?: number;
  subtotal: number;
}

interface PrintInvoiceProps {
  type: 'purchase' | 'sale';
  invoiceNumber: string;
  date: string;
  partyName: string;
  partyLabel: string;
  items: InvoiceItem[];
  subtotal?: number;
  discount?: number;
  taxAmount?: number;
  total: number;
  notes?: string;
  status?: string;
  paymentMethod?: string;
}

export default function PrintInvoice({
  type, invoiceNumber, date, partyName, partyLabel,
  items, subtotal, discount, taxAmount, total, notes, status, paymentMethod,
}: PrintInvoiceProps) {
  const { t } = useTranslation();
  const [tenant, setTenant] = useState<TenantSettings | null>(null);

  useEffect(() => {
    api.getTenantSettings().then(setTenant).catch(() => { /* non-critical: invoice prints with fallback pharmacy name */ });
  }, []);

  const pharmacyName = tenant?.name || t('pos.receiptPharmacyName');
  const phone = tenant?.phone || '';
  const address = tenant?.address || '';

  return (
    <div className="print-invoice hidden print:block fixed top-0 left-0 z-[999] bg-white text-black w-full" style={{ padding: '10mm' }}>
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-black pb-3 mb-4">
        <div>
          <h1 className="text-lg font-bold">{pharmacyName}</h1>
          {address && <p className="text-xs opacity-70">{address}</p>}
          {phone && <p className="text-xs opacity-70">{phone}</p>}
        </div>
        <div className="text-right">
          <h2 className="text-base font-bold">
            {type === 'purchase' ? t('purchases.invoiceDetail') : t('sales.invoiceTitle')}
          </h2>
          <p className="text-sm font-mono">{invoiceNumber}</p>
          <p className="text-xs opacity-70">{date}</p>
          {status && <p className="text-xs mt-1 font-medium">{status}</p>}
        </div>
      </div>

      {/* Party info */}
      <div className="mb-4 text-sm">
        <span className="font-medium">{partyLabel}: </span>
        <span>{partyName}</span>
        {paymentMethod && (
          <span className="ms-4 text-xs opacity-70">
            {t('sales.paymentMethod')}: {paymentMethod}
          </span>
        )}
      </div>

      {/* Items Table */}
      <table className="w-full text-xs border-collapse mb-4">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="text-right py-1.5 px-2 font-medium">#</th>
            <th className="text-right py-1.5 px-2 font-medium">{t('purchases.productName')}</th>
            {type === 'purchase' && <th className="text-right py-1.5 px-2 font-medium">{t('purchases.batchNumber')}</th>}
            {type === 'purchase' && <th className="text-right py-1.5 px-2 font-medium">{t('purchases.expiryDate')}</th>}
            <th className="text-right py-1.5 px-2 font-medium">{t('purchases.qty')}</th>
            <th className="text-right py-1.5 px-2 font-medium">
              {type === 'purchase' ? t('purchases.costPrice') : t('pos.price')}
            </th>
            <th className="text-right py-1.5 px-2 font-medium">{t('purchases.lineTotal')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id || i} className="border-b border-gray-300">
              <td className="py-1 px-2 tabular-nums">{i + 1}</td>
              <td className="py-1 px-2">{item.product_name}</td>
              {type === 'purchase' && <td className="py-1 px-2 tabular-nums">{item.batch_number || '—'}</td>}
              {type === 'purchase' && <td className="py-1 px-2 tabular-nums">{item.expiry_date || '—'}</td>}
              <td className="py-1 px-2 tabular-nums text-right">{item.quantity}</td>
              <td className="py-1 px-2 tabular-nums text-right">
                {api.formatMoney(item.unit_cost ?? item.unit_price ?? 0)}
              </td>
              <td className="py-1 px-2 tabular-nums text-right font-medium">{api.formatMoney(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mb-4">
        <div className="w-60 text-xs">
          {subtotal !== undefined && (
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span>{t('pos.subtotal')}</span>
              <span className="tabular-nums">{api.formatMoney(subtotal)} SDG</span>
            </div>
          )}
          {discount !== undefined && discount > 0 && (
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span>{t('purchases.discount')}</span>
              <span className="tabular-nums">-{api.formatMoney(discount)} SDG</span>
            </div>
          )}
          {taxAmount !== undefined && taxAmount > 0 && (
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span>{t('purchases.vat')}</span>
              <span className="tabular-nums">{api.formatMoney(taxAmount)} SDG</span>
            </div>
          )}
          <div className="flex justify-between py-1.5 font-bold text-sm border-t-2 border-black">
            <span>{t('purchases.grandTotal')}</span>
            <span className="tabular-nums">{api.formatMoney(total)} SDG</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {notes && (
        <div className="text-xs border-t border-gray-300 pt-2 mb-4">
          <span className="font-medium">{t('purchases.notes')}: </span>{notes}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-gray-300 pt-3 text-center text-[9px] opacity-50">
        {tenant?.receipt_footer || pharmacyName}
      </div>
    </div>
  );
}
