import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../../api';
import type { BackupLogRow, CloudBackupRow, CloudConfig, CloudSyncStatus, RestoreVerification } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Toast from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';

export default function BackupTab() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [history, setHistory] = useState<BackupLogRow[]>([]);
  const [cloudBackups, setCloudBackups] = useState<CloudBackupRow[]>([]);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus | null>(null);
  const [cloudConfig, setCloudConfig] = useState<CloudConfig>({ cloud_endpoint: '', cloud_token: '', cloud_enabled: false });
  const [restoringRemoteId, setRestoringRemoteId] = useState<string | null>(null);
  const [deletingRemoteId, setDeletingRemoteId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [restorePreview, setRestorePreview] = useState<RestoreVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [uploadingCloud, setUploadingCloud] = useState(false);
  const [restoreSource, setRestoreSource] = useState<'local' | 'cloud'>('cloud');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const [autoBackup, setAutoBackup] = useState<BackupLogRow | null>(null);

  const cloudConnected = Boolean(cloudConfig.cloud_endpoint && cloudConfig.cloud_token);

  const load = useCallback(async () => {
    try {
      const [localHistory, config, nextSyncStatus, ab] = await Promise.all([
        api.getBackupHistory(),
        api.getCloudConfig(),
        api.getCloudSyncStatus(),
        api.getAutoBackupStatus().catch(() => null),
      ]);
      setHistory(localHistory);
      setCloudConfig(config);
      setSyncStatus(nextSyncStatus);
      setAutoBackup(ab);
      if (config.cloud_endpoint && config.cloud_token) {
        try { setCloudBackups(await api.getCloudBackups()); } catch { setCloudBackups([]); /* non-critical: backup list optional, shown only when cloud configured */ }
      } else {
        setCloudBackups([]);
      }
    }
    catch (e: unknown) { setToast({ msg: String(e), type: 'danger' }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleLocalBackup = async () => {
    if (!user) return;
    setCreating(true);
    try {
      await api.createBackup(user.id);
      setToast({ msg: t('settings.backup.successMsg'), type: 'success' });
      load();
    } catch (e: unknown) { setToast({ msg: `${t('settings.backup.failMsg')}: ${e}`, type: 'danger' }); }
    finally { setCreating(false); }
  };

  const handleCloudBackup = async () => {
    if (!user) return;
    setUploadingCloud(true);
    try {
      await api.uploadBackupToCloud(user.id);
      await load();
      setToast({ msg: t('settings.backup.syncSuccess'), type: 'success' });
    } catch (e: unknown) {
      setToast({ msg: `${t('settings.backup.syncFail')}: ${e}`, type: 'danger' });
    } finally { setUploadingCloud(false); }
  };

  const handlePrepareRestore = async (remoteId: string) => {
    setRestoringRemoteId(remoteId);
    setRestoreSource('cloud');
    try {
      const preview = await api.restoreFromCloud(remoteId, false);
      setRestorePreview(preview);
    } catch (e: unknown) { setToast({ msg: String(e), type: 'danger' }); }
    finally { setRestoringRemoteId(null); }
  };

  const handlePrepareLocalRestore = async (backupId: string) => {
    setRestoringRemoteId(backupId);
    setRestoreSource('local');
    try {
      const preview = await api.restoreFromLocal(backupId, false);
      setRestorePreview(preview);
    } catch (e: unknown) { setToast({ msg: String(e), type: 'danger' }); }
    finally { setRestoringRemoteId(null); }
  };

  const handleConfirmRestore = async () => {
    if (!restorePreview) return;
    setRestoringRemoteId(restorePreview.remote_id);
    try {
      if (restoreSource === 'local') {
        await api.restoreFromLocal(restorePreview.remote_id, true);
      } else {
        await api.restoreFromCloud(restorePreview.remote_id, true, restorePreview.staged_file_path);
      }
      setToast({ msg: t('settings.backup.restoreSuccess'), type: 'success' });
      setRestorePreview(null);
      await load();
    } catch (e: unknown) { setToast({ msg: String(e), type: 'danger' }); }
    finally { setRestoringRemoteId(null); }
  };

  const handleDeleteCloudBackup = async (remoteId: string) => {
    setDeletingRemoteId(remoteId);
    try {
      await api.deleteCloudBackup(remoteId);
      setCloudBackups((prev) => prev.filter((item) => item.remote_id !== remoteId));
      setToast({ msg: t('settings.backup.deleteSuccess'), type: 'success' });
    } catch (e: unknown) { setToast({ msg: String(e), type: 'danger' }); }
    finally { setDeletingRemoteId(null); }
  };

  const fmtSize = (bytes?: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fmtDateTime = (value?: string) => value ? value.slice(0, 19).replace('T', ' ') : '—';

  if (loading) return <div className="py-12 text-center text-ink-muted">{t('common.loading')}</div>;

  return (
    <>
    <div className="app-card max-w-3xl space-y-6 p-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {history.length > 0 && history[0].status === 'completed' ? (
        <div className="flex items-center gap-2 rounded-xl border border-forest-600/20 bg-forest-50 px-4 py-2.5 text-sm">
          <span className="h-2 w-2 rounded-full bg-forest-600 shrink-0" />
          <span className="text-ink-muted">{t('settings.backup.lastBackup')}:</span>
          <span className="font-medium text-ink-main">{fmtDateTime(history[0].completed_at)}</span>
          <span className="ms-auto text-xs text-ink-muted">{fmtSize(history[0].file_size ?? undefined)}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm">
          <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
          <span className="text-ink-muted">{t('settings.backup.noBackupYet')}</span>
        </div>
      )}

      {autoBackup && (
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${
          autoBackup.sync_status === 'synced' ? 'border-primary-200 bg-primary-50' :
          autoBackup.sync_status === 'failed' ? 'border-red-200 bg-red-50' :
          'border-ivory-border bg-surface-secondary'
        }`}>
          <span className={`h-2 w-2 rounded-full shrink-0 ${
            autoBackup.sync_status === 'synced' ? 'bg-primary-600' :
            autoBackup.sync_status === 'failed' ? 'bg-status-danger' :
            'bg-amber-400'
          }`} />
          <span className="text-ink-muted">آخر نسخة احتياطية:</span>
          <span className="font-medium text-ink-main">{fmtDateTime(autoBackup.started_at)}</span>
          {autoBackup.sync_status === 'synced' && (
            <span className="ms-auto rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">مرفوعة</span>
          )}
          {autoBackup.sync_status === 'failed' && (
            <span className="ms-auto rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-status-danger">فشل</span>
          )}
          {autoBackup.sync_status === 'pending' && (
            <span className="ms-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">قيد الانتظار</span>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="app-panel space-y-3 p-4">
          <h3 className="text-sm font-bold text-ink-main">{t('settings.backup.localTab')}</h3>
          <p className="text-xs text-ink-muted">{t('settings.backup.localDescription')}</p>
          <Button onClick={handleLocalBackup} disabled={creating} className="w-full">
            {creating ? t('settings.backup.creating') : t('settings.backup.createBackup')}
          </Button>
        </div>

        <div className="app-panel space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink-main">{t('settings.backup.cloudTab')}</h3>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              cloudConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${cloudConnected ? 'bg-emerald-500' : 'bg-red-400'}`} />
              {cloudConnected ? t('settings.backup.cloudConnected') : t('settings.backup.cloudDisconnected')}
            </span>
          </div>
          <p className="text-xs text-ink-muted">{t('settings.backup.cloudDescription')}</p>
          <Button onClick={handleCloudBackup} disabled={uploadingCloud || !cloudConnected} className="w-full">
            {uploadingCloud ? t('settings.backup.syncing') : t('settings.backup.cloudBackupBtn')}
          </Button>
        </div>
      </div>

      {cloudConnected && syncStatus && (
        <div className="app-panel p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-ink-main">{t('settings.backup.syncMonitorTitle')}</h4>
            <span className="text-xs text-ink-muted">{t('settings.backup.autoSyncNote')}</span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-ivory-border bg-white p-3">
              <div className="text-xs text-ink-muted">{t('settings.backup.lastSyncedStatus')}</div>
              <div className="mt-1 text-sm font-semibold text-ink-main">{fmtDateTime(syncStatus.last_synced_at)}</div>
            </div>
            <div className="rounded-xl border border-ivory-border bg-white p-3">
              <div className="text-xs text-ink-muted">{t('settings.backup.pendingEvents')}</div>
              <div className="mt-1 text-lg font-bold text-ink-main tabular-nums">{syncStatus.pending_count ?? 0}</div>
            </div>
            <div className="rounded-xl border border-ivory-border bg-white p-3">
              <div className="text-xs text-ink-muted">{t('settings.backup.failedEvents')}</div>
              <div className={`mt-1 text-lg font-bold tabular-nums ${(syncStatus.failed_count ?? 0) > 0 ? 'text-red-600' : 'text-ink-main'}`}>{syncStatus.failed_count ?? 0}</div>
            </div>
          </div>
          {syncStatus.last_error && (
            <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{syncStatus.last_error}</div>
          )}
        </div>
      )}

      {restorePreview && (
        <div className="app-panel space-y-3 border border-amber-200 bg-amber-50 p-4">
          <h4 className="text-sm font-bold text-ink-main">{t('settings.backup.verificationTitle')}</h4>
          <p className="text-sm text-ink-muted">{t('settings.backup.restoreWarning')}</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-ink-muted">{t('settings.backup.size')}:</span> <span className="font-medium text-ink-main">{fmtSize(restorePreview.file_size)}</span></div>
            <div><span className="text-ink-muted">{t('settings.backup.date')}:</span> <span className="font-medium text-ink-main">{restorePreview.modified_at ? restorePreview.modified_at.slice(0, 19).replace('T', ' ') : '—'}</span></div>
            <div><span className="text-ink-muted">{t('settings.backup.productsCount')}:</span> <span className="font-medium text-ink-main">{restorePreview.products_count}</span></div>
            <div><span className="text-ink-muted">{t('settings.backup.customersCount')}:</span> <span className="font-medium text-ink-main">{restorePreview.customers_count}</span></div>
            <div><span className="text-ink-muted">{t('settings.backup.suppliersCount')}:</span> <span className="font-medium text-ink-main">{restorePreview.suppliers_count}</span></div>
            <div><span className="text-ink-muted">{t('settings.backup.salesCount')}:</span> <span className="font-medium text-ink-main">{restorePreview.sales_count}</span></div>
            <div><span className="text-ink-muted">{t('settings.backup.purchasesCount')}:</span> <span className="font-medium text-ink-main">{restorePreview.purchases_count}</span></div>
          </div>
          <div className="flex gap-2">
            <Button variant="danger" onClick={handleConfirmRestore} disabled={restoringRemoteId === restorePreview.remote_id}>
              {restoringRemoteId === restorePreview.remote_id ? t('common.loading') : t('settings.backup.confirmRestore')}
            </Button>
            <Button variant="ghost" onClick={() => setRestorePreview(null)}>{t('common.cancel')}</Button>
          </div>
        </div>
      )}

      {cloudConnected && cloudBackups.length > 0 && (
        <div className="app-card overflow-hidden shadow-none">
          <div className="border-b border-ivory-border bg-surface-secondary px-4 py-3 text-sm font-bold text-ink-main">
            {t('settings.backup.cloudList')}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ivory-border bg-surface-secondary">
                <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.backup.date')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.backup.size')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.backup.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {cloudBackups.map((backup) => (
                <tr key={backup.remote_id} className="border-b border-ivory-border bg-white">
                  <td className="px-4 py-2.5 text-ink-main">{backup.created_at ? backup.created_at.slice(0, 19).replace('T', ' ') : '—'}</td>
                  <td className="px-4 py-2.5 text-ink-muted">{fmtSize(backup.file_size ?? undefined)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handlePrepareRestore(backup.remote_id)} disabled={restoringRemoteId === backup.remote_id}>
                        {restoringRemoteId === backup.remote_id ? t('common.loading') : t('settings.backup.restore')}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setDeleteConfirmId(backup.remote_id)} disabled={deletingRemoteId === backup.remote_id}>
                        {deletingRemoteId === backup.remote_id ? t('common.loading') : t('settings.backup.delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="app-card overflow-hidden shadow-none">
        <div className="border-b border-ivory-border bg-surface-secondary px-4 py-3 text-sm font-bold text-ink-main">
          {t('settings.backup.history')}
        </div>
        {history.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-muted">{t('settings.backup.noBackups')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-ivory-border bg-surface-secondary">
              <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.backup.date')}</th>
              <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.backup.status')}</th>
              <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.backup.size')}</th>
              <th className="px-4 py-2.5 text-right font-medium text-ink-muted">{t('settings.backup.actions')}</th>
            </tr></thead>
            <tbody>
              {history.map(b => (
                <tr key={b.id} className="border-b border-ivory-border bg-white">
                  <td className="px-4 py-2.5 text-ink-main">{b.started_at.slice(0, 19).replace('T', ' ')}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={b.status === 'completed' ? 'success' : b.status === 'failed' ? 'danger' : 'warning'}>
                      {t(`settings.backup.${b.status}` as Parameters<typeof t>[0])}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-ink-muted tabular-nums">{fmtSize(b.file_size ?? undefined)}</td>
                  <td className="px-4 py-2.5">
                    {b.status === 'completed' && (
                      <Button variant="ghost" size="sm" onClick={() => handlePrepareLocalRestore(b.id)} disabled={restoringRemoteId === b.id}>
                        {restoringRemoteId === b.id ? t('common.loading') : t('settings.backup.restore')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>

    <Modal
      open={!!deleteConfirmId}
      title={t('settings.backup.deleteTitle')}
      message={t('settings.backup.deleteConfirm')}
      variant="danger"
      onConfirm={() => { if (deleteConfirmId) { handleDeleteCloudBackup(deleteConfirmId); setDeleteConfirmId(null); } }}
      onCancel={() => setDeleteConfirmId(null)}
    />
    </>
  );
}
