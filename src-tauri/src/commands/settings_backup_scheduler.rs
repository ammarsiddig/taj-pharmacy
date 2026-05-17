use crate::commands::settings_backup::{cloud_client, cloud_resource_url, encrypt_backup_bytes};
use crate::db::Database;
use rusqlite::Connection;
use std::fs;
use uuid::Uuid;

const DEFAULT_BACKUP_INTERVAL_HOURS: u64 = 24;

fn parse_backup_interval() -> std::time::Duration {
    let hours = std::env::var("PMS_BACKUP_INTERVAL_HOURS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(DEFAULT_BACKUP_INTERVAL_HOURS);
    std::time::Duration::from_secs(hours * 3600)
}

fn resolve_backup_config(conn: &Connection) -> (String, String, String) {
    let tenant_id = conn
        .query_row("SELECT id FROM tenants LIMIT 1", [], |row| row.get::<_, String>(0))
        .unwrap_or_else(|_| "default-tenant".to_string());

    let endpoint = std::env::var("PMS_OWNER_SYNC_ENDPOINT").unwrap_or_default();
    let token = std::env::var("PMS_OWNER_SYNC_TOKEN").unwrap_or_default();

    if endpoint.is_empty() || token.is_empty() {
        let ep = conn.query_row(
            "SELECT value FROM cloud_sync_config WHERE key = 'endpoint'", [],
            |row| row.get::<_, String>(0)).unwrap_or_default();
        let tk = conn.query_row(
            "SELECT value FROM cloud_sync_config WHERE key = 'token'", [],
            |row| row.get::<_, String>(0)).unwrap_or_default();
        (ep, tk, tenant_id)
    } else {
        (endpoint, token, tenant_id)
    }
}

/// Spawns a background thread that auto-creates and uploads cloud backups.
pub fn spawn_backup_scheduler(db: Database, app_data_dir: std::path::PathBuf) {
    let interval = parse_backup_interval();
    log::info!("backup scheduler: interval={}h", interval.as_secs() / 3600);

    std::thread::spawn(move || loop {
        std::thread::sleep(interval);

        let (endpoint, token, tenant_id) = {
            let conn = match db.conn.lock() { Ok(c) => c, Err(_) => continue };
            resolve_backup_config(&conn)
        };

        if endpoint.is_empty() || token.is_empty() { continue; }

        log::info!("backup scheduler: auto-backup for {}", tenant_id);

        let result = (|| -> Result<(), String> {
            let conn = db.conn.lock().map_err(|e| e.to_string())?;
            let backup_dir = app_data_dir.join("backups");
            fs::create_dir_all(&backup_dir).map_err(|e| format!("backup dir: {}", e))?;

            let backup_id = Uuid::new_v4().to_string();
            let started_at = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
            let date_str = chrono::Utc::now().format("%Y-%m-%d_%H%M%S").to_string();
            let backup_filename = format!("{}_auto_backup_{}.db", tenant_id, date_str);
            let backup_path = backup_dir.join(&backup_filename);

            conn.execute(
                "INSERT INTO backup_log (id, tenant_id, backup_type, file_path, status, sync_status, started_at)
                 VALUES (?1, ?2, 'auto', ?3, 'started', 'pending', ?4)",
                rusqlite::params![backup_id, tenant_id, backup_path.to_string_lossy().to_string(), started_at],
            ).map_err(|e| e.to_string())?;

            conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);").map_err(|e| e.to_string())?;

            let vacuum_sql = format!("VACUUM INTO '{}'", backup_path.to_string_lossy().replace('\'', "''"));
            conn.execute_batch(&vacuum_sql).map_err(|e| format!("VACUUM: {}", e))?;

            let file_size = fs::metadata(&backup_path).map(|m| m.len() as i64).unwrap_or(0);
            conn.execute(
                "UPDATE backup_log SET status = 'completed', file_size = ?2,
                    completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE id = ?1",
                rusqlite::params![backup_id, file_size],
            ).map_err(|e| e.to_string())?;

            let local_bytes = fs::read(&backup_path).map_err(|e| format!("read: {}", e))?;
            let encrypted_bytes = encrypt_backup_bytes(&tenant_id, &token, &local_bytes)?;

            let client = cloud_client()?;
            let response = client
                .post(cloud_resource_url(&endpoint, None))
                .header(reqwest::header::AUTHORIZATION, format!("Bearer {}", token))
                .header(reqwest::header::CONTENT_TYPE, "application/octet-stream")
                .header("X-Backup-Id", &backup_id)
                .header("X-Tenant-Id", &tenant_id)
                .header("X-Backup-Name", &backup_filename)
                .body(encrypted_bytes)
                .send()
                .map_err(|e| format!("upload: {}", e))?;

            let status = response.status();
            if !status.is_success() {
                let body = response.text().unwrap_or_default();
                conn.execute(
                    "UPDATE backup_log SET sync_status = 'failed', error_message = ?2 WHERE id = ?1",
                    rusqlite::params![backup_id, body],
                ).ok();
                return Err(format!("upload failed: HTTP {}", status));
            }

            conn.execute(
                "UPDATE backup_log SET sync_status = 'synced', remote_id = ?2 WHERE id = ?1",
                rusqlite::params![backup_id, backup_id],
            ).ok();

            log::info!("backup scheduler: uploaded {} ({} bytes)", backup_filename, file_size);
            Ok(())
        })();

        if let Err(e) = result { log::warn!("backup scheduler: {}", e); }
    });
}
