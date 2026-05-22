import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../../api';
import type { PaymentMethodSetting, PaymentMethodData, Account } from '../../types';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Toast from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';

export default function PaymentSettingsTab() {
  const { t } = useTranslation();
  const [methods, setMethods] = useState<PaymentMethodSetting[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const [deleteMethodId, setDeleteMethodId] = useState<string | null>(null);
  const [form, setForm] = useState<PaymentMethodData>({
    name: '', name_ar: '', method_type: 'bank_transfer',
    account_id: '', is_default: false, is_active: true, sort_order: 0,
  });

  const branchId = api.getBranchId();
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, accts] = await Promise.all([api.getPaymentMethods(false), api.getAccounts(branchId)]);
      setMethods(rows);
      setAccounts(accts);
    } catch (e: unknown) { setToast({ msg: String(e), type: 'danger' }); }
    finally { setLoading(false); }
  }, [branchId]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setForm({ name: '', name_ar: '', method_type: 'bank_transfer', account_id: '', is_default: false, is_active: true, sort_order: 0 });
  };

  const save = async () => {
    try {
      if (!form.name?.trim()) return;
      if (editingId) { await api.updatePaymentMethod(editingId, form); }
      else { await api.createPaymentMethod(form); }
      resetForm();
      setToast({ msg: 'Saved', type: 'success' });
      load();
    } catch (e: unknown) { setToast({ msg: String(e), type: 'danger' }); }
  };

  const edit = (row: PaymentMethodSetting) => {
    setEditingId(row.id);
    setForm({ name: row.name, name_ar: row.name_ar || '', method_type: row.method_type, account_id: row.account_id || '', is_default: row.is_default, is_active: row.is_active, sort_order: row.sort_order });
  };

  const remove = async (id: string) => {
    try { await api.deletePaymentMethod(id); load(); }
    catch (e: unknown) { setToast({ msg: String(e), type: 'danger' }); }
  };

  if (loading) return <div className="py-12 text-center text-ink-muted">{t('common.loading')}</div>;

  const inp = "app-input w-full px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100";

  return (
    <>
    <div className="app-card space-y-4 p-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <h3 className="text-base font-bold text-ink-main">{t('settings.payment.title')}</h3>

      <div className="grid grid-cols-2 gap-3">
        <input className={inp} placeholder={t('settings.payment.name')} value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <input className={inp} placeholder={t('settings.payment.nameAr')} value={form.name_ar || ''} onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))} />
        <select className={inp} value={form.method_type} onChange={e => setForm(f => ({ ...f, method_type: e.target.value as PaymentMethodData['method_type'] }))}>
          <option value="cash">{t('settings.payment.cash')}</option>
          <option value="bank_transfer">{t('settings.payment.bankWallet')}</option>
          <option value="credit">{t('settings.payment.credit')}</option>
        </select>
        <select className={inp} value={form.account_id || ''} onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}>
          <option value="">{t('settings.payment.accountOptional')}</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name_ar || a.name}</option>)}
        </select>
      </div>
      <div className="flex gap-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} />{t('settings.payment.default')}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />{t('settings.payment.active')}</label>
      </div>
      <div className="flex gap-2">
        <Button onClick={save}>{editingId ? t('common.save') : t('common.add')}</Button>
        {editingId && <Button variant="ghost" onClick={resetForm}>{t('common.cancel')}</Button>}
      </div>

      <div className="app-card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-ivory-border bg-surface-secondary">
            <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.payment.name')}</th>
            <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.payment.type')}</th>
            <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.payment.status')}</th>
            <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('common.actions')}</th>
          </tr></thead>
          <tbody>
            {methods.map(m => (
              <tr key={m.id} className="border-b border-ivory-border bg-white">
                <td className="px-4 py-2.5">{m.name_ar || m.name}</td>
                <td className="px-4 py-2.5 text-ink-muted">{m.method_type}</td>
                <td className="px-4 py-2.5">{m.is_active ? <Badge variant="success">{t('settings.payment.active')}</Badge> : <Badge variant="neutral">{t('settings.payment.disabled')}</Badge>}</td>
                <td className="px-4 py-2.5 flex gap-2">
                  <button className="text-xs text-primary-600 hover:underline" onClick={() => edit(m)}>{t('common.edit')}</button>
                  <button className="text-xs text-status-danger hover:underline" onClick={() => setDeleteMethodId(m.id)}>{t('common.delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <Modal
      open={!!deleteMethodId}
      title={t('settings.payment.deleteTitle')}
      message={t('settings.payment.deleteConfirm')}
      variant="danger"
      onConfirm={() => { if (deleteMethodId) { remove(deleteMethodId); setDeleteMethodId(null); } }}
      onCancel={() => setDeleteMethodId(null)}
    />
    </>
  );
}
