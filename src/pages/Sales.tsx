import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Plus, Trash2, ReceiptText, CreditCard, UserRound, NotebookText, Printer, CalendarDays, Users, FileText } from 'lucide-react';
import CustomersTab from '../components/CustomersTab';
import { useAuth } from '../hooks/useAuth';
import {
  getBranchId,
  printThermal,
  getInvoiceSales,
  createInvoiceSale,
  getCustomers,
  searchProductsPos,
  getAccounts,
  getSaleDetail,
  getAuthState,
  writeAuditLog,
} from '../api';
import type { InvoiceSaleRow, CustomerRow, PosProduct, PosBatch, AccountRow, Sale } from '../types';
import Button from '../components/ui/Button';
import PrintInvoice from '../components/ui/PrintInvoice';
import NumericInput from '../components/ui/NumericInput';

function fmt(piasters: number) {
  return (piasters / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return iso.substring(0, 10);
}

const STATUS_COLORS: Record<string, string> = {
  paid: 'bg-status-success-bg text-status-success',
  credit: 'bg-status-danger-bg text-status-danger',
  partial: 'bg-status-warning-bg text-status-warning',
};

function EmptyStateCard({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  return (
    <div className="p-12 text-center text-ink-muted">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-ivory-muted text-primary-600">
        <ReceiptText size={28} />
      </div>
      <p>{title}</p>
      <button onClick={onAction} className="mt-3 text-sm font-medium text-primary-600 hover:underline">{action}</button>
    </div>
  );
}

interface CartLine {
  product_id: string;
  product_name: string;
  batch_id: string;
  batch_number?: string;
  expiry_date?: string;
  quantity: number;
  max_qty: number;
  unit_price: number;
  unit_cost: number;
}

function NewInvoiceModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const branchId = getBranchId();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'credit' | 'partial'>('cash');
  const [accountId, setAccountId] = useState('');
  const [discount, setDiscount] = useState(0);
  const [vatRate, setVatRate] = useState(0);
  const [notes, setNotes] = useState('');
  const [amountPaid, setAmountPaid] = useState(0);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PosProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([getCustomers(), getAccounts(branchId)]).then(([c, a]) => {
      const customerRows = c as unknown as CustomerRow[];
      const accountRows = a as unknown as AccountRow[];
      setCustomers(customerRows);
      setAccounts(accountRows);
      const defaultAccount = accountRows.find((account) => account.is_default);
      if (defaultAccount) setAccountId(defaultAccount.id);
    });
    searchRef.current?.focus();
  }, [branchId]);

  function handleSearch(query: string) {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        setSearchResults(await searchProductsPos(branchId, query));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
  }

  function addToCart(product: PosProduct, batch: PosBatch) {
    const existing = cart.find((line) => line.batch_id === batch.batch_id);
    if (existing) {
      setCart((previous) => previous.map((line) => line.batch_id === batch.batch_id ? { ...line, quantity: Math.min(line.quantity + 1, line.max_qty) } : line));
    } else {
      setCart((previous) => [...previous, {
        product_id: product.product_id,
        product_name: product.product_name,
        batch_id: batch.batch_id,
        batch_number: batch.batch_number,
        expiry_date: batch.expiry_date,
        quantity: 1,
        max_qty: batch.quantity_current,
        unit_price: product.sale_price,
        unit_cost: batch.unit_cost,
      }]);
    }
    setSearchQuery('');
    setSearchResults([]);
    searchRef.current?.focus();
  }

  function updateQty(batchId: string, quantity: number) {
    if (quantity <= 0) {
      setCart((previous) => previous.filter((line) => line.batch_id !== batchId));
      return;
    }
    setCart((previous) => previous.map((line) => line.batch_id === batchId ? { ...line, quantity: Math.min(quantity, line.max_qty) } : line));
  }

  function updatePrice(batchId: string, price: number) {
    setCart((previous) => previous.map((line) => line.batch_id === batchId ? { ...line, unit_price: Math.round(price * 100) } : line));
  }

  const subtotal = cart.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
  const discountPiasters = Math.round(discount * 100);
  const taxableAmount = Math.max(0, subtotal - discountPiasters);
  const taxPiasters = Math.round((taxableAmount * vatRate) / 100);
  const total = Math.max(0, taxableAmount + taxPiasters);
  const balanceDue = Math.max(0, total - amountPaid);
  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const selectedAccount = accounts.find((account) => account.id === accountId);

  async function handleSave() {
    if (!user) return;
    if (cart.length === 0) {
      setError(t('sales.addAtLeastOne'));
      return;
    }
    if ((paymentMethod === 'credit' || paymentMethod === 'partial') && !customerId) {
      setError(t('sales.customerRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const paid = paymentMethod === 'credit' ? 0 : paymentMethod === 'cash' || paymentMethod === 'bank_transfer' ? total : amountPaid;
      const saleResult = await createInvoiceSale(branchId, user.id, {
        customerId: customerId || undefined,
        paymentMethod,
        amountPaid: paid,
        accountId,
        discount: discountPiasters,
        taxAmount: taxPiasters,
        notes: notes || undefined,
        items: cart.map((line) => ({
          product_id: line.product_id,
          batch_id: line.batch_id,
          quantity: line.quantity,
          unit_price: line.unit_price,
          unit_cost: line.unit_cost,
        })),
      });
      try {
        const auth = getAuthState();
        if (auth.user) {
          writeAuditLog(auth.user.id, {
            action: 'create',
            entity_type: 'invoice_sale',
            entity_id: typeof saleResult === 'string' ? saleResult : 'new',
            changes_json: JSON.stringify({ payment_method: paymentMethod }),
          });
        }
      } catch { /* audit log failure is non-critical */ }
      onSaved();
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
      <div className="flex h-[94vh] max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-ivory-border bg-white shadow-[var(--shadow-float)]">
        <div className="flex shrink-0 items-center justify-between border-b border-ivory-border bg-white/90 px-6 py-4 backdrop-blur-sm">
          <div>
            <h2 className="text-xl font-bold text-ink-main">{t('sales.newInvoiceTitle')}</h2>
            <p className="text-sm text-ink-muted mt-1">{t('sales.subtitle')}</p>
          </div>
          <button onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl border border-ivory-border bg-ivory-muted text-ink-muted hover:bg-white hover:text-ink-main">×</button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_360px]">
          <div className="min-h-0 min-w-0 border-l border-ivory-border">
            <div className="grid gap-5 p-5 h-full grid-rows-[auto_auto_minmax(0,1fr)]">
              <section className="app-panel p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700"><Search size={18} /></div>
                    <div>
                      <h3 className="font-semibold text-ink-main">{t('sales.searchProduct')}</h3>
                      <p className="text-xs text-ink-muted">{t('sales.addProductsHint')}</p>
                    </div>
                  </div>
                  {searching && <span className="text-xs text-ink-muted">{t('sales.searching')}</span>}
                </div>
                <div className="relative">
                  <input ref={searchRef} value={searchQuery} onChange={(event) => handleSearch(event.target.value)} placeholder={t('sales.searchProduct')} className="app-input w-full px-4 py-3 text-sm text-ink-main placeholder:text-ink-placeholder focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
                  {searchResults.length > 0 && (
                    <div className="absolute inset-x-0 top-full mt-2 max-h-72 overflow-y-auto rounded-2xl border border-ivory-border bg-white shadow-[var(--shadow-float)] z-20">
                      {searchResults.map((product) => (
                        <div key={product.product_id} className="border-b border-ivory-border last:border-0">
                          {product.batches.map((batch) => (
                            <button key={batch.batch_id} onClick={() => addToCart(product, batch)} className="w-full px-4 py-3 text-start hover:bg-ivory-muted">
                              <div className="flex items-center justify-between gap-4">
                                <div className="text-start">
                                  <div className="font-medium text-ink-main">{product.product_name}</div>
                                  <div className="text-xs text-ink-muted mt-1">{batch.batch_number ? `#${batch.batch_number}` : '—'}{batch.expiry_date ? ` • ${fmtDate(batch.expiry_date)}` : ''}</div>
                                </div>
                                <div className="text-end">
                                  <div className="font-semibold text-primary-700 tabular-nums">{fmt(product.sale_price)}</div>
                                  <div className="text-xs text-ink-muted">{t('pos.available')}: {batch.quantity_current}</div>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
              <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="app-panel p-4"><div className="text-xs text-ink-muted mb-1">{t('sales.subtotal')}</div><div className="text-2xl font-bold text-ink-main tabular-nums">{fmt(subtotal)}</div></div>
                <div className="app-panel p-4"><div className="text-xs text-ink-muted mb-1">{t('sales.discount')}</div><div className="text-2xl font-bold text-status-warning tabular-nums">{fmt(discountPiasters)}</div></div>
                <div className="app-panel p-4"><div className="text-xs text-ink-muted mb-1">{t('sales.vat')}</div><div className="text-2xl font-bold text-ink-main tabular-nums">{fmt(taxPiasters)}</div></div>
                <div className="app-panel p-4"><div className="text-xs text-ink-muted mb-1">{t('sales.totalLabel')}</div><div className="text-2xl font-bold text-primary-700 tabular-nums">{fmt(total)}</div></div>
              </section>
              <section className="app-card overflow-hidden min-h-0">
                <div className="flex items-center justify-between border-b border-ivory-border px-4 py-3 bg-ivory-app">
                  <div><h3 className="font-semibold text-ink-main">{t('sales.items')}</h3><p className="text-xs text-ink-muted">{cart.length} {t('sales.items')}</p></div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700"><ReceiptText size={18} /></div>
                </div>
                <div className="overflow-auto h-full">
                  {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-3 p-10 text-center text-ink-muted"><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-ivory-muted text-primary-600"><Plus size={26} /></div><div className="font-medium text-ink-main">{t('sales.addProductsHint')}</div></div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-ivory-app border-b border-ivory-border">
                        <tr>
                          <th className="px-4 py-3 text-right text-xs font-medium text-ink-muted uppercase">{t('sales.product')}</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-ink-muted uppercase">{t('sales.batch')}</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-ink-muted uppercase">{t('sales.qty')}</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-ink-muted uppercase">{t('sales.unitPrice')}</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-ink-muted uppercase">{t('sales.subtotal')}</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-ink-muted uppercase"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {cart.map((line) => (
                          <tr key={line.batch_id} className="border-b border-ivory-border last:border-0 hover:bg-ivory-muted">
                            <td className="px-4 py-3"><div className="font-medium text-ink-main">{line.product_name}</div><div className="text-xs text-ink-muted mt-1">{line.expiry_date ? fmtDate(line.expiry_date) : '—'}</div></td>
                            <td className="px-4 py-3 text-ink-muted text-xs">{line.batch_number || '—'}</td>
                            <td className="px-4 py-3"><input type="number" min={1} max={line.max_qty} value={line.quantity} onChange={(event) => updateQty(line.batch_id, parseInt(event.target.value, 10) || 0)} className="app-input w-20 px-3 py-2 text-center text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" /></td>
                            <td className="px-4 py-3"><input type="number" min={0} step={0.01} value={(line.unit_price / 100).toFixed(2)} onChange={(event) => updatePrice(line.batch_id, parseFloat(event.target.value) || 0)} className="app-input w-28 px-3 py-2 text-center text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" /></td>
                            <td className="px-4 py-3 font-semibold text-ink-main tabular-nums">{fmt(line.quantity * line.unit_price)}</td>
                            <td className="px-4 py-3"><button onClick={() => updateQty(line.batch_id, 0)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-ivory-border bg-ivory-muted text-ink-muted hover:text-status-danger hover:bg-white"><Trash2 size={16} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            </div>
          </div>
          <aside className="min-h-0 min-w-0 bg-ivory-app">
            <div className="flex h-full min-h-0 flex-col p-5">
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-visible pe-1">
                <div className="relative space-y-4 overflow-visible pb-4">
                <section className="app-card p-4">
                  <div className="flex items-center gap-2 mb-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700"><ReceiptText size={18} /></div><div><h3 className="font-semibold text-ink-main">{t('sales.totalLabel')}</h3><p className="text-xs text-ink-muted">{t('sales.balanceDueLabel')}</p></div></div>
                  <div className="rounded-2xl bg-[linear-gradient(135deg,#1C5F6F_0%,#0FA3A6_100%)] px-4 py-5 text-white shadow-[var(--shadow-card)]">
                    <div className="text-xs text-white/70 mb-1">{t('sales.totalLabel')}</div>
                    <div className="text-3xl font-bold tabular-nums">{fmt(total)}</div>
                    {(paymentMethod === 'partial' || paymentMethod === 'credit') && balanceDue > 0 && <div className="mt-3 flex items-center justify-between text-sm text-white/90"><span>{t('sales.balanceDueLabel')}</span><span className="font-semibold tabular-nums">{fmt(balanceDue)}</span></div>}
                  </div>
                </section>
                <section className="app-card relative z-10 overflow-visible p-4 space-y-4 focus-within:z-30">
                  <div className="flex items-center gap-2"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700"><UserRound size={18} /></div><div><h3 className="font-semibold text-ink-main">{t('sales.customerLabel')}</h3><p className="text-xs text-ink-muted">{selectedCustomer?.name || t('sales.walkInNone')}</p></div></div>
                  <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="app-input w-full px-3 py-3 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100">
                    <option value="">{t('sales.walkInNone')}</option>
                    {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                  </select>
                </section>
                <section className="app-card relative z-10 overflow-visible p-4 space-y-4 focus-within:z-30">
                  <div className="flex items-center gap-2"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700"><CreditCard size={18} /></div><div><h3 className="font-semibold text-ink-main">{t('sales.paymentMethod')}</h3><p className="text-xs text-ink-muted">{paymentMethod}</p></div></div>
                  <div className="grid grid-cols-2 gap-2">
                    {[{ value: 'cash', label: t('sales.cash') }, { value: 'bank_transfer', label: t('sales.bankTransfer') }, { value: 'credit', label: t('sales.fullCredit') }, { value: 'partial', label: t('sales.partialPayment') }].map((option) => (
                      <button key={option.value} onClick={() => setPaymentMethod(option.value as typeof paymentMethod)} className={`rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${paymentMethod === option.value ? 'border-primary-600 bg-primary-100 text-primary-700' : 'border-ivory-border bg-ivory-muted text-ink-muted hover:bg-white'}`}>{option.label}</button>
                    ))}
                  </div>
                  {paymentMethod !== 'credit' && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-ink-muted">{t('sales.account')}</label>
                      <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="app-input w-full px-3 py-3 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100">
                        {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({fmt(account.current_balance)})</option>)}
                      </select>
                      {selectedAccount && <div className="text-xs text-ink-muted">{fmt(selectedAccount.current_balance)} {t('common.currency')}</div>}
                    </div>
                  )}
                  {paymentMethod === 'partial' && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-ink-muted">{t('sales.amountPaidLabel')}</label>
                      <NumericInput value={amountPaid / 100} onChange={(value) => setAmountPaid(Math.round(Math.max(0, value) * 100))} min={0} step={0.01} />
                    </div>
                  )}
                </section>
                <section className="app-card p-4 space-y-4">
                  <div className="flex items-center gap-2"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700"><NotebookText size={18} /></div><div><h3 className="font-semibold text-ink-main">{t('sales.notes')}</h3></div></div>
                  <div className="space-y-2"><label className="text-xs font-medium text-ink-muted">{t('sales.discount')}</label><NumericInput value={discount} onChange={(value) => setDiscount(Math.max(0, value))} min={0} step={0.01} /></div>
                  <div className="space-y-2"><label className="text-xs font-medium text-ink-muted">{t('sales.vatRate')}</label><NumericInput value={vatRate} onChange={(value) => setVatRate(Math.max(0, value))} min={0} step={0.1} /></div>
                  <div className="flex justify-between text-sm"><span className="text-ink-muted">{t('sales.vat')}</span><span className="tabular-nums text-ink-main">{fmt(taxPiasters)}</span></div>
                  <div className="space-y-2"><label className="text-xs font-medium text-ink-muted">{t('sales.notes')}</label><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="app-input w-full px-3 py-3 text-sm resize-none focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" /></div>
                </section>
                {error && <div className="glass-danger rounded-2xl px-4 py-3 text-sm text-status-danger">{error}</div>}
                </div>
              </div>
              <div className="border-t border-ivory-border pt-4">
                <div className="flex gap-3">
                  <Button variant="secondary" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button>
                  <Button className="flex-1" onClick={handleSave} disabled={saving || cart.length === 0}>{saving ? t('sales.saving') : t('sales.saveInvoice')}</Button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

type Tab = 'invoices' | 'customers';

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

export default function Sales() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('invoices');
  const branchId = getBranchId();
  const [sales, setSales] = useState<InvoiceSaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [error, setError] = useState('');
  const [printSale, setPrintSale] = useState<Sale | null>(null);

  const pmLabel = (m: string): string => ({ cash: t('sales.cash'), bank_transfer: t('sales.bankTransfer'), full_credit: t('sales.fullCredit'), partial_payment: t('sales.partialPayment') } as Record<string, string>)[m] ?? m.replace(/_/g, ' ');
  const psLabel = (s: string): string => ({ paid: t('sales.paid'), partial: t('sales.partial'), credit: t('sales.credit') } as Record<string, string>)[s] ?? s;

  async function handlePrint(saleId: string) {
    try {
      const detail = await getSaleDetail(saleId);
      setPrintSale(detail);
      setTimeout(() => printThermal(), 200);
    } catch (e: unknown) {
      setError(String(e));
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSales(await getInvoiceSales(branchId, undefined, filterStatus || undefined, filterFrom || undefined, filterTo || undefined));
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [branchId, filterStatus, filterFrom, filterTo]);

  useEffect(() => { load(); }, [load]);

  const totalInvoiced = sales.reduce((sum, row) => sum + row.total, 0);
  const totalPaid = sales.reduce((sum, row) => sum + row.amount_paid, 0);
  const totalDue = sales.reduce((sum, row) => sum + row.balance_due, 0);
  const creditCount = sales.filter((row) => row.payment_status !== 'paid').length;

  return (
    <div className="h-full flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
            <ReceiptText size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink-main">{t('sales.title')}</h1>
            <p className="mt-1 text-sm text-ink-muted">{t('sales.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-2">
            <TabButton active={activeTab === 'invoices'} onClick={() => setActiveTab('invoices')} icon={<FileText size={15} />}>
              {t('sales.invoicesTab')}
            </TabButton>
            <TabButton active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} icon={<Users size={15} />}>
              {t('customers.title')}
            </TabButton>
          </div>
          {activeTab === 'invoices' && <Button onClick={() => setShowNew(true)}>{t('sales.newInvoice')}</Button>}
        </div>
      </div>
      {activeTab === 'customers' ? (
        <CustomersTab />
      ) : (
      <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[{ label: t('sales.totalInvoiced'), value: fmt(totalInvoiced), sub: `${sales.length} ${t('sales.invoices')}`, tone: 'text-ink-main' }, { label: t('sales.totalCollected'), value: fmt(totalPaid), sub: t('sales.amountReceived'), tone: 'text-status-success' }, { label: t('sales.outstanding'), value: fmt(totalDue), sub: `${creditCount} ${t('sales.unpaid')}`, tone: 'text-status-danger' }, { label: t('sales.collectionRate'), value: totalInvoiced > 0 ? `${Math.round((totalPaid / totalInvoiced) * 100)}%` : '—', sub: t('sales.ofInvoiced'), tone: 'text-primary-700' }].map((card) => (
          <div key={card.label} className="app-card p-4"><div className="text-xs font-medium text-ink-muted uppercase tracking-wide">{card.label}</div><div className={`text-2xl font-bold mt-2 ${card.tone}`}>{card.value}</div><div className="text-xs text-ink-muted mt-1">{card.sub}</div></div>
        ))}
      </div>
      <div className="app-card p-4 flex flex-wrap gap-3 items-end">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">{t('sales.filterStatus')}</label><select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} className="app-input px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"><option value="">{t('sales.all')}</option><option value="paid">{t('sales.paid')}</option><option value="credit">{t('sales.credit')}</option><option value="partial">{t('sales.partial')}</option></select></div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">{t('sales.from')}</label>
          <div className="relative">
            <CalendarDays size={14} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-placeholder" />
            <input type="date" value={filterFrom} onChange={(event) => setFilterFrom(event.target.value)} className="app-input px-3 py-2.5 pe-9 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">{t('sales.to')}</label>
          <div className="relative">
            <CalendarDays size={14} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-placeholder" />
            <input type="date" value={filterTo} onChange={(event) => setFilterTo(event.target.value)} className="app-input px-3 py-2.5 pe-9 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
          </div>
        </div>
        <Button variant="secondary" onClick={() => { setFilterStatus(''); setFilterFrom(''); setFilterTo(''); }}>{t('sales.clear')}</Button>
      </div>
      {error && <div className="glass-danger rounded-2xl px-4 py-3 text-sm text-status-danger">{error}</div>}
      <div className="app-card overflow-hidden flex-1 min-h-0">
        {loading ? (
          <div className="p-10 text-center text-ink-muted">{t('sales.loading')}</div>
        ) : sales.length === 0 ? (
          <EmptyStateCard title={t('sales.noInvoices')} action={t('sales.createFirst')} onAction={() => setShowNew(true)} />
        ) : (
          <div className="overflow-auto h-full">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-ivory-app border-b border-ivory-border">
                <tr>{[t('sales.invoiceNumber'), t('sales.customer'), t('sales.date'), t('sales.items'), t('sales.total'), t('sales.amountPaid'), t('sales.balanceDue'), t('sales.method'), t('sales.status'), t('sales.by'), ''].map((header) => <th key={header} className="px-4 py-3 text-right text-xs font-medium text-ink-muted uppercase">{header}</th>)}</tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className="border-b border-ivory-border last:border-0 hover:bg-ivory-muted">
                    <td className="px-4 py-3 font-medium text-ink-main">{sale.sale_number}</td>
                    <td className="px-4 py-3 text-ink-main">{sale.customer_name || <span className="text-ink-muted italic">{t('sales.walkIn')}</span>}</td>
                    <td className="px-4 py-3 text-ink-muted">{fmtDate(sale.created_at)}</td>
                    <td className="px-4 py-3 text-ink-muted">{sale.items_count}</td>
                    <td className="px-4 py-3 font-semibold text-ink-main tabular-nums">{fmt(sale.total)}</td>
                    <td className="px-4 py-3 font-medium text-status-success tabular-nums">{fmt(sale.amount_paid)}</td>
                    <td className="px-4 py-3">{sale.balance_due > 0 ? <span className="font-medium text-status-danger tabular-nums">{fmt(sale.balance_due)}</span> : <span className="text-ink-muted">—</span>}</td>
                    <td className="px-4 py-3 text-ink-muted">{pmLabel(sale.payment_method)}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[sale.payment_status] || 'bg-ivory-muted text-ink-muted'}`}>{psLabel(sale.payment_status)}</span></td>
                    <td className="px-4 py-3 text-ink-muted text-xs">{sale.cashier_name}</td>
                    <td className="px-4 py-3"><button onClick={() => handlePrint(sale.id)} title={t('sales.printInvoice')} className="flex h-10 w-10 items-center justify-center rounded-xl border border-ivory-border bg-ivory-muted text-ink-muted hover:bg-white hover:text-primary-600"><Printer size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showNew && <NewInvoiceModal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}
      {printSale && (
        <PrintInvoice
          type="sale"
          invoiceNumber={printSale.sale_number}
          date={printSale.created_at}
          partyName={printSale.customer_id ? (sales.find((sale) => sale.id === printSale.id)?.customer_name || t('sales.walkIn')) : t('sales.walkIn')}
          partyLabel={t('sales.customer')}
          items={printSale.items.map((item) => ({ id: item.id, product_name: item.product_name || '', batch_number: item.batch_number, quantity: item.quantity, unit_price: item.unit_price, sale_price: item.unit_price, subtotal: item.subtotal }))}
          subtotal={printSale.subtotal}
          discount={printSale.discount}
          taxAmount={printSale.tax_amount}
          total={printSale.total}
          notes={printSale.notes}
          status={printSale.payment_status}
          paymentMethod={printSale.payment_method}
        />
      )}
      </>
      )}
    </div>
  );
}
