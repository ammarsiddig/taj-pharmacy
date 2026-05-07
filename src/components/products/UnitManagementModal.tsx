import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import * as api from '../../api';
import type { UnitMeasure, UnitMeasureData } from '../../types';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Toast from '../ui/Toast';

interface UnitManagementModalProps {
  open: boolean;
  onClose: () => void;
}

export default function UnitManagementModal({ open, onClose }: UnitManagementModalProps) {
  const { t } = useTranslation();
  const [units, setUnits] = useState<UnitMeasure[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UnitMeasureData>({ name: '', name_ar: '', is_active: true });
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setUnits(await api.getUnitMeasures(false)); }
    catch (e: unknown) { setToast({ msg: String(e), type: 'danger' }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const resetForm = () => { setEditingId(null); setForm({ name: '', name_ar: '', is_active: true }); };

  const save = async () => {
    try {
      if (!form.name?.trim()) return;
      if (editingId) { await api.updateUnitMeasure(editingId, form); }
      else { await api.createUnitMeasure(form); }
      resetForm();
      setToast({ msg: t('settings.savedSuccess'), type: 'success' });
      load();
    } catch (e: unknown) { setToast({ msg: String(e), type: 'danger' }); }
  };

  const edit = (row: UnitMeasure) => {
    setEditingId(row.id);
    setForm({ name: row.name, name_ar: row.name_ar || '', is_active: row.is_active });
  };

  const remove = async (id: string) => {
    try { await api.deleteUnitMeasure(id); load(); }
    catch (e: unknown) { setToast({ msg: String(e), type: 'danger' }); }
  };

  if (!open) return null;

  const inp = "app-input w-full px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-2xl border border-ivory-border bg-white shadow-[var(--shadow-float)]">
        <div className="flex items-center justify-between border-b border-ivory-border px-6 py-4">
          <h3 className="text-lg font-semibold text-ink-main">{t('settings.units')}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-main">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

          <div className="grid grid-cols-2 gap-3">
            <input className={inp} placeholder={t('settings.unitName')} value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <input className={inp} placeholder={t('settings.unitNameAr')} value={form.name_ar || ''} onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))} dir="rtl" />
          </div>

          <label className="flex items-center gap-2 text-sm text-ink-main">
            <input type="checkbox" checked={!!form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="h-4 w-4 accent-primary-600" />
            {t('settings.active')}
          </label>

          <div className="flex gap-2">
            <Button onClick={save}>{editingId ? t('common.update') : t('common.add')}</Button>
            {editingId && <Button variant="ghost" onClick={resetForm}>{t('common.cancel')}</Button>}
          </div>

          {loading ? (
            <div className="py-8 text-center text-ink-muted">{t('common.loading')}</div>
          ) : (
            <div className="app-card overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-ivory-border bg-surface-secondary">
                  <th className="px-4 py-2.5 text-start font-medium text-ink-muted">{t('settings.unit')}</th>
                  <th className="px-4 py-2.5 text-start font-medium text-ink-muted">{t('settings.status')}</th>
                  <th className="px-4 py-2.5 text-start font-medium text-ink-muted">{t('settings.actions')}</th>
                </tr></thead>
                <tbody>
                  {units.map(u => (
                    <tr key={u.id} className="border-b border-ivory-border bg-white">
                      <td className="px-4 py-2.5">{u.name_ar || u.name}</td>
                      <td className="px-4 py-2.5">{u.is_active ? <Badge variant="success">{t('settings.active')}</Badge> : <Badge variant="neutral">{t('settings.inactive')}</Badge>}</td>
                      <td className="px-4 py-2.5 flex gap-2">
                        <button className="text-xs text-primary-600 hover:underline" onClick={() => edit(u)}>{t('common.edit')}</button>
                        <button className="text-xs text-status-danger hover:underline" onClick={() => remove(u.id)}>{t('common.delete')}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
