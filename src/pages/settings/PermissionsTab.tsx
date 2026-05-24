import { useState, useEffect, useCallback } from 'react';
import * as api from '../../api';
import { useAuth } from '../../hooks/useAuth';
import type { User, Branch } from '../../types/auth';
import RoleEditor from './RoleEditor';
import UserPermissionEditor from './UserPermissionEditor';
import type { RoleWithPermissions } from '../../api/permissions';

const RESOURCES_BY_CATEGORY: Record<string, string[]> = {
  'لوحة التحكم': ['dashboard.view'],
  'نقطة البيع': ['pos.sell', 'pos.returns', 'pos.history', 'pos.discount'],
  'الجلسات': ['sessions'],
  'المخزون': ['products', 'inventory', 'transfers', 'disposal'],
  'المشتريات': ['purchases', 'supplier_returns', 'suppliers'],
  'المبيعات': ['customers', 'customer_payments'],
  'الأموال': ['accounts', 'account_transfers', 'expenses'],
  'التقارير': ['reports.sales', 'reports.inventory', 'reports.financial'],
  'النظام': ['audit', 'settings.users', 'settings.branches', 'settings.license', 'settings.backup', 'settings.payment_methods', 'settings.tax'],
};

export default function PermissionsTab() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const [editingRole, setEditingRole] = useState<RoleWithPermissions | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const showToast = (type: 'success' | 'danger', msg: string) => setToast({ msg, type });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [r, u, b] = await Promise.all([
        api.listRoles(),
        api.getUsers(),
        api.getBranches(),
      ]);
      setRoles(r);
      setUsers(u);
      setBranches(b);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaveRole = async (data: api.SaveRoleData) => {
    try {
      await api.saveRole(user?.id || '', data);
      showToast('success', 'تم حفظ الدور بنجاح');
      setEditingRole(null);
      loadData();
    } catch (e: unknown) {
      showToast('danger', String(e));
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الدور؟')) return;
    try {
      await api.deleteRole(user?.id || '', roleId);
      showToast('success', 'تم حذف الدور');
      loadData();
    } catch (e: unknown) {
      showToast('danger', String(e));
    }
  };

  const handleAssignRole = async (data: api.AssignRoleData) => {
    try {
      await api.assignUserRole(user?.id || '', data);
      showToast('success', 'تم تعيين الدور للمستخدم. سيُطلب من المستخدم تسجيل الدخول مرة أخرى.');
      setEditingUser(null);
      loadData();
    } catch (e: unknown) {
      showToast('danger', String(e));
    }
  };

  const handleSetOverrides = async (data: api.SetUserOverridesData) => {
    try {
      await api.setUserOverrides(user?.id || '', data);
      showToast('success', 'تم حفظ الصلاحيات المخصصة. سيُطلب من المستخدم تسجيل الدخول مرة أخرى.');
      loadData();
    } catch (e: unknown) {
      showToast('danger', String(e));
    }
  };

  if (loading) return <div className="app-card py-12 text-center text-ink-muted">جاري التحميل...</div>;
  if (error) return <div className="app-card py-12 text-center text-status-danger">{error}</div>;

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${toast.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {toast.msg}
          <button className="ms-3 underline" onClick={() => setToast(null)}>إغلاق</button>
        </div>
      )}

      {/* Roles Section */}
      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-ivory-border">
          <h3 className="text-lg font-bold text-ink-main">الأدوار</h3>
          <button
            onClick={() => setEditingRole({ role: { id: '', tenant_id: '', name: '', is_system: false }, permissions: [] })}
            className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
          >
            + إنشاء دور جديد
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ivory-border bg-surface-secondary">
              <th className="px-6 py-2.5 text-right font-medium text-ink-muted">اسم الدور</th>
              <th className="px-6 py-2.5 text-right font-medium text-ink-muted">النوع</th>
              <th className="px-6 py-2.5 text-right font-medium text-ink-muted">عدد الصلاحيات</th>
              <th className="px-6 py-2.5 text-right font-medium text-ink-muted">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.role.id} className="group border-b border-ivory-border bg-white transition-colors hover:bg-primary-100/60">
                <td className="px-6 py-3 font-medium text-ink-main">{r.role.name_ar || r.role.name}</td>
                <td className="px-6 py-3 text-ink-muted">{r.role.is_system ? 'نظام' : 'مخصص'}</td>
                <td className="px-6 py-3 text-ink-muted">{r.permissions.length} صلاحية</td>
                <td className="px-6 py-3 flex gap-2">
                  <button onClick={() => setEditingRole(r)} className="rounded-lg px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-600 hover:bg-primary-100">تعديل</button>
                  {!r.role.is_system && (
                    <button onClick={() => handleDeleteRole(r.role.id)} className="rounded-lg px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100">حذف</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Users Section */}
      <div className="app-card overflow-hidden">
        <div className="px-6 py-4 border-b border-ivory-border">
          <h3 className="text-lg font-bold text-ink-main">المستخدمون والصلاحيات</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ivory-border bg-surface-secondary">
              <th className="px-6 py-2.5 text-right font-medium text-ink-muted">المستخدم</th>
              <th className="px-6 py-2.5 text-right font-medium text-ink-muted">الدور</th>
              <th className="px-6 py-2.5 text-right font-medium text-ink-muted">الفرع الأساسي</th>
              <th className="px-6 py-2.5 text-right font-medium text-ink-muted">جميع الفروع</th>
              <th className="px-6 py-2.5 text-right font-medium text-ink-muted">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="group border-b border-ivory-border bg-white transition-colors hover:bg-primary-100/60">
                <td className="px-6 py-3 font-medium text-ink-main">{u.full_name_ar || u.full_name}</td>
                <td className="px-6 py-3 text-ink-muted">{u.role?.name_ar || u.role?.name || ''}</td>
                <td className="px-6 py-3 text-ink-muted">{u.branch?.name_ar || u.branch?.name || ''}</td>
                <td className="px-6 py-3 text-ink-muted">{u.home_branch_id ? (u.see_all_branches ? 'نعم' : 'لا') : '-'}</td>
                <td className="px-6 py-3 flex gap-2">
                  <button onClick={() => setEditingUser(u)} className="rounded-lg px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-600 hover:bg-primary-100">صلاحيات</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Role Editor Modal */}
      {editingRole && (
        <RoleEditor
          role={editingRole}
          resourceCategories={RESOURCES_BY_CATEGORY}
          onSave={handleSaveRole}
          onClose={() => setEditingRole(null)}
        />
      )}

      {/* User Editor Modal */}
      {editingUser && (
        <UserPermissionEditor
          user={editingUser}
          roles={roles}
          branches={branches}
          onSaveRole={handleAssignRole}
          onSaveOverrides={handleSetOverrides}
          onClose={() => setEditingUser(null)}
        />
      )}
    </div>
  );
}
