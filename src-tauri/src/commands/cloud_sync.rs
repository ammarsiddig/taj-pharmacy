use chrono::{DateTime, Duration as ChronoDuration, Utc};
use reqwest::blocking::Client;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;
use tauri::State;
use uuid::Uuid;

use crate::db::Database;

const DEFAULT_SYNC_INTERVAL_SECONDS: u64 = 120;
const DEFAULT_SYNC_PAGE_SIZE: i64 = 50;
const DEFAULT_SYNC_MAX_PAGES: i64 = 5;

#[derive(Clone, Default)]
pub struct CloudSyncRuntime {
    in_progress: Arc<AtomicBool>,
}

impl CloudSyncRuntime {
    fn try_start(&self) -> bool {
        self.in_progress
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
    }

    fn finish(&self) {
        self.in_progress.store(false, Ordering::Release);
    }
}

struct CloudSyncRunGuard<'a> {
    runtime: &'a CloudSyncRuntime,
}

impl Drop for CloudSyncRunGuard<'_> {
    fn drop(&mut self) {
        self.runtime.finish();
    }
}

fn acquire_run_guard(runtime: &CloudSyncRuntime) -> Result<CloudSyncRunGuard<'_>, String> {
    if !runtime.try_start() {
        return Err("Cloud sync export is already in progress.".into());
    }
    Ok(CloudSyncRunGuard { runtime })
}

#[derive(Debug, Clone, Copy)]
enum CloudSyncRunMode {
    Manual,
    Auto,
}

impl CloudSyncRunMode {
    fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Auto => "auto",
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct CloudSyncSchedulerConfig {
    interval: Duration,
    page_size: i64,
    max_pages: i64,
}

#[derive(Debug, Serialize)]
pub struct CloudSyncStatus {
    pub tenant_id: String,
    pub last_synced_at: Option<String>,
    pub last_attempt_at: Option<String>,
    pub last_error: Option<String>,
    pub last_auto_run_at: Option<String>,
    pub last_run_mode: Option<String>,
    pub last_run_processed: i64,
    pub last_run_synced: i64,
    pub last_run_failed: i64,
    pub last_run_retried: i64,
    pub pending_count: i64,
    pub failed_count: i64,
    pub retry_ready_count: i64,
    pub retry_waiting_count: i64,
    pub oldest_pending_created_at: Option<String>,
    pub oldest_failed_created_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CloudSyncOutboxRow {
    pub id: String,
    pub event_type: String,
    pub entity_type: String,
    pub entity_id: String,
    pub payload_json: Option<String>,
    pub status: String,
    pub attempt_count: i64,
    pub last_attempt_at: Option<String>,
    pub last_error: Option<String>,
    pub retry_ready: Option<bool>,
    pub next_retry_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CloudSyncOutboxInput {
    pub event_type: String,
    pub entity_type: String,
    pub entity_id: String,
    pub payload_json: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct QueueOwnerSnapshotResult {
    pub queued: i64,
    pub snapshot_event_id: String,
}

#[derive(Debug, Serialize)]
pub struct CloudSyncRunResult {
    pub endpoint: String,
    pub processed: i64,
    pub synced: i64,
    pub failed: i64,
    pub retried: i64,
    pub next_cursor: Option<String>,
    pub has_more_pending: bool,
    pub pages_run: i64,
}

#[derive(Debug)]
struct CloudSyncRunMetrics {
    processed: i64,
    synced: i64,
    failed: i64,
    retried: i64,
    last_error: Option<String>,
}

#[derive(Debug)]
struct OutboxProcessRow {
    id: String,
    event_type: String,
    entity_type: String,
    entity_id: String,
    payload_json: Option<String>,
    created_at: String,
    attempt_count: i64,
    last_attempt_at: Option<String>,
    status: String,
}

#[derive(Debug)]
struct CloudSyncPageResult {
    processed: i64,
    synced: i64,
    failed: i64,
    retried: i64,
    next_cursor: Option<String>,
    has_more_pending: bool,
    last_error: Option<String>,
}

#[cfg(test)]
thread_local! {
    static TEST_NOW: std::cell::RefCell<Option<DateTime<Utc>>> =
        const { std::cell::RefCell::new(None) };
}

fn current_time() -> DateTime<Utc> {
    #[cfg(test)]
    if let Some(now) = TEST_NOW.with(|value| value.borrow().clone()) {
        return now;
    }

    Utc::now()
}

fn now_iso() -> String {
    current_time().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

fn encode_cursor(created_at: &str, id: &str) -> String {
    format!("{}|{}", created_at, id)
}

fn parse_cursor(cursor: &str) -> Option<(String, String)> {
    let mut parts = cursor.splitn(2, '|');
    let created_at = parts.next()?.trim();
    let id = parts.next()?.trim();
    if created_at.is_empty() || id.is_empty() {
        return None;
    }
    Some((created_at.to_string(), id.to_string()))
}

fn parse_env_u64(name: &str, default_value: u64, min: u64, max: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.trim().parse::<u64>().ok())
        .map(|value| value.clamp(min, max))
        .unwrap_or(default_value)
}

fn parse_env_i64(name: &str, default_value: i64, min: i64, max: i64) -> i64 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.trim().parse::<i64>().ok())
        .map(|value| value.clamp(min, max))
        .unwrap_or(default_value)
}

fn scheduler_config_from_env() -> CloudSyncSchedulerConfig {
    CloudSyncSchedulerConfig {
        interval: Duration::from_secs(parse_env_u64(
            "PMS_OWNER_SYNC_INTERVAL_SECONDS",
            DEFAULT_SYNC_INTERVAL_SECONDS,
            15,
            3600,
        )),
        page_size: parse_env_i64(
            "PMS_OWNER_SYNC_PAGE_SIZE",
            DEFAULT_SYNC_PAGE_SIZE,
            1,
            500,
        ),
        max_pages: parse_env_i64(
            "PMS_OWNER_SYNC_MAX_PAGES_PER_CYCLE",
            DEFAULT_SYNC_MAX_PAGES,
            1,
            100,
        ),
    }
}

fn retry_backoff_seconds(attempt_count: i64) -> i64 {
    let exp = (attempt_count - 1).clamp(0, 16) as u32;
    let seconds = 5_i64.saturating_mul(2_i64.saturating_pow(exp));
    seconds.min(300)
}

fn parse_iso_to_utc(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

fn next_retry_at(last_attempt_at: Option<&str>, attempt_count: i64) -> Option<String> {
    let last_attempt_at = parse_iso_to_utc(last_attempt_at?)?;
    let next = last_attempt_at + ChronoDuration::seconds(retry_backoff_seconds(attempt_count));
    Some(next.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string())
}

fn is_retry_ready(last_attempt_at: Option<&str>, attempt_count: i64) -> bool {
    let Some(last_attempt_at) = last_attempt_at else {
        return true;
    };
    let Some(last) = parse_iso_to_utc(last_attempt_at) else {
        return true;
    };
    let elapsed = current_time().signed_duration_since(last);
    elapsed.num_seconds() >= retry_backoff_seconds(attempt_count)
}

fn cloud_sync_endpoint() -> Option<String> {
    std::env::var("PMS_OWNER_SYNC_ENDPOINT")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn cloud_sync_token() -> Option<String> {
    std::env::var("PMS_OWNER_SYNC_TOKEN")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn build_cloud_sync_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create cloud sync client: {}", e))
}

fn ensure_sync_state_row(conn: &rusqlite::Connection, tenant_id: &str) {
    conn.execute(
        "INSERT INTO cloud_sync_state (tenant_id, updated_at)
         VALUES (?1, ?2)
         ON CONFLICT(tenant_id) DO UPDATE SET
            updated_at = excluded.updated_at",
        params![tenant_id, now_iso()],
    )
    .ok();
}

fn record_sync_run_summary(
    conn: &rusqlite::Connection,
    tenant_id: &str,
    mode: CloudSyncRunMode,
    attempt_at: &str,
    metrics: &CloudSyncRunMetrics,
) {
    let last_synced_at = if metrics.synced > 0 {
        Some(attempt_at)
    } else {
        None
    };
    let last_auto_run_at = if matches!(mode, CloudSyncRunMode::Auto) {
        Some(attempt_at)
    } else {
        None
    };

    conn.execute(
        "INSERT INTO cloud_sync_state (
            tenant_id,
            last_synced_at,
            last_attempt_at,
            last_error,
            last_auto_run_at,
            last_run_mode,
            last_run_processed,
            last_run_synced,
            last_run_failed,
            last_run_retried,
            updated_at
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(tenant_id) DO UPDATE SET
            last_synced_at = COALESCE(excluded.last_synced_at, cloud_sync_state.last_synced_at),
            last_attempt_at = excluded.last_attempt_at,
            last_error = excluded.last_error,
            last_auto_run_at = COALESCE(excluded.last_auto_run_at, cloud_sync_state.last_auto_run_at),
            last_run_mode = excluded.last_run_mode,
            last_run_processed = excluded.last_run_processed,
            last_run_synced = excluded.last_run_synced,
            last_run_failed = excluded.last_run_failed,
            last_run_retried = excluded.last_run_retried,
            updated_at = excluded.updated_at",
        params![
            tenant_id,
            last_synced_at,
            attempt_at,
            metrics.last_error.as_deref(),
            last_auto_run_at,
            mode.as_str(),
            metrics.processed,
            metrics.synced,
            metrics.failed,
            metrics.retried,
            attempt_at,
        ],
    )
    .ok();
}

fn list_tenant_ids(db: &Database) -> Result<Vec<String>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id FROM tenants WHERE deleted_at IS NULL ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|row| row.ok())
        .collect();
    Ok(rows)
}

fn tenant_has_backlog(db: &Database, tenant_id: &str) -> Result<bool, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let backlog: bool = conn
        .query_row(
            "SELECT EXISTS(
                SELECT 1
                FROM cloud_sync_outbox
                WHERE tenant_id = ?1
                  AND status IN ('pending', 'failed', 'processing')
            )",
            params![tenant_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(backlog)
}

fn load_pending_rows(
    db: &Database,
    tenant_id: &str,
    limit: i64,
    cursor: Option<&str>,
) -> Result<Vec<OutboxProcessRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let parsed_cursor = cursor.and_then(parse_cursor);

