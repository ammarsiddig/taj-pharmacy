import { invoke } from '../lib/tauri';
import type {
  TenantSettings, TenantSettingsUpdate, BranchRow, BranchData,
  NotificationSettingRow, NotificationSettingUpdate,
  BackupLogRow, CloudConfig, CloudConfigInput, CloudBackupRow,
  RestoreVerification, CloudSyncStatus, CloudSyncOutboxRow, CloudSyncOutboxInput,
  QueueOwnerSnapshotResult, CloudSyncRunResult,
} from '../types';
import { getTenantId } from './core';

// ====== Tenant ======

export async function getTenantSettings(): Promise<TenantSettings> {
  return invoke('get_tenant_settings', { tenantId: getTenantId() });
}

export async function updateTenantSettings(data: TenantSettingsUpdate): Promise<TenantSettings> {
  return invoke('update_tenant_settings', { tenantId: getTenantId(), data });
}

export async function savePharmacyLogo(base64Data: string): Promise<string> {
  return invoke('save_pharmacy_logo', { tenantId: getTenantId(), base64Data });
}

export async function getPharmacyLogo(): Promise<string | null> {
  return invoke('get_pharmacy_logo', { tenantId: getTenantId() });
}

// ====== Branches ======

export async function getBranchesFull(): Promise<BranchRow[]> {
  return invoke('get_branches_full', { tenantId: getTenantId() });
}

export async function createBranch(data: BranchData): Promise<BranchRow> {
  return invoke('create_branch', { tenantId: getTenantId(), data });
}

export async function updateBranch(branchId: string, data: BranchData): Promise<void> {
  return invoke('update_branch', { tenantId: getTenantId(), branchId, data });
}

export async function toggleBranchActive(branchId: string): Promise<void> {
  return invoke('toggle_branch_active', { tenantId: getTenantId(), branchId });
}

// ====== Notification Settings ======

export async function getNotificationSettings(): Promise<NotificationSettingRow[]> {
  return invoke('get_notification_settings', { tenantId: getTenantId() });
}

export async function updateNotificationSetting(data: NotificationSettingUpdate): Promise<void> {
  return invoke('update_notification_setting', { tenantId: getTenantId(), data });
}

// ====== Backup & Cloud ======

export async function createBackup(userId: string): Promise<BackupLogRow> {
  return invoke('create_backup', { tenantId: getTenantId(), userId });
}

export async function getBackupHistory(limit = 20): Promise<BackupLogRow[]> {
  return invoke('get_backup_history', { tenantId: getTenantId(), limit });
}

export async function getCloudConfig(): Promise<CloudConfig> {
  return invoke('get_cloud_config', { tenantId: getTenantId() });
}

export async function saveCloudConfig(data: CloudConfigInput): Promise<CloudConfig> {
  return invoke('save_cloud_config', { tenantId: getTenantId(), data });
}

export interface SyncConfig { endpoint: string; token: string; }

export async function getSyncConfig(): Promise<SyncConfig> {
  return invoke('get_sync_config');
}

export async function saveSyncConfig(data: SyncConfig): Promise<void> {
  return invoke('save_sync_config', { data });
}

export async function uploadBackupToCloud(userId: string): Promise<BackupLogRow> {
  return invoke('upload_backup_to_cloud', { tenantId: getTenantId(), userId });
}

export async function getCloudBackups(): Promise<CloudBackupRow[]> {
  return invoke('get_cloud_backups', { tenantId: getTenantId() });
}

export async function deleteCloudBackup(remoteId: string): Promise<void> {
  return invoke('delete_cloud_backup', { tenantId: getTenantId(), remoteId });
}

export async function restoreFromCloud(
  remoteId: string,
  confirm = false,
  stagedFilePath?: string,
): Promise<RestoreVerification> {
  return invoke('restore_from_cloud', {
    tenantId: getTenantId(),
    remoteId,
    confirm,
    stagedFilePath: stagedFilePath || null,
  });
}

export async function restoreFromLocal(backupId: string, confirm = false): Promise<RestoreVerification> {
  return invoke('restore_from_local', { tenantId: getTenantId(), backupId, confirm });
}

export async function getCloudSyncStatus(): Promise<CloudSyncStatus> {
  return invoke('get_cloud_sync_status', { tenantId: getTenantId() });
}

export async function listCloudSyncOutbox(limit = 100): Promise<CloudSyncOutboxRow[]> {
  return invoke('list_cloud_sync_outbox', { tenantId: getTenantId(), limit });
}

export async function enqueueCloudSyncEvent(data: CloudSyncOutboxInput): Promise<string> {
  return invoke('enqueue_cloud_sync_event', { tenantId: getTenantId(), data });
}

export async function queueOwnerReadModelSnapshot(): Promise<QueueOwnerSnapshotResult> {
  return invoke('queue_owner_read_model_snapshot', { tenantId: getTenantId() });
}

export async function runCloudSyncExport(limit = 50, cursor?: string): Promise<CloudSyncRunResult> {
  return invoke('run_cloud_sync_export', { tenantId: getTenantId(), limit, cursor: cursor ?? null });
}

export async function runCloudSyncCycle(pageSize = 50, maxPages = 5): Promise<CloudSyncRunResult> {
  return invoke('run_cloud_sync_cycle', { tenantId: getTenantId(), pageSize, maxPages });
}
