import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../../api';
import type { BranchRow, BranchData } from '../../types';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Toast from '../../components/ui/Toast';

export default function BranchesTab() {
  const { t } = useTranslation();
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [form, setForm] = useState<BranchData>({ name: '', name_ar: '', address: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);

  const load = useCallback(async () => {
    try { setBranches(await api.getBranchesFull()); }
    catch (e: unknown) { setToast({ msg: String(e), type: 'danger' }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ name: '', name_ar: '', address: '', phone: '' }); setShowForm(true); };
  const openEdit = (b: BranchRow) => { setEditing(b); setForm({ name: b.name, name_ar: b.name_ar || '', address: b.address || '', phone: b.phone || '' }); setShowForm(true); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) { await api.updateBranch(editing.id, form); }
      else { await api.createBranch(form); }
      setShowForm(false);
      setToast({ msg: t('settings.branches.saveSuccess'), type: 'success' });
      load();
    } catch (e: unknown) { setToast({ msg: String(e), type: 'danger' }); }
    finally { setSaving(false); }
  };

  const handleToggle = async (b: BranchRow) => {
    try { await api.toggleBranchActive(b.id); load(); }
    catch (e: unknown) { setToast({ msg: String(e), type: 'danger' }); }
  };

  if (loading) return <div className="py-12 text-center text-ink-muted">{t('common.loading')}</div>;

  const inp = "app-input w-full px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100";

  return (
    <div className="app-card space-y-4 p-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div className="flex justify-between items-center">
        <h3 className="text-base font-bold text-ink-main">{t('settings.branches.title')}</h3>
        <Button onClick={openNew}>{t('settings.branches.addBranch')}</Button>
      </div>

      <div className="app-card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-ivory-border bg-surface-secondary">
            <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.branches.name')}</th>
            <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.branches.nameAr')}</th>
            <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.branches.phone')}</th>
            <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.status')}</th>
            <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.actions')}</th>
          </tr></thead>
          <tbody>
            {branches.map(b => (
              <tr key={b.id} className="border-b border-ivory-border bg-white transition-colors hover:bg-primary-100/60">
                <td className="px-4 py-2.5 font-medium text-ink-main">{b.name} {b.is_main && <Badge variant="info">{t('settings.branches.mainBranch')}</Badge>}</td>
                <td className="px-4 py-2.5 text-ink-muted">{b.name_ar || '—'}</td>
                <td className="px-4 py-2.5 text-ink-muted">{b.phone || '—'}</td>
                <td className="px-4 py-2.5"><Badge variant={b.is_active ? 'success' : 'neutral'}>{b.is_active ? t('settings.branches.activeBranch') : t('settings.branches.inactiveBranch')}</Badge></td>
                <td className="px-4 py-2.5 flex gap-2">
                  <button onClick={() => openEdit(b)} className="text-xs text-primary-600 hover:underline">{t('settings.branches.edit')}</button>
                  {!b.is_main && <button onClick={() => handleToggle(b)} className="text-xs text-ink-muted hover:underline">{b.is_active ? t('settings.branches.deactivate') : t('settings.branches.activate')}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="app-card max-w-lg space-y-3 p-4">
          <h4 className="font-bold text-sm text-ink-main">{editing ? t('settings.branches.editBranch') : t('settings.branches.addNewBranch')}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-ink-muted mb-1">{t('settings.branches.name')}</label><input className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><label className="block text-xs text-ink-muted mb-1">{t('settings.branches.nameAr')}</label><input className={inp} value={form.name_ar || ''} onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))} dir="rtl" /></div>
            <div><label className="block text-xs text-ink-muted mb-1">{t('settings.branches.address')}</label><input className={inp} value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
            <div><label className="block text-xs text-ink-muted mb-1">{t('settings.branches.phone')}</label><input className={inp} value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>{saving ? t('common.loading') : t('settings.save')}</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>{t('settings.cancel')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
