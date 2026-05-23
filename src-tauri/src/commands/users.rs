use serde::{Deserialize, Serialize};
use tauri::State;
use rusqlite::params;
use uuid::Uuid;
use argon2::{Argon2, PasswordHasher, password_hash::{SaltString, rand_core::OsRng}};
use std::collections::HashMap;

use crate::db::Database;
use crate::commands::auth::RoleInfo;
use crate::commands::license_guard;
use crate::commands::audit;
use crate::commands::guard;
use crate::commands::session_state::{AuthSessionState, resolve_identity};

#[derive(Debug, Serialize, Deserialize)]
pub struct UserWithRole {
    pub id: String,
    pub tenant_id: String,
    pub branch_id: Option<String>,
    pub role_id: String,
    pub username: String,
    pub full_name: String,
    pub full_name_ar: Option<String>,
    pub phone: Option<String>,
    pub is_active: bool,
    pub last_login_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub role: Option<RoleInfo>,
    pub branch: Option<BranchInfo>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BranchInfo {
    pub id: String,
    pub tenant_id: String,
    pub name: String,
    pub name_ar: Option<String>,
    pub is_main: bool,
    pub is_active: bool,
}

#[derive(Debug, Deserialize)]
pub struct UserData {
    pub full_name: String,
    pub full_name_ar: Option<String>,
    pub username: String,
    pub password: Option<String>,
    pub role_id: String,
    pub branch_id: String,
    pub is_active: bool,
    pub permissions: Option<HashMap<String, bool>>,
}

#[tauri::command]
pub fn get_users(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<Vec<UserWithRole>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT u.id, u.tenant_id, u.branch_id, u.role_id, u.username,
                u.full_name, u.full_name_ar, u.phone, u.is_active,
                u.last_login_at, u.created_at, u.updated_at,
                r.id, r.tenant_id, r.name, r.name_ar, r.is_system,
                b.id, b.tenant_id, b.name, b.name_ar, b.is_main, b.is_active
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
         LEFT JOIN branches b ON u.branch_id = b.id
         WHERE u.tenant_id = ?1 AND u.deleted_at IS NULL
         ORDER BY u.created_at ASC"
    ).map_err(|e| e.to_string())?;

    let users = stmt.query_map(params![tenant_id], |row| {
        Ok(UserWithRole {
            id: row.get(0)?,
            tenant_id: row.get(1)?,
            branch_id: row.get(2)?,
            role_id: row.get(3)?,
            username: row.get(4)?,
            full_name: row.get(5)?,
            full_name_ar: row.get(6)?,
            phone: row.get(7)?,
            is_active: row.get(8)?,
            last_login_at: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
            role: row.get::<_, Option<String>>(12)?.map(|id| RoleInfo {
                id,
                tenant_id: row.get(13).unwrap_or_default(),
                name: row.get(14).unwrap_or_default(),
                name_ar: row.get(15).ok().flatten(),
                is_system: row.get(16).unwrap_or(false),
            }),
            branch: row.get::<_, Option<String>>(17)?.map(|id| BranchInfo {
                id,
                tenant_id: row.get(18).unwrap_or_default(),
                name: row.get(19).unwrap_or_default(),
                name_ar: row.get(20).ok().flatten(),
                is_main: row.get(21).unwrap_or(false),
                is_active: row.get(22).unwrap_or(true),
            }),
        })
    }).map_err(|e| e.to_string())?
      .filter_map(|r| r.ok())
      .collect();

    Ok(users)
}

#[tauri::command]
pub fn create_user(
    db: State<'_, Database>,
    tenant_id: String,
    actor_id: String,
    data: UserData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<UserWithRole, String> {
    if data.full_name.trim().is_empty() || data.username.trim().is_empty() {
        return Err("الاسم الكامل واسم المستخدم مطلوبان".into());
    }

    let password = data.password.as_deref().unwrap_or("");
    if password.is_empty() {
        return Err("كلمة المرور مطلوبة للمستخدمين الجدد".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &actor_id, "")?;
    license_guard::require_active(&conn, &tenant_id)?;
    guard::require_access(&conn, &actor_id, "settings.users", guard::Level::Write)?;
    license_guard::check_user_limit(&conn, &tenant_id)?;

    // Check username uniqueness
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM users WHERE tenant_id = ?1 AND username = ?2 AND deleted_at IS NULL)",
        params![tenant_id, data.username],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    if exists {
        return Err("اسم المستخدم موجود بالفعل".into());
    }

    let salt = SaltString::generate(&mut OsRng);
    let password_hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| format!("فشل تشفير كلمة المرور: {}", e))?
        .to_string();

    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO users (id, tenant_id, branch_id, role_id, username, password_hash, full_name, full_name_ar, is_active)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![id, tenant_id, data.branch_id, data.role_id, data.username, password_hash, data.full_name, data.full_name_ar, data.is_active as i32],
    ).map_err(|e| format!("فشل إنشاء المستخدم: {}", e))?;

    if let Some(ref perms) = data.permissions {
        for (feature, &allowed) in perms {
            let perm_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO permissions (id, tenant_id, user_id, feature, allowed)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![perm_id, tenant_id, id, feature, allowed as i32],
            ).map_err(|e| format!("فشل حفظ الصلاحية: {}", e))?;
        }
    }

    if let Err(e) = audit::log_action(&conn, &tenant_id, &actor_id, "create", "user", &id, None) {
        log::warn!("audit log failed after create_user: {}", e);
    }
    drop(conn);

    // Return the created user
    let users = get_users(db, tenant_id)?;
    users.into_iter().find(|u| u.id == id).ok_or("فشل جلب المستخدم المنشأ".into())
}

