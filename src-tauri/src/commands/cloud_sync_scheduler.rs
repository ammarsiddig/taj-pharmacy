use crate::commands::cloud_sync::{
    ensure_sync_state_row, list_tenant_ids, now_iso, CloudSyncRunGuard,
    CloudSyncRunMode, CloudSyncRuntime, DEFAULT_SYNC_MAX_PAGES, DEFAULT_SYNC_PAGE_SIZE,
};
use crate::commands::cloud_sync_outbox::execute_sync_cycle;
use crate::db::Database;
use rusqlite::params;
use serde_json::json;
use std::time::Duration;
use uuid::Uuid;

const DEFAULT_SYNC_INTERVAL_SECONDS: u64 = 120;

const SNAPSHOT_INTERVAL_SECONDS: u64 = 300; // 5 minutes

#[derive(Debug, Clone, Copy)]
pub(crate) struct CloudSyncSchedulerConfig {
    pub(crate) interval: Duration,
    pub(crate) page_size: i64,
    pub(crate) max_pages: i64,
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

pub(crate) fn run_background_scheduler_once(
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
    .map_err(|e| format!("فشل وضع طلب تحديث المالك في قائمة الانتظار: {}", e))?;

    ensure_sync_state_row(conn, tenant_id);

    Ok(event_id)
}

pub fn enqueue_cloud_deletion(
    conn: &rusqlite::Connection,
    tenant_id: &str,
    branch_id: &str,
    table_name: &str,
    record_id: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT OR IGNORE INTO cloud_sync_deletions (id, tenant_id, branch_id, table_name, record_id)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![Uuid::new_v4().to_string(), tenant_id, branch_id, table_name, record_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn build_and_enqueue_snapshot(
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
    ).map_err(|e| format!("فشل وضع لقطة المالك في قائمة الانتظار: {}", e))?;

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
            let branches = match super::cloud_sync_snapshot::list_branch_ids_for_tenant(&db, &tenant_id) {
                Ok(ids) => ids,
                Err(e) => { log::warn!("snapshot scheduler: failed to list branches for {}: {}", tenant_id, e); continue; }
            };
            for branch in branches {
                match super::cloud_sync_snapshot::push_all_tables(&db, &tenant_id, &branch) {
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
