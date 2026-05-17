use reqwest::blocking::Client;
use reqwest::header::CONTENT_TYPE;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::Duration;
use tauri::State;
use uuid::Uuid;
use hmac::{Hmac, Mac};
use hex;

use crate::db::Database;
use crate::commands::session_state::{AuthSessionState, resolve_identity};

// ─── License System ─────────────────────────────────────────────────────────

type HmacSha256 = Hmac<Sha256>;

// Shared secret — in production this would be obfuscated or stored securely
const LICENSE_SECRET_FALLBACK: &[u8] = b"PMS-PHARMACY-2026-LICENSE-SECRET-KEY";
const GRACE_DAYS: i64 = 7;

fn license_secret() -> Vec<u8> {
    std::env::var("PMS_LICENSE_SECRET")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .map(|v| v.into_bytes())
        .unwrap_or_else(|| LICENSE_SECRET_FALLBACK.to_vec())
}

fn evaluate_license_window(status: &str, expiry: Option<&str>) -> (bool, Option<i64>, bool, Option<i64>, bool) {
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();

    if status == "suspended" {
        return (false, None, false, None, true);
    }

    if let Some(exp) = expiry {
        use chrono::NaiveDate;
        let exp_date = NaiveDate::parse_from_str(exp, "%Y-%m-%d").ok();
        let today_date = NaiveDate::parse_from_str(&today, "%Y-%m-%d").ok();

        if let (Some(e), Some(t)) = (exp_date, today_date) {
            let diff = (e - t).num_days();
            if diff >= 0 {
                return (true, Some(diff), false, None, false);
            }

            let grace_left = GRACE_DAYS + diff;
            if grace_left >= 0 {
                return (true, Some(diff), true, Some(grace_left), false);
            }
            return (false, Some(diff), false, None, true);
        }
    }

    // If expiry is absent or invalid date format, trust active status and fail safe.
    if status == "active" {
        return (true, None, false, None, false);
    }
    (false, None, false, None, true)
}

fn sync_license_status(conn: &Connection, tenant_id: &str, current_status: &str, expiry: Option<&str>) -> Result<String, String> {
    let status = if current_status == "suspended" {
        "suspended".to_string()
    } else {
        let (_, _, in_grace, _, is_read_only) = evaluate_license_window(current_status, expiry);
        if is_read_only && !in_grace {
            "expired".to_string()
        } else {
            "active".to_string()
        }
    };

    if status != current_status {
        conn.execute(
            "UPDATE tenants
             SET subscription_status = ?2,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1 AND deleted_at IS NULL",
            params![tenant_id, status],
        )
        .map_err(|e| format!("فشل مزامنة حالة الترخيص: {}", e))?;
    }

    Ok(status)
}

