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
use crate::commands::license_guard;
use crate::commands::session_state::{AuthSessionState, resolve_identity};

// ─── Backup System ───

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

pub(crate) fn cloud_resource_url(endpoint: &str, remote_id: Option<&str>) -> String {
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
        .map_err(|e| format!("فشل الحصول على مجلد بيانات التطبيق: {}", e))?
        .join("backups");
    fs::create_dir_all(&dir).map_err(|e| format!("فشل إنشاء مجلد النسخ الاحتياطي: {}", e))?;
    Ok(dir)
}

fn restore_stage_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("فشل الحصول على مجلد بيانات التطبيق: {}", e))?
        .join("restore-staging");
    fs::create_dir_all(&dir).map_err(|e| format!("فشل إنشاء مجلد استعادة النسخ الاحتياطي: {}", e))?;
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
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("فشل تهيئة التشفير: {}", e))?;
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| "فشل التشفير".to_string())?;
    let mut payload = header.to_vec();
    payload.extend_from_slice(&nonce_bytes);
    payload.extend_from_slice(&ciphertext);
    Ok(payload)
}

fn decrypt_payload(key: &[u8; 32], header: &[u8], payload: &[u8]) -> Result<Vec<u8>, String> {
    if payload.len() <= header.len() + 12 || &payload[..header.len()] != header {
        return Err("تنسيق حمولة مشفرة غير صالح".into());
    }
    let nonce = Nonce::from_slice(&payload[header.len()..header.len() + 12]);
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("فشل تهيئة التشفير: {}", e))?;
    cipher
        .decrypt(nonce, &payload[header.len() + 12..])
        .map_err(|_| "فشل فك التشفير".to_string())
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
        .map_err(|_| "رمز السحابة المخزن غير صالح".to_string())?;
    let key = derive_key(&[CLOUD_CONFIG_SECRET, tenant_id.as_bytes()]);
    let decrypted = decrypt_payload(&key, b"PMSCFG1", &payload)?;
    String::from_utf8(decrypted).map_err(|_| "الرمز المخزن ليس UTF-8 صالح".to_string())
}

pub(crate) fn encrypt_backup_bytes(tenant_id: &str, cloud_token: &str, bytes: &[u8]) -> Result<Vec<u8>, String> {
    let key = derive_key(&[CLOUD_BACKUP_SECRET, tenant_id.as_bytes(), cloud_token.as_bytes()]);
    encrypt_payload(&key, b"PMSBK1", bytes)
}

fn decrypt_backup_bytes(tenant_id: &str, cloud_token: &str, bytes: &[u8]) -> Result<Vec<u8>, String> {
    let key = derive_key(&[CLOUD_BACKUP_SECRET, tenant_id.as_bytes(), cloud_token.as_bytes()]);
    decrypt_payload(&key, b"PMSBK1", bytes)
}

pub(crate) fn cloud_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|e| format!("فشل بناء عميل السحابة: {}", e))
}

fn count_rows(conn: &Connection, table: &str) -> i64 {
    let sql = format!("SELECT COUNT(*) FROM {}", table);
    conn.query_row(&sql, [], |row| row.get(0)).unwrap_or(0)
}

