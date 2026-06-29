import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../../api';
import type { SalePayment, TenantSettings } from '../../types';
import type { ReceiptPreferences } from '../../pages/pos/workspaceState';
import ReceiptBody, { type ReceiptItem, type LogoPosition, type LogoSize } from './ReceiptBody';

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

  return (
    <div className="print-receipt hidden print:block fixed top-0 left-0 z-[999] bg-white p-2 text-black" style={{ width: '80mm' }}>
      <ReceiptBody
        saleNumber={saleNumber}
        date={date}
        items={items}
        subtotal={subtotal}
        total={total}
        discount={discount}
        taxAmount={taxAmount}
        paymentMethod={paymentMethod}
        paymentMethodName={paymentMethodName}
        amountPaid={amountPaid}
        changeAmount={changeAmount}
        customerName={customerName}
        cashierName={cashierName}
        notes={notes}
        splitPayments={splitPayments}
        pharmacyName={tenant?.name || t('pos.receiptPharmacyName')}
        pharmacyNameAr={tenant?.name_ar || ''}
        licenseNumber={tenant?.license_number || ''}
        phone={tenant?.phone || ''}
        address={tenant?.address || ''}
        header={tenant?.receipt_header || ''}
        footer={tenant?.receipt_footer || t('pos.receiptFooter')}
        logoUrl={logoUrl}
        showLogo={tenant?.print_logo !== false}
        logoPosition={(tenant?.logo_position as LogoPosition) || 'center'}
        logoSize={(tenant?.logo_size as LogoSize) || 'medium'}
        preferences={preferences}
      />
    </div>
  );
}
