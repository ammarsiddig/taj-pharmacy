use aes_gcm::{
    aead::{rand_core::{OsRng, RngCore}, Aead},
    Aes256Gcm, KeyInit, Nonce,
};
use base64::Engine;
use reqwest::blocking::Client;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::Manager;
use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::audit;
use crate::commands::license_guard;

// ─── Tenant / General Settings ──────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct TenantSettings {
    pub id: String,
    pub name: String,
    pub name_ar: Option<String>,
    pub license_number: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub currency_code: String,
    pub timezone: String,
    pub receipt_header: Option<String>,
    pub receipt_footer: Option<String>,
    pub print_logo: bool,
    pub subscription_plan: String,
    pub subscription_status: String,
    pub subscription_expiry: Option<String>,
    pub max_branches: i64,
    pub max_users: i64,
    pub feature_flags: i64,
}

#[derive(Debug, Deserialize)]
pub struct TenantSettingsUpdate {
    pub name: String,
    pub name_ar: Option<String>,
    pub license_number: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub currency_code: Option<String>,
    pub timezone: Option<String>,
    pub receipt_header: Option<String>,
    pub receipt_footer: Option<String>,
    pub print_logo: Option<bool>,
}

#[tauri::command]
pub fn get_tenant_settings(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<TenantSettings, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, name, name_ar, license_number, phone, address,
                currency_code, timezone, receipt_header, receipt_footer,
                print_logo, subscription_plan, subscription_status,
                subscription_expiry, max_branches, max_users, feature_flags
         FROM tenants WHERE id = ?1 AND deleted_at IS NULL",
        params![tenant_id],
        |row| {
            Ok(TenantSettings {
                id: row.get(0)?,
                name: row.get(1)?,
                name_ar: row.get(2)?,
                license_number: row.get(3)?,
                phone: row.get(4)?,
                address: row.get(5)?,
                currency_code: row.get(6)?,
                timezone: row.get(7)?,
                receipt_header: row.get(8)?,
                receipt_footer: row.get(9)?,
                print_logo: row.get(10)?,
                subscription_plan: row.get(11)?,
                subscription_status: row.get(12)?,
                subscription_expiry: row.get(13)?,
                max_branches: row.get(14)?,
                max_users: row.get(15)?,
                feature_flags: row.get(16)?,
            })
        },
    )
    .map_err(|e| format!("Failed to load tenant settings: {}", e))
}

#[tauri::command]
pub fn update_tenant_settings(
    db: State<'_, Database>,
    tenant_id: String,
    data: TenantSettingsUpdate,
) -> Result<TenantSettings, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    conn.execute(
        "UPDATE tenants SET
            name = ?2, name_ar = ?3, license_number = ?4,
            phone = ?5, address = ?6,
            currency_code = COALESCE(?7, currency_code),
            timezone = COALESCE(?8, timezone),
            receipt_header = ?9, receipt_footer = ?10,
            print_logo = COALESCE(?11, print_logo),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1 AND deleted_at IS NULL",
        params![
            tenant_id,
            data.name,
            data.name_ar,
            data.license_number,
            data.phone,
            data.address,
            data.currency_code,
            data.timezone,
            data.receipt_header,
            data.receipt_footer,
            data.print_logo.map(|v| v as i32),
        ],
    )
    .map_err(|e| format!("Failed to update tenant settings: {}", e))?;
    if let Err(e) = audit::log_action(&conn, &tenant_id, "system", "update", "settings", &tenant_id, None) {
        log::warn!("audit log failed after update_tenant_settings: {}", e);
    }
    drop(conn);
    get_tenant_settings(db, tenant_id)
}

// ─── Pharmacy Logo ──────────────────────────────────────────────────────────

fn logo_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("logos");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create logos dir: {}", e))?;
    Ok(dir)
}

