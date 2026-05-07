export interface AuditLogRow {
  id: string;
  user_id: string;
  user_name?: string;
  action: string;
  entity_type: string;
  entity_id: string;
  changes_json?: string;
  created_at: string;
}

export interface AuditLogEntry {
  action: string;
  entity_type: string;
  entity_id: string;
  changes_json?: string;
}

export interface LicenseInfo {
  is_valid: boolean;
  plan: string;
  status: string;
  expiry?: string;
  max_branches: number;
  max_users: number;
  feature_flags: number;
  days_until_expiry?: number;
  in_grace_period: boolean;
  grace_days_remaining?: number;
  is_read_only: boolean;
  read_only_reason?: string;
}

export interface LicenseHistoryRow {
  id: string;
  plan: string;
  activated_at: string;
  expires_at?: string;
  max_branches: number;
  max_users: number;
  activated_by?: string;
}

export interface OnboardingStatus {
  completed: boolean;
}

export interface OnboardingData {
  pharmacy_name: string;
  pharmacy_name_ar?: string;
  phone?: string;
  address?: string;
  license_number?: string;
  currency_code: string;
  timezone: string;
  branch_name: string;
  branch_name_ar?: string;
  admin_username: string;
  owner_email?: string;
  admin_full_name: string;
  admin_full_name_ar?: string;
  admin_password: string;
}

export interface CloudRemoteConfig {
  status: string;
  expires_at?: string;
  announcement?: string;
  announcement_type?: string;
}

export interface ActivateLicenseCloudData {
  key: string;
  email: string;
  password: string;
  pharmacy_name: string;
}

export interface ActivateLicenseCloudResult {
  sync_token: string;
  tenant_id: string;
  expires_at?: string;
  plan: string;
  max_users: number;
  max_branches: number;
}

export interface RenewLicenseCloudData {
  key: string;
}

export interface RenewLicenseCloudResult {
  ok: boolean;
  expires_at?: string;
  plan: string;
  max_users: number;
  max_branches: number;
}

export interface AssetCategory {
  id: string;
  name: string;
  name_ar?: string;
  useful_life_years: number;
  depreciation_method: 'straight_line' | 'declining_balance';
  salvage_rate: number;
}

export interface AssetCategoryData {
  name: string;
  name_ar?: string;
  useful_life_years: number;
  depreciation_method: 'straight_line' | 'declining_balance';
  salvage_rate: number;
}

export interface AssetRow {
  id: string;
  name: string;
  name_ar?: string;
  asset_code?: string;
  serial_number?: string;
  category_id?: string;
  category_name?: string;
  purchase_date: string;
  purchase_cost: number;
  salvage_value: number;
  useful_life_years: number;
  depreciation_method: 'straight_line' | 'declining_balance';
  status: 'active' | 'disposed' | 'written_off';
  disposal_date?: string;
  disposal_value?: number;
  notes?: string;
  current_nbv: number;
  total_depreciated: number;
  created_at: string;
}

export interface AssetData {
  name: string;
  name_ar?: string;
  asset_code?: string;
  serial_number?: string;
  category_id?: string;
  branch_id: string;
  purchase_date: string;
  purchase_cost: number;
  salvage_value: number;
  useful_life_years: number;
  depreciation_method: 'straight_line' | 'declining_balance';
  notes?: string;
  created_by?: string;
}

export interface DisposeAssetData {
  disposal_date: string;
  disposal_value: number;
  write_off: boolean;
}

export interface DepreciationEntry {
  id: string;
  asset_id: string;
  asset_name: string;
  period_year: number;
  period_month: number;
  opening_nbv: number;
  depreciation: number;
  closing_nbv: number;
  created_at: string;
}

export interface DepreciationRunResult {
  processed: number;
  total_depreciation: number;
  entries: DepreciationEntry[];
}

export interface AssetSummary {
  total_assets: number;
  active_assets: number;
  total_purchase_cost: number;
  total_nbv: number;
  total_depreciated: number;
  disposed_this_year: number;
}

// Pharmacy switcher types for multi-pharmacy admin mode
export interface PharmacyConfig {
  id: string;
  tenant_id: string;
  name: string;
  name_ar?: string;
  cloud_endpoint: string;
  cloud_token: string;
  data_dir: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

export interface PharmacyConfigInput {
  tenant_id: string;
  name: string;
  name_ar?: string;
  cloud_endpoint: string;
  cloud_token: string;
}
