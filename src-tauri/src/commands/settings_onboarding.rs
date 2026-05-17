use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Database;
use crate::commands::session_state::{AuthSessionState, resolve_identity};

const DEFAULT_CLOUD_ENDPOINT: &str = "https://pharmacy.taj.systems";

fn normalize_cloud_endpoint(endpoint: &str) -> String {
    let trimmed = endpoint.trim().trim_end_matches('/');
    match trimmed {
        "" => DEFAULT_CLOUD_ENDPOINT.to_string(),
        "http://178.104.158.147" | "https://178.104.158.147" | "http://taj.systems" => {
            DEFAULT_CLOUD_ENDPOINT.to_string()
        }
        _ => trimmed.to_string(),
    }
}

// ─── Onboarding ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct OnboardingStatus {
    pub completed: bool,
}

#[derive(Debug, Serialize)]
pub struct TenantIdentity {
    pub tenant_id: String,
    pub branch_id: String,
}

#[derive(Debug, Deserialize)]
pub struct OnboardingData {
    pub pharmacy_name: String,
    pub pharmacy_name_ar: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub license_number: Option<String>,
    pub currency_code: String,
    pub timezone: String,
    pub branch_name: String,
    pub branch_name_ar: Option<String>,
    pub admin_username: String,
    pub owner_email: Option<String>,
    pub admin_full_name: String,
    pub admin_full_name_ar: Option<String>,
    pub admin_password: String,
}

#[tauri::command]
pub fn get_db_tenant_id(db: State<'_, Database>) -> Result<TenantIdentity, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let tenant_id: String = conn
        .query_row("SELECT id FROM tenants LIMIT 1", [], |row| row.get(0))
        .unwrap_or_else(|_| "default-tenant".to_string());
    let branch_id: String = conn
        .query_row("SELECT id FROM branches WHERE tenant_id = ?1 AND is_main = 1 LIMIT 1",
            rusqlite::params![tenant_id], |row| row.get(0))
        .unwrap_or_else(|_| "main-branch".to_string());
    Ok(TenantIdentity { tenant_id, branch_id })
}

#[tauri::command]
pub fn check_onboarding(db: State<'_, Database>) -> Result<OnboardingStatus, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let completed: i64 = conn
        .query_row(
            "SELECT onboarding_completed FROM tenants LIMIT 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    Ok(OnboardingStatus { completed: completed == 1 })
}

#[tauri::command]
pub fn complete_onboarding(
    db: State<'_, Database>,
    data: OnboardingData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, "", "", "")?;
    use argon2::{password_hash::{SaltString, rand_core::OsRng}, Argon2, PasswordHasher};

    let username = data.admin_username.trim();
    let pharmacy_name = data.pharmacy_name.trim();
    let branch_name = data.branch_name.trim();
    let admin_full_name = data.admin_full_name.trim();

    if data.admin_password.len() < 6 {
        return Err("كلمة المرور يجب أن تكون 6 أحرف على الأقل".into());
    }
    if pharmacy_name.is_empty() {
        return Err("اسم الصيدلية مطلوب".into());
    }
    if branch_name.is_empty() {
        return Err("اسم الفرع الرئيسي مطلوب".into());
    }
    if username.is_empty() {
        return Err("اسم المستخدم مطلوب".into());
    }
    if admin_full_name.is_empty() {
        return Err("الاسم الكامل للمدير مطلوب".into());
    }
    if !data.admin_password.chars().any(|c| c.is_ascii_alphabetic())
        || !data.admin_password.chars().any(|c| c.is_ascii_digit())
    {
        return Err("كلمة المرور يجب أن تحتوي على حرف واحد ورقم واحد على الأقل".into());
    }

    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(data.admin_password.as_bytes(), &salt)
        .map_err(|e| format!("فشل تشفير كلمة المرور: {}", e))?
        .to_string();

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let tenant_id: String = conn
        .query_row("SELECT id FROM tenants LIMIT 1", [], |row| row.get(0))
        .map_err(|_| "لا يوجد مستأجر مسجل".to_string())?;
    let branch_id: String = conn
        .query_row("SELECT id FROM branches WHERE tenant_id = ?1 AND is_main = 1 LIMIT 1",
            params![tenant_id], |row| row.get(0))
        .map_err(|_| "لا يوجد فرع رئيسي مسجل".to_string())?;

    let username_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM users
             WHERE tenant_id = ?1
               AND id <> 'user-admin'
               AND deleted_at IS NULL
               AND username = ?2",
            params![tenant_id, username],
            |row| row.get(0),
        )
        .map_err(|e| format!("فشل التحقق من اسم المستخدم: {}", e))?;
    if username_exists > 0 {
        return Err("اسم المستخدم مستخدم بالفعل".into());
    }

    conn.execute(
        "UPDATE tenants SET
            name = ?1, name_ar = ?2, phone = ?3, address = ?4,
            license_number = ?5, currency_code = ?6, timezone = ?7,
            onboarding_completed = 1,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?8",
        params![
            pharmacy_name,
            data.pharmacy_name_ar,
            data.phone,
            data.address,
            data.license_number,
            data.currency_code,
            data.timezone,
            tenant_id,
        ],
    )
        .map_err(|e| format!("فشل تحديث المستأجر: {}", e))?;

    conn.execute(
        "UPDATE branches SET
            name = ?1, name_ar = ?2,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?3 AND tenant_id = ?4",
        params![branch_name, data.branch_name_ar, branch_id, tenant_id],
    )
        .map_err(|e| format!("فشل تحديث الفرع: {}", e))?;

    let email_normalized = data.owner_email
        .as_deref()
        .map(|e| e.trim().to_lowercase())
        .filter(|e| !e.is_empty());

    conn.execute(
        "UPDATE users SET
            username = ?1, full_name = ?2, full_name_ar = ?3,
            password_hash = ?4, email = ?5,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = 'user-admin' AND tenant_id = ?6",
        params![
            username,
            admin_full_name,
            data.admin_full_name_ar,
            password_hash,
            email_normalized,
            tenant_id,
        ],
    )
        .map_err(|e| format!("فشل تحديث المستخدم المسؤول: {}", e))?;

    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct ActivateLicenseCloudData {
    pub key: String,
    pub email: String,
    pub password: String,
    pub pharmacy_name: String,
}