fn build_restore_verification(remote_id: &str, staged_path: &Path) -> Result<RestoreVerification, String> {
    let conn = Connection::open(staged_path).map_err(|e| format!("فشل فتح النسخة الاحتياطية المؤقتة: {}", e))?;
    let metadata = fs::metadata(staged_path).map_err(|e| format!("فشل فحص النسخة الاحتياطية المؤقتة: {}", e))?;
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
    conn.execute_batch(&attach_sql).map_err(|e| format!("فشل إرفاق قاعدة بيانات الاستعادة: {}", e))?;

    let main_tables = list_tables(conn, "main")?;
    let restore_tables = list_tables(conn, "restore_db")?;
    let restore_set: std::collections::HashSet<_> = restore_tables.into_iter().collect();
    let shared_tables: Vec<String> = main_tables
        .into_iter()
        .filter(|table| restore_set.contains(table))
        .collect();

    conn.execute_batch("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;")
        .map_err(|e| format!("فشل بدء معاملة الاستعادة: {}", e))?;

    for table in &shared_tables {
        let sql = format!("DELETE FROM \"{}\"", table.replace('"', "\"\""));
        if let Err(e) = conn.execute_batch(&sql) {
            let _ = conn.execute_batch("ROLLBACK; DETACH DATABASE restore_db; PRAGMA foreign_keys=ON;");
            return Err(format!("فشل مسح {} أثناء الاستعادة: {}", table, e));
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
            return Err(format!("فشل نسخ {} أثناء الاستعادة: {}", table, e));
        }
    }

    conn.execute_batch("COMMIT; DETACH DATABASE restore_db; PRAGMA foreign_keys=ON; PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| format!("فشل إنهاء الاستعادة: {}", e))?;
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

pub(crate) fn create_local_backup_internal(
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
            return Err(format!("فشل نقطة تفتيش WAL: {}", e));
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
            Err(format!("فشل النسخ الاحتياطي: {}", e))
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
        .map_err(|e| format!("فشل تنزيل السحابة: {}", e))?;

    let status = response.status();
    let bytes = response.bytes().map_err(|e| format!("فشل قراءة استجابة السحابة: {}", e))?;
    if !status.is_success() {
        return Err(format!("فشل تنزيل السحابة بالحالة {}", status));
    }

    let decrypted = decrypt_backup_bytes(tenant_id, token, &bytes)?;
    let stage_dir = restore_stage_dir(app_handle)?;
    let staged_path = stage_dir.join(format!("{}_{}.db", tenant_id, sanitize_component(remote_id)));
    fs::write(&staged_path, decrypted).map_err(|e| format!("فشل كتابة النسخة الاحتياطية المؤقتة: {}", e))?;
    Ok(staged_path)
}

#[tauri::command]
pub fn create_backup(
    db: State<'_, Database>,
    app_handle: tauri::AppHandle,
    tenant_id: String,
    user_id: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<BackupLogRow, String> {
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, "")?;
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
    auth_session: State<'_, AuthSessionState>,
) -> Result<CloudConfigRow, String> {
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    let endpoint = data.cloud_endpoint.trim().to_string();
    let token = data.cloud_token.trim().to_string();
    if data.cloud_enabled && (endpoint.is_empty() || token.is_empty()) {
        return Err("نقطة النهاية السحابية والرمز مطلوبان عند تفعيل النسخ الاحتياطي السحابي".into());
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
    .map_err(|e| format!("فشل حفظ إعدادات السحابة: {}", e))?;
    get_cloud_config_internal(&conn, &tenant_id)
}

#[tauri::command]
pub fn upload_backup_to_cloud(
    db: State<'_, Database>,
    app_handle: tauri::AppHandle,
    tenant_id: String,
    user_id: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<BackupLogRow, String> {
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, "")?;
    let (mut backup_row, config) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        license_guard::require_active(&conn, &tenant_id)?;
        let backup = create_local_backup_internal(&conn, &app_handle, &tenant_id, &user_id)?;
        let config = get_cloud_config_internal(&conn, &tenant_id)?;
        (backup, config)
    };

    if config.cloud_endpoint.trim().is_empty() || config.cloud_token.trim().is_empty() {
        return Err("النسخ الاحتياطي السحابي غير مكون".into());
    }

    let backup_path = PathBuf::from(
        backup_row
            .file_path
            .clone()
            .ok_or_else(|| "مسار ملف النسخ الاحتياطي مفقود".to_string())?,
    );
    let local_bytes = fs::read(&backup_path).map_err(|e| format!("فشل قراءة النسخة الاحتياطية المحلية: {}", e))?;
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
        .map_err(|e| format!("فشل رفع السحابة: {}", e))?;

    let status = response.status();
    let body = response.text().map_err(|e| format!("فشل قراءة استجابة الرفع: {}", e))?;

    if !status.is_success() {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE backup_log SET sync_status = 'failed', error_message = ?2 WHERE id = ?1",
            params![backup_row.id, body],
        )
        .ok();
        return Err(format!("فشل رفع السحابة بالحالة {}", status));
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
        .map_err(|e| format!("فشل تحديث حالة مزامنة النسخ الاحتياطي: {}", e))?;
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
        .map_err(|e| format!("فشل جلب النسخ الاحتياطية السحابية: {}", e))?;

    let status = response.status();
    let body = response.text().map_err(|e| format!("فشل قراءة استجابة النسخ الاحتياطية السحابية: {}", e))?;
    if !status.is_success() {
        return Err(format!("فشل جلب النسخ الاحتياطية السحابية: HTTP {}", status));
    }

    let value = serde_json::from_str::<Value>(&body)
        .map_err(|e| format!("قائمة النسخ الاحتياطي السحابي ليست JSON صالحة: {}", e))?;
    Ok(parse_cloud_backup_list(value))
}

#[tauri::command]
pub fn delete_cloud_backup(
    db: State<'_, Database>,
    tenant_id: String,
    remote_id: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    let config = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        license_guard::require_active(&conn, &tenant_id)?;
        get_cloud_config_internal(&conn, &tenant_id)?
    };
    if config.cloud_endpoint.trim().is_empty() || config.cloud_token.trim().is_empty() {
        return Err("النسخ الاحتياطي السحابي غير مكون".into());
    }

    let client = cloud_client()?;
    let response = client
        .delete(cloud_resource_url(&config.cloud_endpoint, Some(&remote_id)))
        .header(AUTHORIZATION, format!("Bearer {}", config.cloud_token))
        .send()
        .map_err(|e| format!("فشل حذف النسخة الاحتياطية السحابية: {}", e))?;
    if !response.status().is_success() {
        return Err(format!("فشل حذف النسخة الاحتياطية السحابية: HTTP {}", response.status()));
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
    auth_session: State<'_, AuthSessionState>,
) -> Result<RestoreVerification, String> {
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    let config = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        license_guard::require_active(&conn, &tenant_id)?;
        get_cloud_config_internal(&conn, &tenant_id)?
    };
    if config.cloud_endpoint.trim().is_empty() || config.cloud_token.trim().is_empty() {
        return Err("النسخ الاحتياطي السحابي غير مكون".into());
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
        .map_err(|e| format!("فشل تحضير قاعدة البيانات للاستعادة: {}", e))?;
    conn.execute_batch(&vacuum_sql)
        .map_err(|e| format!("فشل إنشاء نسخة احتياطية آمنة: {}", e))?;

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
    auth_session: State<'_, AuthSessionState>,
) -> Result<RestoreVerification, String> {
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;

    let file_path: String = conn
        .query_row(
            "SELECT file_path FROM backup_log WHERE id = ?1 AND tenant_id = ?2 AND status = 'completed'",
            params![backup_id, tenant_id],
            |row| row.get(0),
        )
        .map_err(|_| "النسخة الاحتياطية غير موجودة أو غير مكتملة".to_string())?;

    let staged_path = PathBuf::from(&file_path);
    if !staged_path.exists() {
        return Err(format!("لم يتم العثور على ملف النسخ الاحتياطي: {}", file_path));
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
        .map_err(|e| format!("فشل تحضير قاعدة البيانات للاستعادة: {}", e))?;
    conn.execute_batch(&vacuum_sql)
        .map_err(|e| format!("فشل إنشاء نسخة احتياطية آمنة: {}", e))?;

    apply_restore_from_staged(&conn, &staged_path)?;
    Ok(verification)
}

/// Returns the most recent auto-backup log entry for status display.
#[tauri::command]
pub fn get_auto_backup_status(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<Option<BackupLogRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let row = conn
        .query_row(
            "SELECT id, backup_type, file_path, file_size, status, sync_status, remote_id,
                    error_message, started_at, completed_at, created_by
             FROM backup_log
             WHERE tenant_id = ?1 AND backup_type = 'auto'
             ORDER BY started_at DESC LIMIT 1",
            rusqlite::params![tenant_id],
            |row| {
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
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(row)
}



