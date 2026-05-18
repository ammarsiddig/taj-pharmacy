import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useLicense } from '../../hooks/useLicense';
import { useAuditLog } from '../../hooks/useAuditLog';
import {
  getSupplierReturns, createSupplierReturn, confirmSupplierReturn, getInvoiceBatches,
  getSuppliersFull, getPurchaseInvoices,
} from '../../api';
import type {
  SupplierReturnRow, SupplierReturnCreateData,
  SupplierRow, PurchaseInvoiceRow, BatchRow,
} from '../../types';
import { fmt, fmtDate, EmptyBlock } from './WarehouseShared';

interface Props {
  branchId: string;
  openingBranchId?: string;
}

export default function SupplierReturnsTab({ branchId }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isBlocked } = useLicense();
  const { log: auditLog } = useAuditLog();
  const [returns, setReturns] = useState<SupplierReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoiceRow[]>([]);
  const [invoiceBatches, setInvoiceBatches] = useState<BatchRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState<SupplierReturnCreateData>({
    supplier_id: '', invoice_id: '', return_date: new Date().toISOString().substring(0, 10),
    reason: '', notes: '', items: [],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReturns(await getSupplierReturns());
    } catch (e: unknown) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function openForm() {
    try {
      const [sups, invs] = await Promise.all([
        getSuppliersFull(),
        getPurchaseInvoices(branchId, { status: 'confirmed' }),
      ]);
      setSuppliers(sups as unknown as SupplierRow[]);
      setInvoices(invs);
    } catch (e: unknown) { setError(String(e)); }
    setForm({
      supplier_id: '', invoice_id: '', return_date: new Date().toISOString().substring(0, 10),
      reason: '', notes: '', items: [],
    });
    setInvoiceBatches([]);
    setShowForm(true);
  }

  async function handleInvoiceChange(invoiceId: string) {
    setForm(p => ({ ...p, invoice_id: invoiceId, items: [] }));
    if (!invoiceId) { setInvoiceBatches([]); return; }
    try {
      const batches = await getInvoiceBatches(invoiceId);
      setInvoiceBatches(batches);
    } catch { setInvoiceBatches([]); /* non-critical: batch list falls back to empty on invoice change */ }
  }

  function toggleBatchItem(batch: BatchRow, checked: boolean) {
    setForm(p => {
      if (checked) {
        return { ...p, items: [...p.items, { product_id: batch.product_id, batch_id: batch.id, quantity: 1, unit_cost: batch.unit_cost }] };
      } else {
        return { ...p, items: p.items.filter(i => i.batch_id !== batch.id) };
      }
    });
  }

  function updateItemQty(batchId: string, qty: number) {
    setForm(p => ({ ...p, items: p.items.map(i => i.batch_id === batchId ? { ...i, quantity: qty } : i) }));
  }

  async function handleSave() {
    if (!user || !form.supplier_id || !form.invoice_id || form.items.length === 0) return;
    setSaving(true);
    try {
      const retId = await createSupplierReturn(branchId, user.id, form);
      auditLog('create', 'supplier_return', typeof retId === 'string' ? retId : 'new');
      setShowForm(false);
      load();
    } catch (e: unknown) { setError(String(e)); }
    finally { setSaving(false); }
  }

  async function handleConfirm(returnId: string) {
    if (!user) return;
    if (!confirm(t('warehouse.supplierReturns.confirm') + '?')) return;
    try {
      await confirmSupplierReturn(returnId, user.id);
      auditLog('confirm', 'supplier_return', returnId);
      load();
    } catch (e: unknown) { setError(String(e)); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-ink-main">{t('warehouse.supplierReturns.title')}</h3>
          <p className="text-sm text-ink-muted">{t('warehouse.subtitle')}</p>
        </div>
        <button onClick={openForm} disabled={isBlocked} title={isBlocked ? t('license.licenseExpired') : undefined}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
          {t('warehouse.supplierReturns.create')}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

      <div className="app-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-ink-muted">{t('common.loading')}</div>
        ) : returns.length === 0 ? (
          <EmptyBlock title={t('warehouse.supplierReturns.noReturns')} subtitle={t('warehouse.supplierReturns.create')} />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-ivory-app">
              <tr>
                {[t('warehouse.supplierReturns.returnNumber'), t('warehouse.supplierReturns.supplier'), t('warehouse.supplierReturns.invoice'), t('warehouse.supplierReturns.date'), t('warehouse.supplierReturns.items'), t('warehouse.supplierReturns.total'), t('warehouse.supplierReturns.status'), t('warehouse.locations.actions')].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {returns.map(r => (
                <tr key={r.id} className="hover:bg-ivory-muted">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.return_number}</td>
                  <td className="px-4 py-3 text-gray-700">{r.supplier_name}</td>
                  <td className="px-4 py-3 text-gray-500">{r.invoice_number || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(r.return_date)}</td>
                  <td className="px-4 py-3 text-gray-600">{r.item_count}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{fmt(r.total_amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      r.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                      r.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{t(`warehouse.supplierReturns.${r.status}`, { defaultValue: r.status })}</span>
                  </td>
                  <td className="px-4 py-3">
                    {r.status === 'pending' && (
                      <button onClick={() => handleConfirm(r.id)} disabled={isBlocked} title={isBlocked ? t('license.licenseExpired') : undefined}
                        className="text-xs text-green-600 font-medium hover:underline disabled:opacity-50">{t('warehouse.supplierReturns.confirm')}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New return modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-ivory-border bg-white shadow-[var(--shadow-float)]">
            <div className="px-6 py-4 border-b border-ivory-border flex items-center justify-between bg-white/90 backdrop-blur-sm">
              <h3 className="font-semibold text-gray-900">{t('warehouse.supplierReturns.create')}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('warehouse.supplierReturns.supplier')} *</label>
                  <select value={form.supplier_id} onChange={e => setForm(p => ({ ...p, supplier_id: e.target.value, invoice_id: '', items: [] }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none">
                    <option value="">{t('warehouse.supplierReturns.selectSupplier')}</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('warehouse.supplierReturns.invoice')} *</label>
                  <select value={form.invoice_id} onChange={e => handleInvoiceChange(e.target.value)}
                    disabled={!form.supplier_id}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none disabled:bg-gray-100">
                    <option value="">{t('warehouse.supplierReturns.selectInvoice')}</option>
                    {invoices.map(i => <option key={i.id} value={i.id}>{i.invoice_number || i.id.slice(0,8)} — {fmtDate(i.invoice_date)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('warehouse.supplierReturns.date')} *</label>
                  <input type="date" value={form.return_date} onChange={e => setForm(p => ({ ...p, return_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('warehouse.supplierReturns.reason')}</label>
                  <input value={form.reason || ''} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                    placeholder={t('warehouse.supplierReturns.reasonPlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none" />
                </div>
              </div>

              {/* Batch selection */}
              {invoiceBatches.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('warehouse.supplierReturns.items')} *</label>
                  <div className="border border-ivory-border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-ivory-app">
                        <tr>
                          <th className="px-3 py-2 text-start text-xs text-gray-500"></th>
                          <th className="px-3 py-2 text-start text-xs text-gray-500">{t('warehouse.supplierReturns.product')}</th>
                          <th className="px-3 py-2 text-start text-xs text-gray-500">{t('warehouse.supplierReturns.batch')}</th>
                          <th className="px-3 py-2 text-start text-xs text-gray-500">{t('warehouse.supplierReturns.qty')}</th>
                          <th className="px-3 py-2 text-start text-xs text-gray-500">{t('warehouse.supplierReturns.qty')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {invoiceBatches.map(b => {
                          const selected = form.items.find(i => i.batch_id === b.id);
                          return (
                            <tr key={b.id} className={selected ? 'bg-green-50' : 'hover:bg-ivory-muted'}>
                              <td className="px-3 py-2">
                                <input type="checkbox" checked={!!selected}
                                  onChange={e => toggleBatchItem(b, e.target.checked)} className="rounded" />
                              </td>
                              <td className="px-3 py-2 text-gray-900">{b.product_name}</td>
                              <td className="px-3 py-2 text-gray-500">{b.batch_number || '—'}</td>
                              <td className="px-3 py-2 text-gray-600">{b.quantity_current}</td>
                              <td className="px-3 py-2">
                                {selected && (
                                  <input type="number" min={1} max={b.quantity_current}
                                    value={selected.quantity}
                                    onChange={e => updateItemQty(b.id, parseInt(e.target.value, 10) || 1)}
                                    className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-center" />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {form.items.length > 0 && (
                <div className="app-panel p-3 text-sm text-ink-main">
                  <span className="font-medium">{t('warehouse.supplierReturns.total')}:</span> {fmt(form.items.reduce((s, i) => s + i.unit_cost * i.quantity, 0))}
                  &nbsp;·&nbsp; {form.items.length} {t('warehouse.supplierReturns.items')}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 border border-ivory-border rounded-xl text-sm text-ink-muted hover:bg-ivory-muted">{t('common.cancel')}</button>
              <button onClick={handleSave}
                disabled={saving || !form.supplier_id || !form.invoice_id || form.items.length === 0 || isBlocked} title={isBlocked ? t('license.licenseExpired') : undefined}
                className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                {saving ? t('common.loading') : t('warehouse.supplierReturns.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