#[derive(Debug, Serialize)]
pub struct ActivateLicenseCloudResult {
    pub sync_token: String,
    pub tenant_id: String,
    pub expires_at: Option<String>,
    pub plan: String,
    pub max_users: i64,
    pub max_branches: i64,
}

#[derive(Debug, Deserialize)]
pub struct RenewLicenseCloudData {
    pub key: String,
}

#[derive(Debug, Serialize)]
pub struct RenewLicenseCloudResult {
    pub ok: bool,
    pub expires_at: Option<String>,
    pub plan: String,
    pub max_users: i64,
    pub max_branches: i64,
}

#[tauri::command]
pub fn activate_license_cloud(
    db: State<'_, Database>,
    data: ActivateLicenseCloudData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<ActivateLicenseCloudResult, String> {
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, "", "", "")?;

    let endpoint = std::env::var("PMS_OWNER_SYNC_ENDPOINT")
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| {
            let conn = db.conn.lock().ok()?;
            conn.query_row(
                "SELECT value FROM cloud_sync_config WHERE key = 'endpoint'",
                [],
                |row| row.get::<_, String>(0),
            ).ok().filter(|s: &String| !s.is_empty())
        })
        .map(|endpoint| normalize_cloud_endpoint(&endpoint))
        .unwrap_or_else(|| DEFAULT_CLOUD_ENDPOINT.to_string());

    let url = format!("{}/v1/activate", endpoint);
    let body = serde_json::json!({
        "key": data.key.trim(),
        "email": data.email.trim().to_lowercase(),
        "password": data.password,
        "pharmacy_name": data.pharmacy_name.trim(),
    });

    let client = reqwest::blocking::Client::new();
    let response = client
        .post(&url)
        .json(&body)
        .send()
        .map_err(|e| format!("طلب التفعيل فشل: {}", e))?;

    let status = response.status();
    let result_text = response.text().unwrap_or_default();
    let result: serde_json::Value = serde_json::from_str(&result_text)
        .unwrap_or(serde_json::Value::Null);

    if !status.is_success() {
        return Err(result["error"].as_str().unwrap_or("خطأ في التفعيل").to_string());
    }

    let sync_token = result["sync_token"].as_str().ok_or("لم يتم استلام رمز المزامنة")?.to_string();
    let tenant_id = result["tenant_id"].as_str().ok_or("لم يتم استلام معرف المستأجر")?.to_string();
    let expires_at = result["expires_at"].as_str().map(|s| s.to_string());
    let plan = result["plan"].as_str().unwrap_or("basic").to_string();
    let max_users = result["max_users"].as_i64().unwrap_or(5);
    let max_branches = result["max_branches"].as_i64().unwrap_or(3);

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO cloud_sync_config (key, value) VALUES ('token', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![sync_token],
    ).map_err(|e| format!("فشل حفظ رمز المزامنة: {}", e))?;
    conn.execute(
        "INSERT INTO cloud_sync_config (key, value) VALUES ('tenant_id', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![tenant_id],
    ).map_err(|e| format!("فشل حفظ معرف المستأجر السحابي: {}", e))?;

    // Mirror all plan details into the local tenants table
    let local_tenant_id: String = conn
        .query_row("SELECT id FROM tenants LIMIT 1", [], |row| row.get(0))
        .unwrap_or_else(|_| "default-tenant".to_string());
    conn.execute(
        "UPDATE tenants SET subscription_plan = ?1, max_users = ?2, max_branches = ?3,
         subscription_status = 'active',
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?4",
        params![plan, max_users, max_branches, local_tenant_id],
    ).map_err(|e| format!("فشل تحديث خطة المستأجر: {}", e))?;

    if let Some(ref exp) = expires_at {
        conn.execute(
            "INSERT INTO cloud_sync_config (key, value) VALUES ('expires_at', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![exp],
        ).map_err(|e| format!("فشل حفظ تاريخ الانتهاء: {}", e))?;
        conn.execute(
            "UPDATE tenants SET subscription_expiry = ?1,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?2",
            params![exp, local_tenant_id],
        ).map_err(|e| format!("فشل تحديث تاريخ انتهاء المستأجر: {}", e))?;
    }

    std::env::set_var("PMS_OWNER_SYNC_TOKEN", &sync_token);

    Ok(ActivateLicenseCloudResult { sync_token, tenant_id, expires_at, plan, max_users, max_branches })
}