    let mut stmt = if parsed_cursor.is_some() {
        conn.prepare(
            "SELECT id, event_type, entity_type, entity_id, payload_json, created_at, attempt_count, last_attempt_at, status
             FROM cloud_sync_outbox
             WHERE tenant_id = ?1
               AND status = 'pending'
               AND (created_at > ?2 OR (created_at = ?2 AND id > ?3))
             ORDER BY created_at ASC, id ASC
             LIMIT ?4",
        )
        .map_err(|e| e.to_string())?
    } else {
        conn.prepare(
            "SELECT id, event_type, entity_type, entity_id, payload_json, created_at, attempt_count, last_attempt_at, status
             FROM cloud_sync_outbox
             WHERE tenant_id = ?1 AND status = 'pending'
             ORDER BY created_at ASC, id ASC
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?
    };

    let rows = if let Some((cursor_created_at, cursor_id)) = parsed_cursor {
        stmt.query_map(params![tenant_id, cursor_created_at, cursor_id, limit], |row| {
            Ok(OutboxProcessRow {
                id: row.get(0)?,
                event_type: row.get(1)?,
                entity_type: row.get(2)?,
                entity_id: row.get(3)?,
                payload_json: row.get(4)?,
                created_at: row.get(5)?,
                attempt_count: row.get(6)?,
                last_attempt_at: row.get(7)?,
                status: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|row| row.ok())
        .collect()
    } else {
        stmt.query_map(params![tenant_id, limit], |row| {
            Ok(OutboxProcessRow {
                id: row.get(0)?,
                event_type: row.get(1)?,
                entity_type: row.get(2)?,
                entity_id: row.get(3)?,
                payload_json: row.get(4)?,
                created_at: row.get(5)?,
                attempt_count: row.get(6)?,
                last_attempt_at: row.get(7)?,
                status: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|row| row.ok())
        .collect()
    };

    Ok(rows)
}

fn load_retry_rows(
    db: &Database,
    tenant_id: &str,
    limit: i64,
) -> Result<Vec<OutboxProcessRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, event_type, entity_type, entity_id, payload_json, created_at, attempt_count, last_attempt_at, status
             FROM cloud_sync_outbox
             WHERE tenant_id = ?1 AND status = 'failed'
             ORDER BY COALESCE(last_attempt_at, created_at) ASC, created_at ASC, id ASC
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![tenant_id, limit], |row| {
            Ok(OutboxProcessRow {
                id: row.get(0)?,
                event_type: row.get(1)?,
                entity_type: row.get(2)?,
                entity_id: row.get(3)?,
                payload_json: row.get(4)?,
                created_at: row.get(5)?,
                attempt_count: row.get(6)?,
                last_attempt_at: row.get(7)?,
                status: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|row| row.ok())
        .collect();

    Ok(rows)
}

fn mark_row_processing(db: &Database, row_id: &str, attempt_at: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE cloud_sync_outbox
         SET status = 'processing',
             attempt_count = attempt_count + 1,
             last_attempt_at = ?2,
             updated_at = ?2
         WHERE id = ?1",
        params![row_id, attempt_at],
    )
    .map_err(|e| format!("Failed to mark sync row as processing: {}", e))?;
    Ok(())
}

fn finalize_row_status(
    db: &Database,
    row_id: &str,
    status: &str,
    last_error: Option<&str>,
    updated_at: &str,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE cloud_sync_outbox
         SET status = ?2,
             last_error = ?3,
             updated_at = ?4
         WHERE id = ?1",
        params![row_id, status, last_error, updated_at],
    )
    .map_err(|e| format!("Failed to finalize sync row: {}", e))?;
    Ok(())
}

fn has_more_pending_rows(
    db: &Database,
    tenant_id: &str,
    next_cursor: Option<&str>,
) -> Result<bool, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    if let Some((next_created_at, next_id)) = next_cursor.and_then(parse_cursor) {
        conn.query_row(
            "SELECT EXISTS(
                SELECT 1
                FROM cloud_sync_outbox
                WHERE tenant_id = ?1
                  AND status = 'pending'
                  AND (created_at > ?2 OR (created_at = ?2 AND id > ?3))
            )",
            params![tenant_id, next_created_at, next_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())
    } else {
        conn.query_row(
            "SELECT EXISTS(
                SELECT 1
                FROM cloud_sync_outbox
                WHERE tenant_id = ?1 AND status = 'pending'
            )",
            params![tenant_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())
    }
}

fn send_row_to_cloud(
    client: &Client,
    endpoint: &str,
    token: Option<&str>,
    tenant_id: &str,
    row: &OutboxProcessRow,
) -> Result<(), String> {
    let payload_value: Value = row
        .payload_json
        .as_ref()
        .and_then(|value| serde_json::from_str::<Value>(value).ok())
        .unwrap_or(Value::Null);

    let request_body = json!({
        "tenant_id": tenant_id,
        "event_id": row.id,
        "event_type": row.event_type,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "created_at": row.created_at,
        "payload": payload_value,
    });

    let mut request = client
        .post(format!("{}/v1/events", endpoint.trim_end_matches('/')))
        .header("Content-Type", "application/json")
        .json(&request_body);
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }

    match request.send() {
        Ok(response) if response.status().is_success() => Ok(()),
        Ok(response) => Err(format!("HTTP {}", response.status())),
        Err(error) => Err(format!("Request failed: {}", error)),
    }
}

fn process_outbox_row(
    db: &Database,
    client: &Client,
    endpoint: &str,
    token: Option<&str>,
    tenant_id: &str,
    row: &OutboxProcessRow,
) -> Result<(), String> {
    let attempt_at = now_iso();
    mark_row_processing(db, &row.id, &attempt_at)?;

    match send_row_to_cloud(client, endpoint, token, tenant_id, row) {
        Ok(()) => {
            finalize_row_status(db, &row.id, "synced", None, &now_iso())?;
            Ok(())
        }
        Err(error) => {
            finalize_row_status(db, &row.id, "failed", Some(&error), &now_iso())?;
            Err(error)
        }
    }
}

fn execute_export_page(
    db: &Database,
    client: &Client,
    endpoint: &str,
    token: Option<&str>,
    tenant_id: &str,
    limit: i64,
    cursor: Option<&str>,
) -> Result<CloudSyncPageResult, String> {
    let pending_rows = load_pending_rows(db, tenant_id, limit, cursor)?;
    let next_cursor = pending_rows
        .last()
        .map(|row| encode_cursor(&row.created_at, &row.id));

    let mut result = CloudSyncPageResult {
        processed: 0,
        synced: 0,
        failed: 0,
        retried: 0,
        next_cursor,
        has_more_pending: false,
        last_error: None,
    };

    for row in &pending_rows {
        match process_outbox_row(db, client, endpoint, token, tenant_id, row) {
            Ok(()) => result.synced += 1,
            Err(error) => {
                result.failed += 1;
                result.last_error = Some(error);
            }
        }
        result.processed += 1;
    }

    let remaining = (limit - result.processed).max(0);
    if remaining > 0 {
        for row in load_retry_rows(db, tenant_id, remaining)? {
            if row.status == "failed" && !is_retry_ready(row.last_attempt_at.as_deref(), row.attempt_count)
            {
                continue;
            }

            result.retried += 1;
            match process_outbox_row(db, client, endpoint, token, tenant_id, &row) {
                Ok(()) => result.synced += 1,
                Err(error) => {
                    result.failed += 1;
                    result.last_error = Some(error);
                }
            }
            result.processed += 1;
        }
    }

    result.has_more_pending = has_more_pending_rows(db, tenant_id, result.next_cursor.as_deref())?;
    Ok(result)
}

fn metrics_from_page_result(page: &CloudSyncPageResult) -> CloudSyncRunMetrics {
    CloudSyncRunMetrics {
        processed: page.processed,
        synced: page.synced,
        failed: page.failed,
        retried: page.retried,
        last_error: page.last_error.clone(),
    }
}

fn execute_sync_cycle(
    db: &Database,
    tenant_id: &str,
    page_size: i64,
    max_pages: i64,
    mode: CloudSyncRunMode,
    strict_endpoint: bool,
) -> Result<CloudSyncRunResult, String> {
    let endpoint = cloud_sync_endpoint();
    let token = cloud_sync_token();
    let page_size = page_size.clamp(1, 500);
    let max_pages = max_pages.clamp(1, 100);
    let attempt_at = now_iso();

    if endpoint.is_none() {
        let backlog = tenant_has_backlog(db, tenant_id)?;
        if strict_endpoint {
            return Err(
                "PMS_OWNER_SYNC_ENDPOINT is not configured. Set it to your cloud sync API base URL."
                    .into(),
            );
        }

        let metrics = CloudSyncRunMetrics {
            processed: 0,
            synced: 0,
            failed: 0,
            retried: 0,
            last_error: if backlog {
                Some(
                    "PMS_OWNER_SYNC_ENDPOINT is not configured. Background sync skipped.".into(),
                )
            } else {
                None
            },
        };
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        record_sync_run_summary(&conn, tenant_id, mode, &attempt_at, &metrics);

        return Ok(CloudSyncRunResult {
            endpoint: String::new(),
            processed: 0,
            synced: 0,
            failed: 0,
            retried: 0,
            next_cursor: None,
            has_more_pending: false,
            pages_run: 0,
        });
    }

    let endpoint = endpoint.unwrap_or_default();
    let client = build_cloud_sync_client()?;
    let mut cursor: Option<String> = None;
    let mut pages_run = 0_i64;
    let mut metrics = CloudSyncRunMetrics {
        processed: 0,
        synced: 0,
        failed: 0,
        retried: 0,
        last_error: None,
    };
    let mut has_more_pending = false;
    let mut next_cursor = None;

    for _ in 0..max_pages {
        let page = execute_export_page(
            db,
            &client,
            &endpoint,
            token.as_deref(),
            tenant_id,
            page_size,
            cursor.as_deref(),
        )?;

        pages_run += 1;
        metrics.processed += page.processed;
        metrics.synced += page.synced;
        metrics.failed += page.failed;
        metrics.retried += page.retried;
        if page.last_error.is_some() {
            metrics.last_error = page.last_error.clone();
        }

        has_more_pending = page.has_more_pending;
        next_cursor = page.next_cursor.clone();

        if !page.has_more_pending || page.next_cursor.is_none() || page.processed == 0 {
            break;
        }
        cursor = page.next_cursor;
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    record_sync_run_summary(&conn, tenant_id, mode, &attempt_at, &metrics);

    Ok(CloudSyncRunResult {
        endpoint,
        processed: metrics.processed,
        synced: metrics.synced,
        failed: metrics.failed,
        retried: metrics.retried,
        next_cursor,
        has_more_pending,
        pages_run,
    })
}

fn run_background_scheduler_once(
    db: &Database,
    runtime: &CloudSyncRuntime,
    config: CloudSyncSchedulerConfig,
) {
    let Some(_guard) = runtime.try_start().then_some(CloudSyncRunGuard { runtime }) else {
        log::debug!("cloud sync scheduler skipped: a sync run is already in progress");
        return;
    };

    let tenant_ids = match list_tenant_ids(db) {
        Ok(ids) => ids,
        Err(error) => {
            log::warn!("cloud sync scheduler failed to list tenants: {}", error);
            return;
        }
    };

    for tenant_id in tenant_ids {
        match execute_sync_cycle(
            db,
            &tenant_id,
            config.page_size,
            config.max_pages,
            CloudSyncRunMode::Auto,
            false,
        ) {
            Ok(result) => {
                if result.processed > 0 || result.failed > 0 || result.retried > 0 {
                    log::info!(
                        "cloud sync auto-run tenant={} processed={} synced={} failed={} retried={} pages={}",
                        tenant_id,
                        result.processed,
                        result.synced,
                        result.failed,
                        result.retried,
                        result.pages_run,
                    );
                }
            }
            Err(error) => {
                log::warn!("cloud sync auto-run failed for tenant {}: {}", tenant_id, error);
            }
        }
    }
}

pub fn spawn_background_scheduler(db: Database, runtime: CloudSyncRuntime) {
    let config = scheduler_config_from_env();
    log::info!(
        "cloud sync scheduler enabled: interval={}s page_size={} max_pages={}",
        config.interval.as_secs(),
        config.page_size,
        config.max_pages,
    );

    std::thread::spawn(move || loop {
        run_background_scheduler_once(&db, &runtime, config);
        std::thread::sleep(config.interval);
    });
}

pub fn enqueue_owner_refresh_request(
    conn: &rusqlite::Connection,
    tenant_id: &str,
    reason: &str,
) -> Result<String, String> {
    let event_id = Uuid::new_v4().to_string();
    let payload = json!({
        "generated_at": now_iso(),
        "reason": reason,
    })
    .to_string();

    conn.execute(
        "INSERT INTO cloud_sync_outbox
            (id, tenant_id, event_type, entity_type, entity_id, payload_json, status, attempt_count)
         VALUES (?1, ?2, 'refresh_request', 'owner_dashboard', 'owner_dashboard', ?3, 'pending', 0)",
        params![event_id, tenant_id, payload],
    )
    .map_err(|e| format!("Failed to enqueue owner refresh request: {}", e))?;

    ensure_sync_state_row(conn, tenant_id);

    Ok(event_id)
}

#[tauri::command]
pub fn get_cloud_sync_status(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<CloudSyncStatus, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let state = conn
        .query_row(
            "SELECT last_synced_at, last_attempt_at, last_error, last_auto_run_at,
                    last_run_mode, last_run_processed, last_run_synced, last_run_failed, last_run_retried
             FROM cloud_sync_state WHERE tenant_id = ?1",
            params![tenant_id],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<i64>>(5)?.unwrap_or(0),
                    row.get::<_, Option<i64>>(6)?.unwrap_or(0),
                    row.get::<_, Option<i64>>(7)?.unwrap_or(0),
                    row.get::<_, Option<i64>>(8)?.unwrap_or(0),
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let pending_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM cloud_sync_outbox WHERE tenant_id = ?1 AND status = 'pending'",
            params![tenant_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let failed_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM cloud_sync_outbox WHERE tenant_id = ?1 AND status = 'failed'",
            params![tenant_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let oldest_pending_created_at: Option<String> = conn
        .query_row(
            "SELECT created_at FROM cloud_sync_outbox
             WHERE tenant_id = ?1 AND status = 'pending'
             ORDER BY created_at ASC LIMIT 1",
            params![tenant_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let oldest_failed_created_at: Option<String> = conn
        .query_row(
            "SELECT created_at FROM cloud_sync_outbox
             WHERE tenant_id = ?1 AND status = 'failed'
             ORDER BY created_at ASC LIMIT 1",
            params![tenant_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let mut retry_ready_count = 0_i64;
    let mut retry_waiting_count = 0_i64;
    let mut stmt = conn
        .prepare(
            "SELECT attempt_count, last_attempt_at
             FROM cloud_sync_outbox
             WHERE tenant_id = ?1 AND status = 'failed'",
        )
        .map_err(|e| e.to_string())?;
    let failed_rows = stmt
        .query_map(params![tenant_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, Option<String>>(1)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in failed_rows.filter_map(|row| row.ok()) {
        if is_retry_ready(row.1.as_deref(), row.0) {
            retry_ready_count += 1;
        } else {
            retry_waiting_count += 1;
        }
    }

    let (
        last_synced_at,
        last_attempt_at,
        last_error,
        last_auto_run_at,
        last_run_mode,
        last_run_processed,
        last_run_synced,
        last_run_failed,
        last_run_retried,
    ) = state.unwrap_or((None, None, None, None, None, 0, 0, 0, 0));

    Ok(CloudSyncStatus {
        tenant_id,
        last_synced_at,
        last_attempt_at,
        last_error,
        last_auto_run_at,
        last_run_mode,
        last_run_processed,
        last_run_synced,
        last_run_failed,
        last_run_retried,
        pending_count,
        failed_count,
        retry_ready_count,
        retry_waiting_count,
        oldest_pending_created_at,
        oldest_failed_created_at,
    })
}

#[tauri::command]
pub fn list_cloud_sync_outbox(
    db: State<'_, Database>,
    tenant_id: String,
    limit: Option<i64>,
) -> Result<Vec<CloudSyncOutboxRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(100);

    let sql = format!(
        "SELECT id, event_type, entity_type, entity_id, payload_json,
                status, attempt_count, last_attempt_at, last_error,
                created_at, updated_at
         FROM cloud_sync_outbox
         WHERE tenant_id = ?1
         ORDER BY created_at DESC
         LIMIT {}",
        lim
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![tenant_id], |row| {
            let status: String = row.get(5)?;
            let attempt_count: i64 = row.get(6)?;
            let last_attempt_at: Option<String> = row.get(7)?;
            let retry_ready = if status == "failed" {
                Some(is_retry_ready(last_attempt_at.as_deref(), attempt_count))
            } else {
                None
            };
            let next_retry_at = if status == "failed" && retry_ready == Some(false) {
                next_retry_at(last_attempt_at.as_deref(), attempt_count)
            } else {
                None
            };

            Ok(CloudSyncOutboxRow {
                id: row.get(0)?,
                event_type: row.get(1)?,
                entity_type: row.get(2)?,
                entity_id: row.get(3)?,
                payload_json: row.get(4)?,
                status,
                attempt_count,
                last_attempt_at,
                last_error: row.get(8)?,
                retry_ready,
                next_retry_at,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|row| row.ok())
        .collect();

    Ok(rows)
}

#[tauri::command]
pub fn enqueue_cloud_sync_event(
    db: State<'_, Database>,
    tenant_id: String,
    data: CloudSyncOutboxInput,
) -> Result<String, String> {
    if data.event_type.trim().is_empty() {
        return Err("event_type is required".into());
    }
    if data.entity_type.trim().is_empty() {
        return Err("entity_type is required".into());
    }
    if data.entity_id.trim().is_empty() {
        return Err("entity_id is required".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO cloud_sync_outbox
            (id, tenant_id, event_type, entity_type, entity_id, payload_json, status, attempt_count)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', 0)",
        params![
            id,
            tenant_id,
            data.event_type.trim(),
            data.entity_type.trim(),
            data.entity_id.trim(),
            data.payload_json
        ],
    )
    .map_err(|e| format!("Failed to enqueue sync event: {}", e))?;

    ensure_sync_state_row(&conn, &tenant_id);

    Ok(id)
}

const SNAPSHOT_INTERVAL_SECONDS: u64 = 300; // 5 minutes

fn build_and_enqueue_snapshot(
    conn: &rusqlite::Connection,
    tenant_id: &str,
) -> Result<String, String> {
    let products_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM products WHERE tenant_id = ?1 AND deleted_at IS NULL AND is_active = 1",
            params![tenant_id], |row| row.get(0),
        ).unwrap_or(0);

    let customers_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM customers WHERE tenant_id = ?1 AND deleted_at IS NULL AND is_active = 1",
            params![tenant_id], |row| row.get(0),
        ).unwrap_or(0);

    let suppliers_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM suppliers WHERE tenant_id = ?1 AND deleted_at IS NULL AND is_active = 1",
            params![tenant_id], |row| row.get(0),
        ).unwrap_or(0);

    let (today_sales_count, today_sales_total): (i64, i64) = conn
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(total), 0) FROM sales
             WHERE tenant_id = ?1 AND deleted_at IS NULL AND DATE(created_at) = DATE('now')",
            params![tenant_id], |row| Ok((row.get(0)?, row.get(1)?)),
        ).unwrap_or((0, 0));

    let (month_sales_count, month_sales_total): (i64, i64) = conn
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(total), 0) FROM sales
             WHERE tenant_id = ?1 AND deleted_at IS NULL
               AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')",
            params![tenant_id], |row| Ok((row.get(0)?, row.get(1)?)),
        ).unwrap_or((0, 0));

    let low_stock_count: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT p.id) FROM products p
             JOIN product_batches pb ON pb.product_id = p.id AND pb.deleted_at IS NULL
             WHERE p.tenant_id = ?1 AND p.deleted_at IS NULL AND p.is_active = 1
               AND p.min_stock_level > 0
             GROUP BY p.id HAVING SUM(pb.quantity) <= p.min_stock_level",
            params![tenant_id], |row| row.get(0),
        ).unwrap_or(0);

    let out_of_stock_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM (
               SELECT p.id FROM products p
               LEFT JOIN product_batches pb
                 ON pb.product_id = p.id AND pb.deleted_at IS NULL AND pb.quantity > 0
               WHERE p.tenant_id = ?1 AND p.deleted_at IS NULL AND p.is_active = 1
               GROUP BY p.id HAVING COALESCE(SUM(pb.quantity), 0) = 0
             )",
            params![tenant_id], |row| row.get(0),
        ).unwrap_or(0);

    let expiring_soon_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM product_batches pb
             JOIN products p ON p.id = pb.product_id
             WHERE p.tenant_id = ?1 AND pb.deleted_at IS NULL AND pb.quantity > 0
               AND pb.expiry_date IS NOT NULL
               AND DATE(pb.expiry_date) BETWEEN DATE('now') AND DATE('now', '+30 days')",
            params![tenant_id], |row| row.get(0),
        ).unwrap_or(0);

    let total_customer_receivables: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(balance), 0) FROM customers
             WHERE tenant_id = ?1 AND deleted_at IS NULL AND balance > 0",
            params![tenant_id], |row| row.get(0),
        ).unwrap_or(0);

    let total_supplier_payables: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(balance_due), 0) FROM suppliers
             WHERE tenant_id = ?1 AND deleted_at IS NULL AND balance_due > 0",
            params![tenant_id], |row| row.get(0),
        ).unwrap_or(0);

    let pharmacy_name: String = conn
        .query_row(
            "SELECT COALESCE(name, '') FROM tenants WHERE id = ?1 LIMIT 1",
            params![tenant_id], |row| row.get(0),
        ).unwrap_or_default();

    let payload = json!({
        "generated_at": now_iso(),
        "pharmacy_name": pharmacy_name,
        "products_count": products_count,
        "customers_count": customers_count,
        "suppliers_count": suppliers_count,
        "today_sales_count": today_sales_count,
        "today_sales_total": today_sales_total,
        "month_sales_count": month_sales_count,
        "month_sales_total": month_sales_total,
        "low_stock_count": low_stock_count,
        "out_of_stock_count": out_of_stock_count,
        "expiring_soon_count": expiring_soon_count,
        "total_customer_receivables": total_customer_receivables,
        "total_supplier_payables": total_supplier_payables,
    }).to_string();

    let event_id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO cloud_sync_outbox
            (id, tenant_id, event_type, entity_type, entity_id, payload_json, status, attempt_count)
         VALUES (?1, ?2, 'snapshot', 'owner_dashboard', 'owner_dashboard', ?3, 'pending', 0)",
        params![event_id, tenant_id, payload],
    ).map_err(|e| format!("Failed to queue owner snapshot: {}", e))?;

    ensure_sync_state_row(conn, tenant_id);
    Ok(event_id)
}

pub fn spawn_snapshot_scheduler(db: Database) {
    let interval = Duration::from_secs(SNAPSHOT_INTERVAL_SECONDS);
    log::info!("cloud sync snapshot scheduler enabled: interval={}s", interval.as_secs());

    std::thread::spawn(move || loop {
        std::thread::sleep(interval);
        let tenant_ids = match list_tenant_ids(&db) {
            Ok(ids) => ids,
            Err(e) => { log::warn!("snapshot scheduler: failed to list tenants: {}", e); continue; }
        };
        for tenant_id in tenant_ids {
            // Push table snapshots to cloud
            let branches = match list_branch_ids_for_tenant(&db, &tenant_id) {
                Ok(ids) => ids,
                Err(e) => { log::warn!("snapshot scheduler: failed to list branches for {}: {}", tenant_id, e); continue; }
            };
            for branch in branches {
                match push_all_tables(&db, &tenant_id, &branch) {
                    Ok(n) => log::info!("snapshot scheduler: pushed {} rows for {} / {}", n, tenant_id, branch),
                    Err(e) => log::warn!("snapshot scheduler: push_all_tables failed for {} / {}: {}", tenant_id, branch, e),
                }
            }
            // Also enqueue owner_dashboard event (legacy)
            let conn = match db.conn.lock() {
                Ok(c) => c,
                Err(e) => { log::warn!("snapshot scheduler: lock error: {}", e); continue; }
            };
            match build_and_enqueue_snapshot(&conn, &tenant_id) {
                Ok(id) => log::debug!("snapshot scheduler: enqueued snapshot {} for {}", id, tenant_id),
                Err(e) => log::warn!("snapshot scheduler: failed for {}: {}", tenant_id, e),
            }
        }
    });
}

#[tauri::command]
pub fn queue_owner_read_model_snapshot(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<QueueOwnerSnapshotResult, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let event_id = build_and_enqueue_snapshot(&conn, &tenant_id)?;
    Ok(QueueOwnerSnapshotResult { queued: 1, snapshot_event_id: event_id })
}

#[tauri::command]
pub fn run_cloud_sync_export(
    db: State<'_, Database>,
    runtime: State<'_, CloudSyncRuntime>,
    tenant_id: String,
    limit: Option<i64>,
    cursor: Option<String>,
) -> Result<CloudSyncRunResult, String> {
    let _guard = acquire_run_guard(&runtime)?;
    let endpoint = cloud_sync_endpoint().ok_or_else(|| {
        "PMS_OWNER_SYNC_ENDPOINT is not configured. Set it to your cloud sync API base URL."
            .to_string()
    })?;
    let token = cloud_sync_token();
    let client = build_cloud_sync_client()?;
    let page = execute_export_page(
        &db,
        &client,
        &endpoint,
        token.as_deref(),
        &tenant_id,
        limit.unwrap_or(DEFAULT_SYNC_PAGE_SIZE).clamp(1, 500),
        cursor.as_deref(),
    )?;
    let metrics = metrics_from_page_result(&page);
    let attempt_at = now_iso();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    record_sync_run_summary(&conn, &tenant_id, CloudSyncRunMode::Manual, &attempt_at, &metrics);

    Ok(CloudSyncRunResult {
        endpoint,
        processed: page.processed,
        synced: page.synced,
        failed: page.failed,
        retried: page.retried,
        next_cursor: page.next_cursor,
        has_more_pending: page.has_more_pending,
        pages_run: 1,
    })
}

#[tauri::command]
pub fn run_cloud_sync_cycle(
    db: State<'_, Database>,
    runtime: State<'_, CloudSyncRuntime>,
    tenant_id: String,
    page_size: Option<i64>,
    max_pages: Option<i64>,
) -> Result<CloudSyncRunResult, String> {
    let _guard = acquire_run_guard(&runtime)?;
    execute_sync_cycle(
        &db,
        &tenant_id,
        page_size.unwrap_or(DEFAULT_SYNC_PAGE_SIZE),
        max_pages.unwrap_or(DEFAULT_SYNC_MAX_PAGES),
        CloudSyncRunMode::Manual,
        true,
    )
}

// ============================================================================
// Table-Snapshot Sync (Phase 5: Full Read-Replica)
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct TableSyncResult {
    pub table: String,
    pub upserted: i64,
    pub deleted: i64,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncStatusResult {
    pub last_sync_at: Option<String>,
    pub total_syncs: i64,
    pub tables: std::collections::HashMap<String, TableSyncInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TableSyncInfo {
    pub last_sync_at: Option<String>,
    pub row_count: i64,
}

/// Sync a table snapshot to the cloud (full or delta)
/// POST /v1/sync/:table with rows and deletedIds
#[tauri::command]
pub fn sync_table_snapshot(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: Option<String>,
    table: String,
    rows: Vec<Value>,
    deleted_ids: Vec<String>,
) -> Result<TableSyncResult, String> {
    let endpoint = cloud_sync_endpoint()
        .ok_or_else(|| "PMS_OWNER_SYNC_ENDPOINT not configured".to_string())?;
    let token = cloud_sync_token()
        .ok_or_else(|| "PMS_OWNER_SYNC_TOKEN not configured".to_string())?;

    let client = build_cloud_sync_client()?;
    let url = format!("{}/v1/sync/{}", endpoint.trim_end_matches('/'), table);

    let payload = json!({
        "rows": rows,
        "deletedIds": deleted_ids,
    });

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .header("X-Branch-ID", branch_id.unwrap_or_else(|| "main-branch".to_string()))
        .json(&payload)
        .send()
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = response.status();
    let body: Value = response
        .json()
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if !status.is_success() {
        let error_msg = body
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown error")
            .to_string();
        return Ok(TableSyncResult {
            table,
            upserted: 0,
            deleted: 0,
            success: false,
            error: Some(format!("HTTP {}: {}", status, error_msg)),
        });
    }

    let upserted = body
        .get("upserted")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let deleted = body
        .get("deleted")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    // Update local sync tracking
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = now_iso();
    conn.execute(
        "INSERT INTO cloud_sync_table_state (tenant_id, table_name, last_sync_at, row_count)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(tenant_id, table_name) DO UPDATE SET
         last_sync_at = excluded.last_sync_at,
         row_count = excluded.row_count",
        params![tenant_id, table, now, upserted],
    )
    .ok(); // Non-critical tracking

    Ok(TableSyncResult {
        table,
        upserted,
        deleted,
        success: true,
        error: None,
    })
}

/// Sync multiple tables in one batch request
#[tauri::command]
pub fn sync_tables_batch(
    _db: State<'_, Database>,
    _tenant_id: String,
    branch_id: Option<String>,
    tables: std::collections::HashMap<String, TableBatchData>,
) -> Result<Vec<TableSyncResult>, String> {
    let endpoint = cloud_sync_endpoint()
        .ok_or_else(|| "PMS_OWNER_SYNC_ENDPOINT not configured".to_string())?;
    let token = cloud_sync_token()
        .ok_or_else(|| "PMS_OWNER_SYNC_TOKEN not configured".to_string())?;

    let client = build_cloud_sync_client()?;
    let url = format!("{}/v1/sync/batch", endpoint.trim_end_matches('/'));

    // Convert tables HashMap to JSON payload
    let payload: Value = tables
        .iter()
        .map(|(name, data)| {
            (
                name.clone(),
                json!({
                    "rows": data.rows,
                    "deletedIds": data.deleted_ids,
                }),
            )
        })
        .collect::<serde_json::Map<String, Value>>()
        .into();

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .header("X-Branch-ID", branch_id.unwrap_or_else(|| "main-branch".to_string()))
        .json(&payload)
        .send()
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = response.status();
    let body: Value = response
        .json()
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if !status.is_success() {
        let error_msg = body
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown error")
            .to_string();
        return Err(format!("Batch sync failed: {}", error_msg));
    }

    // Extract results per table
    let results: Vec<TableSyncResult> = tables
        .keys()
        .map(|name| {
            let table_result = body.get("results").and_then(|r| r.get(name));
            TableSyncResult {
                table: name.clone(),
                upserted: table_result
                    .and_then(|r| r.get("upserted"))
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0),
                deleted: table_result
                    .and_then(|r| r.get("deleted"))
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0),
                success: true,
                error: None,
            }
        })
        .collect();

    Ok(results)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TableBatchData {
    pub rows: Vec<Value>,
    pub deleted_ids: Vec<String>,
}

/// Get sync status from the cloud API
#[tauri::command]
pub fn get_sync_status(
    _tenant_id: String,
) -> Result<SyncStatusResult, String> {
    let endpoint = cloud_sync_endpoint()
        .ok_or_else(|| "PMS_OWNER_SYNC_ENDPOINT not configured".to_string())?;
    let token = cloud_sync_token()
        .ok_or_else(|| "PMS_OWNER_SYNC_TOKEN not configured".to_string())?;

    let client = build_cloud_sync_client()?;
    let url = format!("{}/v1/sync/status", endpoint.trim_end_matches('/'));

    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = response.status();
    let body: Value = response
        .json()
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if !status.is_success() {
        let error_msg = body
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown error")
            .to_string();
        return Err(format!("Failed to get sync status: {}", error_msg));
    }

    let tables = body
        .get("tables")
        .and_then(|t| t.as_object())
        .map(|obj| {
            obj.iter()
                .map(|(k, v)| {
                    let info = TableSyncInfo {
                        last_sync_at: v
                            .get("lastSyncAt")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        row_count: v
                            .get("rowCount")
                            .and_then(|v| v.as_i64())
                            .unwrap_or(0),
                    };
                    (k.clone(), info)
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(SyncStatusResult {
        last_sync_at: body
            .get("lastSyncAt")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        total_syncs: body
            .get("totalSyncs")
            .and_then(|v| v.as_i64())
            .unwrap_or(0),
        tables,
    })
}

fn query_table_rows(
    conn: &rusqlite::Connection,
    sql: &str,
    tenant_id: &str,
    branch_id: &str,
) -> Vec<Value> {
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return vec![],
    };
    let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let rows = stmt.query_map(params![tenant_id, branch_id], |row| {
        let mut map = serde_json::Map::new();
        for (i, col) in cols.iter().enumerate() {
            let val: Value = match row.get_ref(i) {
                Ok(rusqlite::types::ValueRef::Null) => Value::Null,
                Ok(rusqlite::types::ValueRef::Integer(n)) => Value::Number(n.into()),
                Ok(rusqlite::types::ValueRef::Real(f)) => {
                    Value::Number(serde_json::Number::from_f64(f).unwrap_or(0.into()))
                }
                Ok(rusqlite::types::ValueRef::Text(s)) => {
                    Value::String(String::from_utf8_lossy(s).to_string())
                }
                Ok(rusqlite::types::ValueRef::Blob(_)) => Value::Null,
                Err(_) => Value::Null,
            };
            map.insert(col.clone(), val);
        }
        Ok(Value::Object(map))
    });
    match rows {
        Ok(iter) => iter.filter_map(|r| r.ok()).collect(),
        Err(_) => vec![],
    }
}

fn list_branch_ids_for_tenant(db: &Database, tenant_id: &str) -> Result<Vec<String>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id FROM branches
             WHERE tenant_id = ?1 AND is_active = 1 AND deleted_at IS NULL
             ORDER BY is_main DESC, created_at ASC",
        )
        .map_err(|e| format!("Failed to prepare branch query: {}", e))?;
    let rows = stmt
        .query_map(params![tenant_id], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Failed to query branches: {}", e))?;
    let mut branches: Vec<String> = rows.filter_map(|r| r.ok()).collect();
    if branches.is_empty() {
        branches.push("main-branch".to_string());
    }
    Ok(branches)
}

fn push_all_tables(db: &Database, tenant_id: &str, branch: &str) -> Result<i64, String> {
    let endpoint = cloud_sync_endpoint()
        .ok_or_else(|| "PMS_OWNER_SYNC_ENDPOINT not configured".to_string())?;
    let token = cloud_sync_token()
        .ok_or_else(|| "PMS_OWNER_SYNC_TOKEN not configured".to_string())?;

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Column names MUST match server TABLE_SCHEMAS keys exactly.
    // Local SQLite columns differ from server schema — alias them here.
    let tables_data: Vec<(&str, Vec<Value>)> = vec![
        // products: local has trade_name (not name), no branch_id; stock from batches
        ("products", query_table_rows(&conn,
            "SELECT p.id, p.tenant_id, ?2 AS branch_id, \
             p.trade_name AS name, COALESCE(p.trade_name_ar, '') AS name_ar, \
             COALESCE(p.barcode, '') AS barcode, COALESCE(p.category, '') AS category, \
             COALESCE(p.unit, '') AS unit_measure, \
             COALESCE(p.last_purchase_price, 0) AS purchase_price, \
             COALESCE(p.sale_price, 0) AS sale_price, 0 AS tax_percent, \
             COALESCE(p.min_stock_level, 0) AS min_stock, \
             COALESCE(SUM(b.quantity_current), 0) AS current_stock, \
             p.is_active, p.updated_at \
             FROM products p \
             LEFT JOIN batches b ON b.product_id = p.id AND b.status = 'active' AND b.deleted_at IS NULL \
                AND EXISTS (SELECT 1 FROM storage_locations sl WHERE sl.id = b.location_id AND sl.branch_id = ?2 AND sl.deleted_at IS NULL) \
             WHERE p.tenant_id = ?1 AND p.deleted_at IS NULL \
             GROUP BY p.id",
            tenant_id, branch)),
        // customers: local has no branch_id, no total_purchases
        ("customers", query_table_rows(&conn,
            "SELECT id, tenant_id, ?2 AS branch_id, name, COALESCE(name_ar, '') AS name_ar, \
             COALESCE(phone, '') AS phone, COALESCE(credit_limit, 0) AS credit_limit, \
             COALESCE(current_balance, 0) AS current_balance, 0 AS total_purchases, \
             is_active, updated_at \
             FROM customers WHERE tenant_id = ?1 AND deleted_at IS NULL",
            tenant_id, branch)),
        // suppliers: local has opening_balance (not current_balance), no branch_id
        ("suppliers", query_table_rows(&conn,
            "SELECT id, tenant_id, ?2 AS branch_id, name, \
             COALESCE(phone, '') AS phone, COALESCE(email, '') AS email, \
             COALESCE(address, '') AS address, \
             COALESCE(opening_balance, 0) AS current_balance, \
             is_active, updated_at \
             FROM suppliers WHERE tenant_id = ?1 AND deleted_at IS NULL",
            tenant_id, branch)),
        // pos_sales: local table is 'sales', has branch_id
        ("pos_sales", query_table_rows(&conn,
            "SELECT s.id, s.tenant_id, s.branch_id, s.session_id, s.sale_number, \
             s.customer_id, COALESCE(c.name, '') AS customer_name, \
             s.total, COALESCE(s.tax_amount, 0) AS tax_amount, \
             COALESCE(s.discount, 0) AS discount, s.payment_method, s.payment_status, \
             s.amount_paid, (s.total - s.amount_paid) AS balance_due, \
             '' AS cashier_name, \
             COALESCE(s.notes, '') AS notes, 0 AS is_return, s.created_at \
             FROM sales s \
             LEFT JOIN customers c ON c.id = s.customer_id \
             WHERE s.tenant_id = ?1 AND s.branch_id = ?2 AND s.deleted_at IS NULL",
            tenant_id, branch)),
        // pos_sale_items: local table is 'sale_items', no branch_id — get from sales
        ("pos_sale_items", query_table_rows(&conn,
            "SELECT si.id, si.tenant_id, s.branch_id, si.sale_id, si.product_id, \
             COALESCE(p.trade_name, '') AS product_name, \
             si.batch_id, COALESCE(b.batch_number, '') AS batch_number, \
             si.quantity, si.unit_price, si.subtotal \
             FROM sale_items si \
             JOIN sales s ON s.id = si.sale_id \
             LEFT JOIN products p ON p.id = si.product_id \
             LEFT JOIN batches b ON b.id = si.batch_id \
             WHERE si.tenant_id = ?1 AND s.branch_id = ?2 AND s.deleted_at IS NULL",
            tenant_id, branch)),
        // expenses: has branch_id, category_id instead of category
        ("expenses", query_table_rows(&conn,
            "SELECT id, tenant_id, branch_id, \
             COALESCE(category_id, '') AS category, amount, \
             COALESCE(description, '') AS description, expense_date, created_at \
             FROM expenses WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL",
            tenant_id, branch)),
        // batches: local branch is inferred from the storage location
        ("batches", query_table_rows(&conn,
            "SELECT b.id, b.tenant_id, ?2 AS branch_id, b.product_id, \
             COALESCE(b.batch_number, '') AS batch_number, b.expiry_date, \
             b.quantity_current AS quantity, b.unit_cost AS purchase_price, \
             b.location_id, CASE WHEN b.status = 'active' THEN 1 ELSE 0 END AS is_active, \
             b.updated_at \
             FROM batches b \
             JOIN storage_locations sl ON sl.id = b.location_id \
             WHERE b.tenant_id = ?1 AND sl.branch_id = ?2 AND b.deleted_at IS NULL",
            tenant_id, branch)),
        ("stock_movements", query_table_rows(&conn,
            "SELECT id, tenant_id, branch_id, product_id, batch_id, movement_type, \
             quantity_change AS quantity, COALESCE(reference_type, '') AS reference_type, \
             COALESCE(reference_id, '') AS reference_id, COALESCE(notes, '') AS notes, created_at \
             FROM stock_movements WHERE tenant_id = ?1 AND branch_id = ?2",
            tenant_id, branch)),
        // supplier_invoices: for Supplier Accounts on Owner PWA
        ("supplier_invoices", query_table_rows(&conn,
            "SELECT si.id, si.tenant_id, si.branch_id, si.supplier_id, \
             COALESCE(s.name, '') AS supplier_name, \
             si.invoice_number, si.invoice_date, si.status, si.payment_status, \
             si.total, COALESCE(si.amount_paid, 0) AS amount_paid, \
             (si.total - COALESCE(si.amount_paid, 0)) AS balance_due, \
             si.created_at, si.updated_at \
             FROM supplier_invoices si \
             LEFT JOIN suppliers s ON s.id = si.supplier_id \
             WHERE si.tenant_id = ?1 AND si.branch_id = ?2 AND si.deleted_at IS NULL",
            tenant_id, branch)),
    ];

    drop(conn);

    let payload: Value = tables_data
        .iter()
        .map(|(name, rows)| (name.to_string(), json!({ "rows": rows, "deletedIds": [] })))
        .collect::<serde_json::Map<String, Value>>()
        .into();

    let client = build_cloud_sync_client()?;
    let url = format!("{}/v1/sync/batch", endpoint.trim_end_matches('/'));
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .header("X-Branch-ID", branch)
        .json(&payload)
        .send()
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = response.status();
    let body: Value = response.json().map_err(|e| format!("Failed to parse response: {}", e))?;

    if !status.is_success() {
        let msg = body.get("error").and_then(|v| v.as_str()).unwrap_or("Unknown error").to_string();
        return Err(format!("Sync failed ({}): {}", status, msg));
    }

    let total: i64 = tables_data.iter().map(|(_, rows)| rows.len() as i64).sum();
    Ok(total)
}

/// One-shot full table sync: reads all key tables from local DB and pushes to cloud.
/// Called by the frontend "مزامنة فورية" button.
#[tauri::command]
pub fn sync_all_tables_now(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: Option<String>,
) -> Result<Vec<TableSyncResult>, String> {
    let branches = match branch_id {
        Some(branch) => vec![branch],
        None => list_branch_ids_for_tenant(&db, &tenant_id)?,
    };
    let mut results = Vec::new();
    for branch in branches {
        let total = push_all_tables(&db, &tenant_id, &branch)?;
        results.push(TableSyncResult {
            table: format!("all:{}", branch),
            upserted: total,
            deleted: 0,
            success: true,
            error: None,
        });
    }
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{migrations, seed};
    use rusqlite::{params, Connection};
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::{Mutex, OnceLock};
    use std::thread;

    const TEST_TENANT_ID: &str = "default-tenant";

    struct FixedNowGuard {
        previous: Option<DateTime<Utc>>,
    }

    impl FixedNowGuard {
        fn set(iso: &str) -> Self {
            let fixed = parse_iso_to_utc(iso).expect("invalid fixed test timestamp");
            let previous = TEST_NOW.with(|value| value.replace(Some(fixed)));
            Self { previous }
        }
    }

    impl Drop for FixedNowGuard {
        fn drop(&mut self) {
            let previous = self.previous.take();
            TEST_NOW.with(|value| {
                value.replace(previous);
            });
        }
    }

    struct SyncEnvGuard {
        previous_endpoint: Option<String>,
        previous_token: Option<String>,
    }

    impl SyncEnvGuard {
        fn set(endpoint: &str) -> Self {
            let previous_endpoint = std::env::var("PMS_OWNER_SYNC_ENDPOINT").ok();
            let previous_token = std::env::var("PMS_OWNER_SYNC_TOKEN").ok();
            std::env::set_var("PMS_OWNER_SYNC_ENDPOINT", endpoint);
            std::env::remove_var("PMS_OWNER_SYNC_TOKEN");
            Self {
                previous_endpoint,
                previous_token,
            }
        }
    }

    impl Drop for SyncEnvGuard {
        fn drop(&mut self) {
            if let Some(endpoint) = self.previous_endpoint.as_deref() {
                std::env::set_var("PMS_OWNER_SYNC_ENDPOINT", endpoint);
            } else {
                std::env::remove_var("PMS_OWNER_SYNC_ENDPOINT");
            }

            if let Some(token) = self.previous_token.as_deref() {
                std::env::set_var("PMS_OWNER_SYNC_TOKEN", token);
            } else {
                std::env::remove_var("PMS_OWNER_SYNC_TOKEN");
            }
        }
    }

    struct TestHttpServer {
        endpoint: String,
        handle: Option<thread::JoinHandle<()>>,
    }

    impl TestHttpServer {
        fn spawn_ok(expected_requests: usize) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").expect("bind test http server");
            let address = listener.local_addr().expect("read test server address");
            let endpoint = format!("http://{}", address);

            let handle = thread::spawn(move || {
                for _ in 0..expected_requests {
                    let (mut stream, _) = listener.accept().expect("accept test request");
                    respond_ok(&mut stream);
                }
            });

            Self {
                endpoint,
                handle: Some(handle),
            }
        }

        fn join(mut self) {
            if let Some(handle) = self.handle.take() {
                handle.join().expect("join test http server");
            }
        }
    }

    fn respond_ok(stream: &mut TcpStream) {
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .expect("set read timeout");
        let mut buffer = [0_u8; 4096];
        let _ = stream.read(&mut buffer);
        stream
            .write_all(
                b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
            )
            .expect("write test response");
        stream.flush().expect("flush test response");
    }

    fn env_lock() -> &'static Mutex<()> {
        static ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        ENV_LOCK.get_or_init(|| Mutex::new(()))
    }

    fn create_test_database() -> Database {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(
            "PRAGMA foreign_keys=ON;
             PRAGMA busy_timeout=5000;",
        )
        .expect("apply test pragmas");

        migrations::run(&conn).expect("run test migrations");
        seed::run(&conn).expect("run test seed");

        Database {
            conn: Arc::new(std::sync::Mutex::new(conn)),
        }
    }

    fn insert_outbox_row(
        db: &Database,
        row_id: &str,
        status: &str,
        attempt_count: i64,
        created_at: &str,
        last_attempt_at: Option<&str>,
    ) {
        let conn = db.conn.lock().expect("lock db");
        conn.execute(
            "INSERT INTO cloud_sync_outbox
                (id, tenant_id, event_type, entity_type, entity_id, payload_json, status, attempt_count, last_attempt_at, created_at, updated_at)
             VALUES (?1, ?2, 'snapshot', 'owner_dashboard', 'owner_dashboard', ?3, ?4, ?5, ?6, ?7, ?7)",
            params![
                row_id,
                TEST_TENANT_ID,
                json!({ "row_id": row_id }).to_string(),
                status,
                attempt_count,
                last_attempt_at,
                created_at,
            ],
        )
        .expect("insert outbox row");
    }

    fn count_outbox_rows(db: &Database, status: &str) -> i64 {
        let conn = db.conn.lock().expect("lock db");
        conn.query_row(
            "SELECT COUNT(*) FROM cloud_sync_outbox WHERE tenant_id = ?1 AND status = ?2",
            params![TEST_TENANT_ID, status],
            |row| row.get(0),
        )
        .expect("count outbox rows")
    }

    fn row_status(db: &Database, row_id: &str) -> String {
        let conn = db.conn.lock().expect("lock db");
        conn.query_row(
            "SELECT status FROM cloud_sync_outbox WHERE id = ?1",
            params![row_id],
            |row| row.get(0),
        )
        .expect("read row status")
    }

    fn sync_state_counts(db: &Database) -> (i64, i64, i64, i64) {
        let conn = db.conn.lock().expect("lock db");
        conn.query_row(
            "SELECT last_run_processed, last_run_synced, last_run_failed, last_run_retried
             FROM cloud_sync_state
             WHERE tenant_id = ?1",
            params![TEST_TENANT_ID],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .expect("read sync state counts")
    }

    #[test]
    fn scheduler_skips_when_runtime_is_already_in_progress() {
        let db = create_test_database();
        insert_outbox_row(
            &db,
            "pending-overlap",
            "pending",
            0,
            "2026-04-16T09:00:00.000Z",
            None,
        );
        let runtime = CloudSyncRuntime::default();
        let _guard = acquire_run_guard(&runtime).expect("acquire initial guard");

        run_background_scheduler_once(
            &db,
            &runtime,
            CloudSyncSchedulerConfig {
                interval: Duration::from_secs(30),
                page_size: 10,
                max_pages: 1,
            },
        );

        assert_eq!(count_outbox_rows(&db, "pending"), 1);
        assert_eq!(row_status(&db, "pending-overlap"), "pending");
    }

    #[test]
    fn retry_cycle_processes_only_retry_ready_failed_rows() {
        let _fixed_now = FixedNowGuard::set("2026-04-16T12:00:00.000Z");
        let db = create_test_database();
        insert_outbox_row(
            &db,
            "failed-ready",
            "failed",
            1,
            "2026-04-16T11:00:00.000Z",
            Some("2026-04-16T11:59:50.000Z"),
        );
        insert_outbox_row(
            &db,
            "failed-waiting",
            "failed",
            1,
            "2026-04-16T11:05:00.000Z",
            Some("2026-04-16T11:59:58.000Z"),
        );

        let server = TestHttpServer::spawn_ok(1);
        let _env_lock = env_lock().lock().expect("lock sync env");
        let _env = SyncEnvGuard::set(&server.endpoint);

        let result = execute_sync_cycle(
            &db,
            TEST_TENANT_ID,
            10,
            1,
            CloudSyncRunMode::Manual,
            true,
        )
        .expect("run retry-ready cycle");

        assert_eq!(result.processed, 1);
        assert_eq!(result.synced, 1);
        assert_eq!(result.failed, 0);
        assert_eq!(result.retried, 1);
        assert_eq!(result.pages_run, 1);
        assert_eq!(row_status(&db, "failed-ready"), "synced");
        assert_eq!(row_status(&db, "failed-waiting"), "failed");
        assert_eq!(sync_state_counts(&db), (1, 1, 0, 1));

        drop(_env);
        drop(_env_lock);
        server.join();
    }

    #[test]
    fn sync_cycle_respects_page_bounds_and_records_summary_counts() {
        let _fixed_now = FixedNowGuard::set("2026-04-16T13:00:00.000Z");
        let db = create_test_database();
        for index in 0..5 {
            let created_at = format!("2026-04-16T10:00:0{}.000Z", index);
            insert_outbox_row(
                &db,
                &format!("pending-{}", index + 1),
                "pending",
                0,
                &created_at,
                None,
            );
        }

        let server = TestHttpServer::spawn_ok(4);
        let _env_lock = env_lock().lock().expect("lock sync env");
        let _env = SyncEnvGuard::set(&server.endpoint);

        let result = execute_sync_cycle(
            &db,
            TEST_TENANT_ID,
            2,
            2,
            CloudSyncRunMode::Manual,
            true,
        )
        .expect("run bounded sync cycle");

        assert_eq!(result.processed, 4);
        assert_eq!(result.synced, 4);
        assert_eq!(result.failed, 0);
        assert_eq!(result.retried, 0);
        assert_eq!(result.pages_run, 2);
        assert!(result.has_more_pending);
        assert_eq!(count_outbox_rows(&db, "synced"), 4);
        assert_eq!(count_outbox_rows(&db, "pending"), 1);
        assert_eq!(row_status(&db, "pending-5"), "pending");
        assert_eq!(sync_state_counts(&db), (4, 4, 0, 0));

        drop(_env);
        drop(_env_lock);
        server.join();
    }
}
