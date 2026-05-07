import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Plus, Trash2, Save, PackagePlus, Truck, ReceiptText } from 'lucide-react';

import * as api from '../api';
import type { Product as ProductType, Supplier, SupplierFormData, PurchaseInvoiceCreateData } from '../types';
import Button from '../components/ui/Button';
import Toast from '../components/ui/Toast';
import NumericInput from '../components/ui/NumericInput';

interface LocalProduct {
  id: string;
  name: string;
  barcode: string | null;
}

interface InvoiceItem {
  key: number;
  product_id: string;
  product_name: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  cost_price: number;
  sell_price: number;
}

let itemKeyCounter = 0;

export default function PurchaseNew() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id?: string }>();
  const isEdit = !!editId;
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState(0);
  const [vatRate, setVatRate] = useState(0);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const [invalidRows, setInvalidRows] = useState<Set<number>>(new Set());
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState<SupplierFormData>({ name: '', phone: '', address: '', notes: '', opening_balance: 0 });
  const branchId = api.getBranchId();

  const loadData = useCallback(async () => {
    try {
      const [sup, prod] = await Promise.all([api.getSuppliers(), api.getProducts()]);
      const mappedProd = prod.map((p: ProductType) => ({ id: p.id, name: p.trade_name, barcode: p.barcode ?? null }));
      setSuppliers(sup);
      setProducts(mappedProd);
      if (isEdit && editId) {
        const inv = await api.getPurchaseInvoice(editId);
        setSupplierId(inv.supplier_id);
        setInvoiceDate(inv.invoice_date);
        setNotes(inv.notes ?? '');
        setDiscount(inv.discount);
        setItems(inv.items.map(item => ({
          key: ++itemKeyCounter,
          product_id: item.product_id,
          product_name: mappedProd.find((p: LocalProduct) => p.id === item.product_id)?.name ?? item.product_name,
          batch_number: item.batch_number ?? '',
          expiry_date: item.expiry_date ?? '',
          quantity: item.quantity,
          cost_price: item.unit_cost,
          sell_price: item.sale_price,
        })));
      }
    } catch (e: unknown) {
      setToast({ msg: api.errMsg(e, t('common.error')), type: 'danger' });
    }
  }, [t, isEdit, editId]);

  useEffect(() => { loadData(); }, [loadData]);

  const addItem = () => {
    setItems((previous) => [...previous, { key: ++itemKeyCounter, product_id: '', product_name: '', batch_number: '', expiry_date: '', quantity: 1, cost_price: 0, sell_price: 0 }]);
  };

  const removeItem = (key: number) => {
    setItems((previous) => previous.filter((item) => item.key !== key));
  };

  const updateItem = (key: number, field: keyof InvoiceItem, value: string | number) => {
    setItems((previous) => previous.map((item) => {
      if (item.key !== key) return item;
      const updated = { ...item, [field]: value };
      if (field === 'product_id') {
        const product = products.find((entry) => entry.id === value);
        updated.product_name = product?.name ?? '';
      }
      return updated;
    }));
    setInvalidRows((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.cost_price, 0);
  const taxableAmount = Math.max(0, subtotal - discount);
  const taxPiasters = Math.round((taxableAmount * vatRate) / 100);
  const total = taxableAmount + taxPiasters;
  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);

  const handleCreateSupplier = async () => {
    if (!newSupplier.name.trim()) return;
    try {
      const created = await api.createSupplier(newSupplier);
      setSuppliers((previous) => [...previous, created]);
      setSupplierId(created.id);
      setShowNewSupplier(false);
      setNewSupplier({ name: '', phone: '', address: '', notes: '', opening_balance: 0 });
    } catch (e: unknown) {
      setToast({ msg: api.errMsg(e, t('common.error')), type: 'danger' });
    }
  };

  const handleSave = async () => {
    if (!supplierId) {
      setToast({ msg: t('purchases.selectSupplier'), type: 'danger' });
      return;
    }
    if (items.length === 0) {
      setToast({ msg: t('purchases.addItems'), type: 'danger' });
      return;
    }
    // Draft validation: product, qty > 0, prices > 0. batch/expiry optional for drafts.
    const bad = new Set<number>();
    let firstError = '';
    items.forEach((item, idx) => {
      const n = idx + 1;
      if (!item.product_id) {
        bad.add(item.key);
        if (!firstError) firstError = t('purchases.draftRowNoProduct', { n });
      } else if (item.quantity <= 0) {
        bad.add(item.key);
        if (!firstError) firstError = t('purchases.draftRowNoQty', { n });
      } else if (item.cost_price <= 0) {
        bad.add(item.key);
        if (!firstError) firstError = t('purchases.draftRowNoCost', { n });
      } else if (item.sell_price <= 0) {
        bad.add(item.key);
        if (!firstError) firstError = t('purchases.draftRowNoSell', { n });
      }
    });
    if (bad.size > 0) {
      setInvalidRows(bad);
      setToast({ msg: firstError, type: 'danger' });
      return;
    }
    setInvalidRows(new Set());

    setSaving(true);
    try {
      const data: PurchaseInvoiceCreateData = {
        supplier_id: supplierId,
        invoice_date: invoiceDate,
        notes: notes || undefined,
        discount,
        tax_amount: taxPiasters,
        items: items.map((item) => ({
          product_id: item.product_id,
          batch_number: item.batch_number,
          expiry_date: item.expiry_date,
          quantity: item.quantity,
          unit_cost: item.cost_price,
          sale_price: item.sell_price,
        })),
      };
      const auth = api.getAuthState();
      if (isEdit && editId) {
        await api.updatePurchaseInvoice(editId, data);
        navigate(`/purchases/${editId}`);
      } else {
        await api.createPurchaseDraft(branchId, data, auth.user!.id);
        navigate('/purchases');
      }
    } catch (e: unknown) {
      setToast({ msg: api.errMsg(e, t('common.error')), type: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/purchases')} className="flex h-11 w-11 items-center justify-center rounded-xl border border-ivory-border bg-white text-ink-muted shadow-[var(--shadow-soft)] hover:text-primary-600">
            <ArrowRight size={20} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-ink-main">{isEdit ? t('purchases.editInvoice') : t('purchases.newInvoice')}</h2>
            <p className="text-sm text-ink-muted mt-1">{t('purchases.newInvoiceTitle')}</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save size={16} />
          {saving ? t('common.loading') : t('purchases.saveDraft')}
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_360px] gap-5 flex-1 min-h-0">
        <div className="min-w-0 flex flex-col gap-5">
          <section className="app-panel p-4">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700"><PackagePlus size={18} /></div>
                <div>
                  <h3 className="font-semibold text-ink-main">{t('purchases.items')}</h3>
                  <p className="text-xs text-ink-muted">{items.length} {t('purchases.items')}</p>
                </div>
              </div>
              <Button variant="secondary" onClick={addItem}>
                <Plus size={16} />
                {t('purchases.addItem')}
              </Button>
            </div>

            <div className="app-card overflow-auto min-h-[420px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-ivory-app border-b border-ivory-border">
                  <tr>
                    <th className="px-3 py-3 text-right font-medium text-ink-muted w-[220px]">{t('purchases.product')}</th>
                    <th className="px-3 py-3 text-right font-medium text-ink-muted">{t('purchases.batchNumber')}</th>
                    <th className="px-3 py-3 text-right font-medium text-ink-muted">{t('purchases.expiryDate')}</th>
                    <th className="px-3 py-3 text-right font-medium text-ink-muted w-[90px]">{t('purchases.qty')}</th>
                    <th className="px-3 py-3 text-right font-medium text-ink-muted">{t('purchases.costPrice')}</th>
                    <th className="px-3 py-3 text-right font-medium text-ink-muted">{t('purchases.sellPrice')}</th>
                    <th className="px-3 py-3 text-right font-medium text-ink-muted">{t('purchases.lineTotal')}</th>
                    <th className="px-3 py-3 text-right font-medium text-ink-muted"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-20 text-center text-ink-muted">
                        {t('purchases.addItems')}
                      </td>
                    </tr>
                  ) : items.map((item) => (
                    <tr key={item.key} className={`border-b border-ivory-border last:border-0 ${
                      invalidRows.has(item.key)
                        ? 'bg-status-danger-bg ring-2 ring-inset ring-status-danger'
                        : 'hover:bg-ivory-muted'
                    }`}>
                      <td className="px-3 py-2">
                        <select value={item.product_id} onChange={(event) => updateItem(item.key, 'product_id', event.target.value)} className="app-input w-full px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100">
                          <option value="">{t('purchases.selectProduct')}</option>
                          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2"><input type="text" value={item.batch_number} onChange={(event) => updateItem(item.key, 'batch_number', event.target.value)} className="app-input w-full px-3 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" /></td>
                      <td className="px-3 py-2"><input type="date" value={item.expiry_date} onChange={(event) => updateItem(item.key, 'expiry_date', event.target.value)} className="app-input w-full px-3 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" /></td>
                      <td className="px-3 py-2"><NumericInput value={item.quantity} onChange={(value) => updateItem(item.key, 'quantity', Math.max(1, Math.round(value)))} min={1} step={1} className="text-center" /></td>
                      <td className="px-3 py-2"><NumericInput value={item.cost_price / 100} onChange={(value) => updateItem(item.key, 'cost_price', Math.round(value * 100))} min={0} step={0.01} className="text-center" /></td>
                      <td className="px-3 py-2"><NumericInput value={item.sell_price / 100} onChange={(value) => updateItem(item.key, 'sell_price', Math.round(value * 100))} min={0} step={0.01} className="text-center" /></td>
                      <td className="px-3 py-2 tabular-nums font-semibold text-ink-main">{api.formatMoney(item.quantity * item.cost_price)}</td>
                      <td className="px-3 py-2"><button onClick={() => removeItem(item.key)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-ivory-border bg-ivory-muted text-ink-muted hover:bg-white hover:text-status-danger"><Trash2 size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="min-h-0 min-w-0">
          <div className="flex h-full min-h-0 flex-col">
            <div className="space-y-4 overflow-y-auto overflow-x-visible pe-1">
            <section className="app-card relative z-10 overflow-visible p-4 space-y-4 focus-within:z-30">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700"><Truck size={18} /></div>
                <div>
                  <h3 className="font-semibold text-ink-main">{t('purchases.supplier')}</h3>
                  <p className="text-xs text-ink-muted">{selectedSupplier?.name || t('purchases.selectSupplier')}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="app-input flex-1 px-3 py-3 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100">
                  <option value="">{t('purchases.selectSupplier')}</option>
                  {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
                <Button variant="secondary" onClick={() => setShowNewSupplier(!showNewSupplier)}><Plus size={16} /></Button>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-muted">{t('purchases.date')}</label>
                <input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} className="app-input w-full px-3 py-3 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-muted">{t('purchases.notes')}</label>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="app-input w-full px-3 py-3 text-sm resize-none focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
              </div>
            </section>

            {showNewSupplier && (
              <section className="app-card relative z-10 overflow-visible p-4 space-y-3 focus-within:z-30">
                <h4 className="font-semibold text-ink-main">{t('purchases.newSupplier')}</h4>
                <input placeholder={t('purchases.supplierName')} value={newSupplier.name} onChange={(event) => setNewSupplier({ ...newSupplier, name: event.target.value })} className="app-input w-full px-3 py-3 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
                <input placeholder={t('purchases.supplierPhone')} value={newSupplier.phone} onChange={(event) => setNewSupplier({ ...newSupplier, phone: event.target.value })} className="app-input w-full px-3 py-3 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
                <input placeholder={t('purchases.supplierAddress')} value={newSupplier.address} onChange={(event) => setNewSupplier({ ...newSupplier, address: event.target.value })} className="app-input w-full px-3 py-3 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
                <Button onClick={handleCreateSupplier}>{t('purchases.addSupplier')}</Button>
              </section>
            )}

            <section className="app-card p-4 space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700"><ReceiptText size={18} /></div>
                <div>
                  <h3 className="font-semibold text-ink-main">{t('purchases.grandTotal')}</h3>
                  <p className="text-xs text-ink-muted">{t('purchases.subtotal')}</p>
                </div>
              </div>
              <div className="rounded-2xl bg-[linear-gradient(135deg,#1C5F6F_0%,#0FA3A6_100%)] px-4 py-5 text-white shadow-[var(--shadow-card)]">
                <div className="text-xs text-white/70 mb-1">{t('purchases.grandTotal')}</div>
                <div className="text-3xl font-bold tabular-nums">{api.formatMoney(total)}</div>
              </div>
              <div className="flex justify-between text-sm"><span className="text-ink-muted">{t('purchases.subtotal')}</span><span className="tabular-nums text-ink-main">{api.formatMoney(subtotal)}</span></div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-muted">{t('purchases.discount')}</label>
                <NumericInput value={discount / 100} onChange={(value) => setDiscount(Math.round(value * 100))} min={0} step={0.01} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-muted">{t('purchases.vatRate')}</label>
                <NumericInput value={vatRate} onChange={(value) => setVatRate(Math.max(0, value))} min={0} step={0.1} />
              </div>
              <div className="flex justify-between text-sm"><span className="text-ink-muted">{t('purchases.vat')}</span><span className="tabular-nums text-ink-main">{api.formatMoney(taxPiasters)}</span></div>
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => navigate('/purchases')}>{t('common.cancel')}</Button>
                <Button className="flex-1" onClick={handleSave} disabled={saving}>{saving ? t('common.loading') : t('purchases.saveDraft')}</Button>
              </div>
            </section>
            </div>
          </div>
        </aside>
      </div>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
