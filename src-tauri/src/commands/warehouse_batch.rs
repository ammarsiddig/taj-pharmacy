use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::{cloud_sync, license_guard, guard, audit};
use crate::commands::session_state::{AuthSessionState, resolve_identity};

const FLAG_WAREHOUSE: i64 = 8;

#[derive(Debug, Serialize, Deserialize)]
pub struct RecalledBatch {
    pub id: String,
    pub product_id: String,
    pub product_name: String,
    pub batch_number: Option<String>,
    pub location_id: String,
    pub location_name: String,
    pub quantity_recalled: i64,
}

#[tauri::command]
pub fn dispose_batch(
    tenant_id: String,
    branch_id: String,
    user_id: String,
    batch_id: String,
    quantity: i64,
    reason: Option<String>,
    db: State<Database>,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    if quantity <= 0 { return Err("الكمية يجب أن تكون أكبر من صفر".into()); }
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, &branch_id)?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_WAREHOUSE)?;
    guard::require_permission(&conn, &user_id, "warehouse")?;

    // Verify batch exists
    let (qty_current, product_id): (i64, String) = conn.query_row(
        "SELECT quantity_current, product_id FROM batches
         WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![batch_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "الدفعة غير موجودة".to_string())?;

    if quantity > qty_current {
        return Err(format!("الكمية المطلوبة ({}) أكبر من المتاح ({})", quantity, qty_current));
    }

    let qty_after = qty_current - quantity;
    let new_status = if qty_after == 0 { "disposed" } else { "active" };

    conn.execute(
        "UPDATE batches SET quantity_current = ?2, status = ?3,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1",
        params![batch_id, qty_after, new_status],
    ).map_err(|e| e.to_string())?;

    let mv_id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO stock_movements (id, tenant_id, branch_id, product_id, batch_id,
                movement_type, quantity_change, quantity_before, quantity_after,
                reference_type, reference_id, notes, created_by)
         VALUES (?1, ?2, ?3, ?4, ?5, 'dispose', ?6, ?7, ?8, 'dispose', ?5, ?9, ?10)",
        params![mv_id, tenant_id, branch_id, product_id, batch_id,
                -quantity, qty_current, qty_after, reason, user_id],
    ).map_err(|e| e.to_string())?;

    if let Err(e) = audit::log_action(&conn, &tenant_id, &user_id, "dispose", "batch", &batch_id, reason.as_deref()) {
        log::warn!("audit log failed after dispose_batch: {}", e);
    }
    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "batch_disposed") {
        log::warn!("cloud sync enqueue failed after dispose_batch: {}", e);
    }

    Ok(())
}

#[tauri::command]
pub fn recall_batch(
    tenant_id: String,
    branch_id: String,
    user_id: String,
    batch_number: String,
    reason: Option<String>,
    db: State<Database>,
    auth_session: State<'_, AuthSessionState>,
) -> Result<Vec<RecalledBatch>, String> {
    if batch_number.trim().is_empty() {
        return Err("رقم الدفعة مطلوب".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, &branch_id)?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_WAREHOUSE)?;
    guard::require_permission(&conn, &user_id, "warehouse")?;

    let mut stmt = conn.prepare(
        "SELECT b.id, b.product_id, p.trade_name, b.batch_number, b.location_id,
                COALESCE(sl.name_ar, sl.name, 'غير محدد') as location_name,
                b.quantity_current
         FROM batches b
         JOIN products p ON b.product_id = p.id
         LEFT JOIN storage_locations sl ON b.location_id = sl.id
         WHERE b.tenant_id = ?1 AND b.batch_number = ?2
           AND b.status = 'active' AND b.quantity_current > 0
           AND b.deleted_at IS NULL",
    ).map_err(|e| e.to_string())?;

    let targets: Vec<(String, String, String, Option<String>, String, String, i64)> = stmt.query_map(
        params![tenant_id, batch_number],
        |row| Ok((
            row.get(0)?, row.get(1)?, row.get(2)?,
            row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?,
        )),
    ).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    if targets.is_empty() {
        return Err("لم يتم العثور على دفعات نشطة بهذا الرقم".into());
    }
    drop(stmt);

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let mut recalled = Vec::new();
    for (batch_id, product_id, product_name, batch_num, location_id, location_name, qty_current) in &targets {
        conn.execute(
            "UPDATE batches SET status = 'disposed', quantity_current = 0,
                     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1",
            params![batch_id],
        ).map_err(|e| e.to_string())?;

        let mv_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO stock_movements (id, tenant_id, branch_id, product_id, batch_id,
                     movement_type, quantity_change, quantity_before, quantity_after,
                     reference_type, reference_id, notes, created_by)
             VALUES (?1, ?2, ?3, ?4, ?5, 'dispose', ?6, ?7, 0, 'recall', ?5, ?8, ?9)",
            params![mv_id, tenant_id, branch_id, product_id, batch_id,
                    -qty_current, qty_current, reason, user_id],
        ).map_err(|e| e.to_string())?;

        recalled.push(RecalledBatch {
            id: batch_id.clone(),
            product_id: product_id.clone(),
            product_name: product_name.clone(),
            batch_number: batch_num.clone(),
            location_id: location_id.clone(),
            location_name: location_name.clone(),
            quantity_recalled: *qty_current,
        });
    }

    conn.execute("COMMIT", []).map_err(|e| e.to_string())?;

    if let Err(e) = audit::log_action(&conn, &tenant_id, &user_id, "recall", "batch", &batch_number, reason.as_deref()) {
        log::warn!("audit log failed after recall_batch: {}", e);
    }
    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "batch_recalled") {
        log::warn!("cloud sync enqueue failed after recall_batch: {}", e);
    }

    Ok(recalled)
}
