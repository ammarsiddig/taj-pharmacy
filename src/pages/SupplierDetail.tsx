import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as api from '../api';
import type { SupplierDetail as SupplierDetailType, SupplierStatementRow, AccountRow, SupplierPaymentData } from '../types';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import NumericInput from '../components/ui/NumericInput';
import Badge from '../components/ui/Badge';
import Toast from '../components/ui/Toast';

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [supplier, setSupplier] = useState<SupplierDetailType | null>(null);
  const [statement, setStatement] = useState<SupplierStatementRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'statement' | 'invoices' | 'payments'>('statement');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const showToast = (type: 'success' | 'danger', msg: string) => setToast({ msg, type });

  useEffect(() => {
    api.getAllAccounts(api.getBranchId()).then(setAccounts).catch(() => { /* non-critical: payment form falls back to empty account list */ });
  }, []);

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [sup, stmt] = await Promise.all([
        api.getSupplier(id),
        api.getSupplierStatement(id, dateFrom || undefined, dateTo || undefined),
      ]);
      setSupplier(sup);
      setStatement(stmt);
    } catch (err) {
      showToast('danger', String(err));
    } finally {
      setLoading(false);
    }
  }, [id, dateFrom, dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  const handlePaymentSaved = () => {
    setShowPaymentModal(false);
    showToast('success', t('common.save'));
    loadData();
  };

  if (loading) {
    return <div className="text-center py-12 text-ink-muted">{t('common.loading')}</div>;
  }

  if (!supplier) {
    return <div className="text-center py-12 text-ink-muted">{t('common.noResults')}</div>;
  }

  return (
    <div className="h-full space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => navigate('/suppliers')} className="flex h-11 w-11 items-center justify-center rounded-xl border border-ivory-border bg-white text-ink-muted shadow-[var(--shadow-soft)] hover:text-primary-600">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
        <div>
          <h2 className="text-2xl font-bold text-ink-main">{supplier.name_ar || supplier.name}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t('suppliers.tab_statement')}، {t('suppliers.tab_invoices')}، {t('suppliers.tab_payments')}</p>
        </div>
        {supplier.is_active ? (
          <Badge variant="success">{t('suppliers.active')}</Badge>
        ) : (
          <Badge variant="neutral">{t('suppliers.inactive')}</Badge>
        )}
        <div className="mr-auto" />
        <Button onClick={() => setShowPaymentModal(true)}>{t('suppliers.recordPayment')}</Button>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <InfoCard label={t('suppliers.phone')} value={supplier.phone || '—'} />
        <InfoCard label={t('suppliers.contactPerson')} value={supplier.contact_person || '—'} />
        <InfoCard label={t('suppliers.totalPurchased')} value={api.formatMoney(supplier.total_purchased)} tabular />
        <InfoCard label={t('suppliers.lastPurchase')} value={supplier.last_purchase_date?.slice(0, 10) || '—'} />
      </div>

      {/* Balance summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <InfoCard label={t('suppliers.totalInvoices')} value={String(supplier.total_invoices)} tabular />
        <InfoCard label={t('suppliers.totalPaid')} value={api.formatMoney(supplier.total_paid)} tabular />
        <InfoCard label={t('suppliers.balanceDue')} value={api.formatMoney(supplier.balance_due)} tabular danger={supplier.balance_due > 0} />
        <InfoCard label={t('suppliers.overdueAmount')} value={api.formatMoney(supplier.overdue_amount)} tabular danger={supplier.overdue_amount > 0} />
      </div>

      {/* Tabs */}
      <div className="app-panel flex flex-wrap gap-2 p-2">
        {(['statement', 'invoices', 'payments'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
              ? 'rounded-full bg-primary-600 text-white shadow-[var(--shadow-soft)]'
              : 'rounded-full border-transparent text-ink-muted hover:bg-surface-secondary hover:text-ink-main'
            }`}
          >
            {t(`suppliers.tab_${key}`)}
          </button>
        ))}
      </div>

      {/* Statement Tab */}
      {tab === 'statement' && (
        <>
          <div className="app-panel flex flex-wrap gap-3 p-4">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="app-input px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="app-input px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
          </div>
          {statement.length === 0 ? (
            <div className="text-center py-12 text-ink-muted">{t('common.noResults')}</div>
          ) : (
            <div className="app-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ivory-border bg-surface-secondary">
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('suppliers.date')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('suppliers.description')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('suppliers.debit')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('suppliers.credit')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('suppliers.balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.map((row, idx) => (
                    <tr key={idx} className="border-b border-ivory-border bg-white">
                      <td className="px-4 py-2.5 tabular-nums text-ink-muted">{row.date?.slice(0, 10)}</td>
                      <td className="px-4 py-2.5 text-ink-main">
                        <span className="inline-flex items-center gap-1.5">
                          <Badge variant={row.row_type === 'invoice' ? 'warning' : 'success'}>
                            {row.row_type === 'invoice' ? t('suppliers.invoice') : t('suppliers.payment')}
                          </Badge>
                          {row.description}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-status-danger">
                        {row.debit > 0 ? api.formatMoney(row.debit) : ''}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-primary-600">
                        {row.credit > 0 ? api.formatMoney(row.credit) : ''}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums font-medium text-ink-main">
                        {api.formatMoney(row.running_balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Invoices Tab */}
      {tab === 'invoices' && (
        <>
          {supplier.recent_invoices.length === 0 ? (
            <div className="text-center py-12 text-ink-muted">{t('common.noResults')}</div>
          ) : (
            <div className="app-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ivory-border bg-surface-secondary">
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('suppliers.invoiceNumber')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('suppliers.date')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('suppliers.invoiceTotal')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('suppliers.amountPaid')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('suppliers.paymentStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {supplier.recent_invoices.map((inv) => (
                    <tr key={inv.id} className="cursor-pointer border-b border-ivory-border bg-white transition-colors hover:bg-primary-100/60"
                      onClick={() => navigate(`/purchases/${inv.id}`)}
                    >
                      <td className="px-4 py-2.5 font-medium text-ink-main">{inv.invoice_number}</td>
                      <td className="px-4 py-2.5 tabular-nums text-ink-muted">{inv.invoice_date?.slice(0, 10)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-ink-main">{api.formatMoney(inv.total)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-primary-600">{api.formatMoney(inv.amount_paid)}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={inv.payment_status === 'paid' ? 'success' : inv.payment_status === 'partial' ? 'warning' : 'neutral'}>
                          {inv.payment_status === 'paid' ? t('suppliers.paid') : inv.payment_status === 'partial' ? t('suppliers.partial') : t('suppliers.unpaid')}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Payments Tab */}
      {tab === 'payments' && (
        <>
          {supplier.recent_payments.length === 0 ? (
            <div className="text-center py-12 text-ink-muted">{t('common.noResults')}</div>
          ) : (
            <div className="app-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ivory-border bg-surface-secondary">
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('suppliers.date')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('suppliers.paymentAmount')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('suppliers.paymentMethod')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('suppliers.account')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('suppliers.linkedInvoice')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('suppliers.notes')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('suppliers.createdBy')}</th>
                  </tr>
                </thead>
                <tbody>
                  {supplier.recent_payments.map((p) => (
                    <tr key={p.id} className="border-b border-ivory-border bg-white">
                      <td className="px-4 py-2.5 tabular-nums text-ink-muted">{p.payment_date?.slice(0, 10)}</td>
                      <td className="px-4 py-2.5 tabular-nums font-medium text-primary-600">{api.formatMoney(p.amount)}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={p.payment_method === 'cash' ? 'success' : 'neutral'}>
                          {p.payment_method === 'cash' ? t('suppliers.cash') : t('suppliers.bankTransfer')}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-ink-muted">{p.account_name}</td>
                      <td className="px-4 py-2.5 text-ink-muted">{p.invoice_number || '—'}</td>
                      <td className="px-4 py-2.5 text-ink-muted">{p.notes || '—'}</td>
                      <td className="px-4 py-2.5 text-ink-muted">{p.created_by_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <SupplierPaymentModal
          supplierId={supplier.id}
          balanceDue={supplier.balance_due}
          invoices={supplier.recent_invoices}
          accounts={accounts}
          onClose={() => setShowPaymentModal(false)}
          onSaved={handlePaymentSaved}
          onError={(msg) => showToast('danger', msg)}
        />
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function InfoCard({ label, value, tabular, danger }: { label: string; value: string; tabular?: boolean; danger?: boolean }) {
  return (
    <div className="app-card p-3">
      <div className="text-xs text-ink-muted mb-1">{label}</div>
      <div className={`text-sm font-medium ${danger ? 'text-status-danger' : 'text-ink-main'} ${tabular ? 'tabular-nums' : ''}`}>{value}</div>
    </div>
  );
}

interface SupplierPaymentModalProps {
  supplierId: string;
  balanceDue: number;
  invoices: { id: string; invoice_number: string; total: number; amount_paid: number; payment_status: string }[];
  accounts: AccountRow[];
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function SupplierPaymentModal({ supplierId, balanceDue, invoices, accounts, onClose, onSaved, onError }: SupplierPaymentModalProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const firstAcct = accounts[0];
  const [form, setForm] = useState<SupplierPaymentData>({
    amount: 0,
    payment_method: api.paymentMethodFromAccountType(firstAcct?.account_type ?? 'cash'),
    account_id: firstAcct?.id ?? '',
    invoice_id: '',
    payment_date: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const unpaidInvoices = invoices.filter((i) => i.payment_status !== 'paid');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.amount <= 0) { onError(t('common.required')); return; }
    if (!form.account_id) { onError(t('common.required')); return; }

    setSaving(true);
    try {
      const auth = api.getAuthState();
      await api.recordSupplierPayment(
        supplierId,
        auth.user!.id,
        { ...form, amount: Math.round(form.amount * 100), invoice_id: form.invoice_id || undefined },
      );
      onSaved();
    } catch (err) {
      onError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const derivedMethodLabel = form.payment_method === 'bank_transfer'
    ? t('suppliers.bankTransfer')
    : t('suppliers.cash');

  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: `${a.name_ar || a.name} — ${api.formatMoney(a.current_balance)}`,
  }));
  const invoiceOptions = [
    { value: '', label: t('suppliers.noLinkedInvoice') },
    ...unpaidInvoices.map((i) => ({
      value: i.id,
      label: `${i.invoice_number} — ${api.formatMoney(i.total - i.amount_paid)}`,
    })),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="app-card mx-4 w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-ink-main mb-1">{t('suppliers.recordPayment')}</h3>
        <p className="text-sm text-ink-muted mb-4">
          {t('suppliers.balanceDue')}: {api.formatMoney(balanceDue)}
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <NumericInput
            label={t('suppliers.paymentAmount') + ' (' + t('common.currency') + ')*'}
            value={form.amount}
            onChange={(v) => setForm((prev) => ({ ...prev, amount: v }))}
            step={0.01}
            min={0}
            className="tabular-nums"
          />
          <Select
            label={t('suppliers.account') + '*'}
            value={form.account_id}
            onChange={(e) => {
              const acctId = e.target.value;
              const acct = accounts.find(a => a.id === acctId);
              const derived = api.paymentMethodFromAccountType(acct?.account_type ?? 'cash');
              setForm((prev) => ({ ...prev, account_id: acctId, payment_method: derived }));
            }}
            options={accountOptions}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-ink-main">{t('suppliers.paymentMethod')}</label>
            <div className="app-input px-3 py-2.5 text-sm text-ink-muted bg-ivory-muted">
              {derivedMethodLabel}
            </div>
          </div>
          <Select
            label={t('suppliers.linkedInvoice')}
            value={form.invoice_id || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, invoice_id: e.target.value }))}
            options={invoiceOptions}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-ink-main">{t('suppliers.date')}</label>
            <input
              type="date"
              value={form.payment_date}
              onChange={(e) => setForm((prev) => ({ ...prev, payment_date: e.target.value }))}
              className="app-input w-full px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-ink-main">{t('suppliers.notes')}</label>
            <textarea
              value={form.notes || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              rows={2}
              className="app-input w-full px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving}>
              {saving ? t('common.loading') : t('suppliers.recordPayment')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
