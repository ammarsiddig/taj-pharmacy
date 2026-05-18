import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ReceiptText, Coins, CalendarDays, Tag, Landmark, StickyNote, Palette } from 'lucide-react';
import * as api from '../api';
import type { ExpenseRow, ExpenseData, ExpenseCategory, ExpenseSummary, Account, ExpenseTemplate, ExpenseTemplateData } from '../types';
import Button from '../components/ui/Button';
import Toast from '../components/ui/Toast';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';

export default function Expenses() {
  const { t } = useTranslation();
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);
  const [prefillTemplate, setPrefillTemplate] = useState<ExpenseTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRow | null>(null);
  const [templates, setTemplates] = useState<ExpenseTemplate[]>([]);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const showToast = (type: 'success' | 'danger', msg: string) => setToast({ msg, type });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [exp, cats, accts, sum, tmpl] = await Promise.all([
        api.getExpenses(categoryFilter || undefined, dateFrom || undefined, dateTo || undefined, methodFilter || undefined),
        api.getExpenseCategories(),
        api.getAccounts(api.getBranchId()),
        api.getExpenseSummary(dateFrom || undefined, dateTo || undefined),
        api.getExpenseTemplates(),
      ]);
      setExpenses(exp);
      setCategories(cats);
      setAccounts(accts);
      setSummary(sum);
      setTemplates(tmpl);
    } catch (err) {
      showToast('danger', String(err));
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, methodFilter, dateFrom, dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAdd = (tmpl?: ExpenseTemplate) => { setEditingExpense(null); setPrefillTemplate(tmpl ?? null); setPanelOpen(true); };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await api.deleteExpenseTemplate(id);
      loadData();
    } catch (err) {
      showToast('danger', String(err));
    }
  };

  const handleSaveTemplate = async (data: ExpenseTemplateData) => {
    try {
      await api.createExpenseTemplate(data);
      setShowNewTemplate(false);
      loadData();
    } catch (err) {
      showToast('danger', String(err));
    }
  };
  const handleEdit = (exp: ExpenseRow) => { setEditingExpense(exp); setPanelOpen(true); };
  const handleClosePanel = () => { setPanelOpen(false); setEditingExpense(null); setPrefillTemplate(null); };

  const handleSave = async (data: ExpenseData) => {
    try {
      const auth = api.getAuthState();
      if (editingExpense) {
        await api.updateExpense(editingExpense.id, data, auth.user!.id);
      } else {
        await api.createExpense(data, auth.user!.id);
      }
      setPanelOpen(false);
      setEditingExpense(null);
      showToast('success', t('common.save'));
      loadData();
    } catch (err) {
      showToast('danger', String(err));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const auth = api.getAuthState();
      await api.deleteExpense(deleteTarget.id, auth.user!.id);
      setDeleteTarget(null);
      showToast('success', t('common.delete'));
      loadData();
    } catch (err) {
      showToast('danger', String(err));
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && panelOpen) handleClosePanel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [panelOpen]);

  return (
    <div className="flex h-full gap-6">
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-ink-main">{t('expenses.title')}</h2>
            <p className="mt-1 text-sm text-ink-muted">{t('expenses.total')}، {t('expenses.paymentMethod')}، {t('expenses.category')}</p>
          </div>
          <Button onClick={() => handleAdd()}>{t('expenses.addExpense')}</Button>
        </div>

        {/* Template chip strip */}
        <div className="mb-4 app-panel p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-ink-muted me-1">{t('expenses.templates')}:</span>
            {templates.map(tmpl => (
              <div key={tmpl.id} className="group flex items-center gap-1">
                <button
                  onClick={() => handleAdd(tmpl)}
                  className="flex items-center gap-1.5 rounded-full border border-ivory-border bg-white px-3 py-1 text-xs font-medium text-ink-main shadow-[var(--shadow-soft)] hover:border-primary-600 hover:text-primary-600 transition-colors"
                >
                  {tmpl.category_color && (
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tmpl.category_color }} />
                  )}
                  {tmpl.name_ar || tmpl.name}
                </button>
                <button onClick={() => handleDeleteTemplate(tmpl.id)} className="hidden group-hover:flex text-ink-muted hover:text-status-danger text-xs">✕</button>
              </div>
            ))}
            {!showNewTemplate ? (
              <button onClick={() => setShowNewTemplate(true)} className="rounded-full border border-dashed border-ivory-border px-3 py-1 text-xs text-ink-muted hover:text-primary-600 hover:border-primary-600">+ {t('expenses.newTemplate')}</button>
            ) : (
              <NewTemplateForm categories={categories} accounts={accounts} onSave={handleSaveTemplate} onCancel={() => setShowNewTemplate(false)} />
            )}
          </div>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="mb-5 grid grid-cols-3 gap-4">
            <SummaryCard label={t('expenses.total')} value={api.formatMoney(summary.total)} />
            <SummaryCard label={t('expenses.today')} value={api.formatMoney(summary.today)} />
            <SummaryCard label={t('expenses.thisMonth')} value={api.formatMoney(summary.this_month)} />
          </div>
        )}

        {/* Category breakdown */}
        {summary && summary.by_category.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-2">
            {summary.by_category.map((c) => (
              <span
                key={c.category_name}
                className="inline-flex items-center gap-1.5 rounded-full border border-ivory-border bg-white px-3 py-1.5 text-xs shadow-[var(--shadow-soft)]"
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.category_color }} />
                {c.category_name_ar || c.category_name}: {api.formatMoney(c.total)}
              </span>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="sales-form-toolbar app-card mb-5 flex flex-wrap gap-3 p-4">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="app-input min-w-[180px] px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          >
            <option value="">{t('expenses.allCategories')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name_ar || c.name}</option>
            ))}
          </select>
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="app-input min-w-[180px] px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          >
            <option value="">{t('expenses.allMethods')}</option>
            <option value="cash">{t('expenses.cash')}</option>
            <option value="bank_transfer">{t('expenses.bankTransfer')}</option>
          </select>
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

        {/* Table */}
        {loading ? (
          <div className="app-card py-12 text-center text-ink-muted">{t('common.loading')}</div>
        ) : expenses.length === 0 ? (
          <div className="app-card py-20 text-center">
            <h3 className="text-lg font-bold text-ink-main mb-2">{t('common.noResults')}</h3>
          </div>
        ) : (
          <div className="sales-form-table-wrap app-card overflow-hidden">
            <table className="sales-form-table w-full text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('expenses.date')}</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('expenses.description')}</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('expenses.category')}</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('expenses.amount')}</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('expenses.paymentMethod')}</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('expenses.createdBy')}</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('common.edit')}</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => (
                  <tr key={exp.id} className="group border-b border-ivory-border bg-white transition-colors">
                    <td className="px-4 py-2.5 tabular-nums text-ink-muted">{exp.expense_date?.slice(0, 10)}</td>
                    <td className="px-4 py-2.5 font-medium text-ink-main">{exp.description}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: exp.category_color }} />
                        {exp.category_name_ar || exp.category_name}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-ink-main">{api.formatMoney(exp.amount)}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={exp.payment_method === 'cash' ? 'success' : 'neutral'}>
                        {exp.payment_method === 'cash' ? t('expenses.cash') : t('expenses.bankTransfer')}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted">{exp.created_by_name}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => handleEdit(exp)}
                          className="rounded-xl border border-transparent p-2 text-ink-muted hover:border-ivory-border hover:bg-white hover:text-primary-600"
                          title={t('common.edit')}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteTarget(exp)}
                          className="rounded-xl border border-transparent p-2 text-ink-muted hover:border-ivory-border hover:bg-white hover:text-status-danger"
                          title={t('common.delete')}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {expenses.length > 0 && (
          <div className="mt-3 text-xs text-ink-muted">
            {expenses.length} {t('expenses.title')}
          </div>
        )}
      </div>

      {/* Side Panel */}
      {panelOpen && (
        <ExpensePanel
          expense={editingExpense}
          prefillTemplate={prefillTemplate}
          categories={categories}
          accounts={accounts}
          onSave={handleSave}
          onClose={handleClosePanel}
          onCategoryCreated={loadData}
        />
      )}

      {/* Delete Confirmation */}
      <Modal
        open={!!deleteTarget}
        title={t('common.delete')}
        message={t('expenses.deleteConfirm')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-card p-3">
      <div className="text-xs text-ink-muted mb-1">{label}</div>
      <div className="text-lg font-bold text-ink-main tabular-nums">{value}</div>
    </div>
  );
}