#[derive(Debug, Serialize)]
pub struct LicenseInfo {
    pub is_valid: bool,
    pub plan: String,
    pub status: String,
    pub expiry: Option<String>,
    pub max_branches: i64,
    pub max_users: i64,
    pub feature_flags: i64,
    pub days_until_expiry: Option<i64>,
    pub in_grace_period: bool,
    pub grace_days_remaining: Option<i64>,
    pub is_read_only: bool,
    pub read_only_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LicenseActivation {
    pub license_key: String,
    pub user_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct LicensePayload {
    tenant_id: String,
    plan: String,
    expires: String,
    max_branches: i64,
    max_users: i64,
    feature_flags: i64,
}

#[tauri::command]
pub fn get_license_info(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<LicenseInfo, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (plan, raw_status, expiry, max_b, max_u, flags): (String, String, Option<String>, i64, i64, i64) =
        conn.query_row(
            "SELECT subscription_plan, subscription_status, subscription_expiry,
                    max_branches, max_users, feature_flags
             FROM tenants WHERE id = ?1 AND deleted_at IS NULL",
            params![tenant_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
        )
        .map_err(|e| e.to_string())?;

    let status = sync_license_status(&conn, &tenant_id, &raw_status, expiry.as_deref())?;
    let (is_valid, days_until_expiry, in_grace_period, grace_days_remaining, is_read_only) =
        evaluate_license_window(&status, expiry.as_deref());

    // Check cloud-cached suspension/expiry from /v1/config
    let cloud_status = conn
        .query_row("SELECT value FROM cloud_sync_config WHERE key = 'cloud_status'", [], |r| r.get::<_, String>(0))
        .ok()
        .filter(|s| !s.is_empty());
    let cloud_suspended = cloud_status.as_deref() == Some("suspended");
    let cloud_expired = cloud_status.as_deref() == Some("expired");

    // Override with server revocation if applicable
    let server_revoked = is_revoked_by_server(&conn, &tenant_id);
    let (is_valid, is_read_only, read_only_reason) = if server_revoked {
        (false, true, Some("revoked".to_string()))
    } else if cloud_suspended || status == "suspended" {
        (false, true, Some("suspended".to_string()))
    } else if cloud_expired || is_read_only {
        (false, true, Some("expired".to_string()))
    } else {
        (is_valid, false, None)
    };

    Ok(LicenseInfo {
        is_valid,
        plan,
        status,
        expiry,
        max_branches: max_b,
        max_users: max_u,
        feature_flags: flags,
        days_until_expiry,
        in_grace_period,
        grace_days_remaining,
        is_read_only,
        read_only_reason,
    })
}

#[tauri::command]
pub fn activate_license(
    db: State<'_, Database>,
    tenant_id: String,
    data: LicenseActivation,
    auth_session: State<'_, AuthSessionState>,
) -> Result<LicenseInfo, String> {
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    // License key format: base64(json_payload).hex(hmac_signature)
    let parts: Vec<&str> = data.license_key.split('.').collect();
    if parts.len() != 2 {
        return Err("تنسيق مفتاح الترخيص غير صالح".into());
    }

    let payload_b64 = parts[0];
    let signature_hex = parts[1];

    // Verify HMAC
    let secret = license_secret();
    let mut mac = <HmacSha256 as Mac>::new_from_slice(&secret)
        .map_err(|e| format!("فشل تهيئة HMAC: {}", e))?;
    mac.update(payload_b64.as_bytes());

    let expected_sig = hex::decode(signature_hex)
        .map_err(|_| "تنسيق توقيع مفتاح الترخيص غير صالح".to_string())?;

    mac.verify_slice(&expected_sig)
        .map_err(|_| "مفتاح الترخيص غير صالح - عدم تطابق التوقيع".to_string())?;

    // Decode payload
    use base64::Engine;
    let payload_bytes = base64::engine::general_purpose::STANDARD
        .decode(payload_b64)
        .map_err(|_| "حمولة مفتاح الترخيص غير صالحة".to_string())?;
    let payload: LicensePayload = serde_json::from_slice(&payload_bytes)
        .map_err(|e| format!("بيانات مفتاح الترخيص غير صالحة: {}", e))?;

    // Verify tenant_id matches
    if payload.tenant_id != tenant_id {
        return Err("مفتاح الترخيص ليس لهذه الصيدلية".into());
    }

    // Check not expired
    if payload.expires < chrono::Utc::now().format("%Y-%m-%d").to_string() {
        return Err("انتهت صلاحية مفتاح الترخيص".into());
    }

    // Apply to tenant
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE tenants SET
            subscription_plan = ?2, subscription_status = 'active',
            subscription_expiry = ?3, max_branches = ?4,
            max_users = ?5, feature_flags = ?6,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1 AND deleted_at IS NULL",
        params![
            tenant_id,
            payload.plan,
            payload.expires,
            payload.max_branches,
            payload.max_users,
            payload.feature_flags,
        ],
    )
    .map_err(|e| format!("فشل تفعيل الترخيص: {}", e))?;

    // Record activation in history (hash the key so we don't store the raw key)
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(data.license_key.as_bytes());
    let key_hash = hex::encode(hasher.finalize());
    let history_id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT OR IGNORE INTO license_keys
            (id, tenant_id, key_hash, plan, activated_at, expires_at,
             max_branches, max_users, feature_flags, activated_by)
         VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                 ?5, ?6, ?7, ?8, ?9)",
        params![
            history_id,
            tenant_id,
            key_hash,
            payload.plan,
            if payload.expires.is_empty() { None } else { Some(payload.expires.clone()) },
            payload.max_branches,
            payload.max_users,
            payload.feature_flags,
            data.user_id,
        ],
    )
    .ok(); // Non-fatal: duplicate key just gets ignored

