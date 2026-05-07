export interface TenantSettings {
  id: string;
  name: string;
  name_ar?: string;
  license_number?: string;
  phone?: string;
  address?: string;
  currency_code: string;
  timezone: string;
  receipt_header?: string;
  receipt_footer?: string;
  print_logo: boolean;
  subscription_plan: string;
  subscription_status: string;
  subscription_expiry?: string;
  max_branches: number;
  max_users: number;
  feature_flags: number;
}

export interface TenantSettingsUpdate {
  name: string;
  name_ar?: string;
  license_number?: string;
  phone?: string;
  address?: string;
  currency_code?: string;
  timezone?: string;
  receipt_header?: string;
  receipt_footer?: string;
  print_logo?: boolean;
}

export interface BranchRow {
  id: string;
  name: string;
  name_ar?: string;
  address?: string;
  phone?: string;
  is_main: boolean;
  is_active: boolean;
  created_at: string;
}

export interface BranchData {
  name: string;
  name_ar?: string;
  address?: string;
  phone?: string;
}

export interface NotificationSettingRow {
  id: string;
  notification_type: string;
  is_enabled: boolean;
  threshold_value?: number;
}

export interface NotificationSettingUpdate {
  notification_type: string;
  is_enabled: boolean;
  threshold_value?: number;
}

export interface BackupLogRow {
  id: string;
  backup_type: string;
  file_path?: string;
  file_size?: number;
  status: string;
  sync_status?: 'pending' | 'synced' | 'failed';
  remote_id?: string;
  error_message?: string;
  started_at: string;
  completed_at?: string;
  created_by?: string;
}

export interface CloudConfig {
  id?: string;
  cloud_endpoint: string;
  cloud_token: string;
  cloud_enabled: boolean;
  last_sync_at?: string;
}

export interface CloudConfigInput {
  cloud_endpoint: string;
  cloud_token: string;
  cloud_enabled: boolean;
}

export interface CloudBackupRow {
  remote_id: string;
  file_name?: string;
  file_size?: number;
  created_at?: string;
  uploaded_by?: string;
}

export interface RestoreVerification {
  remote_id: string;
  file_size: number;
  modified_at?: string;
  staged_file_path?: string;
  products_count: number;
  customers_count: number;
  suppliers_count: number;
  sales_count: number;
  purchases_count: number;
}

export interface CloudSyncStatus {
  tenant_id: string;
  last_synced_at?: string;
  last_attempt_at?: string;
  last_error?: string;
  last_auto_run_at?: string;
  last_run_mode?: 'manual' | 'auto';
  last_run_processed: number;
  last_run_synced: number;
  last_run_failed: number;
  last_run_retried: number;
  pending_count: number;
  failed_count: number;
  retry_ready_count: number;
  retry_waiting_count: number;
  oldest_pending_created_at?: string;
  oldest_failed_created_at?: string;
}

export interface CloudSyncOutboxRow {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload_json?: string;
  status: 'pending' | 'processing' | 'synced' | 'failed';
  attempt_count: number;
  last_attempt_at?: string;
  last_error?: string;
  retry_ready?: boolean;
  next_retry_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CloudSyncOutboxInput {
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload_json?: string;
}

export interface QueueOwnerSnapshotResult {
  queued: number;
  snapshot_event_id: string;
}

export interface CloudSyncRunResult {
  endpoint: string;
  processed: number;
  synced: number;
  failed: number;
  retried?: number;
  next_cursor?: string;
  has_more_pending?: boolean;
  pages_run?: number;
}