interface NewTemplateFormProps {
  categories: ExpenseCategory[];
  accounts: Account[];
  onSave: (data: ExpenseTemplateData) => Promise<void>;
  onCancel: () => void;
}

function NewTemplateForm({ categories, accounts, onSave, onCancel }: NewTemplateFormProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<ExpenseTemplateData>({ name: '', name_ar: '', category_id: '', default_amount: 0, payment_method: 'cash', account_id: accounts[0]?.id ?? '' });
  const [saving, setSaving] = useState(false);
  const inp = 'app-input w-full px-2 py-1.5 text-xs';
  return (
    <div className="flex flex-wrap items-end gap-1.5 rounded-xl border border-ivory-border bg-ivory-muted p-2">
      <input className={inp} style={{ width: 100 }} placeholder={t('expenses.templateName')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      <input className={inp} style={{ width: 100 }} placeholder={t('expenses.templateNameAr')} dir="rtl" value={form.name_ar || ''} onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))} />
      <select className={inp} style={{ width: 110 }} value={form.category_id || ''} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
        <option value="">{t('expenses.noCategory')}</option>
        {categories.map(c => <option key={c.id} value={c.id}>{c.name_ar || c.name}</option>)}
      </select>
      <input type="number" className={inp} style={{ width: 90 }} placeholder={t('common.amount')} value={form.default_amount / 100 || ''} onChange={e => setForm(f => ({ ...f, default_amount: Math.round(Number(e.target.value) * 100) }))} />
      <div className="flex gap-1">
        <button onClick={async () => { setSaving(true); await onSave(form).finally(() => setSaving(false)); }} disabled={saving || !form.name.trim()} className="rounded-lg bg-primary-600 px-3 py-1 text-xs text-white disabled:opacity-50">{saving ? t('common.loading') : t('common.save')}</button>
        <button onClick={onCancel} className="rounded-lg border border-ivory-border px-3 py-1 text-xs text-ink-muted">{t('common.cancel')}</button>
      </div>
    </div>
  );
}

