use chrono::{DateTime, Duration as ChronoDuration, Utc};
use rusqlite::params;

use super::cloud_sync::{current_time, CloudSyncRunMode};
use super::cloud_sync_outbox::CloudSyncRunMetrics;

pub(crate) fn encode_cursor(created_at: &str, id: &str) -> String {
    format!("{}|{}", created_at, id)
}

pub(crate) fn parse_cursor(cursor: &str) -> Option<(String, String)> {
    let mut parts = cursor.splitn(2, '|');
    let created_at = parts.next()?.trim();
    let id = parts.next()?.trim();
    if created_at.is_empty() || id.is_empty() {
        return None;
    }
    Some((created_at.to_string(), id.to_string()))
}

fn retry_backoff_seconds(attempt_count: i64) -> i64 {
    let exp = (attempt_count - 1).clamp(0, 16) as u32;
    let seconds = 5_i64.saturating_mul(2_i64.saturating_pow(exp));
    seconds.min(300)
}

pub(crate) fn parse_iso_to_utc(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

pub(crate) fn next_retry_at(last_attempt_at: Option<&str>, attempt_count: i64) -> Option<String> {
    let last_attempt_at = parse_iso_to_utc(last_attempt_at?)?;
    let next = last_attempt_at + ChronoDuration::seconds(retry_backoff_seconds(attempt_count));
    Some(next.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string())
}

pub(crate) fn is_retry_ready(last_attempt_at: Option<&str>, attempt_count: i64) -> bool {
    let Some(last_attempt_at) = last_attempt_at else {
        return true;
    };
    let Some(last) = parse_iso_to_utc(last_attempt_at) else {
        return true;
    };
    let elapsed = current_time().signed_duration_since(last);
    elapsed.num_seconds() >= retry_backoff_seconds(attempt_count)
}

pub(crate) fn record_sync_run_summary(
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