#[tauri::command]
pub fn update_user(
    db: State<'_, Database>,
    tenant_id: String,
    actor_id: String,
    user_id: String,
    data: UserData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<UserWithRole, String> {
    if data.full_name.trim().is_empty() || data.username.trim().is_empty() {
        return Err("الاسم الكامل واسم المستخدم مطلوبان".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &actor_id, "")?;
    guard::require_access(&conn, &actor_id, "settings.users", guard::Level::Write)?;

    // Check username uniqueness (exclude self)
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM users WHERE tenant_id = ?1 AND username = ?2 AND id != ?3 AND deleted_at IS NULL)",
        params![tenant_id, data.username, user_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    if exists {
        return Err("اسم المستخدم موجود بالفعل".into());
    }

    // Update base fields
    conn.execute(
        "UPDATE users SET
            full_name = ?3, full_name_ar = ?4, username = ?5,
            role_id = ?6, branch_id = ?7, is_active = ?8,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE tenant_id = ?1 AND id = ?2 AND deleted_at IS NULL",
        params![tenant_id, user_id, data.full_name, data.full_name_ar, data.username, data.role_id, data.branch_id, data.is_active as i32],
    ).map_err(|e| format!("فشل تحديث المستخدم: {}", e))?;

    // Update password if provided
    if let Some(ref password) = data.password {
        if !password.is_empty() {
            let salt = SaltString::generate(&mut OsRng);
            let password_hash = Argon2::default()
                .hash_password(password.as_bytes(), &salt)
                .map_err(|e| format!("فشل تشفير كلمة المرور: {}", e))?
                .to_string();

            conn.execute(
                "UPDATE users SET password_hash = ?3 WHERE tenant_id = ?1 AND id = ?2",
                params![tenant_id, user_id, password_hash],
            ).map_err(|e| format!("فشل تحديث كلمة المرور: {}", e))?;
        }
    }

    if let Some(ref perms) = data.permissions {
        conn.execute(
            "DELETE FROM permissions WHERE user_id = ?1",
            params![user_id],
        ).map_err(|e| e.to_string())?;
        for (feature, &allowed) in perms {
            let perm_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO permissions (id, tenant_id, user_id, feature, allowed)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![perm_id, tenant_id, user_id, feature, allowed as i32],
            ).map_err(|e| format!("فشل حفظ الصلاحية: {}", e))?;
        }
    }

    if let Err(e) = audit::log_action(&conn, &tenant_id, &actor_id, "update", "user", &user_id, None) {
        log::warn!("audit log failed after update_user: {}", e);
    }
    drop(conn);

    let users = get_users(db, tenant_id)?;
    users.into_iter().find(|u| u.id == user_id).ok_or("فشل جلب المستخدم المحدث".into())
}

#[tauri::command]
pub fn get_roles(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<Vec<RoleInfo>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, tenant_id, name, name_ar, is_system
         FROM roles WHERE tenant_id = ?1 AND deleted_at IS NULL ORDER BY name"
    ).map_err(|e| e.to_string())?;

    let roles = stmt.query_map(params![tenant_id], |row| {
        Ok(RoleInfo {
            id: row.get(0)?,
            tenant_id: row.get(1)?,
            name: row.get(2)?,
            name_ar: row.get(3)?,
            is_system: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?
      .filter_map(|r| r.ok())
      .collect();

    Ok(roles)
}

#[tauri::command]
pub fn get_branches(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<Vec<BranchInfo>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, tenant_id, name, name_ar, is_main, is_active
         FROM branches WHERE tenant_id = ?1 AND deleted_at IS NULL ORDER BY name"
    ).map_err(|e| e.to_string())?;

    let branches = stmt.query_map(params![tenant_id], |row| {
        Ok(BranchInfo {
            id: row.get(0)?,
            tenant_id: row.get(1)?,
            name: row.get(2)?,
            name_ar: row.get(3)?,
            is_main: row.get(4)?,
            is_active: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?
      .filter_map(|r| r.ok())
      .collect();

    Ok(branches)
}
