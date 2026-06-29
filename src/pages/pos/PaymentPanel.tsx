import { useMemo, useState, useRef, useEffect, type FormEvent } from 'react';
import { Banknote, Smartphone, FileText, Wallet, Tag, Percent, AlertTriangle, Plus, X, ChevronDown } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { CartItem, PaymentMethodSetting, CustomerRow } from '../../types';
import Button from '../../components/ui/Button';
import NumericInput from '../../components/ui/NumericInput';
import Numpad from '../../components/ui/Numpad';
import * as api from '../../api';

export interface PaymentPanelProps {
  cart: CartItem[];
  cartTotal: number;
  cartDiscount: number;
  finalTotal: number;
  paymentMethod: string;
  paymentMethodId: string | null;
  amountPaid: number;
  paymentMethods: PaymentMethodSetting[];
  bankMethods: PaymentMethodSetting[];
  splitCashAmount: number;
  splitBankAmount: number;
  splitBankMethodId: string | null;
  splitCashChange: number;
  splitRemaining: number;
  saleNote: string;
  discountMode: 'flat' | 'pct';
  discountInput: string;
  selectedCustomerId: string | null;
  customerSearch: string;
  filteredCustomers: CustomerRow[];
  customers: CustomerRow[];
  saving: boolean;
  isBlocked: boolean;
  normalizedSplitCashAmount: number;
  normalizedSplitBankAmount: number;
  loading: boolean;
  editingQtyBatch: string | null;
  onPaymentMethodChange: (method: string) => void;
  onPaymentMethodIdChange: (id: string | null) => void;
  onAmountPaidChange: (amount: number) => void;
  onSplitCashAmountChange: (amount: number) => void;
  onSplitBankAmountChange: (amount: number) => void;
  onSplitBankMethodIdChange: (id: string | null) => void;
  onCustomerSearchChange: (query: string) => void;
  onCustomerSelect: (id: string | null) => void;
  onDiscountModeToggle: (mode: 'flat' | 'pct') => void;
  onDiscountInputChange: (value: string) => void;
  onSaleNoteChange: (note: string) => void;
  onCompleteSale: () => void;
  onCustomerCreated: () => void;
  t: TFunction;
  formatMoney: (n: number) => string;
}

