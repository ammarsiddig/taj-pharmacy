import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Warehouse as WarehouseIcon, Move3D, Undo2, CalendarDays, ArrowLeftRight, PackageSearch, Trash2, RotateCcw } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getBranchId } from '../api';
import {
  getStockMovements,
  getSupplierReturns, createSupplierReturn, confirmSupplierReturn, getInvoiceBatches,
  getSuppliersFull, getPurchaseInvoices,
  getStorageLocations, transferStock, searchProductsPos, getLocationBatches, disposeBatch, recallBatch,
} from '../api';
import type {
  StockMovementRow,
  SupplierReturnRow, SupplierReturnCreateData,
  SupplierRow, PurchaseInvoiceRow, BatchRow,
  StorageLocationFull, RecalledBatch,
} from '../types';
import { useLicense } from '../hooks/useLicense';
import { useAuditLog } from '../hooks/useAuditLog';

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(piasters: number) {
  return (piasters / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return iso.substring(0, 10);
}

const MOVEMENT_COLORS: Record<string, string> = {
  receive: 'bg-green-100 text-green-800',
  sell: 'bg-blue-100 text-blue-800',
  customer_return: 'bg-yellow-100 text-yellow-800',
  supplier_return: 'bg-orange-100 text-orange-800',
  transfer_in: 'bg-teal-100 text-teal-800',
  transfer_out: 'bg-purple-100 text-purple-800',
  adjust: 'bg-gray-100 text-gray-800',
  dispose: 'bg-red-100 text-red-800',
};

// ─── sub-components ─────────────────────────────────────────────────────────

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-4 py-2.5 text-sm font-medium border transition-colors ${
        active
          ? 'border-primary-600 text-primary-600 bg-white shadow-[var(--shadow-soft)]'
          : 'border-ivory-border text-ink-muted bg-ivory-muted hover:text-ink-main hover:bg-white'
      }`}
    >
      <span className="inline-flex items-center gap-2">
        {icon}
        {children}
      </span>
    </button>
  );
}

function EmptyBlock({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="py-10 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-ivory-muted text-ink-muted">i</div>
      <p className="mt-3 text-sm font-medium text-ink-main">{title}</p>
      {subtitle && <p className="mt-1 text-xs text-ink-muted">{subtitle}</p>}
    </div>
  );
}

// ─── Tab 1: Stock Movements ──────────────────────────────────────────────────

function MovementsTab() {
  const { t } = useTranslation();
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [movementType, setMovementType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [error, setError] = useState('');
  const branchId = getBranchId();

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
                    <td className="px-4 py-3 font-medium text-gray-900">{m.product_name}</td>
                    <td className="px-4 py-3 text-gray-500">{m.batch_number || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MOVEMENT_COLORS[m.movement_type] || 'bg-gray-100 text-gray-700'}`}>
                        {m.movement_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-semibold ${
                      ['receive', 'customer_return', 'transfer_in'].includes(m.movement_type) ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {['receive', 'customer_return', 'transfer_in'].includes(m.movement_type) ? '+' : '-'}{m.quantity_change}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{m.quantity_before}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{m.quantity_after}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{m.reference_type ? `${m.reference_type}` : '—'}</td>
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

// ─── Tab 2: Supplier Returns ─────────────────────────────────────────────────

function SupplierReturnsTab() {
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
  const branchId = getBranchId();

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
        <button onClick={openForm} disabled={isBlocked} title={isBlocked ? 'License expired' : undefined}
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
                      <button onClick={() => handleConfirm(r.id)} disabled={isBlocked} title={isBlocked ? 'License expired' : undefined}
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
                disabled={saving || !form.supplier_id || !form.invoice_id || form.items.length === 0 || isBlocked} title={isBlocked ? 'License expired' : undefined}
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

// ─── Tab: Stock Transfer ─────────────────────────────────────────────────────

function TransferTab() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const branchId = getBranchId();
  const [locations, setLocations] = useState<StorageLocationFull[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<{ id: string; trade_name: string; trade_name_ar?: string }[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string } | null>(null);
  const [fromLoc, setFromLoc] = useState('');
  const [toLoc, setToLoc] = useState('');
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);

  useEffect(() => {
    getStorageLocations(branchId).then(locs => {
      const active = locs.filter(l => l.is_active);
      setLocations(active);
      if (active.length > 0) setFromLoc(active[0].id);
      if (active.length > 1) setToLoc(active[1].id);
    }).catch(() => {});
  }, [branchId]);

  useEffect(() => {
    if (!productSearch.trim()) { setProductResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await searchProductsPos(productSearch, branchId);
        setProductResults(res.slice(0, 8).map(p => ({ id: p.product_id, trade_name: p.product_name, trade_name_ar: p.product_name_ar })));
      } catch { setProductResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [productSearch, branchId]);

  const handleTransfer = async () => {
    if (!selectedProduct || !fromLoc || !toLoc || !quantity) return;
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) return;
    setSaving(true);
    try {
      await transferStock(branchId, user!.id, selectedProduct.id, fromLoc, toLoc, qty);
      setToast({ msg: t('warehouse.transfer.success'), type: 'success' });
      setQuantity('');
      setSelectedProduct(null);
      setProductSearch('');
    } catch (e: unknown) {
      setToast({ msg: e instanceof Error ? e.message : String(e), type: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const inp = 'app-input w-full px-3 py-2.5 text-sm';

  return (
    <div className="mx-auto max-w-lg">
      <div className="app-panel p-6 flex flex-col gap-5">
        <h3 className="font-bold text-ink-main text-base">{t('warehouse.transfer.title')}</h3>

        {/* Product search */}
        <div className="relative">
          <label className="mb-1 block text-xs font-medium text-ink-muted">{t('warehouse.transfer.product')}</label>
          {selectedProduct ? (
            <div className="flex items-center justify-between rounded-xl border border-ivory-border bg-ivory-muted px-3 py-2.5">
              <span className="text-sm font-medium text-ink-main">{selectedProduct.name}</span>
              <button onClick={() => { setSelectedProduct(null); setProductSearch(''); }} className="text-xs text-ink-muted hover:text-status-danger">✕</button>
            </div>
          ) : (
            <>
              <input className={inp} placeholder={t('purchases.searchProduct')} value={productSearch} onChange={e => setProductSearch(e.target.value)} />
              {productResults.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full rounded-xl border border-ivory-border bg-white shadow-[var(--shadow-float)]">
                  {productResults.map(p => (
                    <li key={p.id}>
                      <button className="w-full px-3 py-2 text-start text-sm hover:bg-ivory-muted" onClick={() => { setSelectedProduct({ id: p.id, name: p.trade_name_ar || p.trade_name }); setProductSearch(''); setProductResults([]); }}>
                        {p.trade_name_ar || p.trade_name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* From / To locations */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">{t('warehouse.transfer.from')}</label>
            <select className={inp} value={fromLoc} onChange={e => setFromLoc(e.target.value)}>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name_ar || l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">{t('warehouse.transfer.to')}</label>
            <select className={inp} value={toLoc} onChange={e => setToLoc(e.target.value)}>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name_ar || l.name}</option>)}
            </select>
          </div>
        </div>

        {/* Quantity */}
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">{t('warehouse.transfer.quantity')}</label>
          <input type="number" min={1} className={inp} placeholder="0" value={quantity} onChange={e => setQuantity(e.target.value)} />
        </div>

        <button
          disabled={saving || !selectedProduct || !fromLoc || !toLoc || !quantity}
          onClick={handleTransfer}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#0FA3A6] py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#0D8B8D] transition-colors"
        >
          <ArrowLeftRight size={16} />
          {saving ? t('common.loading') : t('warehouse.transfer.submit')}
        </button>
      </div>

      {toast && (
        <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${toast.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Stock by Location (Inventory) ──────────────────────────────────────

function InventoryTab() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const branchId = getBranchId();
  const [locations, setLocations] = useState<StorageLocationFull[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [disposeTarget, setDisposeTarget] = useState<BatchRow | null>(null);
  const [disposeQty, setDisposeQty] = useState('1');
  const [disposeReason, setDisposeReason] = useState('');
  const [disposing, setDisposing] = useState(false);
  const [disposeError, setDisposeError] = useState('');
  const [showRecall, setShowRecall] = useState(false);
  const [recallBatchNumber, setRecallBatchNumber] = useState('');
  const [recallReason, setRecallReason] = useState('');
  const [recalling, setRecalling] = useState(false);
  const [recallError, setRecallError] = useState('');
  const [recalledBatches, setRecalledBatches] = useState<RecalledBatch[] | null>(null);

  useEffect(() => {
    getStorageLocations(branchId).then(locs => {
      const active = locs.filter(l => l.is_active);
      setLocations(active);
      if (active.length > 0) setSelectedLocationId(active[0].id);
    }).catch(() => {});
  }, [branchId]);

  useEffect(() => {
    if (!selectedLocationId) return;
    setLoading(true);
    getLocationBatches(selectedLocationId)
      .then(setBatches)
      .catch(() => setBatches([]))
      .finally(() => setLoading(false));
  }, [selectedLocationId]);

  const filtered = search
    ? batches.filter(b =>
        b.product_name.toLowerCase().includes(search.toLowerCase()) ||
        (b.batch_number ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : batches;

  const totalQty = batches.reduce((sum, b) => sum + b.quantity_current, 0);
  const inp = 'app-input w-full px-3 py-2 text-sm';

  async function handleRecall() {
    if (!user) return;
    if (!recallBatchNumber.trim()) { setRecallError(t('common.required')); return; }
    setRecalling(true);
    setRecallError('');
    setRecalledBatches(null);
    try {
      const result = await recallBatch(branchId, user.id, recallBatchNumber.trim(), recallReason || undefined);
      setRecalledBatches(result);
    } catch (e: unknown) {
      setRecallError(String(e));
    } finally {
      setRecalling(false);
    }
  }

  function closeRecall() {
    setShowRecall(false);
    setRecallBatchNumber('');
    setRecallReason('');
    setRecallError('');
    setRecalledBatches(null);
    if (selectedLocationId) {
      setLoading(true);
      getLocationBatches(selectedLocationId).then(setBatches).catch(() => setBatches([])).finally(() => setLoading(false));
    }
  }

  async function handleDispose() {
    if (!disposeTarget || !user) return;
    const qty = parseInt(disposeQty, 10);
    if (isNaN(qty) || qty <= 0) { setDisposeError(t('warehouse.dispose.invalidQty')); return; }
    if (qty > disposeTarget.quantity_current) { setDisposeError(t('warehouse.dispose.exceedsAvailable')); return; }
    setDisposing(true);
    setDisposeError('');
    try {
      await disposeBatch(branchId, user.id, disposeTarget.id, qty, disposeReason || undefined);
      setDisposeTarget(null);
      setDisposeQty('1');
      setDisposeReason('');
      // Reload batches
      if (selectedLocationId) {
        setLoading(true);
        getLocationBatches(selectedLocationId).then(setBatches).catch(() => setBatches([])).finally(() => setLoading(false));
      }
    } catch (e: unknown) {
      setDisposeError(String(e));
    } finally {
      setDisposing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
        <button
          onClick={() => setShowRecall(true)}
          className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
        >
          <RotateCcw size={15} />
          {t('warehouse.recall.btn')}
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <label className="mb-1 block text-xs font-medium text-ink-muted">{t('warehouse.transfer.from')}</label>
          <select
            className={inp}
            value={selectedLocationId}
            onChange={e => setSelectedLocationId(e.target.value)}
          >
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.name_ar || l.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-ink-muted">{t('common.search')}</label>
          <input
            className={inp}
            placeholder={t('purchases.searchProduct')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="rounded-xl border border-ivory-border bg-ivory-muted px-4 py-2 text-sm">
          <span className="text-ink-muted">{t('warehouse.stockTake.totalItems')}: </span>
          <span className="font-bold text-ink-main">{batches.length}</span>
          <span className="mx-2 text-ink-muted">|</span>
          <span className="text-ink-muted">{t('warehouse.movements.qty')}: </span>
          <span className="font-bold text-ink-main">{totalQty}</span>
        </div>
      </div>

      {/* Table */}
      <div className="app-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ivory-muted">
            <tr>
              <th className="px-4 py-3 text-start text-xs font-semibold text-ink-muted">#</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-ink-muted">{t('warehouse.movements.product')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-ink-muted">{t('purchases.batchNumber')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-ink-muted">{t('purchases.expiryDate')}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-ink-muted">{t('warehouse.movements.qty')}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-ink-muted">{t('purchases.unitCost')}</th>
              <th className="px-4 py-3 text-xs font-semibold text-ink-muted"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-muted">{t('common.loading')}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-muted">{t('warehouse.movements.noMovements')}</td></tr>
            ) : (
              filtered.map((b, i) => (
                <tr key={b.id} className="border-b border-ivory-border hover:bg-ivory-muted/50">
                  <td className="px-4 py-3 tabular-nums text-ink-muted">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-ink-main">{b.product_name_ar || b.product_name}</td>
                  <td className="px-4 py-3 text-ink-muted">{b.batch_number}</td>
                  <td className="px-4 py-3 text-ink-muted">{fmtDate(b.expiry_date)}</td>
                  <td className="px-4 py-3 text-end tabular-nums font-semibold text-ink-main">{b.quantity_current}</td>
                  <td className="px-4 py-3 text-end tabular-nums text-ink-muted">{fmt(b.unit_cost)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => { setDisposeTarget(b); setDisposeQty('1'); setDisposeReason(''); setDisposeError(''); }}
                      className="flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-status-danger hover:bg-red-50"
                      title={t('warehouse.dispose.title')}
                    >
                      <Trash2 size={13} />
                      {t('warehouse.dispose.btn')}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Recall modal */}
      {showRecall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-lg rounded-2xl border border-ivory-border bg-white shadow-[var(--shadow-float)]">
            <div className="px-6 py-4 border-b border-ivory-border flex items-center gap-3">
              <RotateCcw size={18} className="text-amber-600" />
              <div>
                <h3 className="font-semibold text-ink-main">{t('warehouse.recall.title')}</h3>
                <p className="text-xs text-ink-muted mt-0.5">{t('warehouse.recall.batchNumberPlaceholder')}</p>
              </div>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('warehouse.recall.batchNumber')}</label>
                <input
                  value={recallBatchNumber}
                  onChange={e => { setRecallBatchNumber(e.target.value); setRecalledBatches(null); setRecallError(''); }}
                  placeholder={t('warehouse.recall.batchNumberPlaceholder')}
                  className="app-input w-full px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('warehouse.recall.reason')}</label>
                <input
                  value={recallReason}
                  onChange={e => setRecallReason(e.target.value)}
                  placeholder={t('warehouse.recall.reasonPlaceholder')}
                  className="app-input w-full px-3 py-2 text-sm"
                />
              </div>
              {recallError && <p className="text-sm text-status-danger">{recallError}</p>}
              {recalledBatches && recalledBatches.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="mb-2 text-xs font-semibold text-amber-800">{t('warehouse.recall.preview')} ({recalledBatches.length})</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-amber-700">
                        <th className="text-start pb-1">{t('warehouse.recall.product')}</th>
                        <th className="text-start pb-1">{t('warehouse.recall.location')}</th>
                        <th className="text-end pb-1">{t('warehouse.recall.qty')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recalledBatches.map(rb => (
                        <tr key={rb.id} className="border-t border-amber-100">
                          <td className="py-1 text-ink-main">{rb.product_name}</td>
                          <td className="py-1 text-ink-muted">{rb.location_name}</td>
                          <td className="py-1 text-end font-semibold text-status-danger">{rb.quantity_recalled}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-ivory-border flex gap-3">
              <button onClick={closeRecall} className="flex-1 rounded-xl border border-ivory-border py-2 text-sm text-ink-muted hover:bg-ivory-muted">{t('common.close')}</button>
              {recalledBatches ? (
                <button onClick={closeRecall} className="flex-1 rounded-xl bg-primary-600 py-2 text-sm font-semibold text-white hover:opacity-90">
                  {t('common.done')}
                </button>
              ) : (
                <button
                  onClick={handleRecall}
                  disabled={recalling}
                  className="flex-1 rounded-xl bg-amber-600 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {recalling ? t('common.loading') : t('warehouse.recall.confirm')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dispose modal */}
      {disposeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-ivory-border bg-white shadow-[var(--shadow-float)]">
            <div className="px-6 py-4 border-b border-ivory-border">
              <h3 className="font-semibold text-ink-main">{t('warehouse.dispose.title')}</h3>
              <p className="mt-1 text-sm text-ink-muted">{disposeTarget.product_name_ar || disposeTarget.product_name} — {disposeTarget.batch_number}</p>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('warehouse.dispose.qty')} ({t('warehouse.dispose.available')}: {disposeTarget.quantity_current})</label>
                <input
                  type="number" min={1} max={disposeTarget.quantity_current}
                  value={disposeQty}
                  onChange={e => setDisposeQty(e.target.value)}
                  className="app-input w-full px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('warehouse.dispose.reason')}</label>
                <input
                  value={disposeReason}
                  onChange={e => setDisposeReason(e.target.value)}
                  placeholder={t('warehouse.dispose.reasonPlaceholder')}
                  className="app-input w-full px-3 py-2 text-sm"
                />
              </div>
              {disposeError && <p className="text-sm text-status-danger">{disposeError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-ivory-border flex gap-3">
              <button onClick={() => setDisposeTarget(null)} className="flex-1 rounded-xl border border-ivory-border py-2 text-sm text-ink-muted hover:bg-ivory-muted">{t('common.cancel')}</button>
              <button
                onClick={handleDispose}
                disabled={disposing}
                className="flex-1 rounded-xl bg-status-danger py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {disposing ? t('common.loading') : t('warehouse.dispose.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Warehouse Page ─────────────────────────────────────────────────────

type Tab = 'movements' | 'returns' | 'transfer' | 'inventory';

export default function Warehouse() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('movements');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'movements', label: t('warehouse.tabs.movements') },
    { key: 'inventory', label: t('warehouse.tabs.inventory') },
    { key: 'transfer', label: t('warehouse.tabs.transfer') },
    { key: 'returns', label: t('warehouse.tabs.supplierReturns') },
  ];

  return (
    <div className="flex h-full flex-col gap-5 p-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
          <WarehouseIcon size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink-main">{t('warehouse.title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('warehouse.subtitle')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map(tab => (
          <TabButton
            key={tab.key}
            active={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            icon={
              tab.key === 'movements' ? <Move3D size={15} /> :
              tab.key === 'inventory' ? <PackageSearch size={15} /> :
              tab.key === 'transfer' ? <ArrowLeftRight size={15} /> :
              <Undo2 size={15} />
            }
          >
            {tab.label}
          </TabButton>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'movements' && <MovementsTab />}
        {activeTab === 'returns' && <SupplierReturnsTab />}
        {activeTab === 'transfer' && <TransferTab />}
        {activeTab === 'inventory' && <InventoryTab />}
      </div>
    </div>
  );
}
