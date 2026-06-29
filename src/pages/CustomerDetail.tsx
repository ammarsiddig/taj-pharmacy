import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as api from '../api';
import type { CustomerDetail as CustomerDetailType, StatementRow, Account, CustomerPaymentData } from '../types';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import NumericInput from '../components/ui/NumericInput';
import Badge from '../components/ui/Badge';
import Toast from '../components/ui/Toast';

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<CustomerDetailType | null>(null);
  const [statement, setStatement] = useState<StatementRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'statement' | 'payments'>('statement');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const showToast = (type: 'success' | 'danger', msg: string) => setToast({ msg, type });

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [cust, stmt, accts] = await Promise.all([
        api.getCustomer(id),
        api.getCustomerStatement(id, dateFrom || undefined, dateTo || undefined),
        api.getAccounts(api.getBranchId()),
      ]);
      setCustomer(cust);
      setStatement(stmt);
      setAccounts(accts);
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

  if (!customer) {
    return <div className="text-center py-12 text-ink-muted">{t('common.noResults')}</div>;
  }

  const unlimited = customer.credit_limit < 0;
  const creditUsed = customer.current_balance;
  // -1 keeps the available value "unlimited" so formatCreditLimit renders the label.
  const creditAvailable = unlimited ? -1 : Math.max(0, customer.credit_limit - customer.current_balance);
  const creditPct = (!unlimited && customer.credit_limit > 0)
    ? Math.min(100, Math.round((customer.current_balance / customer.credit_limit) * 100))
    : 0;

  return (
    <div className="h-full space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => navigate('/customers')} className="flex h-11 w-11 items-center justify-center rounded-xl border border-ivory-border bg-white text-ink-muted shadow-[var(--shadow-soft)] hover:text-primary-600">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
        <div>
          <h2 className="text-2xl font-bold text-ink-main">{customer.name_ar || customer.name}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t('customers.statement')}، {t('customers.recentSales')}</p>
        </div>
        {customer.is_active ? (
          <Badge variant="success">{t('customers.active')}</Badge>
        ) : (
          <Badge variant="neutral">{t('customers.inactive')}</Badge>
        )}
        <div className="mr-auto" />
        <Button onClick={() => setShowPaymentModal(true)}>{t('customers.recordPayment')}</Button>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <InfoCard label={t('customers.phone')} value={customer.phone || '—'} />
        <InfoCard label={t('customers.email')} value={customer.email || '—'} />
        <InfoCard label={t('customers.totalPurchases')} value={api.formatMoney(customer.total_purchases)} tabular />
        <InfoCard label={t('customers.lastPurchase')} value={customer.last_purchase_date?.slice(0, 10) || '—'} />
      </div>

      {/* Credit Bar */}
      <div className="app-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-ink-muted">{t('customers.creditLimit')}: {api.formatCreditLimit(customer.credit_limit, t('customers.creditUnlimited'))}</span>
          {!unlimited && <span className="text-sm font-medium text-ink-main">{creditPct}%</span>}
        </div>
        {!unlimited && (
          <div className="w-full h-3 bg-ivory-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${creditPct > 80 ? 'bg-status-danger' : creditPct > 50 ? 'bg-status-warning' : 'bg-primary-500'}`}
              style={{ width: `${creditPct}%` }}
            />
          </div>
        )}
        <div className="flex justify-between mt-2 text-xs text-ink-muted">
          <span>{t('customers.creditUsed')}: {api.formatMoney(creditUsed)}</span>
          <span>{t('customers.creditAvailable')}: {api.formatCreditLimit(creditAvailable, t('customers.creditUnlimited'))}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="app-panel flex flex-wrap gap-2 p-2">
        <button
          onClick={() => setTab('statement')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'statement'
            ? 'rounded-full bg-primary-600 text-white shadow-[var(--shadow-soft)]'
            : 'rounded-full border-transparent text-ink-muted hover:bg-surface-secondary hover:text-ink-main'
          }`}
        >
          {t('customers.statement')}
        </button>
        <button
          onClick={() => setTab('payments')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'payments'
            ? 'border-primary-600 text-primary-600'
            : 'border-transparent text-ink-muted hover:text-ink-main'
          }`}
        >
          {t('customers.payments')}
        </button>
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
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('expenses.date')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('expenses.description')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('customers.debit')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('customers.credit')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('customers.balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.map((row, idx) => (
                    <tr key={idx} className="border-b border-ivory-border bg-white">
                      <td className="px-4 py-2.5 tabular-nums text-ink-muted">{row.date?.slice(0, 10)}</td>
                      <td className="px-4 py-2.5 text-ink-main">
                        <span className="inline-flex items-center gap-1.5">
                          <Badge variant={row.row_type === 'sale' ? 'warning' : 'success'}>
                            {row.row_type === 'sale' ? t('customers.sale') : row.row_type === 'payment' ? t('customers.payment') : t('customers.return')}
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

      {/* Payments Tab */}
      {tab === 'payments' && (
        <>
          {customer.recent_payments.length === 0 ? (
            <div className="text-center py-12 text-ink-muted">{t('common.noResults')}</div>
          ) : (
            <div className="app-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ivory-border bg-surface-secondary">
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('expenses.date')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('customers.paymentAmount')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('customers.paymentMethod')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('customers.paymentAccount')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('expenses.notes')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('expenses.createdBy')}</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.recent_payments.map((p) => (
                    <tr key={p.id} className="border-b border-ivory-border bg-white">
                      <td className="px-4 py-2.5 tabular-nums text-ink-muted">{p.created_at?.slice(0, 10)}</td>
                      <td className="px-4 py-2.5 tabular-nums font-medium text-primary-600">{api.formatMoney(p.amount)}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={p.payment_method === 'cash' ? 'success' : 'neutral'}>
                          {p.payment_method === 'cash' ? t('expenses.cash') : t('expenses.bankTransfer')}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-ink-muted">{p.account_name}</td>
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

      {/* Recent Sales Section */}
      {customer.recent_sales.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-bold text-ink-main mb-3">{t('customers.recentSales')}</h3>
          <div className="app-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ivory-border bg-surface-secondary">
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">#</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('expenses.amount')}</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('expenses.paymentMethod')}</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('expenses.date')}</th>
                </tr>
              </thead>
              <tbody>
                {customer.recent_sales.map((s) => (
                  <tr key={s.id} className="border-b border-ivory-border bg-white">
                    <td className="px-4 py-2.5 text-ink-main">{s.sale_number}</td>
                    <td className="px-4 py-2.5 tabular-nums text-ink-main">{api.formatMoney(s.total)}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={s.payment_method === 'cash' ? 'success' : s.payment_method === 'credit' ? 'warning' : 'neutral'}>
                        {s.payment_method}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-ink-muted">{s.created_at?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <PaymentModal
          customerId={customer.id}
          currentBalance={customer.current_balance}
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

function InfoCard({ label, value, tabular }: { label: string; value: string; tabular?: boolean }) {
  return (
    <div className="app-card p-3">
      <div className="text-xs text-ink-muted mb-1">{label}</div>
      <div className={`text-sm font-medium text-ink-main ${tabular ? 'tabular-nums' : ''}`}>{value}</div>
    </div>
  );
}

interface PaymentModalProps {
  customerId: string;
  currentBalance: number;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function PaymentModal({ customerId, currentBalance, accounts, onClose, onSaved, onError }: PaymentModalProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CustomerPaymentData>({
    amount: 0,
    payment_method: 'cash',
    account_id: accounts[0]?.id ?? '',
    notes: '',
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.amount <= 0) { onError(t('common.required')); return; }
    if (!form.account_id) { onError(t('common.required')); return; }

    setSaving(true);
    try {
      const auth = api.getAuthState();
      await api.recordCustomerPayment(
        customerId,
        auth.user!.id,
        { ...form, amount: Math.round(form.amount * 100) },
      );
      onSaved();
    } catch (err) {
      onError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const methodOptions = [
    { value: 'cash', label: t('expenses.cash') },
    { value: 'bank_transfer', label: t('expenses.bankTransfer') },
  ];

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="app-card mx-4 w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-ink-main mb-1">{t('customers.recordPayment')}</h3>
        <p className="text-sm text-ink-muted mb-4">
          {t('customers.currentBalance')}: {api.formatMoney(currentBalance)}
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <NumericInput
            label={t('customers.paymentAmount') + ' (' + t('common.currency') + ')*'}
            value={form.amount}
            onChange={(v) => setForm((prev) => ({ ...prev, amount: v }))}
            step={0.01}
            min={0}
            max={currentBalance / 100}
            className="tabular-nums"
          />
          <Select
            label={t('customers.paymentMethod')}
            value={form.payment_method}
            onChange={(e) => setForm((prev) => ({ ...prev, payment_method: e.target.value }))}
            options={methodOptions}
          />
          <Select
            label={t('customers.paymentAccount') + '*'}
            value={form.account_id}
            onChange={(e) => setForm((prev) => ({ ...prev, account_id: e.target.value }))}
            options={accountOptions}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-ink-main">{t('expenses.notes')}</label>
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
              {saving ? t('common.loading') : t('customers.recordPayment')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
