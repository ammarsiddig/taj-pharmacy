import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Landmark, ArrowLeftRight, Plus, Wallet, CalendarDays, Pencil, Power } from 'lucide-react';
import * as api from '../api';
import type { AccountRow, AccountData, AccountLedger, AccountsSummary, TransferData, TransferFeePreview, UpdateAccountData } from '../types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import NumericInput from '../components/ui/NumericInput';
import Badge from '../components/ui/Badge';
import Toast from '../components/ui/Toast';
import { useLicense } from '../hooks/useLicense';

export default function Accounts() {
  const { t } = useTranslation();
  const { isBlocked } = useLicense();
  const [summary, setSummary] = useState<AccountsSummary | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [ledger, setLedger] = useState<AccountLedger | null>(null);
  const [loading, setLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null);
  const [quickUpdatingId, setQuickUpdatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const showToast = (type: 'success' | 'danger', msg: string) => setToast({ msg, type });

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAccountsSummary(api.getBranchId());
      setSummary(data);
    } catch (err) {
      showToast('danger', String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const loadLedger = useCallback(async (accountId: string) => {
    setLedgerLoading(true);
    try {
      const data = await api.getAccountLedger(accountId, dateFrom || undefined, dateTo || undefined);
      setLedger(data);
    } catch (err) {
      showToast('danger', String(err));
    } finally {
      setLedgerLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (selectedAccount) loadLedger(selectedAccount);
  }, [selectedAccount, loadLedger]);

  const handleAccountClick = (id: string) => {
    setSelectedAccount(id === selectedAccount ? null : id);
    setLedger(null);
  };

  const handleAccountCreated = () => {
    setShowAddModal(false);
    showToast('success', t('common.save'));
    loadSummary();
  };

  const handleTransferDone = () => {
    setShowTransferModal(false);
    showToast('success', t('accounts.transferSuccess'));
    loadSummary();
    if (selectedAccount) loadLedger(selectedAccount);
  };

  const handleAccountUpdated = () => {
    setEditingAccount(null);
    showToast('success', t('accounts.accountSaved'));
    loadSummary();
    if (selectedAccount) loadLedger(selectedAccount);
  };

  const handleToggleActive = async (account: AccountRow) => {
    setQuickUpdatingId(account.id);
    try {
      const auth = api.getAuthState();
      await api.updateAccount(auth.user!.id, account.id, { is_active: !account.is_active });
      showToast('success', t('accounts.accountSaved'));
      await loadSummary();
      if (selectedAccount === account.id) await loadLedger(account.id);
    } catch (err) {
      showToast('danger', String(err));
    } finally {
      setQuickUpdatingId(null);
    }
  };

  return (
    <div className="h-full space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
            <Landmark size={20} />
          </div>
          <div>
          <h2 className="text-2xl font-bold text-ink-main">{t('accounts.title')}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t('accounts.transfer')}، {t('accounts.ledger')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setShowTransferModal(true)} disabled={isBlocked} title={isBlocked ? t('license.licenseExpired') : undefined}>
            <ArrowLeftRight size={16} />
            {t('accounts.transfer')}
          </Button>
          <Button onClick={() => setShowAddModal(true)} disabled={isBlocked} title={isBlocked ? t('license.licenseExpired') : undefined}>
            <Plus size={16} />
            {t('accounts.addAccount')}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {!loading && summary && (
        <div className="grid grid-cols-3 gap-4">
          <SummaryCard label={t('accounts.totalCash')} value={api.formatMoney(summary.total_cash)} />
          <SummaryCard label={t('accounts.totalBank')} value={api.formatMoney(summary.total_bank)} />
          <SummaryCard label={t('accounts.totalAssets')} value={api.formatMoney(summary.total_assets)} highlight />
        </div>
      )}

      {/* Accounts List */}
      {loading ? (
        <div className="app-card py-12 text-center text-ink-muted">{t('common.loading')}</div>
      ) : !summary || summary.accounts.length === 0 ? (
        <EmptyState title={t('common.noResults')} subtitle={t('accounts.addAccount')} />
      ) : (
        <div className="sales-form-table-wrap app-card overflow-hidden">
          <table className="sales-form-table w-full text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('accounts.name')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('accounts.type')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('accounts.currentBalance')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('accounts.default')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('products.status')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('warehouse.locations.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {summary.accounts.map((a) => (
                <tr
                  key={a.id}
                  className={`cursor-pointer border-b border-ivory-border transition-colors ${
                    selectedAccount === a.id ? 'bg-primary-100/80' : 'bg-white'
                  }`}
                  onClick={() => handleAccountClick(a.id)}
                >
                  <td className="px-4 py-2.5 font-medium text-ink-main">{a.name_ar || a.name}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col gap-1">
                      <Badge variant={a.account_type === 'cash' ? 'success' : 'neutral'}>
                        {a.account_type === 'cash' ? t('accounts.cash') : t('accounts.bank')}
                      </Badge>
                      {a.bank_provider && (
                        <span className="text-[10px] text-ink-muted">
                          {bankProviderLabel(a.bank_provider, t)}
                          {a.phone_label ? ` · ${a.phone_label}` : ''}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums font-medium text-ink-main">{api.formatMoney(a.current_balance)}</td>
                  <td className="px-4 py-2.5">
                    {a.is_default && <Badge variant="warning">{t('accounts.default')}</Badge>}
                  </td>
                  <td className="px-4 py-2.5">
                    {a.is_active ? (
                      <Badge variant="success">{t('suppliers.active')}</Badge>
                    ) : (
                      <Badge variant="neutral">{t('suppliers.inactive')}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        type="button"
                        variant="icon"
                        size="sm"
                        onClick={() => setEditingAccount(a)}
                        disabled={isBlocked}
                        title={t('common.edit')}
                      >
                        <Pencil size={15} />
                      </Button>
                      <Button
                        type="button"
                        variant="icon"
                        size="sm"
                        onClick={() => handleToggleActive(a)}
                        disabled={isBlocked || quickUpdatingId === a.id}
                        title={a.is_active ? t('suppliers.inactive') : t('suppliers.active')}
                      >
                        <Power size={15} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ledger Section */}
      {selectedAccount && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-bold text-ink-main">
              {t('accounts.ledger')} — {ledger?.account.name_ar || ledger?.account.name || ''}
            </h3>
            {ledger && (
              <div className="flex gap-4 text-sm">
                <span className="text-primary-600">{t('accounts.totalIn')}: {api.formatMoney(ledger.total_in)}</span>
                <span className="text-status-danger">{t('accounts.totalOut')}: {api.formatMoney(ledger.total_out)}</span>
              </div>
            )}
          </div>

          <div className="sales-form-toolbar app-panel flex flex-wrap items-end gap-3 p-4">
            <div className="flex min-w-[190px] flex-col gap-1">
              <label className="text-xs text-ink-muted">{t('reports.dateFrom')}</label>
              <div className="relative">
                <CalendarDays size={14} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-placeholder" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="app-input w-full px-3 py-2.5 pe-9 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>
            <div className="flex min-w-[190px] flex-col gap-1">
              <label className="text-xs text-ink-muted">{t('reports.dateTo')}</label>
              <div className="relative">
                <CalendarDays size={14} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-placeholder" />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="app-input w-full px-3 py-2.5 pe-9 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>
          </div>

          {ledgerLoading ? (
            <div className="app-card py-8 text-center text-ink-muted">{t('common.loading')}</div>
          ) : !ledger || ledger.transactions.length === 0 ? (
            <EmptyState title={t('common.noResults')} subtitle={t('accounts.ledger')} compact />
          ) : (
            <div className="sales-form-table-wrap app-card overflow-hidden">
              <table className="sales-form-table w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('accounts.txDate')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('accounts.txType')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('accounts.txDescription')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('accounts.txIn')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('accounts.txOut')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('accounts.txBalance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.transactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-ivory-border bg-white">
                      <td className="px-4 py-2.5 tabular-nums text-ink-muted">{tx.created_at?.slice(0, 10)}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={tx.direction === 'in' ? 'success' : 'warning'}>
                          {(() => { const key = `accounts.type_${tx.transaction_type}`; const val = t(key); return val === key ? tx.transaction_type : val; })()}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-ink-main">{tx.description || '—'}</td>
                      <td className="px-4 py-2.5 tabular-nums text-primary-600">
                        {tx.direction === 'in' ? api.formatMoney(tx.amount) : ''}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-status-danger">
                        {tx.direction === 'out' ? api.formatMoney(tx.amount) : ''}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums font-medium text-ink-main">
                        {api.formatMoney(tx.balance_after)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Account Modal */}
      {showAddModal && (
        <AddAccountModal
          onClose={() => setShowAddModal(false)}
          onSaved={handleAccountCreated}
          onError={(msg) => showToast('danger', msg)}
        />
      )}

      {/* Transfer Modal */}
      {showTransferModal && summary && (
        <TransferModal
          accounts={summary.accounts}
          onClose={() => setShowTransferModal(false)}
          onDone={handleTransferDone}
          onError={(msg) => showToast('danger', msg)}
        />
      )}

      {editingAccount && (
        <EditAccountModal
          account={editingAccount}
          onClose={() => setEditingAccount(null)}
          onSaved={handleAccountUpdated}
          onError={(msg) => showToast('danger', msg)}
        />
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function bankProviderLabel(provider: string, t: (key: string) => string): string {
  const labels: Record<string, string> = {
    bok: t('accounts.bankProviderBok'),
    fib: t('accounts.bankProviderFib'),
    onb: t('accounts.bankProviderOnb'),
    other: t('accounts.bankProviderOther'),
  };
  return labels[provider] ?? provider;
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 shadow-[var(--shadow-soft)] ${highlight ? 'border-primary-300 bg-primary-100' : 'border-ivory-border bg-white'}`}>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs text-ink-muted">{label}</div>
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${highlight ? 'bg-white/60 text-primary-700' : 'bg-ivory-muted text-ink-muted'}`}>
          <Wallet size={14} />
        </div>
      </div>
      <div className={`text-lg font-bold tabular-nums ${highlight ? 'text-primary-700' : 'text-ink-main'}`}>{value}</div>
    </div>
  );
}

function EmptyState({ title, subtitle, compact }: { title: string; subtitle: string; compact?: boolean }) {
  return (
    <div className={`app-card text-center ${compact ? 'py-10' : 'py-20'}`}>
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-ivory-muted text-ink-muted">i</div>
      <h3 className="mb-1 mt-3 text-base font-bold text-ink-main">{title}</h3>
      <p className="text-sm text-ink-muted">{subtitle}</p>
    </div>
  );
}

interface AddAccountModalProps {
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function AddAccountModal({ onClose, onSaved, onError }: AddAccountModalProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AccountData>({
    name: '',
    name_ar: '',
    account_type: 'cash',
    opening_balance: 0,
    is_default: false,
    bank_provider: '',
    internal_fee: 0,
    external_fee: 0,
    phone_label: '',
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { onError(t('common.required')); return; }

    setSaving(true);
    try {
      const auth = api.getAuthState();
      await api.createAccount(
        api.getBranchId(),
        auth.user!.id,
        {
          ...form,
          opening_balance: Math.round((form.opening_balance || 0) * 100),
          internal_fee: Math.round((form.internal_fee || 0) * 100),
          external_fee: Math.round((form.external_fee || 0) * 100),
        },
      );
      onSaved();
    } catch (err) {
      onError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const typeOptions = [
    { value: 'cash', label: t('accounts.cash') },
    { value: 'bank', label: t('accounts.bank') },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="app-card mx-4 w-full max-w-md overflow-hidden p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ivory-border bg-ivory-app px-6 py-4">
          <h3 className="text-lg font-bold text-ink-main">{t('accounts.addAccount')}</h3>
          <button onClick={onClose} className="rounded-lg border border-ivory-border px-2 py-1 text-xs text-ink-muted hover:bg-white">×</button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">
          <Input
            label={t('accounts.name') + '*'}
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <Input
            label={t('accounts.nameAr')}
            value={form.name_ar || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, name_ar: e.target.value }))}
          />
          <Select
            label={t('accounts.type')}
            value={form.account_type}
            onChange={(e) => setForm((prev) => ({ ...prev, account_type: e.target.value }))}
            options={typeOptions}
          />
          {form.account_type === 'bank' && (
            <>
              <Select
                label={t('accounts.bankProvider')}
                value={form.bank_provider || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, bank_provider: e.target.value }))}
                options={[
                  { value: '', label: '—' },
                  { value: 'bok', label: t('accounts.bankProviderBok') },
                  { value: 'fib', label: t('accounts.bankProviderFib') },
                  { value: 'onb', label: t('accounts.bankProviderOnb') },
                  { value: 'other', label: t('accounts.bankProviderOther') },
                ]}
              />
              <Input
                label={t('accounts.phoneLabel')}
                value={form.phone_label || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, phone_label: e.target.value }))}
                placeholder={t('accounts.phoneLabelPlaceholder')}
              />
              <NumericInput
                label={t('accounts.internalFee') + ' (' + t('common.currency') + ')'}
                value={form.internal_fee || 0}
                onChange={(v) => setForm((prev) => ({ ...prev, internal_fee: v }))}
                step={0.01}
                min={0}
              />
              <NumericInput
                label={t('accounts.externalFee') + ' (' + t('common.currency') + ')'}
                value={form.external_fee || 0}
                onChange={(v) => setForm((prev) => ({ ...prev, external_fee: v }))}
                step={0.01}
                min={0}
              />
            </>
          )}
          <NumericInput
            label={t('accounts.openingBalance') + ' (' + t('common.currency') + ')'}
            value={form.opening_balance || 0}
            onChange={(v) => setForm((prev) => ({ ...prev, opening_balance: v }))}
            step={0.01}
            min={0}
            className="tabular-nums"
          />
          <label className="flex items-center gap-2 text-sm text-ink-main cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_default || false}
              onChange={(e) => setForm((prev) => ({ ...prev, is_default: e.target.checked }))}
              className="rounded-md border-ivory-border text-primary-600 focus:ring-primary-500"
            />
            {t('accounts.setDefault')}
          </label>
          <div className="flex gap-3 justify-end border-t border-ivory-border pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving}>
              {saving ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface EditAccountModalProps {
  account: AccountRow;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function EditAccountModal({ account, onClose, onSaved, onError }: EditAccountModalProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: account.name,
    name_ar: account.name_ar || '',
    is_active: account.is_active,
    is_default: account.is_default,
    bank_provider: account.bank_provider || '',
    internal_fee: account.internal_fee / 100,
    external_fee: account.external_fee / 100,
    phone_label: account.phone_label || '',
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { onError(t('common.required')); return; }

    const data: UpdateAccountData = {
      name: form.name.trim(),
      name_ar: form.name_ar.trim() || undefined,
      is_active: form.is_active,
      bank_provider: account.account_type === 'bank' ? form.bank_provider : undefined,
      phone_label: account.account_type === 'bank' ? form.phone_label.trim() : undefined,
      internal_fee: account.account_type === 'bank' ? Math.round(form.internal_fee * 100) : undefined,
      external_fee: account.account_type === 'bank' ? Math.round(form.external_fee * 100) : undefined,
    };
    if (account.account_type === 'cash') data.is_default = form.is_default;

    setSaving(true);
    try {
      const auth = api.getAuthState();
      await api.updateAccount(auth.user!.id, account.id, data);
      onSaved();
    } catch (err) {
      onError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="app-card mx-4 w-full max-w-md overflow-hidden p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ivory-border bg-ivory-app px-6 py-4">
          <h3 className="text-lg font-bold text-ink-main">{t('accounts.editAccount')}</h3>
          <button onClick={onClose} className="rounded-lg border border-ivory-border px-2 py-1 text-xs text-ink-muted hover:bg-white">×</button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">
          <Input
            label={t('accounts.name') + '*'}
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <Input
            label={t('accounts.nameAr')}
            value={form.name_ar}
            onChange={(e) => setForm((prev) => ({ ...prev, name_ar: e.target.value }))}
          />
          <div className="rounded-lg border border-ivory-border bg-ivory-app px-3 py-2 text-sm text-ink-muted">
            {t('accounts.type')}: {account.account_type === 'cash' ? t('accounts.cash') : t('accounts.bank')}
          </div>
          {account.account_type === 'bank' && (
            <>
              <Select
                label={t('accounts.bankProvider')}
                value={form.bank_provider}
                onChange={(e) => setForm((prev) => ({ ...prev, bank_provider: e.target.value }))}
                options={[
                  { value: '', label: '—' },
                  { value: 'bok', label: t('accounts.bankProviderBok') },
                  { value: 'fib', label: t('accounts.bankProviderFib') },
                  { value: 'onb', label: t('accounts.bankProviderOnb') },
                  { value: 'other', label: t('accounts.bankProviderOther') },
                ]}
              />
              <Input
                label={t('accounts.phoneLabel')}
                value={form.phone_label}
                onChange={(e) => setForm((prev) => ({ ...prev, phone_label: e.target.value }))}
                placeholder={t('accounts.phoneLabelPlaceholder')}
              />
              <NumericInput
                label={t('accounts.internalFee') + ' (' + t('common.currency') + ')'}
                value={form.internal_fee}
                onChange={(v) => setForm((prev) => ({ ...prev, internal_fee: v }))}
                step={0.01}
                min={0}
              />
              <NumericInput
                label={t('accounts.externalFee') + ' (' + t('common.currency') + ')'}
                value={form.external_fee}
                onChange={(v) => setForm((prev) => ({ ...prev, external_fee: v }))}
                step={0.01}
                min={0}
              />
            </>
          )}
          {account.account_type === 'cash' && (
            <label className="flex items-center gap-2 text-sm text-ink-main cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) => setForm((prev) => ({ ...prev, is_default: e.target.checked }))}
                className="rounded-md border-ivory-border text-primary-600 focus:ring-primary-500"
              />
              {t('accounts.setDefault')}
            </label>
          )}
          <label className="flex items-center gap-2 text-sm text-ink-main cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
              className="rounded-md border-ivory-border text-primary-600 focus:ring-primary-500"
            />
            {t('suppliers.active')}
          </label>
          <div className="flex gap-3 justify-end border-t border-ivory-border pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving}>
              {saving ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface TransferModalProps {
  accounts: AccountRow[];
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string) => void;
}

function TransferModal({ accounts, onClose, onDone, onError }: TransferModalProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<TransferFeePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [form, setForm] = useState<TransferData>({
    from_account_id: accounts[0]?.id ?? '',
    to_account_id: '',
    amount: 0,
    notes: '',
  });

  useEffect(() => {
    let cancelled = false;
    const amount = Math.round(form.amount * 100);

    if (!form.from_account_id || !form.to_account_id || form.from_account_id === form.to_account_id || amount <= 0) {
      setPreview(null);
      return;
    }

    setPreviewLoading(true);
    api.getTransferFeePreview(form.from_account_id, form.to_account_id, amount)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => { cancelled = true; };
  }, [form.amount, form.from_account_id, form.to_account_id]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.amount <= 0) { onError(t('common.required')); return; }
    if (!form.from_account_id) { onError(t('common.required')); return; }
    if (!form.to_account_id) { onError(t('accounts.selectDestination')); return; }
    if (form.from_account_id === form.to_account_id) { onError(t('accounts.sameAccountError')); return; }

    setSaving(true);
    try {
      const auth = api.getAuthState();
      await api.manualTransfer(auth.user!.id, {
        ...form,
        amount: Math.round(form.amount * 100),
      });
      onDone();
    } catch (err) {
      onError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: `${a.name_ar || a.name} (${api.formatMoney(a.current_balance)})`,
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="app-card mx-4 w-full max-w-md overflow-hidden p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ivory-border bg-ivory-app px-6 py-4">
          <h3 className="text-lg font-bold text-ink-main">{t('accounts.transfer')}</h3>
          <button onClick={onClose} className="rounded-lg border border-ivory-border px-2 py-1 text-xs text-ink-muted hover:bg-white">×</button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">
          <Select
            label={t('accounts.fromAccount') + '*'}
            value={form.from_account_id}
            onChange={(e) => setForm((prev) => ({ ...prev, from_account_id: e.target.value }))}
            options={accountOptions}
          />
          <Select
            label={t('accounts.toAccount') + '*'}
            value={form.to_account_id}
            onChange={(e) => setForm((prev) => ({ ...prev, to_account_id: e.target.value }))}
            options={accountOptions}
          />
          <NumericInput
            label={t('accounts.transferAmount') + ' (' + t('common.currency') + ')*'}
            value={form.amount}
            onChange={(v) => setForm((prev) => ({ ...prev, amount: v }))}
            step={0.01}
            min={0}
            className="tabular-nums"
          />
          {(previewLoading || preview) && (
            <div className="rounded-lg border border-ivory-border bg-ivory-app px-3 py-2 text-sm">
              {previewLoading ? (
                <div className="text-ink-muted">{t('common.loading')}</div>
              ) : preview && (
                <div className="grid gap-1 text-ink-main">
                  <div className="flex justify-between gap-3">
                    <span className="text-ink-muted">{t('accounts.transferFee')} ({t(`accounts.fee_${preview.fee_type}`)})</span>
                    <span className="tabular-nums">{api.formatMoney(preview.fee)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-ink-muted">{t('accounts.transferNetAmount')}</span>
                    <span className="tabular-nums">{api.formatMoney(preview.net_amount)}</span>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-ivory-border pt-1 font-semibold">
                    <span>{t('accounts.transferDebitTotal')}</span>
                    <span className="tabular-nums">{api.formatMoney(preview.net_amount + preview.fee)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-ink-main">{t('suppliers.notes')}</label>
            <textarea
              value={form.notes || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              rows={2}
              className="app-input w-full px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <div className="flex gap-3 justify-end border-t border-ivory-border pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving}>
              {saving ? t('common.loading') : t('accounts.transfer')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