#[tauri::command]
pub fn save_pharmacy_logo(
    app_handle: tauri::AppHandle,
    tenant_id: String,
    base64_data: String,
) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Invalid base64: {}", e))?;

    if bytes.len() > 500_000 {
        return Err("حجم الشعار يجب أن لا يتجاوز 500KB".into());
    }

    let dir = logo_dir(&app_handle)?;
    let path = dir.join(format!("{}.png", tenant_id));
    fs::write(&path, &bytes).map_err(|e| format!("Failed to save logo: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_pharmacy_logo(
    app_handle: tauri::AppHandle,
    tenant_id: String,
) -> Result<Option<String>, String> {
    let dir = logo_dir(&app_handle)?;
    let path = dir.join(format!("{}.png", tenant_id));
    if path.exists() {
        let bytes = fs::read(&path).map_err(|e| format!("Failed to read logo: {}", e))?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        Ok(Some(format!("data:image/png;base64,{}", b64)))
    } else {
        Ok(None)
    }
}

// ─── Branches CRUD ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct BranchRow {
    pub id: String,
    pub name: String,
    pub name_ar: Option<String>,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub is_main: bool,
    pub is_active: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct BranchData {
    pub name: String,
    pub name_ar: Option<String>,
    pub address: Option<String>,
    pub phone: Option<String>,
}

#[tauri::command]
pub fn get_branches_full(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<Vec<BranchRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, name_ar, address, phone, is_main, is_active, created_at
             FROM branches WHERE tenant_id = ?1 AND deleted_at IS NULL
             ORDER BY is_main DESC, name ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![tenant_id], |row| {
            Ok(BranchRow {
                id: row.get(0)?,
                name: row.get(1)?,
                name_ar: row.get(2)?,
                address: row.get(3)?,
                phone: row.get(4)?,
                is_main: row.get(5)?,
                is_active: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub fn create_branch(
    db: State<'_, Database>,
    tenant_id: String,
    data: BranchData,
) -> Result<BranchRow, String> {
    if data.name.trim().is_empty() {
        return Err("Branch name is required".into());
    }
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::check_branch_limit(&conn, &tenant_id)?;
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO branches (id, tenant_id, name, name_ar, address, phone, is_main, is_active)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 1)",
        params![id, tenant_id, data.name, data.name_ar, data.address, data.phone],
    )
    .map_err(|e| format!("Failed to create branch: {}", e))?;
    if let Err(e) = audit::log_action(&conn, &tenant_id, "system", "create", "branch", &id, None) {
        log::warn!("audit log failed after create_branch: {}", e);
    }
    drop(conn);
    let branches = get_branches_full(db, tenant_id)?;
    branches.into_iter().find(|b| b.id == id).ok_or("Failed to fetch created branch".into())
}

#[tauri::command]
pub fn update_branch(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    data: BranchData,
) -> Result<(), String> {
    if data.name.trim().is_empty() {
        return Err("Branch name is required".into());
    }
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    conn.execute(
        "UPDATE branches SET name = ?3, name_ar = ?4, address = ?5, phone = ?6,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?2 AND tenant_id = ?1 AND deleted_at IS NULL",
        params![tenant_id, branch_id, data.name, data.name_ar, data.address, data.phone],
    )
    .map_err(|e| format!("Failed to update branch: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn toggle_branch_active(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    // Prevent deactivating the main branch
    let is_main: bool = conn
        .query_row(
            "SELECT is_main FROM branches WHERE id = ?1 AND tenant_id = ?2",
            params![branch_id, tenant_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if is_main {
        return Err("Cannot deactivate the main branch".into());
    }
    conn.execute(
        "UPDATE branches SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![branch_id, tenant_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Notification Settings ──────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct NotificationSettingRow {
    pub id: String,
    pub notification_type: String,
    pub is_enabled: bool,
    pub threshold_value: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct NotificationSettingUpdate {
    pub notification_type: String,
    pub is_enabled: bool,
    pub threshold_value: Option<i64>,
}

#[tauri::command]
pub fn get_notification_settings(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<Vec<NotificationSettingRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Ensure all notification types have a row (upsert defaults)
    let types = [
        ("low_stock", 1, None::<i64>),
        ("out_of_stock", 1, None),
        ("expiring_soon", 1, Some(30)),
        ("expired", 1, None),
        ("supplier_overdue", 1, Some(30)),
        ("credit_limit_exceeded", 1, None),
        ("large_expense", 0, Some(100000)), // 1000 SDG in piasters
        ("session_open_long", 1, Some(12)),
        ("stock_take_overdue", 1, Some(30)),
        ("backup_overdue", 1, Some(7)),
    ];
    for (ntype, enabled, threshold) in &types {
        conn.execute(
            "INSERT OR IGNORE INTO notification_settings (id, tenant_id, notification_type, is_enabled, threshold_value)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![Uuid::new_v4().to_string(), tenant_id, ntype, enabled, threshold],
        )
        .ok();
    }

    let mut stmt = conn
        .prepare(
            "SELECT id, notification_type, is_enabled, threshold_value
             FROM notification_settings WHERE tenant_id = ?1
             ORDER BY notification_type ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![tenant_id], |row| {
            Ok(NotificationSettingRow {
                id: row.get(0)?,
                notification_type: row.get(1)?,
                is_enabled: row.get(2)?,
                threshold_value: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub fn update_notification_setting(
    db: State<'_, Database>,
    tenant_id: String,
    data: NotificationSettingUpdate,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    let changed = conn
        .execute(
            "UPDATE notification_settings SET
                is_enabled = ?3, threshold_value = ?4,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE tenant_id = ?1 AND notification_type = ?2",
            params![tenant_id, data.notification_type, data.is_enabled as i32, data.threshold_value],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        // Insert if not exists
        conn.execute(
            "INSERT INTO notification_settings (id, tenant_id, notification_type, is_enabled, threshold_value)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                Uuid::new_v4().to_string(),
                tenant_id,
                data.notification_type,
                data.is_enabled as i32,
                data.threshold_value
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ─── Backup System ──────────────────────────────────────────────────────────

const CLOUD_CONFIG_SECRET: &[u8] = b"PMS-PHARMACY-2026-CLOUD-CONFIG";
const CLOUD_BACKUP_SECRET: &[u8] = b"PMS-PHARMACY-2026-CLOUD-BACKUP";

#[derive(Debug, Serialize)]
pub struct BackupLogRow {
    pub id: String,
    pub backup_type: String,
    pub file_path: Option<String>,
    pub file_size: Option<i64>,
    pub status: String,
    pub sync_status: Option<String>,
    pub remote_id: Option<String>,
    pub error_message: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub created_by: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CloudConfigRow {
    pub id: Option<String>,
    pub cloud_endpoint: String,
    pub cloud_token: String,
    pub cloud_enabled: bool,
    pub last_sync_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CloudConfigInput {
    pub cloud_endpoint: String,
    pub cloud_token: String,
    pub cloud_enabled: bool,
}

#[derive(Debug, Serialize)]
pub struct CloudBackupRow {
    pub remote_id: String,
    pub file_name: Option<String>,
    pub file_size: Option<i64>,
    pub created_at: Option<String>,
    pub uploaded_by: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RestoreVerification {
    pub remote_id: String,
    pub file_size: i64,
    pub modified_at: Option<String>,
    pub staged_file_path: Option<String>,
    pub products_count: i64,
    pub customers_count: i64,
    pub suppliers_count: i64,
    pub sales_count: i64,
    pub purchases_count: i64,
}

fn now_iso() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

fn sqlite_path_literal(path: &Path) -> String {
    path.to_string_lossy().replace('\'', "''")
}

fn sanitize_component(value: &str) -> String {
    value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' { ch } else { '_' })
        .collect()
}

fn cloud_resource_url(endpoint: &str, remote_id: Option<&str>) -> String {
    let base = endpoint.trim_end_matches('/');
    match remote_id {
        Some(id) => format!("{}/{}", base, sanitize_component(id)),
        None => base.to_string(),
    }
}

fn backups_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("backups");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create backup dir: {}", e))?;
    Ok(dir)
}

fn restore_stage_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("restore-staging");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create restore staging dir: {}", e))?;
    Ok(dir)
}

fn derive_key(parts: &[&[u8]]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    for part in parts {
        hasher.update(part);
    }
    let digest = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&digest[..32]);
    key
}

fn encrypt_payload(key: &[u8; 32], header: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("Cipher init failed: {}", e))?;
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| "Encryption failed".to_string())?;
    let mut payload = header.to_vec();
    payload.extend_from_slice(&nonce_bytes);
    payload.extend_from_slice(&ciphertext);
    Ok(payload)
}

fn decrypt_payload(key: &[u8; 32], header: &[u8], payload: &[u8]) -> Result<Vec<u8>, String> {
    if payload.len() <= header.len() + 12 || &payload[..header.len()] != header {
        return Err("Invalid encrypted payload format".into());
    }
    let nonce = Nonce::from_slice(&payload[header.len()..header.len() + 12]);
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("Cipher init failed: {}", e))?;
    cipher
        .decrypt(nonce, &payload[header.len() + 12..])
        .map_err(|_| "Decryption failed".to_string())
}

fn encrypt_secret_for_storage(tenant_id: &str, secret: &str) -> Result<String, String> {
    let key = derive_key(&[CLOUD_CONFIG_SECRET, tenant_id.as_bytes()]);
    let encrypted = encrypt_payload(&key, b"PMSCFG1", secret.as_bytes())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(encrypted))
}

fn decrypt_secret_from_storage(tenant_id: &str, encrypted: &str) -> Result<String, String> {
    if encrypted.trim().is_empty() {
        return Ok(String::new());
    }
    let payload = base64::engine::general_purpose::STANDARD
        .decode(encrypted)
        .map_err(|_| "Invalid stored cloud token".to_string())?;
    let key = derive_key(&[CLOUD_CONFIG_SECRET, tenant_id.as_bytes()]);
    let decrypted = decrypt_payload(&key, b"PMSCFG1", &payload)?;
    String::from_utf8(decrypted).map_err(|_| "Stored token is not valid UTF-8".to_string())
}

fn encrypt_backup_bytes(tenant_id: &str, cloud_token: &str, bytes: &[u8]) -> Result<Vec<u8>, String> {
    let key = derive_key(&[CLOUD_BACKUP_SECRET, tenant_id.as_bytes(), cloud_token.as_bytes()]);
    encrypt_payload(&key, b"PMSBK1", bytes)
}

fn decrypt_backup_bytes(tenant_id: &str, cloud_token: &str, bytes: &[u8]) -> Result<Vec<u8>, String> {
    let key = derive_key(&[CLOUD_BACKUP_SECRET, tenant_id.as_bytes(), cloud_token.as_bytes()]);
    decrypt_payload(&key, b"PMSBK1", bytes)
}

fn cloud_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|e| format!("Failed to build cloud client: {}", e))
}

fn count_rows(conn: &Connection, table: &str) -> i64 {
    let sql = format!("SELECT COUNT(*) FROM {}", table);
    conn.query_row(&sql, [], |row| row.get(0)).unwrap_or(0)
}

fn build_restore_verification(remote_id: &str, staged_path: &Path) -> Result<RestoreVerification, String> {
    let conn = Connection::open(staged_path).map_err(|e| format!("Failed to open staged backup: {}", e))?;
    let metadata = fs::metadata(staged_path).map_err(|e| format!("Failed to inspect staged backup: {}", e))?;
    let modified_at = metadata
        .modified()
        .ok()
        .map(chrono::DateTime::<chrono::Utc>::from)
        .map(|dt| dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string());
    Ok(RestoreVerification {
        remote_id: remote_id.to_string(),
        file_size: metadata.len() as i64,
        modified_at,
        staged_file_path: Some(staged_path.to_string_lossy().to_string()),
        products_count: count_rows(&conn, "products"),
        customers_count: count_rows(&conn, "customers"),
        suppliers_count: count_rows(&conn, "suppliers"),
        sales_count: count_rows(&conn, "sales"),
        purchases_count: count_rows(&conn, "supplier_invoices"),
    })
}

fn list_tables(conn: &Connection, schema: &str) -> Result<Vec<String>, String> {
    let sql = format!(
        "SELECT name FROM {}.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC",
        schema
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|row| row.ok())
        .collect();
    Ok(rows)
}

fn apply_restore_from_staged(conn: &Connection, staged_path: &Path) -> Result<(), String> {
    let attach_sql = format!("ATTACH DATABASE '{}' AS restore_db", sqlite_path_literal(staged_path));
    conn.execute_batch(&attach_sql).map_err(|e| format!("Attach restore DB failed: {}", e))?;

    let main_tables = list_tables(conn, "main")?;
    let restore_tables = list_tables(conn, "restore_db")?;
    let restore_set: std::collections::HashSet<_> = restore_tables.into_iter().collect();
    let shared_tables: Vec<String> = main_tables
        .into_iter()
        .filter(|table| restore_set.contains(table))
        .collect();

    conn.execute_batch("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;")
        .map_err(|e| format!("Failed to start restore transaction: {}", e))?;

    for table in &shared_tables {
        let sql = format!("DELETE FROM \"{}\"", table.replace('"', "\"\""));
        if let Err(e) = conn.execute_batch(&sql) {
            let _ = conn.execute_batch("ROLLBACK; DETACH DATABASE restore_db; PRAGMA foreign_keys=ON;");
            return Err(format!("Failed clearing {} during restore: {}", table, e));
        }
    }

    for table in &shared_tables {
        let quoted = table.replace('"', "\"\"");
        let sql = format!(
            "INSERT INTO main.\"{0}\" SELECT * FROM restore_db.\"{0}\"",
            quoted
        );
        if let Err(e) = conn.execute_batch(&sql) {
            let _ = conn.execute_batch("ROLLBACK; DETACH DATABASE restore_db; PRAGMA foreign_keys=ON;");
            return Err(format!("Failed copying {} during restore: {}", table, e));
        }
    }

    conn.execute_batch("COMMIT; DETACH DATABASE restore_db; PRAGMA foreign_keys=ON; PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| format!("Failed finalizing restore: {}", e))?;
    Ok(())
}

fn get_cloud_config_internal(conn: &Connection, tenant_id: &str) -> Result<CloudConfigRow, String> {
    let row = conn
        .query_row(
            "SELECT id, cloud_endpoint, cloud_token, cloud_enabled, last_sync_at
             FROM cloud_config WHERE tenant_id = ?1",
            params![tenant_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, bool>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if let Some((id, endpoint, encrypted_token, enabled, last_sync_at)) = row {
        let ep = endpoint.trim().to_string();
        let tk = decrypt_secret_from_storage(tenant_id, &encrypted_token)?;
        if !ep.is_empty() && !tk.is_empty() {
            return Ok(CloudConfigRow {
                id: Some(id),
                cloud_endpoint: ep,
                cloud_token: tk,
                cloud_enabled: enabled,
                last_sync_at,
            });
        }
    }

    // Fall back to environment variables (VPS sync endpoint)
    let env_endpoint = std::env::var("PMS_OWNER_SYNC_ENDPOINT").unwrap_or_default();
    let env_token = std::env::var("PMS_OWNER_SYNC_TOKEN").unwrap_or_default();
    if !env_endpoint.is_empty() && !env_token.is_empty() {
        Ok(CloudConfigRow {
            id: None,
            cloud_endpoint: format!("{}/v1/backups", env_endpoint.trim_end_matches('/')),
            cloud_token: env_token,
            cloud_enabled: true,
            last_sync_at: None,
        })
    } else {
        Ok(CloudConfigRow {
            id: None,
            cloud_endpoint: String::new(),
            cloud_token: String::new(),
            cloud_enabled: false,
            last_sync_at: None,
        })
    }
}

fn parse_cloud_backup_list(value: Value) -> Vec<CloudBackupRow> {
    let items = value
        .as_array()
        .cloned()
        .or_else(|| value.get("backups").and_then(|v| v.as_array()).cloned())
        .or_else(|| value.get("items").and_then(|v| v.as_array()).cloned())
        .unwrap_or_default();

    items
        .into_iter()
        .filter_map(|item| {
            let remote_id = item
                .get("remote_id")
                .or_else(|| item.get("id"))
                .or_else(|| item.get("file_id"))
                .and_then(|v| v.as_str())?
                .to_string();

            Some(CloudBackupRow {
                remote_id,
                file_name: item
                    .get("file_name")
                    .or_else(|| item.get("name"))
                    .and_then(|v| v.as_str())
                    .map(|v| v.to_string()),
                file_size: item
                    .get("file_size")
                    .or_else(|| item.get("size"))
                    .and_then(|v| v.as_i64()),
                created_at: item
                    .get("created_at")
                    .or_else(|| item.get("uploaded_at"))
                    .and_then(|v| v.as_str())
                    .map(|v| v.to_string()),
                uploaded_by: item
                    .get("uploaded_by")
                    .or_else(|| item.get("user"))
                    .and_then(|v| v.as_str())
                    .map(|v| v.to_string()),
            })
        })
        .collect()
}

fn create_local_backup_internal(
    conn: &Connection,
    app_handle: &tauri::AppHandle,
    tenant_id: &str,
    user_id: &str,
) -> Result<BackupLogRow, String> {
    let backup_id = Uuid::new_v4().to_string();
    let started_at = now_iso();
    let backup_dir = backups_dir(app_handle)?;
    let date_str = chrono::Utc::now().format("%Y-%m-%d_%H%M%S").to_string();
    let backup_filename = format!("{}_backup_{}.db", tenant_id, date_str);
    let backup_path = backup_dir.join(&backup_filename);

    conn.execute(
        "INSERT INTO backup_log
            (id, tenant_id, backup_type, file_path, status, sync_status, started_at, created_by)
         VALUES (?1, ?2, 'local', ?3, 'started', 'pending', ?4, ?5)",
        params![backup_id, tenant_id, backup_path.to_string_lossy().to_string(), started_at, user_id],
    )
    .map_err(|e| e.to_string())?;

    if let Err(e) = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);") {
        conn.execute(
            "UPDATE backup_log SET status = 'failed', error_message = ?2,
                completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1",
            params![backup_id, e.to_string()],
        )
        .ok();
        return Err(format!("WAL checkpoint failed: {}", e));
    }

    let vacuum_sql = format!("VACUUM INTO '{}'", sqlite_path_literal(&backup_path));
    match conn.execute_batch(&vacuum_sql) {
        Ok(_) => {
            let file_size = fs::metadata(&backup_path).map(|m| m.len() as i64).unwrap_or(0);
            conn.execute(
                "UPDATE backup_log SET status = 'completed', file_size = ?2,
                    completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE id = ?1",
                params![backup_id, file_size],
            )
            .map_err(|e| e.to_string())?;

            Ok(BackupLogRow {
                id: backup_id,
                backup_type: "local".into(),
                file_path: Some(backup_path.to_string_lossy().to_string()),
                file_size: Some(file_size),
                status: "completed".into(),
                sync_status: Some("pending".into()),
                remote_id: None,
                error_message: None,
                started_at,
                completed_at: Some(now_iso()),
                created_by: Some(user_id.to_string()),
            })
        }
        Err(e) => {
            conn.execute(
                "UPDATE backup_log SET status = 'failed', error_message = ?2,
                    completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE id = ?1",
                params![backup_id, e.to_string()],
            )
            .ok();
            Err(format!("Backup failed: {}", e))
        }
    }
}

fn stage_cloud_backup(
    app_handle: &tauri::AppHandle,
    tenant_id: &str,
    endpoint: &str,
    token: &str,
    remote_id: &str,
) -> Result<PathBuf, String> {
    let client = cloud_client()?;
    let response = client
        .get(cloud_resource_url(endpoint, Some(remote_id)))
        .header(AUTHORIZATION, format!("Bearer {}", token))
        .send()
        .map_err(|e| format!("Cloud download failed: {}", e))?;

    let status = response.status();
    let bytes = response.bytes().map_err(|e| format!("Failed to read cloud response: {}", e))?;
    if !status.is_success() {
        return Err(format!("Cloud download failed with status {}", status));
    }

    let decrypted = decrypt_backup_bytes(tenant_id, token, &bytes)?;
    let stage_dir = restore_stage_dir(app_handle)?;
    let staged_path = stage_dir.join(format!("{}_{}.db", tenant_id, sanitize_component(remote_id)));
    fs::write(&staged_path, decrypted).map_err(|e| format!("Failed to write staged backup: {}", e))?;
    Ok(staged_path)
}

#[tauri::command]
pub fn create_backup(
    db: State<'_, Database>,
    app_handle: tauri::AppHandle,
    tenant_id: String,
    user_id: String,
) -> Result<BackupLogRow, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    create_local_backup_internal(&conn, &app_handle, &tenant_id, &user_id)
}

#[tauri::command]
pub fn get_backup_history(
    db: State<'_, Database>,
    tenant_id: String,
    limit: Option<i64>,
) -> Result<Vec<BackupLogRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(20);
    let sql = format!(
        "SELECT id, backup_type, file_path, file_size, status, sync_status, remote_id,
                error_message, started_at, completed_at, created_by
         FROM backup_log WHERE tenant_id = ?1
         ORDER BY created_at DESC LIMIT {}",
        lim
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![tenant_id], |row| {
            Ok(BackupLogRow {
                id: row.get(0)?,
                backup_type: row.get(1)?,
                file_path: row.get(2)?,
                file_size: row.get(3)?,
                status: row.get(4)?,
                sync_status: row.get(5)?,
                remote_id: row.get(6)?,
                error_message: row.get(7)?,
                started_at: row.get(8)?,
                completed_at: row.get(9)?,
                created_by: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub fn get_cloud_config(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<CloudConfigRow, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    get_cloud_config_internal(&conn, &tenant_id)
}

#[tauri::command]
pub fn save_cloud_config(
    db: State<'_, Database>,
    tenant_id: String,
    data: CloudConfigInput,
) -> Result<CloudConfigRow, String> {
    let endpoint = data.cloud_endpoint.trim().to_string();
    let token = data.cloud_token.trim().to_string();
    if data.cloud_enabled && (endpoint.is_empty() || token.is_empty()) {
        return Err("Cloud endpoint and token are required when cloud backup is enabled".into());
    }

    let encrypted_token = encrypt_secret_for_storage(&tenant_id, &token)?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    conn.execute(
        "INSERT INTO cloud_config (id, tenant_id, cloud_endpoint, cloud_token, cloud_enabled, last_sync_at)
         VALUES (?1, ?2, ?3, ?4, ?5, NULL)
         ON CONFLICT(tenant_id) DO UPDATE SET
            cloud_endpoint = excluded.cloud_endpoint,
            cloud_token = excluded.cloud_token,
            cloud_enabled = excluded.cloud_enabled",
        params![Uuid::new_v4().to_string(), tenant_id, endpoint, encrypted_token, data.cloud_enabled as i32],
    )
    .map_err(|e| format!("Failed to save cloud config: {}", e))?;
    get_cloud_config_internal(&conn, &tenant_id)
}

#[tauri::command]
pub fn upload_backup_to_cloud(
    db: State<'_, Database>,
    app_handle: tauri::AppHandle,
    tenant_id: String,
    user_id: String,
) -> Result<BackupLogRow, String> {
    let (mut backup_row, config) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        license_guard::require_active(&conn, &tenant_id)?;
        let backup = create_local_backup_internal(&conn, &app_handle, &tenant_id, &user_id)?;
        let config = get_cloud_config_internal(&conn, &tenant_id)?;
        (backup, config)
    };

    if config.cloud_endpoint.trim().is_empty() || config.cloud_token.trim().is_empty() {
        return Err("Cloud backup is not configured".into());
    }

    let backup_path = PathBuf::from(
        backup_row
            .file_path
            .clone()
            .ok_or_else(|| "Backup file path is missing".to_string())?,
    );
    let local_bytes = fs::read(&backup_path).map_err(|e| format!("Failed to read local backup: {}", e))?;
    let encrypted_bytes = encrypt_backup_bytes(&tenant_id, &config.cloud_token, &local_bytes)?;

    let client = cloud_client()?;
    let response = client
        .post(cloud_resource_url(&config.cloud_endpoint, None))
        .header(AUTHORIZATION, format!("Bearer {}", config.cloud_token))
        .header(CONTENT_TYPE, "application/octet-stream")
        .header("X-Backup-Id", backup_row.id.clone())
        .header("X-Tenant-Id", tenant_id.clone())
        .header(
            "X-Backup-Name",
            backup_path
                .file_name()
                .map(|v| v.to_string_lossy().to_string())
                .unwrap_or_else(|| format!("{}.db.enc", backup_row.id)),
        )
        .body(encrypted_bytes)
        .send()
        .map_err(|e| format!("Cloud upload failed: {}", e))?;

    let status = response.status();
    let body = response.text().map_err(|e| format!("Failed reading upload response: {}", e))?;

    if !status.is_success() {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE backup_log SET sync_status = 'failed', error_message = ?2 WHERE id = ?1",
            params![backup_row.id, body],
        )
        .ok();
        return Err(format!("Cloud upload failed with status {}", status));
    }

    let remote_id = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|value| {
            value
                .get("remote_id")
                .or_else(|| value.get("id"))
                .or_else(|| value.get("file_id"))
                .and_then(|item| item.as_str())
                .map(|item| item.to_string())
        })
        .unwrap_or_else(|| backup_row.id.clone());

    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE backup_log SET sync_status = 'synced', remote_id = ?2, error_message = NULL WHERE id = ?1",
            params![backup_row.id, remote_id.clone()],
        )
        .map_err(|e| format!("Failed updating backup sync status: {}", e))?;
        conn.execute(
            "UPDATE cloud_config SET last_sync_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE tenant_id = ?1",
            params![tenant_id],
        )
        .ok();
    }

    backup_row.sync_status = Some("synced".into());
    backup_row.remote_id = Some(remote_id);
    Ok(backup_row)
}

#[tauri::command]
pub fn get_cloud_backups(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<Vec<CloudBackupRow>, String> {
    let config = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        get_cloud_config_internal(&conn, &tenant_id)?
    };
    if config.cloud_endpoint.trim().is_empty() || config.cloud_token.trim().is_empty() {
        return Ok(Vec::new());
    }

    let client = cloud_client()?;
    let response = client
        .get(cloud_resource_url(&config.cloud_endpoint, None))
        .header(AUTHORIZATION, format!("Bearer {}", config.cloud_token))
        .send()
        .map_err(|e| format!("Failed to fetch cloud backups: {}", e))?;

    let status = response.status();
    let body = response.text().map_err(|e| format!("Failed reading cloud backups response: {}", e))?;
    if !status.is_success() {
        return Err(format!("Failed to fetch cloud backups: HTTP {}", status));
    }

    let value = serde_json::from_str::<Value>(&body)
        .map_err(|e| format!("Cloud backup list is not valid JSON: {}", e))?;
    Ok(parse_cloud_backup_list(value))
}

#[tauri::command]
pub fn delete_cloud_backup(
    db: State<'_, Database>,
    tenant_id: String,
    remote_id: String,
) -> Result<(), String> {
    let config = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        license_guard::require_active(&conn, &tenant_id)?;
        get_cloud_config_internal(&conn, &tenant_id)?
    };
    if config.cloud_endpoint.trim().is_empty() || config.cloud_token.trim().is_empty() {
        return Err("Cloud backup is not configured".into());
    }

    let client = cloud_client()?;
    let response = client
        .delete(cloud_resource_url(&config.cloud_endpoint, Some(&remote_id)))
        .header(AUTHORIZATION, format!("Bearer {}", config.cloud_token))
        .send()
        .map_err(|e| format!("Failed deleting cloud backup: {}", e))?;
    if !response.status().is_success() {
        return Err(format!("Failed deleting cloud backup: HTTP {}", response.status()));
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE backup_log SET remote_id = NULL, sync_status = 'pending' WHERE tenant_id = ?1 AND remote_id = ?2",
        params![tenant_id, remote_id],
    )
    .ok();
    Ok(())
}

#[tauri::command]
pub fn restore_from_cloud(
    db: State<'_, Database>,
    app_handle: tauri::AppHandle,
    tenant_id: String,
    remote_id: String,
    confirm: bool,
    staged_file_path: Option<String>,
) -> Result<RestoreVerification, String> {
    let config = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        license_guard::require_active(&conn, &tenant_id)?;
        get_cloud_config_internal(&conn, &tenant_id)?
    };
    if config.cloud_endpoint.trim().is_empty() || config.cloud_token.trim().is_empty() {
        return Err("Cloud backup is not configured".into());
    }

    let staged_path = if let Some(existing) = staged_file_path.filter(|v| !v.trim().is_empty()) {
        PathBuf::from(existing)
    } else {
        stage_cloud_backup(&app_handle, &tenant_id, &config.cloud_endpoint, &config.cloud_token, &remote_id)?
    };

    let verification = build_restore_verification(&remote_id, &staged_path)?;
    if !confirm {
        return Ok(verification);
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let backup_dir = backups_dir(&app_handle)?;
    let safety_backup = backup_dir.join(format!(
        "{}_temp_backup_{}.db",
        tenant_id,
        chrono::Utc::now().format("%Y-%m-%d_%H%M%S")
    ));
    let vacuum_sql = format!("VACUUM INTO '{}'", sqlite_path_literal(&safety_backup));
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| format!("Failed preparing live DB for restore: {}", e))?;
    conn.execute_batch(&vacuum_sql)
        .map_err(|e| format!("Failed creating safety backup: {}", e))?;

    apply_restore_from_staged(&conn, &staged_path)?;
    Ok(verification)
}

#[tauri::command]
pub fn restore_from_local(
    db: State<'_, Database>,
    app_handle: tauri::AppHandle,
    tenant_id: String,
    backup_id: String,
    confirm: bool,
) -> Result<RestoreVerification, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;

    let file_path: String = conn
        .query_row(
            "SELECT file_path FROM backup_log WHERE id = ?1 AND tenant_id = ?2 AND status = 'completed'",
            params![backup_id, tenant_id],
            |row| row.get(0),
        )
        .map_err(|_| "Backup not found or incomplete".to_string())?;

    let staged_path = PathBuf::from(&file_path);
    if !staged_path.exists() {
        return Err(format!("Backup file not found: {}", file_path));
    }

    let verification = build_restore_verification(&backup_id, &staged_path)?;
    if !confirm {
        return Ok(verification);
    }

    // Create a safety backup before restoring
    let backup_dir = backups_dir(&app_handle)?;
    let safety_backup = backup_dir.join(format!(
        "safety_before_restore_{}.db",
        chrono::Utc::now().format("%Y%m%d_%H%M%S")
    ));
    let vacuum_sql = format!("VACUUM INTO '{}'", sqlite_path_literal(&safety_backup));
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| format!("Failed preparing live DB for restore: {}", e))?;
    conn.execute_batch(&vacuum_sql)
        .map_err(|e| format!("Failed creating safety backup: {}", e))?;

    apply_restore_from_staged(&conn, &staged_path)?;
    Ok(verification)
}

// ─── Audit Log ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct AuditLogRow {
    pub id: String,
    pub user_id: String,
    pub user_name: Option<String>,
    pub action: String,
    pub entity_type: String,
    pub entity_id: String,
    pub changes_json: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct AuditLogEntry {
    pub action: String,
    pub entity_type: String,
    pub entity_id: String,
    pub changes_json: Option<String>,
}

#[tauri::command]
pub fn write_audit_log(
    db: State<'_, Database>,
    tenant_id: String,
    user_id: String,
    entry: AuditLogEntry,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO audit_log (id, tenant_id, user_id, action, entity_type, entity_id, changes_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, tenant_id, user_id, entry.action, entry.entity_type, entry.entity_id, entry.changes_json],
    )
    .map_err(|e| format!("Failed to write audit log: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn get_audit_log(
    db: State<'_, Database>,
    tenant_id: String,
    entity_type: Option<String>,
    entity_id: Option<String>,
    user_id: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<AuditLogRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(100);

    let sql = format!(
        "SELECT a.id, a.user_id, u.full_name, a.action, a.entity_type, a.entity_id,
                a.changes_json, a.created_at
         FROM audit_log a
         LEFT JOIN users u ON a.user_id = u.id
         WHERE a.tenant_id = ?1
           AND (?2 IS NULL OR a.entity_type = ?2)
           AND (?3 IS NULL OR a.entity_id = ?3)
           AND (?4 IS NULL OR a.user_id = ?4)
         ORDER BY a.created_at DESC
         LIMIT {}",
        lim
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![tenant_id, entity_type, entity_id, user_id], |row| {
            Ok(AuditLogRow {
                id: row.get(0)?,
                user_id: row.get(1)?,
                user_name: row.get(2)?,
                action: row.get(3)?,
                entity_type: row.get(4)?,
                entity_id: row.get(5)?,
                changes_json: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

// ─── License System ─────────────────────────────────────────────────────────

use hmac::{Hmac, Mac};
use hex;

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
        .map_err(|e| format!("Failed to sync license status: {}", e))?;
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
) -> Result<LicenseInfo, String> {
    // License key format: base64(json_payload).hex(hmac_signature)
    let parts: Vec<&str> = data.license_key.split('.').collect();
    if parts.len() != 2 {
        return Err("Invalid license key format".into());
    }

    let payload_b64 = parts[0];
    let signature_hex = parts[1];

    // Verify HMAC
    let secret = license_secret();
    let mut mac = <HmacSha256 as Mac>::new_from_slice(&secret)
        .map_err(|e| format!("HMAC init failed: {}", e))?;
    mac.update(payload_b64.as_bytes());

    let expected_sig = hex::decode(signature_hex)
        .map_err(|_| "Invalid license key signature format".to_string())?;

    mac.verify_slice(&expected_sig)
        .map_err(|_| "Invalid license key — signature mismatch".to_string())?;

    // Decode payload
    use base64::Engine;
    let payload_bytes = base64::engine::general_purpose::STANDARD
        .decode(payload_b64)
        .map_err(|_| "Invalid license key payload".to_string())?;
    let payload: LicensePayload = serde_json::from_slice(&payload_bytes)
        .map_err(|e| format!("Invalid license key data: {}", e))?;

    // Verify tenant_id matches
    if payload.tenant_id != tenant_id {
        return Err("License key is not for this pharmacy".into());
    }

    // Check not expired
    if payload.expires < chrono::Utc::now().format("%Y-%m-%d").to_string() {
        return Err("License key has expired".into());
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
    .map_err(|e| format!("Failed to activate license: {}", e))?;

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
                    return Err("License has been revoked by the license server".into());
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
        return Err(format!("Server returned {}", resp.status()));
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
        return Err(format!("Server returned {}", resp.status()));
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
    .map_err(|e| format!("Failed to update server cache: {}", e))?;
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
    .map_err(|e| format!("Failed to set offline grace: {}", e))?;
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
                message: "No license server configured".into(),
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
                message: "No activated license found".into(),
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
                message: if sv.revoked { "License has been revoked".into() } else { "License is valid".into() },
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
                message: format!("Server unreachable (offline grace extended): {}", e),
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

// ─── Onboarding ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct OnboardingStatus {
    pub completed: bool,
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
pub fn check_onboarding(db: State<'_, Database>) -> Result<OnboardingStatus, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let completed: i64 = conn
        .query_row(
            "SELECT onboarding_completed FROM tenants WHERE id = 'default-tenant' LIMIT 1",
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
) -> Result<(), String> {
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
        .map_err(|e| format!("Hash password: {}", e))?
        .to_string();

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let username_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM users
             WHERE tenant_id = 'default-tenant'
               AND id <> 'user-admin'
               AND deleted_at IS NULL
               AND username = ?1",
            params![username],
            |row| row.get(0),
        )
        .map_err(|e| format!("Check username: {}", e))?;
    if username_exists > 0 {
        return Err("اسم المستخدم مستخدم بالفعل".into());
    }

    conn.execute(
        "UPDATE tenants SET
            name = ?1, name_ar = ?2, phone = ?3, address = ?4,
            license_number = ?5, currency_code = ?6, timezone = ?7,
            onboarding_completed = 1,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = 'default-tenant'",
        params![
            pharmacy_name,
            data.pharmacy_name_ar,
            data.phone,
            data.address,
            data.license_number,
            data.currency_code,
            data.timezone,
        ],
    )
    .map_err(|e| format!("Update tenant: {}", e))?;

    conn.execute(
        "UPDATE branches SET
            name = ?1, name_ar = ?2,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = 'main-branch' AND tenant_id = 'default-tenant'",
        params![branch_name, data.branch_name_ar],
    )
    .map_err(|e| format!("Update branch: {}", e))?;

    let email_normalized = data.owner_email
        .as_deref()
        .map(|e| e.trim().to_lowercase())
        .filter(|e| !e.is_empty());

    conn.execute(
        "UPDATE users SET
            username = ?1, full_name = ?2, full_name_ar = ?3,
            password_hash = ?4, email = ?5,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = 'user-admin' AND tenant_id = 'default-tenant'",
        params![
            username,
            admin_full_name,
            data.admin_full_name_ar,
            password_hash,
            email_normalized,
        ],
    )
    .map_err(|e| format!("Update admin user: {}", e))?;

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
) -> Result<ActivateLicenseCloudResult, String> {
    const DEFAULT_CLOUD_ENDPOINT: &str = "http://178.104.158.147";

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
        .unwrap_or_else(|| DEFAULT_CLOUD_ENDPOINT.to_string());

    let url = format!("{}/v1/activate", endpoint.trim_end_matches('/'));
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

    let sync_token = result["sync_token"].as_str().ok_or("no sync_token in response")?.to_string();
    let tenant_id = result["tenant_id"].as_str().ok_or("no tenant_id in response")?.to_string();
    let expires_at = result["expires_at"].as_str().map(|s| s.to_string());
    let plan = result["plan"].as_str().unwrap_or("basic").to_string();
    let max_users = result["max_users"].as_i64().unwrap_or(5);
    let max_branches = result["max_branches"].as_i64().unwrap_or(3);

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO cloud_sync_config (key, value) VALUES ('token', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![sync_token],
    ).map_err(|e| format!("Save sync token: {}", e))?;
    conn.execute(
        "INSERT INTO cloud_sync_config (key, value) VALUES ('tenant_id', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![tenant_id],
    ).map_err(|e| format!("Save cloud tenant_id: {}", e))?;

    // Mirror all plan details into the local tenants table
    conn.execute(
        "UPDATE tenants SET subscription_plan = ?1, max_users = ?2, max_branches = ?3,
         subscription_status = 'active',
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = 'default-tenant'",
        params![plan, max_users, max_branches],
    ).map_err(|e| format!("Update tenant plan: {}", e))?;

    if let Some(ref exp) = expires_at {
        conn.execute(
            "INSERT INTO cloud_sync_config (key, value) VALUES ('expires_at', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![exp],
        ).map_err(|e| format!("Save expires_at: {}", e))?;
        conn.execute(
            "UPDATE tenants SET subscription_expiry = ?1,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = 'default-tenant'",
            params![exp],
        ).map_err(|e| format!("Update tenant expiry: {}", e))?;
    }

    std::env::set_var("PMS_OWNER_SYNC_TOKEN", &sync_token);

    Ok(ActivateLicenseCloudResult { sync_token, tenant_id, expires_at, plan, max_users, max_branches })
}

#[tauri::command]
pub fn renew_license_cloud(
    db: State<'_, Database>,
    data: RenewLicenseCloudData,
) -> Result<RenewLicenseCloudResult, String> {
    const DEFAULT_CLOUD_ENDPOINT: &str = "http://178.104.158.147";

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let endpoint: String = conn
        .query_row("SELECT value FROM cloud_sync_config WHERE key = 'endpoint'", [], |r| r.get(0))
        .ok()
        .filter(|s: &String| !s.is_empty())
        .or_else(|| std::env::var("PMS_OWNER_SYNC_ENDPOINT").ok().filter(|s| !s.is_empty()))
        .unwrap_or_else(|| DEFAULT_CLOUD_ENDPOINT.to_string());

    let token: String = conn
        .query_row("SELECT value FROM cloud_sync_config WHERE key = 'token'", [], |r| r.get(0))
        .ok()
        .filter(|s: &String| !s.is_empty())
        .or_else(|| std::env::var("PMS_OWNER_SYNC_TOKEN").ok().filter(|s| !s.is_empty()))
        .ok_or_else(|| "لا يوجد رمز مزامنة. يرجى تفعيل الترخيص أولاً".to_string())?;

    drop(conn); // release lock before HTTP call

    let url = format!("{}/v1/renew", endpoint.trim_end_matches('/'));
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

    conn2.execute(
        "UPDATE tenants SET subscription_plan = ?1, max_users = ?2, max_branches = ?3,
         subscription_status = 'active',
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = 'default-tenant'",
        params![plan, max_users, max_branches],
    ).map_err(|e| format!("Update tenant plan after renewal: {}", e))?;

    if let Some(ref exp) = expires_at {
        conn2.execute(
            "INSERT INTO cloud_sync_config (key, value) VALUES ('expires_at', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![exp],
        ).map_err(|e| format!("Save expires_at: {}", e))?;
        conn2.execute(
            "UPDATE tenants SET subscription_expiry = ?1,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = 'default-tenant'",
            params![exp],
        ).map_err(|e| format!("Update tenant expiry after renewal: {}", e))?;
    }

    Ok(RenewLicenseCloudResult { ok: true, expires_at, plan, max_users, max_branches })
}

// ─── Cloud Sync Endpoint Config ─────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SyncEndpointConfig {
    pub endpoint: String,
    pub token: String,
}

#[derive(Debug, Deserialize)]
pub struct SyncEndpointConfigUpdate {
    pub endpoint: String,
    pub token: String,
}

pub fn init_cloud_config_from_db(db: &Database) {
    let conn = match db.conn.lock() {
        Ok(c) => c,
        Err(_) => return,
    };
    let endpoint: Option<String> = conn
        .query_row("SELECT value FROM cloud_sync_config WHERE key = 'endpoint'", [], |r| r.get(0))
        .ok()
        .filter(|s: &String| !s.is_empty());
    let token: Option<String> = conn
        .query_row("SELECT value FROM cloud_sync_config WHERE key = 'token'", [], |r| r.get(0))
        .ok()
        .filter(|s: &String| !s.is_empty());

    if let Some(ep) = endpoint {
        std::env::set_var("PMS_OWNER_SYNC_ENDPOINT", ep);
    }
    if let Some(tok) = token {
        std::env::set_var("PMS_OWNER_SYNC_TOKEN", tok);
    }
}

#[tauri::command]
pub fn get_sync_config(db: State<'_, Database>) -> Result<SyncEndpointConfig, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let endpoint = conn
        .query_row("SELECT value FROM cloud_sync_config WHERE key = 'endpoint'", [], |row| row.get(0))
        .unwrap_or_else(|_| std::env::var("PMS_OWNER_SYNC_ENDPOINT").unwrap_or_default());
    let token = conn
        .query_row("SELECT value FROM cloud_sync_config WHERE key = 'token'", [], |row| row.get(0))
        .unwrap_or_else(|_| std::env::var("PMS_OWNER_SYNC_TOKEN").unwrap_or_default());
    Ok(SyncEndpointConfig { endpoint, token })
}

#[tauri::command]
pub fn save_sync_config(
    db: State<'_, Database>,
    data: SyncEndpointConfigUpdate,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO cloud_sync_config (key, value) VALUES ('endpoint', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![data.endpoint.trim()],
    ).map_err(|e| format!("Save endpoint: {}", e))?;
    conn.execute(
        "INSERT INTO cloud_sync_config (key, value) VALUES ('token', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![data.token.trim()],
    ).map_err(|e| format!("Save token: {}", e))?;
    std::env::set_var("PMS_OWNER_SYNC_ENDPOINT", data.endpoint.trim());
    std::env::set_var("PMS_OWNER_SYNC_TOKEN", data.token.trim());
    Ok(())
}

// ─── Cloud Config Poll ────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct CloudRemoteConfig {
    pub status: String,
    pub expires_at: Option<String>,
    pub announcement: Option<String>,
    pub announcement_type: Option<String>,
}

#[tauri::command]
pub fn fetch_cloud_config(db: State<'_, Database>) -> Result<CloudRemoteConfig, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let endpoint = conn
        .query_row("SELECT value FROM cloud_sync_config WHERE key = 'endpoint'", [], |r| r.get::<_, String>(0))
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| std::env::var("PMS_OWNER_SYNC_ENDPOINT").ok())
        .unwrap_or_default();

    let token = conn
        .query_row("SELECT value FROM cloud_sync_config WHERE key = 'token'", [], |r| r.get::<_, String>(0))
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| std::env::var("PMS_OWNER_SYNC_TOKEN").ok())
        .unwrap_or_default();

    drop(conn);

    if endpoint.is_empty() || token.is_empty() {
        return Ok(CloudRemoteConfig {
            status: "active".to_string(),
            expires_at: None,
            announcement: None,
            announcement_type: None,
        });
    }

    let url = format!("{}/v1/config", endpoint.trim_end_matches('/'));
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .map_err(|e| format!("Network error: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Server returned {}", response.status()));
    }

    let data: serde_json::Value = response.json().map_err(|e| e.to_string())?;

    let status = data["status"].as_str().unwrap_or("active").to_string();
    let expires_at = data["expires_at"].as_str().map(|s| s.to_string());
    let announcement = data["announcement"].as_str().map(|s| s.to_string());
    let announcement_type = data["announcement_type"].as_str().map(|s| s.to_string());

    let conn2 = db.conn.lock().map_err(|e| e.to_string())?;
    let upsert = |key: &str, val: &str| -> Result<(), String> {
        conn2.execute(
            "INSERT INTO cloud_sync_config (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, val],
        ).map_err(|e| format!("Cache {}: {}", key, e))?;
        Ok(())
    };

    upsert("cloud_status", &status)?;
    if let Some(ref exp) = expires_at {
        upsert("cloud_expires_at", exp)?;
    }
    if let Some(ref ann) = announcement {
        upsert("cloud_announcement", ann)?;
    } else {
        conn2.execute(
            "DELETE FROM cloud_sync_config WHERE key = 'cloud_announcement'", [],
        ).ok();
    }
    if let Some(ref ann_type) = announcement_type {
        upsert("cloud_announcement_type", ann_type)?;
    } else {
        conn2.execute(
            "DELETE FROM cloud_sync_config WHERE key = 'cloud_announcement_type'", [],
        ).ok();
    }

    Ok(CloudRemoteConfig { status, expires_at, announcement, announcement_type })
}

#[tauri::command]
pub fn get_cloud_remote_config_cached(db: State<'_, Database>) -> Result<CloudRemoteConfig, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let get = |key: &str| -> Option<String> {
        conn.query_row(
            "SELECT value FROM cloud_sync_config WHERE key = ?1",
            params![key],
            |r| r.get::<_, String>(0),
        ).ok().filter(|s| !s.is_empty())
    };

    Ok(CloudRemoteConfig {
        status: get("cloud_status").unwrap_or_else(|| "active".to_string()),
        expires_at: get("cloud_expires_at"),
        announcement: get("cloud_announcement"),
        announcement_type: get("cloud_announcement_type"),
    })
}