export default function PaymentPanel({
  cart,
  cartTotal,
  cartDiscount,
  finalTotal,
  paymentMethod,
  paymentMethodId,
  amountPaid,
  bankMethods,
  splitBankMethodId,
  splitCashChange,
  splitRemaining,
  saleNote,
  discountMode,
  discountInput,
  selectedCustomerId,
  customerSearch,
  filteredCustomers,
  customers,
  saving,
  isBlocked,
  normalizedSplitCashAmount,
  normalizedSplitBankAmount,
  editingQtyBatch,
  onPaymentMethodChange,
  onPaymentMethodIdChange,
  onAmountPaidChange,
  onSplitCashAmountChange,
  onSplitBankAmountChange,
  onSplitBankMethodIdChange,
  onCustomerSearchChange,
  onCustomerSelect,
  onDiscountModeToggle,
  onDiscountInputChange,
  onSaleNoteChange,
  onCompleteSale,
  onCustomerCreated,
  t,
  formatMoney,
}: PaymentPanelProps) {
  const change = paymentMethod === 'cash' ? amountPaid - finalTotal : 0;
  const splitPaidTotal = normalizedSplitCashAmount + normalizedSplitBankAmount;

  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ name: '', phone: '' });
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId) ?? null;

  const handleAddCustomer = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCust.name.trim()) return;
    setAddingCustomer(true);
    try {
      // Default new customers to unlimited credit (-1), not cash-only (0).
      await api.createCustomer({ name: newCust.name.trim(), credit_limit: -1, phone: newCust.phone || undefined });
      setNewCust({ name: '', phone: '' });
      setShowNewCustomer(false);
      onCustomerCreated();
    } catch { /* error handled by parent refresh */ }
    finally { setAddingCustomer(false); }
  };

  const quickCashAmounts = useMemo(() => {
    if (finalTotal <= 0) return [0];
    const rounded10k = Math.ceil(finalTotal / 10000) * 10000;
    const rounded50k = Math.ceil(finalTotal / 50000) * 50000;
    return Array.from(new Set([finalTotal, rounded10k, rounded50k])).slice(0, 3);
  }, [finalTotal]);

  return (
    <>
      {/* Total + Discount */}
      <div className="rounded-2xl bg-primary-600 text-ivory-surface px-4 py-4 shadow-[var(--shadow-card)]">
        {cartDiscount > 0 && (
          <div className="flex justify-between text-xs opacity-80 mb-1">
            <span>{t('pos.subtotal')}</span>
            <span className="tabular-nums">{formatMoney(cartTotal)}</span>
          </div>
        )}
        {cartDiscount > 0 && (
          <div className="flex justify-between text-xs opacity-80 mb-1">
            <span>{t('pos.discount')}</span>
            <span className="tabular-nums text-yellow-300">-{formatMoney(cartDiscount)}</span>
          </div>
        )}
        <div className="text-xs opacity-80 mb-1 text-center">{t('pos.grandTotal')}</div>
        <div className="text-3xl font-bold tabular-nums text-center">{formatMoney(finalTotal)}</div>
        {/* Discount input */}
        <div className="mt-3 flex items-center gap-1">
          <button
            onClick={() => {
              onDiscountModeToggle(discountMode === 'flat' ? 'pct' : 'flat');
            }}
            className="flex items-center gap-1 rounded-lg border border-white/30 bg-white/10 px-2 py-1 text-[11px] text-ivory-surface hover:bg-white/20"
          >
            {discountMode === 'flat' ? <Tag size={11} /> : <Percent size={11} />}
            {discountMode === 'flat' ? t('common.currency') : '%'}
          </button>
          <input
            type="number"
            min={0}
            placeholder={t('pos.discountPlaceholder')}
            value={discountInput}
            onChange={e => onDiscountInputChange(e.target.value)}
            className="flex-1 rounded-lg border border-white/30 bg-white/10 px-2 py-1 text-sm tabular-nums text-ivory-surface placeholder:text-ivory-surface/50 focus:outline-none focus:border-white/60"
          />
        </div>
      </div>

      {/* Payment methods + inputs */}
      <div className="app-card p-3 flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto -mx-3 px-3">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={() => { onPaymentMethodChange('cash'); onPaymentMethodIdChange(null); }}
              className={`min-w-[80px] flex-1 py-2.5 rounded-xl text-sm font-medium border flex items-center justify-center gap-2 ${
                paymentMethod === 'cash' ? 'bg-primary-600 text-ivory-surface border-primary-600' : 'bg-ivory-surface text-ink-muted border-ivory-border hover:bg-primary-100'
              }`}><Banknote size={16} />{t('pos.cash')}</button>
            {bankMethods.map(pm => (
              <button key={pm.id}
                onClick={() => { onPaymentMethodChange('bank_transfer'); onPaymentMethodIdChange(pm.id); }}
                className={`min-w-[80px] flex-1 py-2.5 rounded-xl text-sm font-medium border flex items-center justify-center gap-2 ${
                  paymentMethod === 'bank_transfer' && paymentMethodId === pm.id ? 'bg-primary-600 text-ivory-surface border-primary-600' : 'bg-ivory-surface text-ink-muted border-ivory-border hover:bg-primary-100'
                }`}><Smartphone size={16} />{pm.name_ar || pm.name}</button>
            ))}
            <button
              onClick={() => { onPaymentMethodChange('credit'); onPaymentMethodIdChange(null); }}
              className={`min-w-[80px] flex-1 py-2.5 rounded-xl text-sm font-medium border flex items-center justify-center gap-2 ${
                paymentMethod === 'credit' ? 'bg-status-warning text-ivory-surface border-status-warning' : 'bg-ivory-surface text-ink-muted border-ivory-border hover:bg-primary-100'
              }`}><FileText size={16} />{t('customers.credit')}</button>
            <button
              onClick={() => { onPaymentMethodChange('split'); onPaymentMethodIdChange(null); }}
              className={`min-w-[80px] flex-1 py-2.5 rounded-xl text-sm font-medium border flex items-center justify-center gap-2 ${
                paymentMethod === 'split' ? 'bg-emerald-600 text-ivory-surface border-emerald-600' : 'bg-ivory-surface text-ink-muted border-ivory-border hover:bg-primary-100'
              }`}><Wallet size={16} />{t('pos.splitPayment')}</button>
          </div>

          {(paymentMethod === 'credit' || (paymentMethod === 'split' && splitRemaining > 0)) && (
            <div className="mb-3">
              <label className="block text-xs text-ink-muted mb-1">{t('customers.title')}</label>
              <input type="text" value={customerSearch} onChange={e => onCustomerSearchChange(e.target.value)} placeholder={t('common.search')}
                className="app-input mb-2 w-full px-3 py-2 text-sm text-ink-main placeholder:text-ink-placeholder focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />

              {/* Custom dropdown replacing native select */}
              <div className="relative" ref={dropdownRef}>
                <div
                  onClick={() => setDropdownOpen(v => !v)}
                  className={`app-input w-full px-3 py-2.5 text-sm flex items-center justify-between cursor-pointer border border-ivory-border rounded-xl bg-white ${dropdownOpen ? 'border-primary-500 ring-2 ring-primary-100' : ''}`}
                >
                  <span className={selectedCustomer ? 'text-ink-main' : 'text-ink-placeholder'}>
                    {selectedCustomer ? (selectedCustomer.name_ar || selectedCustomer.name) : 'اختر عميلاً...'}
                  </span>
                  <div className="flex items-center gap-1">
                    {selectedCustomer && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onCustomerSelect(null); }}
                        className="p-0.5 rounded hover:bg-ivory-muted text-ink-muted"
                      >
                        <X size={14} />
                      </button>
                    )}
                    <ChevronDown size={14} className={`text-ink-muted transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {dropdownOpen && (
                  <div className="absolute start-0 end-0 top-full mt-1 z-40 rounded-xl shadow-[var(--shadow-float)] max-h-48 overflow-y-auto bg-white border border-ivory-border">
                    {filteredCustomers.length === 0 ? (
                      <div className="text-xs text-ink-muted text-center py-3">لا يوجد عملاء مطابقون</div>
                    ) : (
                      filteredCustomers.map(c => (
                        <div
                          key={c.id}
                          onClick={() => { onCustomerSelect(c.id); setDropdownOpen(false); }}
                          className={`px-3 py-2 text-sm cursor-pointer hover:bg-primary-50 flex items-center justify-between gap-2 ${c.id === selectedCustomerId ? 'bg-primary-50' : ''}`}
                        >
                          <span className="font-medium text-ink-main truncate">{c.name_ar || c.name}</span>
                          <span className="text-xs text-ink-muted whitespace-nowrap">
                            {formatMoney(c.current_balance)} / {api.formatCreditLimit(c.credit_limit, t('customers.creditUnlimited'))}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <button type="button" onClick={() => setShowNewCustomer(!showNewCustomer)}
                className="mt-1 flex items-center gap-1 text-xs text-primary-600 hover:underline">
                <Plus size={12} /> {t('customers.addCustomer')}
              </button>
              {showNewCustomer && (
                <form onSubmit={handleAddCustomer} className="mt-2 p-3 rounded-xl border border-ivory-border bg-ivory-muted flex flex-col gap-2">
                  <input value={newCust.name} onChange={e => setNewCust(p => ({ ...p, name: e.target.value }))}
                    placeholder={t('customers.name') + ' *'} required
                    className="app-input w-full px-3 py-2 text-sm text-ink-main focus:outline-none focus:border-primary-500 rounded-lg" />
                  <input value={newCust.phone} onChange={e => setNewCust(p => ({ ...p, phone: e.target.value }))}
                    placeholder={t('customers.phone')} dir="ltr"
                    className="app-input w-full px-3 py-2 text-sm text-ink-main focus:outline-none focus:border-primary-500 rounded-lg" />
                  <Button type="submit" size="sm" disabled={addingCustomer || !newCust.name.trim()}>
                    {addingCustomer ? t('common.loading') : t('common.save')}
                  </Button>
                </form>
              )}
              {/* Credit limit gauge */}
              {selectedCustomerId && (() => {
                const cust = customers.find(c => c.id === selectedCustomerId);
                if (!cust) return null;
                const unlimited = cust.credit_limit < 0;
                const remaining = Math.max(0, cust.credit_limit - cust.current_balance);
                const afterSale = remaining - finalTotal;
                const used = (!unlimited && cust.credit_limit > 0) ? Math.min(100, (cust.current_balance / cust.credit_limit) * 100) : 0;
                const willExceed = !unlimited && finalTotal > remaining;
                return (
                  <div className="mt-2 p-2 rounded-xl border border-ivory-border bg-ivory-muted text-xs">
                    <div className="flex justify-between mb-1">
                      <span className="text-ink-muted">{t('pos.creditRemaining')}:</span>
                      <span className={`tabular-nums font-bold ${unlimited ? 'text-status-success' : willExceed ? 'text-status-danger' : 'text-status-success'}`}>
                        {unlimited ? t('customers.creditUnlimited') : formatMoney(remaining)}
                      </span>
                    </div>
                    {!unlimited && (
                      <div className="h-1.5 rounded-full bg-ivory-border overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${used > 80 ? 'bg-status-danger' : used > 50 ? 'bg-status-warning' : 'bg-status-success'}`}
                          style={{ width: `${used}%` }} />
                      </div>
                    )}
                    {willExceed && (
                      <div className="mt-1 flex items-center gap-1 text-status-danger">
                        <AlertTriangle size={10} />
                        <span>{t('pos.creditExceeded', { amount: formatMoney(afterSale * -1) })}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {paymentMethod === 'split' && (
            <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-ink-main">{t('pos.splitPayment')}</div>
                  <div className="text-xs text-ink-muted">{t('pos.splitPaymentHint')}</div>
                </div>
                <div className="text-right text-xs text-ink-muted">
                  <div>{t('pos.paid')}: <span className="font-semibold text-ink-main">{formatMoney(splitPaidTotal)}</span></div>
                  <div>{t('pos.remaining')}: <span className={`font-semibold ${splitRemaining > 0 ? 'text-status-warning' : 'text-status-success'}`}>{formatMoney(splitRemaining)}</span></div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-ink-muted">{t('pos.cash')}</label>
                  <NumericInput value={normalizedSplitCashAmount / 100} onChange={value => onSplitCashAmountChange(Math.max(0, Math.round(value * 100)))} min={0} step={0.01} className="text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-ink-muted">{t('pos.bankTransfer')}</label>
                  <select
                    value={splitBankMethodId || ''}
                    onChange={event => onSplitBankMethodIdChange(event.target.value || null)}
                    className="app-input mb-2 w-full px-3 py-2 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  >
                    <option value="">{t('pos.chooseBankMethod')}</option>
                    {bankMethods.map((method) => (
                      <option key={method.id} value={method.id}>{method.name_ar || method.name}</option>
                    ))}
                  </select>
                  <NumericInput value={normalizedSplitBankAmount / 100} onChange={value => onSplitBankAmountChange(Math.max(0, Math.round(value * 100)))} min={0} step={0.01} className="text-sm" />
                </div>
              </div>

              {normalizedSplitBankAmount > finalTotal && (
                <div className="mt-2 rounded-xl bg-status-danger/10 px-3 py-2 text-xs font-medium text-status-danger">
                  {t('pos.splitPaymentTooHigh')}
                </div>
              )}
              {splitCashChange > 0 && (
                <div className="mt-2 flex items-center justify-between rounded-xl bg-primary-50 border border-primary-200 px-3 py-2">
                  <span className="text-xs font-medium text-ink-muted">{t('pos.change')}</span>
                  <span className="text-sm font-bold text-primary-600 tabular-nums">{formatMoney(splitCashChange)}</span>
                </div>
              )}
              {splitRemaining > 0 && (
                <div className="mt-2 rounded-xl bg-status-warning/10 px-3 py-2 text-xs font-medium text-status-warning">
                  {t('pos.splitPaymentRemainderCredit', { amount: formatMoney(splitRemaining) })}
                </div>
              )}
            </div>
          )}

          {paymentMethod === 'cash' && (
            <div className="mb-3">
              <label className="block text-xs text-ink-muted mb-1">{t('pos.amountPaid')}</label>
              <NumericInput value={amountPaid / 100} onChange={v => onAmountPaidChange(Math.round(v * 100))} min={0} step={0.01} className="text-lg text-center" />
              {amountPaid > 0 && (
                <div className="mt-2 flex justify-between text-sm px-1">
                  <span className="text-ink-muted">{t('pos.change')}</span>
                  <span className={`tabular-nums font-bold ${change >= 0 ? 'text-primary-600' : 'text-status-danger'}`}>
                    {formatMoney(Math.max(0, change))}
                  </span>
                </div>
              )}
            </div>
          )}

          {paymentMethod === 'cash' && (
            <div className="grid grid-cols-3 gap-2 mb-2">
              {quickCashAmounts.map((amt, i) => (
                <button key={i} onClick={() => onAmountPaidChange(amt)}
                  className="rounded-xl border border-ivory-border bg-ivory-muted py-2 text-xs text-ink-muted active:bg-primary-100 tabular-nums">
                  {formatMoney(amt)}
                </button>
              ))}
            </div>
          )}

          {paymentMethod === 'cash' && (
            <div className="flex justify-center mb-3">
              <Numpad initialValue={amountPaid > 0 ? amountPaid / 100 : 0} decimals={2}
                isActive={editingQtyBatch === null}
                onConfirm={v => onAmountPaidChange(Math.round(v * 100))} onCancel={() => onAmountPaidChange(0)} />
            </div>
          )}

          <div className="mb-3">
            <label className="mb-1 block text-xs text-ink-muted">{t('pos.notes')}</label>
            <textarea
              value={saleNote}
              onChange={event => onSaleNoteChange(event.target.value)}
              placeholder={t('pos.notesPlaceholder')}
              className="app-input h-24 w-full resize-none px-3 py-2 text-sm text-ink-main placeholder:text-ink-placeholder focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-ivory-border mt-auto">
          <Button onClick={onCompleteSale} disabled={saving || cart.length === 0 || isBlocked}
            className="w-full py-3 text-base" title={isBlocked ? t('settings.license.featureLocked') : undefined}>
            {saving ? t('common.loading') : t('pos.completeSale')} (F12)
          </Button>
        </div>
      </div>
    </>
  );
}
