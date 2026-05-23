export interface Tenant {
  id: string;
  tenant_id: string;
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
  subscription_plan: 'basic' | 'professional' | 'enterprise';
  subscription_status: 'active' | 'expired' | 'suspended';
  subscription_expiry?: string;
  max_branches: number;
  max_users: number;
  feature_flags: number;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  tenant_id: string;
  name: string;
  name_ar?: string;
  address?: string;
  phone?: string;
  is_main: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  tenant_id: string;
  name: string;
  name_ar?: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  tenant_id: string;
  branch_id?: string;
  role_id: string;
  username: string;
  full_name: string;
  full_name_ar?: string;
  phone?: string;
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
  home_branch_id?: string;
  see_all_branches?: boolean;
  role?: Role;
  branch?: Branch;
}

export interface Permission {
  id: string;
  tenant_id: string;
  user_id: string;
  feature: string;
  allowed: boolean;
}

export interface LoginResponse {
  user: User;
  role: Role;
  permissions: string[];
  token: string;
}

export interface AuthState {
  user: User | null;
  role: Role | null;
  permissions: string[];
  token: string | null;
  tenant_id: string;
  isAuthenticated: boolean;
}

export type UserFormData = {
  full_name: string;
  full_name_ar?: string;
  username: string;
  password?: string;
  role_id: string;
  branch_id: string;
  is_active: boolean;
  permissions?: Record<string, boolean>;
};
