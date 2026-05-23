import { useState } from 'react';
import type { RoleWithPermissions, SaveRoleData, PermissionEntry } from '../../api/permissions';

interface RoleEditorProps {
  role: RoleWithPermissions;
  resourceCategories: Record<string, string[]>;
  onSave: (data: SaveRoleData) => void;
  onClose: () => void;
}

const LEVELS = ['none', 'read', 'write'] as const;
const LEVEL_LABELS: Record<string, string> = { none: 'بدون', read: 'قراءة', write: 'تعديل' };

export default function RoleEditor({ role, resourceCategories, onSave, onClose }: RoleEditorProps) {
  const [name, setName] = useState(role.role.name);
  const [nameAr, setNameAr] = useState(role.role.name_ar || '');
  const [permissions, setPermissions] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const cat of Object.values(resourceCategories)) {
      for (const res of cat) {
        map[res] = 'none';
      }
    }
    for (const p of role.permissions) {
      map[p.resource] = p.level;
    }
    return map;
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const permEntries: PermissionEntry[] = Object.entries(permissions)
      .filter(([, level]) => level !== 'none')
      .map(([resource, level]) => ({ resource, level }));
    await onSave({
      id: role.role.id || undefined,
      name: name.trim(),
      name_ar: nameAr.trim() || undefined,
      permissions: permEntries,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-3xl w-full mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-ivory-border">
          <h3 className="text-lg font-bold text-ink-main">
            {role.role.id ? 'تعديل الدور' : 'إنشاء دور جديد'}
          </h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-main text-xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-2">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-ink-muted mb-1">اسم الدور (إنجليزي)</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-ivory-border px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
                placeholder="owner"
                disabled={role.role.is_system}
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-ink-muted mb-1">اسم الدور (عربي)</label>
              <input
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                className="w-full rounded-xl border border-ivory-border px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
                placeholder="مالك"
              />
            </div>
          </div>
          {role.role.is_system && (
            <p className="text-xs text-ink-muted">اسم أدوار النظام لا يمكن تغييره</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
          {Object.entries(resourceCategories).map(([category, resources]) => (
            <div key={category}>
              <h4 className="text-sm font-bold text-ink-main mb-2">{category}</h4>
              <div className="space-y-1">
                {resources.map((resource) => (
                  <div key={resource} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-surface-secondary/50">
                    <span className="text-sm text-ink-main">{resource}</span>
                    <div className="flex rounded-lg border border-ivory-border overflow-hidden">
                      {LEVELS.map((lvl) => (
                        <button
                          key={lvl}
                          onClick={() => setPermissions((prev) => ({ ...prev, [resource]: lvl }))}
                          className={`px-3 py-1 text-xs font-medium transition-colors ${
                            permissions[resource] === lvl
                              ? 'bg-primary-600 text-white'
                              : 'bg-white text-ink-muted hover:bg-surface-secondary'
                          }`}
                        >
                          {LEVEL_LABELS[lvl]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-ivory-border">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-secondary">إلغاء</button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="rounded-xl bg-primary-600 px-6 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  );
}
