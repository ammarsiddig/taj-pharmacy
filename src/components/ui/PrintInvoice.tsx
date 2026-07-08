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
  amountPaid?: number;
  notes?: string;
  status?: string;
  paymentMethod?: string;
}

export default function PrintInvoice({
  type, invoiceNumber, date, partyName, partyLabel,
  items, subtotal, discount, taxAmount, total, amountPaid, notes, status, paymentMethod,
}: PrintInvoiceProps) {
  const { t } = useTranslation();
  const [tenant, setTenant] = useState<TenantSettings | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    api.getTenantSettings().then(setTenant).catch(() => { /* non-critical: invoice prints with fallback pharmacy name */ });
    api.getPharmacyLogo().then(setLogoUrl).catch(() => { /* non-critical: invoice prints without logo */ });
  }, []);

  const pharmacyName = tenant?.name || t('pos.receiptPharmacyName');
  const pharmacyNameAr = tenant?.name_ar || '';
  const phone = tenant?.phone || '';
  const address = tenant?.address || '';
  const licenseNumber = tenant?.license_number || '';
  const remaining = amountPaid !== undefined ? total - amountPaid : undefined;

  return (
    <div
      className="print-invoice hidden print:block fixed top-0 start-0 z-[999] bg-white text-black w-full"
      style={{ padding: '12mm', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
    >
      {/* Letterhead */}
      <div className="flex justify-between items-start border-b-4 border-double border-black pb-3 mb-5">
        <div className="flex items-start gap-3">
          {logoUrl && (
            <img src={logoUrl} alt={t('common.logo')} style={{ maxHeight: '56px', maxWidth: '60mm' }} />
          )}
          <div>
            <h1 className="text-xl font-bold leading-tight">{pharmacyName}</h1>
            {pharmacyNameAr && <p className="text-sm font-medium">{pharmacyNameAr}</p>}
            {address && <p className="text-xs opacity-70 mt-0.5">{address}</p>}
            {phone && <p className="text-xs opacity-70">{phone}</p>}
            {licenseNumber && <p className="text-xs opacity-70">{t('pos.receiptLicense')}: {licenseNumber}</p>}
          </div>
        </div>
        <div className="text-end shrink-0">
          <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Invoice / فاتورة</p>
          <h2 className="text-xl font-bold tabular-nums">{invoiceNumber}</h2>
          <p className="text-xs opacity-70 tabular-nums">{date}</p>
          {status && <p className="mt-1 inline-block rounded border border-gray-400 px-2 py-0.5 text-[10px] font-medium">{status}</p>}
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
          <tr className="border-y-2 border-black bg-gray-100">
            <th className="text-start py-2 px-2 font-semibold w-8">#</th>
            <th className="text-start py-2 px-2 font-semibold">{t('purchases.productName')}</th>
            {type === 'purchase' && <th className="text-start py-2 px-2 font-semibold">{t('purchases.batchNumber')}</th>}
            {type === 'purchase' && <th className="text-start py-2 px-2 font-semibold">{t('purchases.expiryDate')}</th>}
            <th className="text-end py-2 px-2 font-semibold">{t('purchases.qty')}</th>
            <th className="text-end py-2 px-2 font-semibold">
              {type === 'purchase' ? t('purchases.costPrice') : t('pos.price')}
            </th>
            <th className="text-end py-2 px-2 font-semibold">{t('purchases.lineTotal')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id || i} className="border-b border-gray-300">
              <td className="py-1.5 px-2 tabular-nums text-gray-500">{i + 1}</td>
              <td className="py-1.5 px-2">{item.product_name}</td>
              {type === 'purchase' && <td className="py-1.5 px-2 tabular-nums">{item.batch_number || '—'}</td>}
              {type === 'purchase' && <td className="py-1.5 px-2 tabular-nums">{item.expiry_date || '—'}</td>}
              <td className="py-1.5 px-2 tabular-nums text-end">{item.quantity}</td>
              <td className="py-1.5 px-2 tabular-nums text-end">
                {api.formatMoney(item.unit_cost ?? item.unit_price ?? 0)}
              </td>
              <td className="py-1.5 px-2 tabular-nums text-end font-medium">{api.formatMoney(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mb-4">
        <div className="w-64 rounded-lg border border-gray-300 p-3 text-xs" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
          {subtotal !== undefined && (
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span className="text-gray-600">{t('pos.subtotal')}</span>
              <span className="tabular-nums">{api.formatMoney(subtotal)} {t('common.currency')}</span>
            </div>
          )}
          {discount !== undefined && discount > 0 && (
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span className="text-gray-600">{t('purchases.discount')}</span>
              <span className="tabular-nums">-{api.formatMoney(discount)} {t('common.currency')}</span>
            </div>
          )}
          {taxAmount !== undefined && taxAmount > 0 && (
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span className="text-gray-600">{t('purchases.vat')}</span>
              <span className="tabular-nums">{api.formatMoney(taxAmount)} {t('common.currency')}</span>
            </div>
          )}
          <div className="flex justify-between py-2 my-1 font-bold text-sm bg-gray-100 -mx-3 px-3">
            <span>{t('purchases.grandTotal')}</span>
            <span className="tabular-nums">{api.formatMoney(total)} {t('common.currency')}</span>
          </div>
          {amountPaid !== undefined && (
            <>
              <div className="flex justify-between py-1 border-b border-gray-200">
                <span className="text-gray-600">{t('pos.paid')}</span>
                <span className="tabular-nums">{api.formatMoney(amountPaid)} {t('common.currency')}</span>
              </div>
              <div className="flex justify-between py-1 font-semibold">
                <span>{t('purchases.remaining')}</span>
                <span className={`tabular-nums ${(remaining ?? 0) > 0 ? 'text-black' : ''}`}>{api.formatMoney(remaining ?? 0)} {t('common.currency')}</span>
              </div>
            </>
          )}
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
        <p>{tenant?.receipt_footer || pharmacyName}</p>
        <p className="mt-1">شكراً لتعاملكم معنا</p>
      </div>
    </div>
  );
}