interface ExpensePanelProps {
  expense: ExpenseRow | null;
  prefillTemplate: ExpenseTemplate | null;
  categories: ExpenseCategory[];
  accounts: Account[];
  onSave: (data: ExpenseData) => Promise<void>;
  onClose: () => void;
  onCategoryCreated: () => void;
}

function ExpensePanel({ expense, prefillTemplate, categories, accounts, onSave, onClose, onCategoryCreated }: ExpensePanelProps) {
  const { t } = useTranslation();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatNameAr, setNewCatNameAr] = useState('');
  const [newCatColor, setNewCatColor] = useState('#0FA3A6');

  const [form, setForm] = useState<ExpenseData>({
    amount: expense ? expense.amount / 100 : (prefillTemplate ? prefillTemplate.default_amount / 100 : 0),
    description: expense?.description ?? '',
    category_id: expense?.category_id ?? prefillTemplate?.category_id ?? (categories[0]?.id ?? ''),
    payment_method: expense?.payment_method ?? prefillTemplate?.payment_method ?? 'cash',
    account_id: expense?.account_id ?? prefillTemplate?.account_id ?? (accounts[0]?.id ?? ''),
    expense_date: expense?.expense_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    notes: expense?.notes ?? '',
  });

  useEffect(() => { firstFieldRef.current?.focus(); }, []);

  const updateField = (key: keyof ExpenseData, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const inp = 'app-input w-full ps-10 pe-3 py-3 text-sm text-ink-main placeholder:text-ink-placeholder focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100';
  const sectionTitle = 'mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted';

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.description.trim()) errs.description = t('common.required');
    if (Number(form.amount) <= 0) errs.amount = t('common.required');
    if (!form.category_id) errs.category_id = t('common.required');
    if (!form.account_id) errs.account_id = t('common.required');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave({
        ...form,
        amount: Math.round(Number(form.amount) * 100),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const cat = await api.createExpenseCategory({
        name: newCatName,
        name_ar: newCatNameAr || newCatName,
        color: newCatColor,
        icon: 'folder',
      });
      setShowNewCategory(false);
      setNewCatName('');
      setNewCatNameAr('');
      setForm((prev) => ({ ...prev, category_id: cat.id }));
      onCategoryCreated();
    } catch (err) {
      console.error(err);
    }
  };

  const methodOptions = [
    { value: 'cash', label: t('expenses.cash') },
    { value: 'bank_transfer', label: t('expenses.bankTransfer') },
  ];

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }));

  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: c.name_ar || c.name,
  }));

  return (
    <div className="sales-form-modal-overlay" onClick={onClose}>
      <div className="sales-form-modal max-w-4xl" onClick={(event) => event.stopPropagation()}>
      <div className="sales-form-panel-header">
        <h3 className="text-base font-bold text-ink-main">
          {expense ? t('expenses.editExpense') : t('expenses.addExpense')}
        </h3>
        <button type="button" aria-label={t('common.cancel')} onClick={onClose} className="sales-form-close-btn">✕</button>
      </div>

      <form onSubmit={handleSubmit} className="sales-form-panel-body space-y-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_0.9fr]">
          <section className="app-panel p-4">
            <h4 className={sectionTitle}>{t('expenses.amountDate')}</h4>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('expenses.amount')} ({t('common.currency')})*</label>
                <div className="relative">
                  <Coins size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input ref={firstFieldRef} type="number" step="0.01" min={0} value={Number(form.amount) || 0} onChange={(e) => updateField('amount', Number(e.target.value || 0))} className={`${inp} tabular-nums`} />
                </div>
                {errors.amount && <p className="mt-1 text-xs text-status-danger">{errors.amount}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('expenses.date')}</label>
                <div className="relative">
                  <CalendarDays size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input type="date" value={form.expense_date} onChange={(e) => updateField('expense_date', e.target.value)} className={inp} />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('expenses.description')}*</label>
                <div className="relative">
                  <ReceiptText size={16} className="pointer-events-none absolute right-3 top-3 text-ink-muted" />
                  <textarea value={form.description} onChange={(e) => updateField('description', e.target.value)} rows={3} className={`${inp} min-h-[92px] resize-none`} />
                </div>
                {errors.description && <p className="mt-1 text-xs text-status-danger">{errors.description}</p>}
              </div>
            </div>
          </section>

          <section className="app-panel p-4">
            <h4 className={sectionTitle}>{t('expenses.categoryNotes')}</h4>
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-ink-muted">{t('expenses.category')}*</label>
                  <button type="button" onClick={() => setShowNewCategory(!showNewCategory)} className="rounded-xl border border-primary-500 px-2 py-1 text-xs text-primary-600 hover:text-primary-700" title={t('expenses.addCategory')}>+
                  </button>
                </div>
                <div className="relative">
                  <Tag size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <select value={form.category_id} onChange={(e) => updateField('category_id', e.target.value)} className={inp}>
                    <option value="">{t('expenses.category')}</option>
                    {categoryOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                {errors.category_id && <p className="mt-1 text-xs text-status-danger">{errors.category_id}</p>}
              </div>

              {showNewCategory && (
                <div className="app-panel flex flex-col gap-2 p-3">
                  <input placeholder={t('expenses.categoryName')} value={newCatName} onChange={(e) => setNewCatName(e.target.value)} className={inp} />
                  <input placeholder={t('expenses.categoryNameAr')} value={newCatNameAr} onChange={(e) => setNewCatNameAr(e.target.value)} className={inp} dir="rtl" />
                  <div className="flex items-center gap-2">
                    <Palette size={16} className="text-ink-muted" />
                    <label className="text-sm font-medium text-ink-main">{t('expenses.categoryColor')}</label>
                    <input type="color" value={newCatColor} onChange={(e) => setNewCatColor(e.target.value)} className="h-8 w-8 cursor-pointer rounded-md border border-ivory-border" />
                  </div>
                  <Button type="button" onClick={handleCreateCategory} className="text-xs rounded-2xl shadow-[var(--shadow-soft)]">{t('expenses.addCategory')}</Button>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('expenses.paymentMethod')}</label>
                <div className="relative">
                  <Landmark size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <select value={form.payment_method} onChange={(e) => updateField('payment_method', e.target.value)} className={inp}>
                    {methodOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('expenses.account')}*</label>
                <div className="relative">
                  <Landmark size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <select value={form.account_id} onChange={(e) => updateField('account_id', e.target.value)} className={inp}>
                    <option value="">{t('expenses.account')}</option>
                    {accountOptions.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
                {errors.account_id && <p className="mt-1 text-xs text-status-danger">{errors.account_id}</p>}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">{t('expenses.notes')}</label>
                <div className="relative">
                  <StickyNote size={16} className="pointer-events-none absolute right-3 top-3 text-ink-muted" />
                  <textarea value={form.notes || ''} onChange={(e) => updateField('notes', e.target.value)} rows={4} className={`${inp} min-h-[96px] resize-none`} />
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-auto flex gap-3 border-t border-ivory-border pt-4">
          <Button type="submit" disabled={saving} className="flex-1 rounded-2xl shadow-[var(--shadow-soft)]">
            {saving ? t('common.loading') : t('common.save')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} className="rounded-2xl">
            {t('common.cancel')}
          </Button>
        </div>
      </form>
      </div>
    </div>
  );
}
