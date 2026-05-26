use serde::{Deserialize, Serialize};
use tauri::State;
use argon2::{Argon2, PasswordHash, PasswordVerifier};
use rusqlite::params;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::path::Path;
use std::sync::OnceLock;

use crate::db::Database;
use crate::commands::session_state::{AuthSession, AuthSessionState, resolve_identity};
use crate::commands::guard;

type HmacSha256 = Hmac<Sha256>;

static TOKEN_SECRET: OnceLock<Vec<u8>> = OnceLock::new();

pub fn init_token_secret(app_data_dir: &Path) {
    let secret = if let Ok(val) = std::env::var("PMS_TOKEN_SECRET") {
        let v = val.trim().to_string();
        if !v.is_empty() {
            v.into_bytes()
        } else {
            load_or_generate_token_secret(app_data_dir)
        }
    } else {
        load_or_generate_token_secret(app_data_dir)
    };
    TOKEN_SECRET.set(secret).ok();
}

fn load_or_generate_token_secret(app_data_dir: &Path) -> Vec<u8> {
    let secret_file = app_data_dir.join("token_secret.key");
    if let Ok(bytes) = std::fs::read(&secret_file) {
        if bytes.len() >= 32 {
            return bytes;
        }
    }
    use aes_gcm::aead::rand_core::{OsRng, RngCore};
    let mut secret = vec![0u8; 32];
    OsRng.fill_bytes(&mut secret);
    std::fs::write(&secret_file, &secret).expect("فشل حفظ المفتاح السري للرموز");
    secret
}