    // If a license server is configured, validate online (non-blocking: failure is tolerated)
    let server_url = std::env::var("PMS_LICENSE_SERVER_URL").ok().filter(|s| !s.trim().is_empty());
    if let Some(ref url) = server_url {
        let mid = machine_id();
        match server_activate_license(url, &data.license_key, &tenant_id, &mid) {
            Ok(sv) => {
                let conn2 = db.conn.lock().map_err(|e| e.to_string())?;
                upsert_server_cache(&conn2, &tenant_id, &key_hash, sv.valid, sv.revoked, sv.next_check.as_deref())?;
                drop(conn2);
                if sv.revoked {
                    return Err("تم إلغاء الترخيص من قبل خادم الترخيص".into());
                }
            }
            Err(_) => {
                // Server unreachable — set offline grace for 48 h so app keeps working
                let conn2 = db.conn.lock().map_err(|e| e.to_string())?;
                set_offline_grace(&conn2, &tenant_id, &key_hash, 48)?;
                drop(conn2);
            }
        }
    }

    drop(conn);
    get_license_info(db, tenant_id)
}

// ─── License Server Integration ──────────────────────────────────────────────
//
// Server API contract (implement this on your license server):
//
// POST {PMS_LICENSE_SERVER_URL}/v1/licenses/activate
//   Request:  { "key": "<raw_key>", "tenant_id": "<uuid>", "machine_id": "<sha256_hex>" }
//   Response: { "valid": bool, "revoked": bool, "next_check": "YYYY-MM-DD" }
//
// POST {PMS_LICENSE_SERVER_URL}/v1/licenses/heartbeat
//   Request:  { "key_hash": "<sha256_hex>", "tenant_id": "<uuid>", "machine_id": "<sha256_hex>" }
//   Response: { "valid": bool, "revoked": bool, "next_check": "YYYY-MM-DD" }

/// A stable machine identifier (SHA-256 of hostname).
fn machine_id() -> String {
    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "unknown".to_string());
    let mut h = Sha256::new();
    h.update(hostname.as_bytes());
    hex::encode(h.finalize())
}

/// Optional license server URL.
fn license_server_url() -> Option<String> {
    std::env::var("PMS_LICENSE_SERVER_URL")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[derive(Debug, Deserialize)]
struct ServerResponse {
    valid: bool,
    revoked: bool,
    next_check: Option<String>,
}

/// Calls the server activation endpoint. Returns Err on network failure.
fn server_activate_license(url: &str, key: &str, tenant_id: &str, mid: &str) -> Result<ServerResponse, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    let body = serde_json::json!({ "key": key, "tenant_id": tenant_id, "machine_id": mid });
    let resp = client
        .post(format!("{}/v1/licenses/activate", url.trim_end_matches('/')))
        .header(CONTENT_TYPE, "application/json")
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("أعاد الخادم الحالة {}", resp.status()));
    }
    resp.json::<ServerResponse>().map_err(|e| e.to_string())
}

/// Calls the server heartbeat endpoint. Returns Err on network failure.
fn server_heartbeat(url: &str, key_hash: &str, tenant_id: &str, mid: &str) -> Result<ServerResponse, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    let body = serde_json::json!({ "key_hash": key_hash, "tenant_id": tenant_id, "machine_id": mid });
    let resp = client
        .post(format!("{}/v1/licenses/heartbeat", url.trim_end_matches('/')))
        .header(CONTENT_TYPE, "application/json")
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("أعاد الخادم الحالة {}", resp.status()));
    }
    resp.json::<ServerResponse>().map_err(|e| e.to_string())
}

/// Upsert license_server_cache with the latest server result.
fn upsert_server_cache(conn: &Connection, tenant_id: &str, key_hash: &str, valid: bool, revoked: bool, next_check: Option<&str>) -> Result<(), String> {
    conn.execute(
        "INSERT INTO license_server_cache
             (tenant_id, key_hash, server_valid, revoked, last_checked_at, next_check_at, offline_grace_until)
         VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?5, NULL)
         ON CONFLICT(tenant_id) DO UPDATE SET
             key_hash            = excluded.key_hash,
             server_valid        = excluded.server_valid,
             revoked             = excluded.revoked,
             last_checked_at     = excluded.last_checked_at,
             next_check_at       = excluded.next_check_at,
             offline_grace_until = NULL",
        params![tenant_id, key_hash, valid as i32, revoked as i32, next_check],
    )
    .map_err(|e| format!("فشل تحديث ذاكرة التخزين المؤقت للخادم: {}", e))?;
    Ok(())
}

