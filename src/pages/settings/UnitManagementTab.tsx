import { useState, useEffect, useCallback } from 'react';
import * as api from '../../api';
import type { UnitMeasure, UnitMeasureData } from '../../types';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Toast from '../../components/ui/Toast';

export default function UnitManagementTab() {
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

  useEffect(() => { load(); }, [load]);

  const resetForm = () => { setEditingId(null); setForm({ name: '', name_ar: '', is_active: true }); };

  const save = async () => {
    try {
      if (!form.name?.trim()) return;
      if (editingId) { await api.updateUnitMeasure(editingId, form); }
      else { await api.createUnitMeasure(form); }
      resetForm();
      setToast({ msg: 'Saved', type: 'success' });
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

  if (loading) return <div className="py-12 text-center text-ink-muted">Loading...</div>;

  const inp = "app-input w-full px-3 py-2.5 text-sm text-ink-main focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100";

  return (
    <div className="app-card space-y-4 p-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <h3 className="text-base font-bold text-ink-main">Unit Management</h3>
      <div className="grid grid-cols-2 gap-3">
        <input className={inp} placeholder="Unit Name" value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <input className={inp} placeholder="Arabic Unit Name" value={form.name_ar || ''} onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))} />
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />Active</label>
      <div className="flex gap-2">
        <Button onClick={save}>{editingId ? 'Update' : 'Add'}</Button>
        {editingId && <Button variant="ghost" onClick={resetForm}>Cancel</Button>}
      </div>

      <div className="app-card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-ivory-border bg-surface-secondary">
            <th className="px-4 py-2.5 text-right font-medium text-ink-muted">Unit</th>
            <th className="px-4 py-2.5 text-right font-medium text-ink-muted">Status</th>
            <th className="px-4 py-2.5 text-right font-medium text-ink-muted">Actions</th>
          </tr></thead>
          <tbody>
            {units.map(u => (
              <tr key={u.id} className="border-b border-ivory-border bg-white">
                <td className="px-4 py-2.5">{u.name_ar || u.name}</td>
                <td className="px-4 py-2.5">{u.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="neutral">Disabled</Badge>}</td>
                <td className="px-4 py-2.5 flex gap-2">
                  <button className="text-xs text-primary-600 hover:underline" onClick={() => edit(u)}>Edit</button>
                  <button className="text-xs text-status-danger hover:underline" onClick={() => remove(u.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
