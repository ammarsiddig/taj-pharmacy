use serde::{Deserialize, Serialize};
use tauri::State;
use argon2::{Argon2, PasswordHash, PasswordVerifier};
use rusqlite::params;
use hmac::{Hmac, Mac};
use sha2::Sha256;

use crate::db::Database;

type HmacSha256 = Hmac<Sha256>;
// TODO(Phase 3): derive TOKEN_SECRET from a per-installation secret stored in
// the OS keychain (e.g. tauri-plugin-stronghold or Windows DPAPI) so that
// tokens from one installation cannot be replayed on another machine.
const TOKEN_SECRET: &[u8] = b"pms-pharmacy-secret-key-change-in-production";

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
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginResponse {
    pub user: UserInfo,
    pub role: RoleInfo,
    pub permissions: Vec<String>,
    pub token: String,
}

fn generate_token(user_id: &str) -> Result<String, String> {
    let expiry = chrono::Utc::now().timestamp() + 2_592_000; // 30 days
    let payload = format!("{}:{}", user_id, expiry);
    let mut mac = HmacSha256::new_from_slice(TOKEN_SECRET)
        .map_err(|e| e.to_string())?;
    mac.update(payload.as_bytes());
    let sig = hex::encode(mac.finalize().into_bytes());
    Ok(format!("{}.{}", payload, sig))
}

fn verify_token(token: &str) -> Result<String, String> {
    let parts: Vec<&str> = token.rsplitn(2, '.').collect();
    if parts.len() != 2 {
        return Err("Invalid token format".into());
    }
    let sig = parts[0];
    let payload = parts[1];

    let mut mac = HmacSha256::new_from_slice(TOKEN_SECRET)
        .map_err(|e| e.to_string())?;
    mac.update(payload.as_bytes());
    let expected_sig = hex::encode(mac.finalize().into_bytes());

    if sig != expected_sig {
        return Err("Invalid token signature".into());
    }

    let parts: Vec<&str> = payload.split(':').collect();
    if parts.len() != 2 {
        return Err("Invalid token payload".into());
    }

    let expiry: i64 = parts[1].parse().map_err(|_| "Invalid expiry")?;
    if chrono::Utc::now().timestamp() > expiry {
        return Err("Token expired".into());
    }

    Ok(parts[0].to_string())
}

fn get_role_default_permissions(role_name: &str) -> Vec<String> {
    match role_name {
        "owner" => vec![
            "pos", "products", "products.create", "products.edit", "products.delete",
            "purchases", "warehouse", "sales", "expenses", "customers", "suppliers",
            "accounts", "reports", "settings", "settings.users", "settings.license",
        ],
        "manager" => vec![
            "pos", "products", "products.create", "products.edit", "products.delete",
            "purchases", "warehouse", "sales", "expenses", "customers", "suppliers",
            "accounts", "reports", "settings",
        ],
        "pharmacist" => vec![
            "pos", "products", "warehouse", "purchases", "reports",
        ],
        "cashier" => vec!["pos"],
        _ => vec![],
    }
    .into_iter()
    .map(String::from)
    .collect()
}

fn get_user_permissions(db: &Database, user_id: &str, role_name: &str) -> Result<Vec<String>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Get user-specific overrides
    let mut stmt = conn
        .prepare("SELECT feature, allowed FROM permissions WHERE user_id = ?1 AND deleted_at IS NULL")
        .map_err(|e| e.to_string())?;

    let overrides: Vec<(String, bool)> = stmt
        .query_map(params![user_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, bool>(1)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    if overrides.is_empty() {
        return Ok(get_role_default_permissions(role_name));
    }

    let mut perms = get_role_default_permissions(role_name);
    for (feature, allowed) in overrides {
        if allowed && !perms.contains(&feature) {
            perms.push(feature);
        } else if !allowed {
            perms.retain(|p| p != &feature);
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
            row.get::<_, String>(5)?, // password_hash
            RoleInfo {
                id: row.get(13)?,
                tenant_id: row.get(14)?,
                name: row.get(15)?,
                name_ar: row.get(16)?,
                is_system: row.get(17)?,
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

    // Verify password
    let parsed_hash = PasswordHash::new(&password_hash)
        .map_err(|_| "بيانات الدخول غير صحيحة".to_string())?;
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .map_err(|_| "بيانات الدخول غير صحيحة".to_string())?;

    // Update last_login_at
    let _ = conn.execute(
        "UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
        params![user.id],
    );

    // Drop conn and stmt to release the lock before calling get_user_permissions
    drop(stmt);
    drop(conn);

    let token = generate_token(&user.id)?;
    let permissions = get_user_permissions(&db, &user.id, &role.name)?;

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
    .map_err(|_| "User not found".into())
}

#[tauri::command]
pub fn check_permission(
    db: State<'_, Database>,
    token: String,
    feature: String,
) -> Result<bool, String> {
    let user_id = verify_token(&token)?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Get user's role name
    let role_name: String = conn
        .query_row(
            "SELECT r.name FROM users u JOIN roles r ON u.role_id = r.id
             WHERE u.id = ?1 AND u.deleted_at IS NULL",
            params![user_id],
            |row| row.get(0),
        )
        .map_err(|_| "User not found".to_string())?;

    drop(conn);

    let permissions = get_user_permissions(&db, &user_id, &role_name)?;
    Ok(permissions.contains(&feature))
}

// Emergency password reset — blocked in release builds at runtime.
#[tauri::command]
pub fn reset_admin_password(
    db: State<'_, Database>,
    new_password: String,
) -> Result<String, String> {
    if !cfg!(debug_assertions) {
        return Err("هذا الأمر متاح في بيئة التطوير فقط".into());
    }
    use argon2::{password_hash::SaltString, PasswordHasher};

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Find admin user
    let admin_id: String = conn
        .query_row(
            "SELECT id FROM users WHERE username = 'admin' AND deleted_at IS NULL ORDER BY created_at LIMIT 1",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "Admin user not found".to_string())?;

    // Hash new password using Argon2 with random salt
    let salt = SaltString::from_b64(&uuid::Uuid::new_v4().to_string().replace("-", ""))
        .map_err(|e| format!("Failed to create salt: {}", e))?;
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(new_password.as_bytes(), &salt)
        .map_err(|e| format!("Failed to hash password: {}", e))?
        .to_string();

    // Update password
    conn.execute(
        "UPDATE users SET password_hash = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![&password_hash, &admin_id],
    ).map_err(|e| format!("Failed to update password: {}", e))?;

    Ok(format!("Admin password reset successfully for user {}", admin_id))
}
