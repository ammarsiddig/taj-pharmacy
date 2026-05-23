import { useState } from 'react';
import type { User, Branch } from '../../types/auth';
import type { AssignRoleData, SetUserOverridesData, PermissionEntry } from '../../api';
import type { RoleWithPermissions } from '../../api/permissions';

interface UserPermissionEditorProps {
  user: User;
  roles: RoleWithPermissions[];
  branches: Branch[];
  onSaveRole: (data: AssignRoleData) => void;
  onSaveOverrides: (data: SetUserOverridesData) => void;
  onClose: () => void;
}

const ALL_RESOURCES = [
  'pos.sell', 'pos.returns', 'pos.history', 'pos.discount',
  'sessions', 'products', 'inventory', 'transfers', 'disposal',
  'purchases', 'supplier_returns', 'suppliers',
  'customers', 'customer_payments',
  'accounts', 'account_transfers', 'expenses',
  'reports.sales', 'reports.inventory', 'reports.financial',
  'audit', 'settings.users', 'settings.branches', 'settings.license',
  'settings.backup', 'settings.payment_methods', 'settings.tax',
];

const LEVELS = ['none', 'read', 'write'] as const;
const LEVEL_LABELS: Record<string, string> = { none: 'افتراضي الدور', read: 'قراءة', write: 'تعديل' };

export default function UserPermissionEditor({ user, roles, branches, onSaveRole, onSaveOverrides, onClose }: UserPermissionEditorProps) {
  const [roleId, setRoleId] = useState(user.role_id);
  const [homeBranchId, setHomeBranchId] = useState(user.branch_id || '');
  const [seeAllBranches, setSeeAllBranches] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const r of ALL_RESOURCES) map[r] = 'none';
    return map;
  });
  const [showOverrides, setShowOverrides] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSaveRole = async () => {
    setSaving(true);
    await onSaveRole({
      user_id: user.id,
      role_id: roleId,
      home_branch_id: homeBranchId || undefined,
      see_all_branches: seeAllBranches || undefined,
    });
    setSaving(false);
  };

  const handleSaveOverrides = async () => {
    setSaving(true);
    const entries: PermissionEntry[] = Object.entries(overrides)
      .filter(([, lvl]) => lvl !== 'none')
      .map(([resource, level]) => ({ resource, level }));
    await onSaveOverrides({ user_id: user.id, overrides: entries });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-ivory-border">
          <h3 className="text-lg font-bold text-ink-main">صلاحيات: {user.full_name_ar || user.full_name}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-main text-xl leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Role assignment */}
          <div>
            <label className="block text-sm font-medium text-ink-muted mb-1">الدور</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="w-full rounded-xl border border-ivory-border px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
            >
              {roles.map((r) => (
                <option key={r.role.id} value={r.role.id}>{r.role.name_ar || r.role.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-muted mb-1">الفرع الأساسي</label>
            <select
              value={homeBranchId}
              onChange={(e) => setHomeBranchId(e.target.value)}
              className="w-full rounded-xl border border-ivory-border px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
            >
              <option value="">-- غير محدد --</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name_ar || b.name}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={seeAllBranches}
              onChange={(e) => setSeeAllBranches(e.target.checked)}
              className="rounded border-ivory-border text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-ink-main">رؤية جميع الفروع</span>
          </label>

          <button
            onClick={handleSaveRole}
            disabled={saving}
            className="w-full rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? 'جاري الحفظ...' : 'حفظ تغييرات الدور'}
          </button>

          {/* Permission overrides */}
          <div className="border-t border-ivory-border pt-4">
            <button
              onClick={() => setShowOverrides(!showOverrides)}
              className="text-sm font-medium text-primary-600 hover:underline"
            >
              {showOverrides ? '▼ إخفاء الصلاحيات المخصصة' : '▶ صلاحيات مخصصة (لإلغاء افتراضي الدور)'}
            </button>

            {showOverrides && (
              <div className="mt-3 space-y-2">
                {ALL_RESOURCES.map((resource) => (
                  <div key={resource} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-surface-secondary/50">
                    <span className="text-sm text-ink-main">{resource}</span>
                    <div className="flex rounded-lg border border-ivory-border overflow-hidden">
                      {LEVELS.map((lvl) => (
                        <button
                          key={lvl}
                          onClick={() => setOverrides((prev) => ({ ...prev, [resource]: lvl }))}
                          className={`px-2 py-1 text-xs font-medium transition-colors ${
                            overrides[resource] === lvl
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
                <button
                  onClick={handleSaveOverrides}
                  disabled={saving}
                  className="w-full rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 mt-3"
                >
                  حفظ التخصيصات
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-ivory-border">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-secondary">إغلاق</button>
        </div>
      </div>
    </div>
  );
}
