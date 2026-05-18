use chrono::{DateTime, Utc};
use reqwest::blocking::Client;
use rusqlite::params;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;

use crate::db::Database;

pub(crate) const DEFAULT_SYNC_PAGE_SIZE: i64 = 50;
pub(crate) const DEFAULT_SYNC_MAX_PAGES: i64 = 5;

#[derive(Clone, Default)]
pub struct CloudSyncRuntime {
    in_progress: Arc<AtomicBool>,
}

impl CloudSyncRuntime {
    pub(crate) fn try_start(&self) -> bool {
        self.in_progress
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
    }

    fn finish(&self) {
        self.in_progress.store(false, Ordering::Release);
    }
}

pub(crate) struct CloudSyncRunGuard<'a> {
    pub(crate) runtime: &'a CloudSyncRuntime,
}

impl Drop for CloudSyncRunGuard<'_> {
    fn drop(&mut self) {
        self.runtime.finish();
    }
}

pub(crate) fn acquire_run_guard(runtime: &CloudSyncRuntime) -> Result<CloudSyncRunGuard<'_>, String> {
    if !runtime.try_start() {
        return Err("تصدير المزامنة السحابية قيد التقدم بالفعل.".into());
    }
    Ok(CloudSyncRunGuard { runtime })
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum CloudSyncRunMode {
    Manual,
    Auto,
}

impl CloudSyncRunMode {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Auto => "auto",
        }
    }
}

#[cfg(test)]
thread_local! {
    static TEST_NOW: std::cell::RefCell<Option<DateTime<Utc>>> =
        const { std::cell::RefCell::new(None) };
}

pub(crate) fn current_time() -> DateTime<Utc> {
    #[cfg(test)]
    if let Some(now) = TEST_NOW.with(|value| value.borrow().clone()) {
        return now;
    }

    Utc::now()
}

pub(crate) fn now_iso() -> String {
    current_time().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

pub(crate) fn cloud_sync_endpoint() -> Option<String> {
    std::env::var("PMS_OWNER_SYNC_ENDPOINT")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(crate) fn cloud_sync_token() -> Option<String> {
    std::env::var("PMS_OWNER_SYNC_TOKEN")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(crate) fn build_cloud_sync_client() -> Result<Client, String> {
    Client::builder()
        .default_headers({
            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert("X-PMS-Client-Version", "1".parse().unwrap());
            headers
        })
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("فشل إنشاء عميل المزامنة السحابية: {}", e))
}

pub(crate) fn ensure_sync_state_row(conn: &rusqlite::Connection, tenant_id: &str) {
    conn.execute(
        "INSERT INTO cloud_sync_state (tenant_id, updated_at)
         VALUES (?1, ?2)
         ON CONFLICT(tenant_id) DO UPDATE SET
            updated_at = excluded.updated_at",
        params![tenant_id, now_iso()],
    )
    .ok();
}

pub(crate) fn list_tenant_ids(db: &Database) -> Result<Vec<String>, String> {
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

pub(crate) fn tenant_has_backlog(db: &Database, tenant_id: &str) -> Result<bool, String> {
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

pub use crate::commands::cloud_sync_scheduler::enqueue_owner_refresh_request;
pub use crate::commands::cloud_sync_scheduler::enqueue_cloud_deletion;

#[cfg(test)]
#[path = "cloud_sync_tests.rs"]
mod tests;