#[tauri::command]
pub fn renew_license_cloud(
    db: State<'_, Database>,
    data: RenewLicenseCloudData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<RenewLicenseCloudResult, String> {
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, "", "", "")?;

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let endpoint: String = conn
        .query_row("SELECT value FROM cloud_sync_config WHERE key = 'endpoint'", [], |r| r.get(0))
        .ok()
        .filter(|s: &String| !s.is_empty())
        .or_else(|| std::env::var("PMS_OWNER_SYNC_ENDPOINT").ok().filter(|s| !s.is_empty()))
        .map(|endpoint| normalize_cloud_endpoint(&endpoint))
        .unwrap_or_else(|| DEFAULT_CLOUD_ENDPOINT.to_string());

    let token: String = conn
        .query_row("SELECT value FROM cloud_sync_config WHERE key = 'token'", [], |r| r.get(0))
        .ok()
        .filter(|s: &String| !s.is_empty())
        .or_else(|| std::env::var("PMS_OWNER_SYNC_TOKEN").ok().filter(|s| !s.is_empty()))
        .ok_or_else(|| "لا يوجد رمز مزامنة. يرجى تفعيل الترخيص أولاً".to_string())?;

    drop(conn); // release lock before HTTP call

    let url = format!("{}/v1/renew", endpoint);
    let body = serde_json::json!({ "key": data.key.trim() });

    let client = reqwest::blocking::Client::new();
    let response = client
        .post(&url)
        .bearer_auth(&token)
        .json(&body)
        .send()
        .map_err(|e| format!("طلب التجديد فشل: {}", e))?;

    let status = response.status();
    let result_text = response.text().unwrap_or_default();
    let result: serde_json::Value = serde_json::from_str(&result_text)
        .unwrap_or(serde_json::Value::Null);

    if !status.is_success() {
        return Err(result["error"].as_str().unwrap_or("خطأ في تجديد الترخيص").to_string());
    }

    let expires_at = result["expires_at"].as_str().map(|s| s.to_string());
    let plan = result["plan"].as_str().unwrap_or("basic").to_string();
    let max_users = result["max_users"].as_i64().unwrap_or(5);
    let max_branches = result["max_branches"].as_i64().unwrap_or(3);

    let conn2 = db.conn.lock().map_err(|e| e.to_string())?;

    let local_tenant_id2: String = conn2
        .query_row("SELECT id FROM tenants LIMIT 1", [], |row| row.get(0))
        .unwrap_or_else(|_| "default-tenant".to_string());

    conn2.execute(
        "UPDATE tenants SET subscription_plan = ?1, max_users = ?2, max_branches = ?3,
         subscription_status = 'active',
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?4",
        params![plan, max_users, max_branches, local_tenant_id2],
    ).map_err(|e| format!("فشل تحديث خطة المستأجر بعد التجديد: {}", e))?;

    if let Some(ref exp) = expires_at {
        conn2.execute(
            "INSERT INTO cloud_sync_config (key, value) VALUES ('expires_at', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![exp],
        ).map_err(|e| format!("فشل حفظ تاريخ الانتهاء: {}", e))?;
        conn2.execute(
            "UPDATE tenants SET subscription_expiry = ?1,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?2",
            params![exp, local_tenant_id2],
        ).map_err(|e| format!("فشل تحديث تاريخ انتهاء المستأجر بعد التجديد: {}", e))?;
    }

    Ok(RenewLicenseCloudResult { ok: true, expires_at, plan, max_users, max_branches })
}
