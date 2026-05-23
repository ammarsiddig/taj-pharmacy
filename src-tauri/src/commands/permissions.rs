use serde::{Deserialize, Serialize};
use tauri::State;
use rusqlite::params;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::auth::RoleInfo;
use crate::commands::guard;
use crate::commands::audit;
use crate::commands::session_state::{AuthSessionState, resolve_identity};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PermissionEntry {
    pub resource: String,
    pub level: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RoleWithPermissions {
    pub role: RoleInfo,
    pub permissions: Vec<PermissionEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveRoleData {
    pub id: Option<String>,
    pub name: String,
    pub name_ar: Option<String>,
    pub permissions: Vec<PermissionEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AssignRoleData {
    pub user_id: String,
    pub role_id: String,
    pub home_branch_id: Option<String>,
    pub see_all_branches: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SetUserOverridesData {
    pub user_id: String,
    pub overrides: Vec<PermissionEntry>,
}

#[tauri::command]
pub fn list_roles(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<Vec<RoleWithPermissions>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, tenant_id, name, name_ar, is_system, created_at, updated_at
             FROM roles WHERE tenant_id = ?1 AND deleted_at IS NULL ORDER BY is_system DESC, name ASC",
        )
        .map_err(|e| e.to_string())?;

    let roles: Vec<RoleInfo> = stmt
        .query_map(params![tenant_id], |row| {
            Ok(RoleInfo {
                id: row.get(0)?,
                tenant_id: row.get(1)?,
                name: row.get(2)?,
                name_ar: row.get(3)?,
                is_system: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut result = Vec::new();
    for role in roles {
        let mut pstmt = conn
            .prepare("SELECT resource, level FROM role_permissions WHERE role_id = ?1 ORDER BY resource")
            .map_err(|e| e.to_string())?;
        let perms: Vec<PermissionEntry> = pstmt
            .query_map(params![role.id], |row| {
                Ok(PermissionEntry {
                    resource: row.get(0)?,
                    level: row.get(1)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        result.push(RoleWithPermissions { role, permissions: perms });
    }
    Ok(result)
}

#[tauri::command]
pub fn save_role(
    db: State<'_, Database>,
    tenant_id: String,
    user_id: String,
    data: SaveRoleData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<RoleWithPermissions, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, "")?;

    guard::require_access(&conn, &user_id, "settings.users", guard::Level::Write)?;

    let role_id = if let Some(ref existing_id) = data.id {
        let is_system: bool = conn
            .query_row(
                "SELECT is_system FROM roles WHERE id = ?1 AND tenant_id = ?2",
                params![existing_id, tenant_id],
                |row| row.get(0),
            )
            .map_err(|_| "الدور غير موجود".to_string())?;

        let old_name: String = conn
            .query_row(
                "SELECT name FROM roles WHERE id = ?1",
                params![existing_id],
                |row| row.get(0),
            )
            .unwrap_or_default();

        conn.execute(
            "UPDATE roles SET name = ?1, name_ar = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?3",
            params![data.name, data.name_ar, existing_id],
        )
        .map_err(|e| e.to_string())?;

        // Remove old permissions, re-insert new ones
        conn.execute(
            "DELETE FROM role_permissions WHERE role_id = ?1",
            params![existing_id],
        )
        .map_err(|e| e.to_string())?;

        // Invalidate sessions for all users with this role
        conn.execute(
            "UPDATE users SET session_token_invalidated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE role_id = ?1",
            params![existing_id],
        )
        .ok();

        // Audit
        let _ = audit::log_action(
            &conn,
            &tenant_id,
            &user_id,
            "role.update",
            "role",
            existing_id,
            Some(&format!("{{\"old_name\":\"{}\",\"new_name\":\"{}\",\"is_system\":{}}}", old_name, data.name, is_system)),
        );

        existing_id.clone()
    } else {
        let new_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO roles (id, tenant_id, name, name_ar, is_system, is_active) VALUES (?1, ?2, ?3, ?4, 0, 1)",
            params![new_id, tenant_id, data.name, data.name_ar],
        )
        .map_err(|e| e.to_string())?;

        audit::log_action(
            &conn,
            &tenant_id,
            &user_id,
            "role.create",
            "role",
            &new_id,
            Some(&format!("{{\"name\":\"{}\"}}", data.name)),
        );

        new_id
    };

    // Insert permissions
    for perm in &data.permissions {
        conn.execute(
            "INSERT OR REPLACE INTO role_permissions (role_id, resource, level) VALUES (?1, ?2, ?3)",
            params![role_id, perm.resource, perm.level],
        )
        .map_err(|e| e.to_string())?;
    }

    // Read back
    let role = conn
        .query_row(
            "SELECT id, tenant_id, name, name_ar, is_system, created_at, updated_at FROM roles WHERE id = ?1",
            params![role_id],
            |row| {
                Ok(RoleInfo {
                    id: row.get(0)?,
                    tenant_id: row.get(1)?,
                    name: row.get(2)?,
                    name_ar: row.get(3)?,
                    is_system: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    let mut pstmt = conn
        .prepare("SELECT resource, level FROM role_permissions WHERE role_id = ?1 ORDER BY resource")
        .map_err(|e| e.to_string())?;
    let perms: Vec<PermissionEntry> = pstmt
        .query_map(params![role_id], |row| {
            Ok(PermissionEntry { resource: row.get(0)?, level: row.get(1)? })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(RoleWithPermissions { role, permissions: perms })
}

#[tauri::command]
pub fn delete_role(
    db: State<'_, Database>,
    tenant_id: String,
    user_id: String,
    role_id: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, "")?;

    guard::require_access(&conn, &user_id, "settings.users", guard::Level::Write)?;

    let is_system: bool = conn
        .query_row(
            "SELECT is_system FROM roles WHERE id = ?1 AND tenant_id = ?2",
            params![role_id, tenant_id],
            |row| row.get(0),
        )
        .map_err(|_| "الدور غير موجود".to_string())?;

    if is_system {
        return Err("أدوار النظام لا يمكن حذفها — يمكن تعديلها فقط".to_string());
    }

    let user_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE role_id = ?1 AND deleted_at IS NULL",
            params![role_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if user_count > 0 {
        return Err("لا يمكن حذف الدور — يوجد مستخدمون مرتبطون به".to_string());
    }

    conn.execute(
        "DELETE FROM role_permissions WHERE role_id = ?1",
        params![role_id],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE roles SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
        params![role_id],
    )
    .map_err(|e| e.to_string())?;

    audit::log_action(
        &conn,
        &tenant_id,
        &user_id,
        "role.delete",
        "role",
        &role_id,
        Some("{}"),
    );

    Ok(())
}

#[tauri::command]
pub fn assign_user_role(
    db: State<'_, Database>,
    tenant_id: String,
    _user_id: String,
    actor_id: String,
    data: AssignRoleData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &actor_id, "")?;

    guard::require_access(&conn, &actor_id, "settings.users", guard::Level::Write)?;

    let old_role_id: String = conn
        .query_row(
            "SELECT role_id FROM users WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
            params![data.user_id, tenant_id],
            |row| row.get(0),
        )
        .map_err(|_| "المستخدم غير موجود".to_string())?;

    conn.execute(
        "UPDATE users SET role_id = ?1, home_branch_id = COALESCE(?2, home_branch_id), see_all_branches = COALESCE(?3, see_all_branches), session_token_invalidated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?4",
        params![
            data.role_id,
            data.home_branch_id,
            data.see_all_branches.map(|v| v as i64),
            data.user_id,
        ],
    )
    .map_err(|e| e.to_string())?;

    audit::log_action(
        &conn,
        &tenant_id,
        &actor_id,
        "user.role_assigned",
        "user",
        &data.user_id,
        Some(&format!("{{\"old_role_id\":\"{}\",\"new_role_id\":\"{}\"}}", old_role_id, data.role_id)),
    );

    Ok(())
}

#[tauri::command]
pub fn set_user_overrides(
    db: State<'_, Database>,
    tenant_id: String,
    actor_id: String,
    data: SetUserOverridesData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &actor_id, "")?;

    guard::require_access(&conn, &actor_id, "settings.users", guard::Level::Write)?;

    // Remove existing overrides
    conn.execute(
        "DELETE FROM user_permission_overrides WHERE user_id = ?1",
        params![data.user_id],
    )
    .map_err(|e| e.to_string())?;

    // Insert new overrides
    for perm in &data.overrides {
        conn.execute(
            "INSERT INTO user_permission_overrides (user_id, resource, level) VALUES (?1, ?2, ?3)",
            params![data.user_id, perm.resource, perm.level],
        )
        .map_err(|e| e.to_string())?;
    }

    // Invalidate user session
    conn.execute(
        "UPDATE users SET session_token_invalidated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
        params![data.user_id],
    )
    .map_err(|e| e.to_string())?;

    audit::log_action(
        &conn,
        &tenant_id,
        &actor_id,
        "user.override_set",
        "user",
        &data.user_id,
        Some(&format!("{{\"overrides_count\":{}}}", data.overrides.len())),
    );

    Ok(())
}
