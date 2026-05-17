use reqwest::blocking::Client;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use super::cloud_sync::{
    cloud_sync_endpoint, cloud_sync_token, build_cloud_sync_client, now_iso,
    ensure_sync_state_row, acquire_run_guard, CloudSyncRunMode,
    CloudSyncRuntime, tenant_has_backlog,
    DEFAULT_SYNC_PAGE_SIZE, DEFAULT_SYNC_MAX_PAGES,
};
use crate::commands::session_state::{AuthSessionState, resolve_identity};

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
    pub entity_id: Option<String>,
    pub payload_json: Option<String>,
    pub status: String,
    pub attempt_count: i64,
    pub last_attempt_at: Option<String>,
    pub last_error: Option<String>,
    pub retry_ready: Option<bool>,
    pub next_retry_at: Option<String>,
    pub created_at: String,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CloudSyncOutboxInput {
    pub event_type: String,
    pub entity_type: String,
    pub entity_id: String,
    pub payload_json: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct QueueOwnerSnapshotResult {
    pub queued: i64,
    pub message: Option<String>,
    pub snapshot_event_id: String,
}

#[derive(Debug, Serialize)]
pub struct CloudSyncRunResult {
    pub endpoint: String,
    pub processed: i64,
    pub synced: i64,
    pub failed: i64,
    pub retried: i64,
    pub pages_run: i64,
    pub next_cursor: Option<String>,
    pub has_more_pending: bool,
    pub last_error: Option<String>,
}

pub(crate) struct CloudSyncRunMetrics {
    pub(crate) processed: i64,
    pub(crate) synced: i64,
    pub(crate) failed: i64,
    pub(crate) retried: i64,
    pub(crate) last_error: Option<String>,
}

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

use super::cloud_sync_outbox_helpers::{
    encode_cursor, parse_cursor, next_retry_at, is_retry_ready, record_sync_run_summary,
};

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
    .map_err(|e| format!("فشل وضع علامة على صف المزامنة قيد المعالجة: {}", e))?;
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
    .map_err(|e| format!("فشل إنهاء صف المزامنة: {}", e))?;
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

pub(crate) fn execute_sync_cycle(
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
                "لم يتم تكوين PMS_OWNER_SYNC_ENDPOINT. قم بتعيينه إلى عنوان URL الأساسي لواجهة برمجة تطبيقات المزامنة السحابية."
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
                    "لم يتم تكوين PMS_OWNER_SYNC_ENDPOINT. تم تخطي المزامنة في الخلفية.".into(),
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
            last_error: None,
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
        last_error: None,
    })
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
    auth_session: State<'_, AuthSessionState>,
) -> Result<String, String> {
    if data.event_type.trim().is_empty() {
        return Err("نوع الحدث مطلوب".into());
    }
    if data.entity_type.trim().is_empty() {
        return Err("نوع الكيان مطلوب".into());
    }
    if data.entity_id.trim().is_empty() {
        return Err("معرف الكيان مطلوب".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
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
    .map_err(|e| format!("فشل وضع حدث المزامنة في قائمة الانتظار: {}", e))?;

    ensure_sync_state_row(&conn, &tenant_id);

    Ok(id)
}

#[tauri::command]
pub fn queue_owner_read_model_snapshot(
    db: State<'_, Database>,
    tenant_id: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<QueueOwnerSnapshotResult, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    let event_id = crate::commands::cloud_sync_scheduler::build_and_enqueue_snapshot(&conn, &tenant_id)?;
    Ok(QueueOwnerSnapshotResult { queued: 1, message: None, snapshot_event_id: event_id })
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
        "لم يتم تكوين PMS_OWNER_SYNC_ENDPOINT. قم بتعيينه إلى عنوان URL الأساسي لواجهة برمجة تطبيقات المزامنة السحابية."
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
        last_error: None,
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
