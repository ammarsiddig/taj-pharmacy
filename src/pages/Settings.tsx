import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import * as api from '../api';
import type { User, UserFormData, Role, Branch } from '../types';
import { useAuditLog } from '../hooks/useAuditLog';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Toast from '../components/ui/Toast';
import UserPanel from './settings/UserPanel';
import GeneralTab from './settings/GeneralTab';
import BranchesTab from './settings/BranchesTab';
import NotificationsTab from './settings/NotificationsTab';
import BackupTab from './settings/BackupTab';
import LicenseTab from './settings/LicenseTab';
import CloudSyncTab from './settings/CloudSyncTab';
import UnitManagementTab from './settings/UnitManagementTab';
import PermissionsTab from './settings/PermissionsTab';
import PaymentSettingsTab from './settings/PaymentSettingsTab';

type TabKey = 'general' | 'users' | 'branches' | 'notifications' | 'backup' | 'license' | 'cloud_sync' | 'units' | 'permissions' | 'payment';

export default function Settings() {
  const { t } = useTranslation();
  const { log: auditLog } = useAuditLog();
  const location = useLocation();
  const [tab, setTab] = useState<TabKey>(() => {
    const state = location.state as { tab?: TabKey } | null;
    return state?.tab ?? 'users';
  });

  useEffect(() => {
    const state = location.state as { tab?: TabKey } | null;
    if (state?.tab) setTab(state.tab);
  }, [location.state]);

  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const showToast = (type: 'success' | 'danger', msg: string) => setToast({ msg, type });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [u, r, b] = await Promise.all([api.getUsers(), api.getRoles(), api.getBranches()]);
      setUsers(u);
      setRoles(r);
      setBranches(b);
    } catch (err) {
      console.error('Settings loadData failed:', err);
      showToast('danger', String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleEdit = (user: User) => { setEditingUser(user); setPanelOpen(true); };
  const handleAdd = () => { setEditingUser(null); setPanelOpen(true); };

  const handleSave = async (data: UserFormData) => {
    const actorId = api.getAuthState().user?.id ?? 'system';
    try {
      if (editingUser) {
        await api.updateUser(actorId, editingUser.id, data);
        auditLog('update', 'user', editingUser.id, JSON.stringify({ username: data.username }));
      } else {
        const created = await api.createUser(actorId, data);
        auditLog('create', 'user', (created as unknown as { id?: string })?.id || 'new', JSON.stringify({ username: data.username }));
      }
      setPanelOpen(false);
      setEditingUser(null);
      showToast('success', t('settings.savedSuccess'));
      loadData();
    } catch (err) {
      console.error('handleSave user failed:', err);
      showToast('danger', String(err));
    }
  };

  const handleClose = () => { setPanelOpen(false); setEditingUser(null); };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && panelOpen) handleClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [panelOpen]);

  return (
    <div className="flex h-full gap-6">
      <div className="flex-1 min-w-0">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-ink-main">{t('settings.title')}</h2>
            <div className="app-panel mt-3 flex flex-wrap gap-2 p-2">
              {([
                ['general', t('settings.generalTab')],
                ['users', t('settings.usersTab')],
                ['branches', t('settings.branchesTab')],
                ['notifications', t('settings.notificationsTab')],
                ['backup', t('settings.backupTab')],
                ['license', t('settings.licenseTab')],
                ['cloud_sync', t('settings.cloudSyncTab')],
                ['units', t('settings.unitsTab')],
                ['payment', t('settings.paymentTab')],
                ['permissions', 'الصلاحيات'],
              ] as [TabKey, string][]).map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    tab === k
                      ? 'bg-primary-600 text-white shadow-[var(--shadow-soft)]'
                      : 'text-ink-muted hover:bg-surface-secondary hover:text-ink-main'
                  }`}>{label}</button>
              ))}
            </div>
          </div>
          {tab === 'users' && <Button onClick={handleAdd}>{t('settings.addUser')}</Button>}
        </div>

        {tab === 'users' && (
          <>
            {loading ? (
              <div className="app-card py-12 text-center text-ink-muted">{t('common.loading')}</div>
            ) : (
              <div className="app-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ivory-border bg-surface-secondary">
                      <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.fullName')}</th>
                      <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.username')}</th>
                      <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.role')}</th>
                      <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.branch')}</th>
                      <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.status')}</th>
                      <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="group border-b border-ivory-border bg-white transition-colors hover:bg-primary-100/60">
                        <td className="px-4 py-2.5 font-medium text-ink-main">{u.full_name_ar || u.full_name}</td>
                        <td className="px-4 py-2.5 text-ink-muted">{u.username}</td>
                        <td className="px-4 py-2.5 text-ink-muted">{u.role?.name_ar || u.role?.name || ''}</td>
                        <td className="px-4 py-2.5 text-ink-muted">{u.branch?.name_ar || u.branch?.name || ''}</td>
                        <td className="px-4 py-2.5">
                          {u.is_active ? (
                            <Badge variant="success">{t('settings.active')}</Badge>
                          ) : (
                            <Badge variant="neutral">{t('settings.inactive')}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => handleEdit(u)}
                            className="rounded-xl border border-transparent p-2 text-ink-muted hover:border-ivory-border hover:bg-white hover:text-primary-600"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === 'general' && <GeneralTab />}
        {tab === 'branches' && <BranchesTab />}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'backup' && <BackupTab />}
        {tab === 'license' && <LicenseTab />}
        {tab === 'cloud_sync' && <CloudSyncTab />}
        {tab === 'units' && <UnitManagementTab />}
        {tab === 'payment' && <PaymentSettingsTab />}
        {tab === 'permissions' && <PermissionsTab />}
      </div>

      {panelOpen && (
        <UserPanel
          user={editingUser}
          roles={roles}
          branches={branches}
          onSave={handleSave}
          onClose={handleClose}
        />
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
