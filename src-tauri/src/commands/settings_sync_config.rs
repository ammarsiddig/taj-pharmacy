use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Database;
use crate::commands::session_state::{AuthSessionState, resolve_identity};

const CANONICAL_CLOUD_ENDPOINT: &str = "https://pharmacy.taj.systems";

fn normalize_cloud_endpoint(endpoint: &str) -> String {
    let trimmed = endpoint.trim().trim_end_matches('/');
    match trimmed {
        "" => CANONICAL_CLOUD_ENDPOINT.to_string(),
        "http://178.104.158.147" | "https://178.104.158.147" | "http://taj.systems" => {
            CANONICAL_CLOUD_ENDPOINT.to_string()
        }
        _ => trimmed.to_string(),
    }
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
        let normalized = normalize_cloud_endpoint(&ep);
        if normalized != ep {
            let _ = conn.execute(
                "UPDATE cloud_sync_config SET value = ?1 WHERE key = 'endpoint'",
                params![normalized],
            );
        }
        std::env::set_var("PMS_OWNER_SYNC_ENDPOINT", normalized);
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
    Ok(SyncEndpointConfig { endpoint: normalize_cloud_endpoint(&endpoint), token })
}

#[tauri::command]
pub fn save_sync_config(
    db: State<'_, Database>,
    data: SyncEndpointConfigUpdate,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, "", "", "")?;
    conn.execute(
        "INSERT INTO cloud_sync_config (key, value) VALUES ('endpoint', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![normalize_cloud_endpoint(&data.endpoint)],
    ).map_err(|e| format!("Save endpoint: {}", e))?;
    conn.execute(
        "INSERT INTO cloud_sync_config (key, value) VALUES ('token', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![data.token.trim()],
    ).map_err(|e| format!("Save token: {}", e))?;
    std::env::set_var("PMS_OWNER_SYNC_ENDPOINT", normalize_cloud_endpoint(&data.endpoint));
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
        return Err(format!("أعاد الخادم الحالة {}", response.status()));
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
