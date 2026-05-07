import { useEffect, useState } from 'react';
import { getSupplierAccounts, type SupplierSummary, type SupplierInvoice } from '../api';

function fmt(fils: number): string {
  return (fils / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dateFmt(d: string): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ar-SD', { day: 'numeric', month: 'short', year: 'numeric' });
}

const statusLabels: Record<string, string> = {
  unpaid: 'غير مدفوعة',
  partial: 'مدفوعة جزئياً',
  paid: 'مدفوعة',
};

const statusColors: Record<string, string> = {
  unpaid: 'var(--color-status-danger)',
  partial: '#f59e0b',
  paid: 'var(--color-status-success)',
};

interface SupplierAccountsProps {
  branch: string;
}

export default function SupplierAccounts({ branch }: SupplierAccountsProps) {
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    getSupplierAccounts(branch)
      .then((r) => { setSuppliers(r.suppliers); setInvoices(r.invoices); })
      .catch(() => setError('تعذر تحميل حسابات الموردين'))
      .finally(() => setLoading(false));
  }, [branch]);

  const totalDue = suppliers.reduce((s, sup) => s + Number(sup.total_due), 0);
  const filteredInvoices = selected
    ? invoices.filter((inv) => inv.supplier_id === selected)
    : invoices;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div
        className="rounded-2xl p-5"
        style={{
          background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
          color: 'white',
        }}
      >
        <p className="text-sm opacity-80">إجمالي المستحق للموردين</p>
        <p className="mt-1 text-3xl font-black tabular-nums">
          {fmt(totalDue)} <span className="text-lg font-normal opacity-70">SDG</span>
        </p>
        <p className="mt-1 text-xs opacity-70">{suppliers.length} مورد · {invoices.length} فاتورة</p>
      </div>

      {error && <p className="py-8 text-center text-sm" style={{ color: 'var(--color-status-danger)' }}>{error}</p>}

      {loading && (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-transparent" style={{ borderTopColor: 'var(--color-primary-600)' }} />
        </div>
      )}

      {!loading && suppliers.length === 0 && (
        <div className="py-10 text-center">
          <p className="text-4xl">🏭</p>
          <p className="mt-2 font-medium" style={{ color: 'var(--color-ink-main)' }}>لا توجد فواتير موردين</p>
        </div>
      )}

      {/* Supplier summary cards */}
      {!loading && suppliers.length > 0 && (
        <>
          <h2 className="text-sm font-bold" style={{ color: 'var(--color-ink-main)' }}>الموردون</h2>
          <div className="flex flex-col gap-2">
            {suppliers.map((sup) => (
              <button
                key={sup.supplier_id}
                onClick={() => setSelected(selected === sup.supplier_id ? null : sup.supplier_id)}
                className="app-card flex items-center gap-4 p-4 text-right w-full"
                style={{
                  border: selected === sup.supplier_id ? '2px solid var(--color-primary-600)' : undefined,
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate" style={{ color: 'var(--color-ink-main)' }}>
                    {sup.supplier_name || 'مورد غير معروف'}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>
                    {sup.invoice_count} فاتورة
                  </p>
                </div>
                <div className="text-left shrink-0">
                  <p className="font-bold tabular-nums" style={{ color: 'var(--color-status-danger)' }}>
                    {fmt(Number(sup.total_due))} SDG
                  </p>
                  {Number(sup.total_paid) > 0 && (
                    <p className="text-xs" style={{ color: 'var(--color-status-success)' }}>
                      مدفوع: {fmt(Number(sup.total_paid))} SDG
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Invoices */}
      {!loading && filteredInvoices.length > 0 && (
        <>
          <h2 className="text-sm font-bold mt-2" style={{ color: 'var(--color-ink-main)' }}>
            الفواتير {selected ? `(${suppliers.find(s => s.supplier_id === selected)?.supplier_name})` : ''}
          </h2>
          <div className="flex flex-col gap-2">
            {filteredInvoices.map((inv) => (
              <div key={inv.id} className="app-card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-sm" style={{ color: 'var(--color-ink-main)' }}>
                      {inv.invoice_number}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>
                      {inv.supplier_name} · {dateFmt(inv.invoice_date)}
                    </p>
                  </div>
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{
                      color: statusColors[inv.payment_status] || 'var(--color-ink-muted)',
                      background: inv.payment_status === 'paid' ? '#dcfce7' : inv.payment_status === 'partial' ? '#fef3c7' : '#fee2e2',
                    }}
                  >
                    {statusLabels[inv.payment_status] || inv.payment_status}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div>
                    <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>الإجمالي</p>
                    <p className="text-sm font-bold tabular-nums">{fmt(Number(inv.total))} SDG</p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>المدفوع</p>
                    <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-status-success)' }}>
                      {fmt(Number(inv.amount_paid))} SDG
                    </p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>المتبقي</p>
                    <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-status-danger)' }}>
                      {fmt(Number(inv.balance_due))} SDG
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
