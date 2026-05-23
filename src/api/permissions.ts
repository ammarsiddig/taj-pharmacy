import { invoke } from '../lib/tauri';
import { getTenantId } from '../api/core';

export interface PermissionEntry {
  resource: string;
  level: string;
}

export interface RoleWithPermissions {
  role: {
    id: string;
    tenant_id: string;
    name: string;
    name_ar?: string;
    is_system: boolean;
    created_at?: string;
    updated_at?: string;
  };
  permissions: PermissionEntry[];
}

export interface SaveRoleData {
  id?: string;
  name: string;
  name_ar?: string;
  permissions: PermissionEntry[];
}

export interface AssignRoleData {
  user_id: string;
  role_id: string;
  home_branch_id?: string;
  see_all_branches?: boolean;
}

export interface SetUserOverridesData {
  user_id: string;
  overrides: PermissionEntry[];
}

export async function listRoles(): Promise<RoleWithPermissions[]> {
  return invoke('list_roles', { tenantId: getTenantId() });
}

export async function saveRole(userId: string, data: SaveRoleData): Promise<RoleWithPermissions> {
  return invoke('save_role', { tenantId: getTenantId(), userId, data });
}

export async function deleteRole(userId: string, roleId: string): Promise<void> {
  return invoke('delete_role', { tenantId: getTenantId(), userId, roleId });
}

export async function assignUserRole(actorId: string, data: AssignRoleData): Promise<void> {
  return invoke('assign_user_role', { tenantId: getTenantId(), userId: data.user_id, actorId, data });
}

export async function setUserOverrides(actorId: string, data: SetUserOverridesData): Promise<void> {
  return invoke('set_user_overrides', { tenantId: getTenantId(), actorId, data });
}
