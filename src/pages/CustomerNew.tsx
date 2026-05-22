import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as api from '../api';
import type { CustomerData } from '../types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import NumericInput from '../components/ui/NumericInput';
import Toast from '../components/ui/Toast';

export default function CustomerNew() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const [form, setForm] = useState<CustomerData>({
    name: '',
    name_ar: '',
    phone: '',
    email: '',
    address: '',
    credit_limit: 0,
    notes: '',
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setToast({ msg: t('common.required'), type: 'danger' });
      return;
    }
    setSaving(true);
    try {
      const result = await api.createCustomer({
        ...form,
        credit_limit: Math.round((form.credit_limit || 0) * 100),
      });
      setToast({ msg: t('common.save'), type: 'success' });
      setTimeout(() => navigate(`/customers/${result.id}`), 500);
    } catch (err) {
      setToast({ msg: String(err), type: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="rounded-xl border border-ivory-border px-3 py-2 text-sm text-ink-muted hover:bg-white">
          ← {t('common.cancel')}
        </button>
        <h2 className="text-xl font-bold text-ink-main">{t('customers.addCustomer')}</h2>
      </div>

      <form onSubmit={handleSubmit} className="app-card space-y-4 p-6">
        <Input
          label={t('customers.name') + ' *'}
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
        />
        <Input
          label={t('customers.nameAr')}
          value={form.name_ar || ''}
          onChange={(e) => setForm((p) => ({ ...p, name_ar: e.target.value }))}
        />
        <Input
          label={t('customers.phone')}
          value={form.phone || ''}
          onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          dir="ltr"
        />
        <Input
          label={t('customers.email')}
          value={form.email || ''}
          onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          dir="ltr"
        />
        <Input
          label={t('customers.address')}
          value={form.address || ''}
          onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
        />
        <NumericInput
          label={t('customers.creditLimit') + ' (' + t('common.currency') + ')'}
          value={form.credit_limit || 0}
          onChange={(v) => setForm((p) => ({ ...p, credit_limit: v }))}
          step={0.01}
          min={0}
          className="tabular-nums"
        />
        <Input
          label={t('customers.notes')}
          value={form.notes || ''}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
        />
        <div className="flex justify-end gap-3 border-t border-ivory-border pt-4">
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? t('common.loading') : t('common.save')}
          </Button>
        </div>
      </form>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