/// Sets offline grace window in the server cache so app doesn't block when server is unreachable.
fn set_offline_grace(conn: &Connection, tenant_id: &str, key_hash: &str, grace_hours: i64) -> Result<(), String> {
    conn.execute(
        "INSERT INTO license_server_cache
             (tenant_id, key_hash, server_valid, revoked, last_checked_at, offline_grace_until)
         VALUES (?1, ?2, 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                 datetime('now', ?3))
         ON CONFLICT(tenant_id) DO UPDATE SET
             last_checked_at     = excluded.last_checked_at,
             offline_grace_until = CASE
                 WHEN revoked = 0 THEN excluded.offline_grace_until
                 ELSE offline_grace_until
             END",
        params![tenant_id, key_hash, format!("+{} hours", grace_hours)],
    )
    .map_err(|e| format!("فشل تعيين فترة السماح دون اتصال: {}", e))?;
    Ok(())
}

/// Checks whether the cache currently blocks the tenant (revoked and grace has not expired).
fn is_revoked_by_server(conn: &Connection, tenant_id: &str) -> bool {
    let result: Result<(i32, i32, Option<String>), _> = conn.query_row(
        "SELECT server_valid, revoked, offline_grace_until FROM license_server_cache WHERE tenant_id = ?1",
        params![tenant_id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    );
    match result {
        Ok((_, 1, _)) => true, // explicitly revoked — always block
        Ok((0, _, grace)) => {
            // server said invalid; block unless offline grace window still active
            match grace {
                Some(g) => {
                    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
                    now > g // grace expired → block
                }
                None => true,
            }
        }
        _ => false, // no cache row or revoked=0, server_valid=1 → allow
    }
}

#[derive(Debug, Serialize)]
pub struct OnlineCheckResult {
    pub checked: bool,
    pub revoked: bool,
    pub offline: bool,
    pub message: String,
}

/// Performs an online heartbeat check against the license server.
/// Safe to call on every app launch; no-op if PMS_LICENSE_SERVER_URL is not set.
#[tauri::command]
pub fn check_license_online(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<OnlineCheckResult, String> {
    let url = match license_server_url() {
        Some(u) => u,
        None => {
            return Ok(OnlineCheckResult {
                checked: false,
                revoked: false,
                offline: false,
                message: "لم يتم تكوين خادم الترخيص".into(),
            });
        }
    };

    // Get the most-recently-activated key hash for this tenant
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let key_hash_opt: Option<String> = conn
        .query_row(
            "SELECT key_hash FROM license_keys WHERE tenant_id = ?1
             ORDER BY activated_at DESC LIMIT 1",
            params![tenant_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let key_hash = match key_hash_opt {
        Some(h) => h,
        None => {
            return Ok(OnlineCheckResult {
                checked: false,
                revoked: false,
                offline: false,
                message: "لم يتم العثور على ترخيص مفعل".into(),
            });
        }
    };
    drop(conn);

    let mid = machine_id();
    match server_heartbeat(&url, &key_hash, &tenant_id, &mid) {
        Ok(sv) => {
            let conn2 = db.conn.lock().map_err(|e| e.to_string())?;
            upsert_server_cache(&conn2, &tenant_id, &key_hash, sv.valid, sv.revoked, sv.next_check.as_deref())?;
            Ok(OnlineCheckResult {
                checked: true,
                revoked: sv.revoked,
                offline: false,
                message: if sv.revoked { "تم إلغاء الترخيص".into() } else { "الترخيص صالح".into() },
            })
        }
        Err(e) => {
            // Server unreachable — extend offline grace
            let conn2 = db.conn.lock().map_err(|e| e.to_string())?;
            set_offline_grace(&conn2, &tenant_id, &key_hash, 48)?;
            Ok(OnlineCheckResult {
                checked: true,
                revoked: false,
                offline: true,
                message: format!("الخادم غير قابل للوصول (تم تمديد فترة السماح دون اتصال): {}", e),
            })
        }
    }
}

// ─── License History ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct LicenseHistoryRow {
    pub id: String,
    pub plan: String,
    pub activated_at: String,
    pub expires_at: Option<String>,
    pub max_branches: i64,
    pub max_users: i64,
    pub activated_by: Option<String>,
}

#[tauri::command]
pub fn get_license_history(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<Vec<LicenseHistoryRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, plan, activated_at, expires_at, max_branches, max_users, activated_by
             FROM license_keys WHERE tenant_id = ?1
             ORDER BY activated_at DESC LIMIT 10",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![tenant_id], |row| {
            Ok(LicenseHistoryRow {
                id: row.get(0)?,
                plan: row.get(1)?,
                activated_at: row.get(2)?,
                expires_at: row.get(3)?,
                max_branches: row.get(4)?,
                max_users: row.get(5)?,
                activated_by: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}
