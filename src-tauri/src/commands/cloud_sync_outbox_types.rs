use serde::{Deserialize, Serialize};
use serde_json::Value;

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
    pub payload: Option<Value>,
    pub status: String,
    pub attempt_count: i64,
    pub last_attempt_at: Option<String>,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CloudSyncOutboxInput {
    pub event_type: String,
    pub entity_type: String,
    pub entity_id: Option<String>,
    pub payload_json: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct QueueOwnerSnapshotResult {
    pub queued: bool,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct CloudSyncRunResult {
    pub processed: i64,
    pub synced: i64,
    pub failed: i64,
    pub retried: i64,
    pub pages_run: i64,
    pub has_more_pending: bool,
    pub last_error: Option<String>,
}

pub(crate) struct CloudSyncRunMetrics {
    pub(crate) processed: i64,
    pub(crate) synced: i64,
    pub(crate) failed: i64,
    pub(crate) retried: i64,
    pub(crate) has_more_pending: bool,
    pub(crate) last_error: Option<String>,
}

pub(crate) struct OutboxProcessRow {
    pub(crate) id: String,
    pub(crate) event_type: String,
    pub(crate) entity_type: String,
    pub(crate) entity_id: String,
    pub(crate) payload_json: Option<String>,
    pub(crate) created_at: String,
    pub(crate) attempt_count: i64,
    pub(crate) last_attempt_at: Option<String>,
    pub(crate) status: String,
}

#[derive(Debug)]
pub(crate) struct CloudSyncPageResult {
    pub(crate) processed: i64,
    pub(crate) synced: i64,
    pub(crate) failed: i64,
    pub(crate) retried: i64,
    pub(crate) next_cursor: Option<String>,
    pub(crate) has_more_pending: bool,
    pub(crate) last_error: Option<String>,
}
