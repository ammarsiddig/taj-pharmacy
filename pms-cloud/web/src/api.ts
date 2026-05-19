const API_BASE = import.meta.env.VITE_API_URL || '';

/* ── Tenant auth (legacy sync_token OR JWT) ── */

const TOKEN_KEY = 'pms_token';
const JWT_KEY = 'pms_jwt';

function getToken(): string | null {
  // Prefer JWT (owner login), fall back to legacy sync token
  return localStorage.getItem(JWT_KEY) || localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function setJwt(token: string): void {
  localStorage.setItem(JWT_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(JWT_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

/* ── Admin auth ── */

function getAdminToken(): string | null {
  return sessionStorage.getItem('pms_admin_token');
}

export function setAdminToken(token: string): void {
  sessionStorage.setItem('pms_admin_token', token);
}

export function clearAdminToken(): void {
  sessionStorage.removeItem('pms_admin_token');
}

export function isAdminAuthenticated(): boolean {
  return !!getAdminToken();
}

/* ── Request helpers ── */

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (res.status === 401 || res.status === 403) {
    clearToken();
    window.location.reload();
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

async function adminRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAdminToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (res.status === 401 || res.status === 403) {
    clearAdminToken();
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

/* ── Types ── */

export interface DashboardData {
  tenant_id: string;
  sync: {
    first_seen_at: string | null;
    last_sync_at: string | null;
    total_syncs: number;
  };
  dashboard: {
    pharmacy_name: string;
    products_count: number;
    customers_count: number;
    suppliers_count: number;
    today_sales_count: number;
    today_sales_total: number;
    today_cash_sales: number;
    today_bank_sales: number;
    today_credit_sales: number;
    month_sales_count: number;
    month_sales_total: number;
    low_stock_count: number;
    out_of_stock_count: number;
    expiring_soon_count: number;
    total_receivables: number;
    total_payables: number;
    month_expenses_total: number;
    today_expenses_total: number;
    computed_at: string;
  } | null;
}

export interface ActivityItem {
  event_type: string;
  entity_type: string;
  entity_id: string;
  summary: string;
  occurred_at: string;
  received_at: string;
}

export interface ActivityResponse {
  tenant_id: string;
  activity: ActivityItem[];
}

export interface SyncStats {
  tenant_id: string;
  branch: string;
  first_seen_at: string | null;
  last_sync_at: string | null;
  minutes_since_sync: number;
  health: 'green' | 'yellow' | 'red';
  total_syncs: number;
  total_rows: number;
  today_events: number;
  tables: { table_name: string; row_count: number; last_sync_at: string | null }[];
}

export interface AdminTenant {
  id: string;
  first_seen_at: string | null;
  last_event_at: string | null;
  last_sync_at: string | null;
  total_events: number;
  total_syncs: number;
  active_tokens: number;
  pharmacy_name?: string;
  is_suspended?: boolean;
  expires_at?: string | null;
  owner_email?: string | null;
  current_plan?: string;
  suspended_at?: string | null;
  suspended_reason?: string | null;
}

export interface AdminStats {
  total_tenants: number;
  total_events: number;
  today_events: number;
  active_tenants: number;
  expiring_soon: number;
  expired_tenants: number;
}

export interface LicenseKey {
  key: string;
  tenant_id: string;
  status: string;
  expires_at: string | null;
  pharmacy_name: string | null;
  created_at: string;
}

export interface OwnerProduct {
  id: string;
  name: string;
  name_ar: string | null;
  barcode: string | null;
  category: string | null;
  sale_price: number;
  min_stock: number;
  current_stock: number;
  nearest_expiry: string | null;
  total_stock: number;
}

export interface OwnerSale {
  id: string;
  sale_number: string;
  customer_name: string | null;
  total: number;
  tax_amount: number;
  payment_method: string;
  payment_status: string;
  amount_paid: number;
  balance_due: number;
  cashier_name: string | null;
  is_return: boolean;
  created_at: string;
  items_count: number;
}

export interface BalanceEntry {
  id: string;
  name: string;
  name_ar?: string | null;
  phone: string | null;
  current_balance: number;
}

export interface AdminTenantDetail {
  tenant: AdminTenant;
  dashboard: DashboardData['dashboard'];
  recent_events: ActivityItem[];
  tokens: { token: string; label: string; is_active: number; created_at: string }[];
}

/* ── Tenant API Calls ── */

export interface DashboardTrendDay {
  date: string;
  total: number;
  cash: number;
  bank: number;
  credit: number;
}

export async function getDashboardTrend(branch?: string): Promise<{ days: DashboardTrendDay[] }> {
  const params = branch ? `?branch=${encodeURIComponent(branch)}` : '';
  return request(`/v1/dashboard/trend${params}`);
}

export async function getDashboard(branch?: string): Promise<DashboardData> {
  const params = branch ? `?branch=${encodeURIComponent(branch)}` : '';
  return request(`/v1/dashboard${params}`);
}

export async function getActivity(limit = 50, branch?: string): Promise<ActivityResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (branch) params.set('branch', branch);
  return request(`/v1/activity?${params}`);
}

export async function getSyncStats(branch?: string): Promise<SyncStats> {
  const params = branch ? `?branch=${encodeURIComponent(branch)}` : '';
  return request(`/v1/sync-stats${params}`);
}

export interface SupplierSummary {
  supplier_id: string;
  supplier_name: string;
  invoice_count: number;
  total_amount: number;
  total_paid: number;
  total_due: number;
}

export interface SupplierInvoice {
  id: string;
  supplier_id: string;
  supplier_name: string;
  invoice_number: string;
  invoice_date: string;
  status: string;
  payment_status: string;
  total: number;
  amount_paid: number;
  balance_due: number;
  created_at: string;
}

export interface SupplierAccountsData {
  suppliers: SupplierSummary[];
  invoices: SupplierInvoice[];
}

export async function getSupplierAccounts(branch?: string): Promise<SupplierAccountsData> {
  const params = branch ? `?branch=${encodeURIComponent(branch)}` : '';
  return request(`/v1/supplier-accounts${params}`);
}

export interface OwnerBranchesResponse {
  tenant_id: string;
  branches: { id: string; name: string | null }[];
}

export async function getOwnerBranches(): Promise<OwnerBranchesResponse> {
  return request('/v1/branches');
}

export interface SetBranchNameResult {
  branch_id: string;
  name: string;
}

export async function setBranchName(branchId: string, name: string): Promise<SetBranchNameResult> {
  return request(`/v1/branches/${encodeURIComponent(branchId)}/name`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}

export async function checkHealth(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

export async function validateToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/v1/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface OwnerLoginResult {
  token: string;
  tenant_id: string;
}

export async function ownerLogin(email: string, password: string): Promise<OwnerLoginResult> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.toLowerCase().trim(), password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Login failed: ${res.status}`);
  return body as OwnerLoginResult;
}

/* ── Admin API Calls ── */

export async function validateAdminToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/tenants`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listTenants(): Promise<{ tenants: AdminTenant[] }> {
  return adminRequest('/admin/tenants');
}

export async function createTenant(
  tenant_id: string,
  label: string,
): Promise<{ tenant_id: string; token: string; message: string }> {
  return adminRequest('/admin/tenants', {
    method: 'POST',
    body: JSON.stringify({ tenant_id, label }),
  });
}

export async function getTenantDetail(id: string): Promise<AdminTenantDetail> {
  return adminRequest(`/admin/tenant/${id}`);
}

export async function revokeToken(token: string): Promise<{ ok: boolean }> {
  return adminRequest(`/admin/tokens/${token}`, { method: 'DELETE' });
}

export async function generateToken(
  tenant_id: string,
  label: string,
): Promise<{ token: string; tenant_id: string }> {
  return adminRequest('/admin/tokens', {
    method: 'POST',
    body: JSON.stringify({ tenant_id, label }),
  });
}

export async function updateTenant(
  id: string,
  patch: { is_suspended?: boolean; expires_at?: string; pharmacy_name?: string },
): Promise<{ tenant: AdminTenant }> {
  return adminRequest(`/admin/tenants/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function deleteTenant(id: string): Promise<{ ok: boolean }> {
  return adminRequest(`/admin/tenants/${id}`, { method: 'DELETE' });
}

export async function getTenantLicenses(tenantId: string): Promise<{ keys: LicenseKey[] }> {
  return adminRequest(`/admin/tenants/${tenantId}/licenses`);
}

export async function createTenantLicense(
  tenantId: string,
  days: number,
): Promise<{ key: string; tenant_id: string; sync_token: string; expires_at: string }> {
  return adminRequest('/admin/licenses', {
    method: 'POST',
    body: JSON.stringify({ tenant_id: tenantId, expires_in_days: days }),
  });
}

export async function deleteLicense(key: string): Promise<{ ok: boolean }> {
  return adminRequest(`/admin/licenses/${encodeURIComponent(key)}`, { method: 'DELETE' });
}

export async function createOwnerAccount(
  tenantId: string,
  email: string,
  password: string,
): Promise<{ ok: boolean; email: string }> {
  return adminRequest(`/admin/tenants/${tenantId}/create-owner`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function sendAnnouncement(
  tenantId: string,
  message: string,
  type: 'info' | 'warning' | 'danger',
): Promise<{ ok: boolean }> {
  return adminRequest(`/admin/tenants/${tenantId}/announcement`, {
    method: 'POST',
    body: JSON.stringify({ message, type }),
  });
}

export async function getAdminStats(): Promise<AdminStats> {
  return adminRequest('/admin/stats');
}

export async function createLicense(
  pharmacyName: string,
  expiresInDays: number,
  tenantId?: string,
  plan = 'basic',
  maxUsers = 5,
  maxBranches = 3,
): Promise<{ key: string; tenant_id: string; expires_at: string }> {
  return adminRequest('/admin/licenses', {
    method: 'POST',
    body: JSON.stringify({
      pharmacy_name: pharmacyName,
      expires_in_days: expiresInDays,
      tenant_id: tenantId,
      plan,
      max_users: maxUsers,
      max_branches: maxBranches,
    }),
  });
}

export async function listLicenses(): Promise<{ keys: LicenseKey[] }> {
  return adminRequest('/admin/licenses');
}

export async function getOwnerProducts(
  branch?: string,
  search?: string,
  page = 1,
): Promise<{ products: OwnerProduct[]; total: number; page: number; limit: number }> {
  const params = new URLSearchParams({ page: String(page), limit: '50' });
  if (branch) params.set('branch', branch);
  if (search) params.set('search', search);
  return request(`/v1/products?${params}`);
}

export async function getOwnerSales(
  branch?: string,
  from?: string,
  to?: string,
  page = 1,
): Promise<{ sales: OwnerSale[]; total: number; grand_total: number; page: number; limit: number }> {
  const params = new URLSearchParams({ page: String(page), limit: '50' });
  if (branch) params.set('branch', branch);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return request(`/v1/sales?${params}`);
}

export async function getOwnerBalances(
  branch?: string,
): Promise<{ customers: BalanceEntry[]; suppliers: BalanceEntry[] }> {
  const params = branch ? `?branch=${branch}` : '';
  return request(`/v1/balances${params}`);
}

export interface SubscriptionInfo {
  status: 'active' | 'expiring' | 'expired' | 'suspended';
  expires_at: string | null;
  days_remaining: number | null;
  pharmacy_name: string | null;
  is_suspended: boolean;
}

export async function getSubscription(): Promise<SubscriptionInfo> {
  return request('/v1/subscription');
}

export async function renewTenant(
  tenantId: string,
  days: number,
): Promise<{ ok: boolean; expires_at: string; days_added: number }> {
  return adminRequest(`/admin/tenants/${tenantId}/renew`, {
    method: 'POST',
    body: JSON.stringify({ days }),
  });
}

// ─── Backups ────────────────────────────────────────────────────────────────

export interface BackupRow {
  id: string;
  file_size: number;
  created_at: string;
}

export interface BackupList {
  tenant_id: string;
  backups: BackupRow[];
}

export async function getBackups(): Promise<BackupList> {
  return request('/v1/backups');
}

export async function downloadBackup(id: string): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('غير مصرح');
  const res = await fetch(`${API_BASE}/v1/backups/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('فشل تحميل النسخة الاحتياطية');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup-${id.slice(0, 8)}.db`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function changePassword(current_password: string, new_password: string): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('غير مصرح');
  const res = await fetch(`${API_BASE}/auth/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ current_password, new_password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'فشل تغيير كلمة المرور');
  }
}

export async function updateTenantInfo(data: { pharmacy_name?: string }): Promise<void> {
  return request('/v1/tenants/me', { method: 'PATCH', body: JSON.stringify(data) });
}

// ─── Download ─────────────────────────────────────────────────────────────────

export interface LatestDownload {
  version: string;
  url: string;
  notes: string | null;
  published_at: string | null;
  source: 'github' | 'fallback';
}

export async function getLatestDownload(): Promise<LatestDownload> {
  const res = await fetch(`${API_BASE}/v1/download/latest`);
  return res.json();
}

// ─── Owner Accounts ─────────────────────────────────────────────────────────

export interface OwnerAccount {
  id: string;
  name: string;
  name_ar: string | null;
  account_type: string;
  current_balance: number;
  is_default: number;
  is_active: number;
  bank_provider: string | null;
  internal_fee: number;
  external_fee: number;
  phone_label: string | null;
}

export async function getOwnerAccounts(branch?: string): Promise<{ accounts: OwnerAccount[] }> {
  const params = branch ? `?branch=${branch}` : '';
  return request(`/v1/accounts${params}`);
}

export interface UserRow { id: string; branch_id: string | null; role_id: string; username: string; full_name: string; full_name_ar: string | null; phone: string | null; is_active: boolean; last_login_at: string | null; }
export async function getOwnerUsers(): Promise<{ tenant_id: string; users: UserRow[] }> {
  return request('/v1/users');
}

export interface BranchRow { id: string; name: string; name_ar: string | null; is_main: boolean; is_active: boolean; }
export async function getBranchFriendlyNames(): Promise<{ tenant_id: string; branches: BranchRow[] }> {
  return request('/v1/branches/friendly-names');
}
