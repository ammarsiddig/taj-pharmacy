import { invoke } from '../lib/tauri';
import type {
  AuditLogRow, AuditLogEntry, LicenseInfo, LicenseHistoryRow,
  OnboardingStatus, OnboardingData, ActivateLicenseCloudData, ActivateLicenseCloudResult,
  RenewLicenseCloudData, RenewLicenseCloudResult,
  CloudRemoteConfig, User, Role,
  AssetCategory, AssetCategoryData, AssetRow, AssetData,
  DisposeAssetData, DepreciationEntry, DepreciationRunResult, AssetSummary,
  PharmacyConfig, PharmacyConfigInput,
  RecoverResult, RestoreResult,
  PermissionEntry,
} from '../types';
import { getTenantId } from './core';

// ---

export async function login(username: string, password: string) {
  return invoke<{ token: string; user: User; role: Role; permissions: PermissionEntry[]; tenant_id: string }>(
    'login', { username, password, tenantId: getTenantId() }
  );
}

// ---

export async function writeAuditLog(userId: string, entry: AuditLogEntry): Promise<void> {
  return invoke('write_audit_log', { tenantId: getTenantId(), userId, entry });
}

export async function getAuditLog(
  entityType?: string, entityId?: string, userId?: string, limit = 100,
): Promise<AuditLogRow[]> {
  return invoke('get_audit_log', {
    tenantId: getTenantId(),
    entityType: entityType || null,
    entityId: entityId || null,
    userId: userId || null,
    limit,
  });
}

// ---

export async function getLicenseInfo(): Promise<LicenseInfo> {
  return invoke('get_license_info', { tenantId: getTenantId() });
}

export async function activateLicense(licenseKey: string, userId?: string): Promise<LicenseInfo> {
  return invoke('activate_license', { tenantId: getTenantId(), data: { license_key: licenseKey, user_id: userId ?? null } });
}

export async function getLicenseHistory(): Promise<LicenseHistoryRow[]> {
  return invoke('get_license_history', { tenantId: getTenantId() });
}

export async function checkLicenseOnline(): Promise<{ checked: boolean; revoked: boolean; offline: boolean; message: string }> {
  return invoke('check_license_online', { tenantId: getTenantId() });
}

// ---

export interface UpdateCheckResult {
  configured: boolean;
  available: boolean;
  version: string;
  current_version: string;
  notes: string | null;
  pub_date: string | null;
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  return invoke('check_for_update', {});
}

export async function installUpdate(): Promise<{ success: boolean; message: string }> {
  return invoke('install_update', {});
}

// ---

export async function checkOnboarding(): Promise<OnboardingStatus> {
  return invoke('check_onboarding', {});
}

export async function getDbTenantId(): Promise<{ tenant_id: string; branch_id: string }> {
  return invoke('get_db_tenant_id', {});
}

export async function completeOnboarding(data: OnboardingData): Promise<void> {
  return invoke('complete_onboarding', { data });
}

export async function activateLicenseCloud(data: ActivateLicenseCloudData): Promise<ActivateLicenseCloudResult> {
  return invoke('activate_license_cloud', { data });
}

export async function renewLicenseCloud(data: RenewLicenseCloudData): Promise<RenewLicenseCloudResult> {
  return invoke('renew_license_cloud', { data });
}

export async function fetchCloudConfig(): Promise<CloudRemoteConfig> {
  return invoke('fetch_cloud_config', {});
}

export async function getCloudRemoteConfigCached(): Promise<CloudRemoteConfig> {
  return invoke('get_cloud_remote_config_cached', {});
}

// ---

export async function getAssetCategories(): Promise<AssetCategory[]> {
  return invoke('get_asset_categories', { tenantId: getTenantId() });
}

export async function createAssetCategory(data: AssetCategoryData): Promise<AssetCategory> {
  return invoke('create_asset_category', { tenantId: getTenantId(), data });
}

export async function getAssets(branchId?: string, status?: string): Promise<AssetRow[]> {
  return invoke('get_assets', { tenantId: getTenantId(), branchId: branchId || null, status: status || null });
}

export async function createAsset(data: AssetData): Promise<AssetRow> {
  return invoke('create_asset', { tenantId: getTenantId(), data });
}

export async function updateAsset(assetId: string, data: AssetData): Promise<void> {
  return invoke('update_asset', { tenantId: getTenantId(), assetId, data });
}

export async function disposeAsset(assetId: string, data: DisposeAssetData): Promise<void> {
  return invoke('dispose_asset', { tenantId: getTenantId(), assetId, data });
}

export async function getDepreciationEntries(assetId?: string, year?: number): Promise<DepreciationEntry[]> {
  return invoke('get_depreciation_entries', { tenantId: getTenantId(), assetId: assetId || null, year: year || null });
}

export async function runDepreciation(year: number, month: number): Promise<DepreciationRunResult> {
  return invoke('run_depreciation', { tenantId: getTenantId(), year, month });
}

export async function getAssetsSummary(branchId?: string): Promise<AssetSummary> {
  return invoke('get_assets_summary', { tenantId: getTenantId(), branchId: branchId || null });
}

// ---

export interface TableSyncResult {
  table: string;
  upserted: number;
  deleted: number;
  success: boolean;
  error: string | null;
}

export async function syncAllTablesNow(branchId?: string): Promise<TableSyncResult[]> {
  return invoke('sync_all_tables_now', {
    tenantId: getTenantId(),
    branchId: branchId ?? null,
  });
}

// ---

export async function listPharmacies(): Promise<PharmacyConfig[]> {
  return invoke('list_pharmacies', {});
}

export async function addPharmacy(data: PharmacyConfigInput): Promise<PharmacyConfig> {
  return invoke('add_pharmacy', { data });
}

export async function switchPharmacy(tenantId: string): Promise<PharmacyConfig> {
  return invoke('switch_pharmacy', { tenantId });
}

export async function getActivePharmacy(): Promise<PharmacyConfig | null> {
  return invoke('get_active_pharmacy', {});
}

export async function removePharmacy(tenantId: string): Promise<void> {
  return invoke('remove_pharmacy', { tenantId });
}

// ---

export async function recoverCloudCredentials(
  licenseKey: string,
  email: string,
  password: string,
): Promise<RecoverResult> {
  return invoke('recover_cloud_credentials', { licenseKey, email, password });
}

export async function pullAllTables(
  endpoint: string,
  syncToken: string,
): Promise<RestoreResult> {
  return invoke('pull_all_tables', { endpoint, syncToken });
}

export async function finalizeRestore(
  syncToken: string,
  endpoint: string,
  adminPassword: string,
  pharmacyName: string,
  subscriptionPlan: string | null,
  subscriptionStatus: string | null,
  subscriptionExpiry: string | null,
  maxUsers: number | null,
  maxBranches: number | null,
  licenseKey: string | null,
): Promise<void> {
  return invoke('finalize_restore', {
    syncToken, endpoint, adminPassword, pharmacyName,
    subscriptionPlan, subscriptionStatus, subscriptionExpiry,
    maxUsers, maxBranches, licenseKey,
  });
}