fn get_token_secret() -> &'static [u8] {
    TOKEN_SECRET
        .get()
        .expect("لم يتم تهيئة المفتاح السري للرموز — استدع init_token_secret أولاً")
        .as_slice()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserInfo {
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
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RoleInfo {
    pub id: String,
    pub tenant_id: String,
    pub name: String,
    pub name_ar: Option<String>,
    pub is_system: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PermissionEntry {
    pub resource: String,
    pub level: String, // "read" | "write"
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginResponse {
    pub user: UserInfo,
    pub role: RoleInfo,
    pub permissions: Vec<PermissionEntry>,
    pub token: String,
}

fn generate_token(user_id: &str) -> Result<String, String> {
    let secret = get_token_secret();
    let expiry = chrono::Utc::now().timestamp() + 2_592_000; // 30 days
    let payload = format!("{}:{}", user_id, expiry);
    let mut mac = HmacSha256::new_from_slice(secret)
        .map_err(|e| e.to_string())?;
    mac.update(payload.as_bytes());
    let sig = hex::encode(mac.finalize().into_bytes());
    Ok(format!("{}.{}", payload, sig))
}

fn verify_token(token: &str) -> Result<String, String> {
    let secret = get_token_secret();
    let parts: Vec<&str> = token.rsplitn(2, '.').collect();
    if parts.len() != 2 {
        return Err("تنسيق الرمز غير صالح".into());
    }
    let sig = parts[0];
    let payload = parts[1];

    let mut mac = HmacSha256::new_from_slice(secret)
        .map_err(|e| e.to_string())?;
    mac.update(payload.as_bytes());
    let expected_sig = hex::encode(mac.finalize().into_bytes());

    if sig != expected_sig {
        return Err("توقيع الرمز غير صالح".into());
    }

    let parts: Vec<&str> = payload.split(':').collect();
    if parts.len() != 2 {
        return Err("حمولة الرمز غير صالحة".into());
    }

    let expiry: i64 = parts[1].parse().map_err(|_| "تاريخ انتهاء غير صالح")?;
    if chrono::Utc::now().timestamp() > expiry {
        return Err("انتهت صلاحية الرمز".into());
    }

    Ok(parts[0].to_string())
}

fn get_role_permissions_from_db(conn: &rusqlite::Connection, role_id: &str) -> Result<Vec<PermissionEntry>, String> {
    let mut stmt = conn
        .prepare("SELECT resource, level FROM role_permissions WHERE role_id = ?1 AND level IN ('read','write')")
        .map_err(|e| e.to_string())?;
    let perms: Vec<PermissionEntry> = stmt
        .query_map(params![role_id], |row| {
            Ok(PermissionEntry { resource: row.get(0)?, level: row.get(1)? })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(perms)
}

fn get_user_permissions(db: &Database, user_id: &str) -> Result<Vec<PermissionEntry>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let role_id: String = conn
        .query_row(
            "SELECT role_id FROM users WHERE id = ?1 AND deleted_at IS NULL",
            params![user_id],
            |row| row.get(0),
        )
        .map_err(|_| "المستخدم غير موجود".to_string())?;

    let mut perms = get_role_permissions_from_db(&conn, &role_id)?;

    // Apply user_permission_overrides: replace role level with override level,
    // or remove the entry when override level is 'none'.
    let mut stmt = conn
        .prepare("SELECT resource, level FROM user_permission_overrides WHERE user_id = ?1")
        .map_err(|e| e.to_string())?;
    let overrides: Vec<(String, String)> = stmt
        .query_map(params![user_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    for (resource, level) in overrides {
        match level.as_str() {
            "none" => perms.retain(|p| p.resource != resource),
            "read" | "write" => {
                if let Some(entry) = perms.iter_mut().find(|p| p.resource == resource) {
                    entry.level = level;
                } else {
                    perms.push(PermissionEntry { resource, level });
                }
            }
            _ => {}
        }
    }

    Ok(perms)
}

#[tauri::command]
pub fn login(
    db: State<'_, Database>,
    username: String,
    password: String,
    tenant_id: String,
    auth_session_state: State<'_, AuthSessionState>,
) -> Result<LoginResponse, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT u.id, u.tenant_id, u.branch_id, u.role_id, u.username,
                    u.password_hash, u.full_name, u.full_name_ar, u.phone,
                    u.is_active, u.last_login_at, u.created_at, u.updated_at,
                    r.id, r.tenant_id, r.name, r.name_ar, r.is_system
             FROM users u
             JOIN roles r ON u.role_id = r.id
             WHERE u.tenant_id = ?1 AND u.username = ?2 AND u.deleted_at IS NULL",
        )
        .map_err(|e| e.to_string())?;

    let result = stmt.query_row(params![tenant_id, username], |row| {
        Ok((
            UserInfo {
                id: row.get(0)?,
                tenant_id: row.get(1)?,
                branch_id: row.get(2)?,
                role_id: row.get(3)?,
                username: row.get(4)?,
                full_name: row.get(6)?,
                full_name_ar: row.get(7)?,
                phone: row.get(8)?,
                is_active: row.get(9)?,
                last_login_at: row.get(10)?,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            },
            row.get::<_, String>(5)?,
            RoleInfo {
                id: row.get(13)?,
                tenant_id: row.get(14)?,
                name: row.get(15)?,
                name_ar: row.get(16)?,
                is_system: row.get(17)?,
                created_at: None,
                updated_at: None,
            },
        ))
    });

    let (user, password_hash, role) = match result {
        Ok(data) => data,
        Err(_) => return Err("بيانات الدخول غير صحيحة".into()),
    };

    if !user.is_active {
        return Err("بيانات الدخول غير صحيحة".into());
    }

    let parsed_hash = PasswordHash::new(&password_hash)
        .map_err(|_| "بيانات الدخول غير صحيحة".to_string())?;
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .map_err(|_| "بيانات الدخول غير صحيحة".to_string())?;

    let _ = conn.execute(
        "UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
        params![user.id],
    );

    drop(stmt);
    drop(conn);

    let token = generate_token(&user.id)?;
    let permissions = get_user_permissions(&db, &user.id)?;

    auth_session_state.set(AuthSession {
        user_id: user.id.clone(),
        tenant_id: user.tenant_id.clone(),
        branch_id: user.branch_id.clone().unwrap_or_default(),
        role_name: role.name.clone(),
        username: user.username.clone(),
    }).ok();

    Ok(LoginResponse {
        user,
        role,
        permissions,
        token,
    })
}

#[tauri::command]
pub fn get_current_user(
    db: State<'_, Database>,
    token: String,
) -> Result<UserInfo, String> {
    let user_id = verify_token(&token)?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, tenant_id, branch_id, role_id, username, full_name,
                full_name_ar, phone, is_active, last_login_at, created_at, updated_at
         FROM users WHERE id = ?1 AND deleted_at IS NULL",
        params![user_id],
        |row| {
            Ok(UserInfo {
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
            })
        },
    )
    .map_err(|_| "المستخدم غير موجود".into())
}

#[tauri::command]
pub fn clear_auth_session(
    auth_session_state: State<'_, AuthSessionState>,
) -> Result<(), String> {
    auth_session_state.clear()
}

/// Re-fetch user, role, and permissions for an existing token.
///
/// Frontend calls this on app start to overwrite the localStorage-cached
/// AuthState. Without this, any permission added by a migration (e.g.
/// `dashboard.view` introduced in TASK-925) is invisible to users until
/// they explicitly log out and log back in. Also re-populates the in-memory
/// AuthSessionState so backend commands that call `auth_session.get()` work
/// across app restarts.
#[tauri::command]
pub fn refresh_session(
    db: State<'_, Database>,
    token: String,
    auth_session_state: State<'_, AuthSessionState>,
) -> Result<LoginResponse, String> {
    let user_id = verify_token(&token)?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let row = conn.query_row(
        "SELECT u.id, u.tenant_id, u.branch_id, u.role_id, u.username,
                u.full_name, u.full_name_ar, u.phone, u.is_active,
                u.last_login_at, u.created_at, u.updated_at,
                r.id, r.tenant_id, r.name, r.name_ar, r.is_system
         FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE u.id = ?1 AND u.deleted_at IS NULL",
        params![user_id],
        |row| {
            Ok((
                UserInfo {
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
                },
                RoleInfo {
                    id: row.get(12)?,
                    tenant_id: row.get(13)?,
                    name: row.get(14)?,
                    name_ar: row.get(15)?,
                    is_system: row.get(16)?,
                    created_at: None,
                    updated_at: None,
                },
            ))
        },
    ).map_err(|_| "المستخدم غير موجود".to_string())?;

    let (user, role) = row;
    if !user.is_active {
        return Err("الحساب معطل".into());
    }

    drop(conn);

    let permissions = get_user_permissions(&db, &user.id)?;

    auth_session_state.set(AuthSession {
        user_id: user.id.clone(),
        tenant_id: user.tenant_id.clone(),
        branch_id: user.branch_id.clone().unwrap_or_default(),
        role_name: role.name.clone(),
        username: user.username.clone(),
    }).ok();

    Ok(LoginResponse { user, role, permissions, token })
}

#[tauri::command]
pub fn check_permission(
    db: State<'_, Database>,
    token: String,
    feature: String,
) -> Result<bool, String> {
    let user_id = verify_token(&token)?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let result = guard::require_access(&conn, &user_id, &feature, guard::Level::Read);
    match result {
        Ok(()) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub fn reset_admin_password(
    db: State<'_, Database>,
    new_password: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<String, String> {
    if !cfg!(debug_assertions) {
        return Err("هذا الأمر متاح في بيئة التطوير فقط".into());
    }
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, "", "", "")?;
    use argon2::{password_hash::SaltString, PasswordHasher};

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let admin_id: String = conn
        .query_row(
            "SELECT id FROM users WHERE username = 'admin' AND deleted_at IS NULL ORDER BY created_at LIMIT 1",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "المستخدم المسؤول غير موجود".to_string())?;

    let salt = SaltString::from_b64(&uuid::Uuid::new_v4().to_string().replace("-", ""))
        .map_err(|e| format!("فشل إنشاء الملح: {}", e))?;
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(new_password.as_bytes(), &salt)
        .map_err(|e| format!("فشل تشفير كلمة المرور: {}", e))?
        .to_string();

    conn.execute(
        "UPDATE users SET password_hash = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![&password_hash, &admin_id],
    ).map_err(|e| format!("فشل تحديث كلمة المرور: {}", e))?;

    Ok(format!("تم إعادة تعيين كلمة مرور المسؤول بنجاح للمستخدم {}", admin_id))
}
