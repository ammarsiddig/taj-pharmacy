use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::{cloud_sync, license_guard, guard, audit};
use crate::commands::session_state::{AuthSessionState, resolve_identity};

const FLAG_WAREHOUSE: i64 = 8;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StockTakeRow {
    pub id: String,
    pub branch_id: String,
    pub started_by: String,
    pub started_by_name: String,
    pub confirmed_by: Option<String>,
    pub status: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub notes: Option<String>,
    pub item_count: i64,
    pub discrepancy_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StockTakeItemRow {
    pub id: String,
    pub stock_take_id: String,
    pub product_id: String,
    pub product_name: String,
    pub product_name_ar: Option<String>,
    pub batch_id: String,
    pub batch_number: Option<String>,
    pub expiry_date: Option<String>,
    pub expected_quantity: i64,
    pub actual_quantity: i64,
    pub difference: i64,
    pub adjustment_applied: bool,
}

#[tauri::command]
pub fn get_stock_takes(
    tenant_id: String,
    branch_id: String,
    db: State<Database>,
) -> Result<Vec<StockTakeRow>, String> {
    let conn = db.conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT st.id, st.branch_id, st.started_by, u.full_name,
                st.confirmed_by, st.status, st.started_at, st.completed_at, st.notes,
                COUNT(sti.id) as item_count,
                SUM(CASE WHEN sti.difference != 0 THEN 1 ELSE 0 END) as discrepancy_count
         FROM stock_takes st
         JOIN users u ON st.started_by = u.id
         LEFT JOIN stock_take_items sti ON sti.stock_take_id = st.id
         WHERE st.tenant_id = ?1 AND st.branch_id = ?2 AND st.deleted_at IS NULL
         GROUP BY st.id
         ORDER BY st.started_at DESC",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![tenant_id, branch_id], |row| {
        Ok(StockTakeRow {
            id: row.get(0)?,
            branch_id: row.get(1)?,
            started_by: row.get(2)?,
            started_by_name: row.get(3)?,
            confirmed_by: row.get(4)?,
            status: row.get(5)?,
            started_at: row.get(6)?,
            completed_at: row.get(7)?,
            notes: row.get(8)?,
            item_count: row.get(9)?,
            discrepancy_count: row.get::<_, Option<i64>>(10)?.unwrap_or(0),
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows { result.push(row.map_err(|e| e.to_string())?); }
    Ok(result)
}

#[tauri::command]
pub fn start_stock_take(
    tenant_id: String,
    branch_id: String,
    user_id: String,
    notes: Option<String>,
    db: State<Database>,
    auth_session: State<'_, AuthSessionState>,
) -> Result<String, String> {
    let conn = db.conn.lock().unwrap();
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, &branch_id)?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_WAREHOUSE)?;

    // Check no in_progress stock take exists
    let existing: i64 = conn.query_row(
        "SELECT COUNT(*) FROM stock_takes WHERE tenant_id=?1 AND branch_id=?2
         AND status='in_progress' AND deleted_at IS NULL",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    if existing > 0 {
        return Err("يوجد جرد مخزون قيد التقدم لهذا الفرع".to_string());
    }

    let id = Uuid::new_v4().to_string();
    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO stock_takes (id, tenant_id, branch_id, started_by, status, notes)
         VALUES (?1, ?2, ?3, ?4, 'in_progress', ?5)",
        params![id, tenant_id, branch_id, user_id, notes],
    ).map_err(|e| e.to_string())?;

    // Load all active batches as items with expected_quantity
    let batches: Vec<(String, String, String, i64)> = {
        let mut stmt = conn.prepare(
            "SELECT b.id, b.product_id, b.batch_number, b.quantity_current
             FROM batches b
             WHERE b.tenant_id=?1 AND b.status='active' AND b.deleted_at IS NULL
             ORDER BY b.product_id, b.expiry_date",
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map(params![tenant_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                row.get::<_, i64>(3)?,
            ))
        }).map_err(|e| e.to_string())?;

        let mut v = Vec::new();
        for r in rows { v.push(r.map_err(|e| e.to_string())?); }
        v
    };

    for (batch_id, product_id, _batch_num, qty) in batches {
        let item_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO stock_take_items (id, tenant_id, stock_take_id, product_id, batch_id,
              expected_quantity, actual_quantity, difference)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, 0)",
            params![item_id, tenant_id, id, product_id, batch_id, qty],
        ).map_err(|e| e.to_string())?;
    }

    conn.execute("COMMIT", []).map_err(|e| e.to_string())?;

    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "stock_take_started") {
        log::warn!("cloud sync enqueue failed after start_stock_take: {}", e);
    }

    Ok(id)
}

#[tauri::command]
pub fn get_stock_take_items(
    stock_take_id: String,
    tenant_id: String,
    db: State<Database>,
) -> Result<Vec<StockTakeItemRow>, String> {
    let conn = db.conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT sti.id, sti.stock_take_id, sti.product_id,
                p.trade_name, p.trade_name_ar,
                sti.batch_id, b.batch_number, b.expiry_date,
                sti.expected_quantity, sti.actual_quantity, sti.difference,
                sti.adjustment_applied
         FROM stock_take_items sti
         JOIN products p ON sti.product_id = p.id
         JOIN batches b ON sti.batch_id = b.id
         WHERE sti.stock_take_id = ?1 AND sti.tenant_id = ?2
         ORDER BY p.trade_name, b.expiry_date",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![stock_take_id, tenant_id], |row| {
        Ok(StockTakeItemRow {
            id: row.get(0)?,
            stock_take_id: row.get(1)?,
            product_id: row.get(2)?,
            product_name: row.get(3)?,
            product_name_ar: row.get(4)?,
            batch_id: row.get(5)?,
            batch_number: row.get(6)?,
            expiry_date: row.get(7)?,
            expected_quantity: row.get(8)?,
            actual_quantity: row.get(9)?,
            difference: row.get(10)?,
            adjustment_applied: row.get::<_, i64>(11)? == 1,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows { result.push(row.map_err(|e| e.to_string())?); }
    Ok(result)
}

#[tauri::command]
pub fn update_stock_take_item(
    item_id: String,
    tenant_id: String,
    actual_quantity: i64,
    db: State<Database>,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_WAREHOUSE)?;

    let expected: i64 = conn.query_row(
        "SELECT expected_quantity FROM stock_take_items WHERE id=?1 AND tenant_id=?2",
        params![item_id, tenant_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let difference = actual_quantity - expected;
    conn.execute(
        "UPDATE stock_take_items SET actual_quantity=?1, difference=?2,
         updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id=?3 AND tenant_id=?4",
        params![actual_quantity, difference, item_id, tenant_id],
    ).map_err(|e| e.to_string())?;

    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "stock_take_item_updated") {
        log::warn!("cloud sync enqueue failed after update_stock_take_item: {}", e);
    }
    Ok(())
}

#[tauri::command]
pub fn confirm_stock_take(
    stock_take_id: String,
    tenant_id: String,
    user_id: String,
    db: State<Database>,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, "")?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_WAREHOUSE)?;
    guard::require_access(&conn, &user_id, "inventory", guard::Level::Write)?;

    // Validate status
    let status: String = conn.query_row(
        "SELECT status FROM stock_takes WHERE id=?1 AND tenant_id=?2 AND deleted_at IS NULL",
        params![stock_take_id, tenant_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    if status != "in_progress" {
        return Err("الجرد ليس قيد التقدم".to_string());
    }

    // Get all items with differences
    let items: Vec<(String, String, i64, i64, i64)> = {
        let mut stmt = conn.prepare(
            "SELECT id, batch_id, expected_quantity, actual_quantity, difference
             FROM stock_take_items
             WHERE stock_take_id=?1 AND difference != 0",
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![stock_take_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
            ))
        }).map_err(|e| e.to_string())?;
        let mut v = Vec::new();
        for r in rows { v.push(r.map_err(|e| e.to_string())?); }
        v
    };

    // Apply adjustments
    for (item_id, batch_id, expected, actual, difference) in items {
        // Get product_id and branch_id for movement
        let (product_id, branch_id): (String, String) = conn.query_row(
            "SELECT product_id, (SELECT branch_id FROM storage_locations WHERE id=batches.location_id) FROM batches WHERE id=?1",
            params![batch_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|e| e.to_string())?;

        let movement_type = "adjust";
        // Keep the sign: `difference` is actual-expected, so a shrinkage must record a
        // NEGATIVE quantity_change. Using .abs() logged a positive change for losses,
        // making SUM(stock_movements.quantity_change) drift above real on-hand.
        let qty_change = difference;
        let movement_id = Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO stock_movements (id, tenant_id, branch_id, product_id, batch_id,
              movement_type, quantity_change, quantity_before, quantity_after,
              reference_type, reference_id, created_by)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'stock_take', ?10, ?11)",
            params![
                movement_id, tenant_id, branch_id, product_id, batch_id,
                movement_type, qty_change, expected, actual,
                stock_take_id, user_id
            ],
        ).map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE batches SET quantity_current=?1,
             status=CASE WHEN ?1=0 THEN 'depleted' ELSE 'active' END,
             updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id=?2",
            params![actual, batch_id],
        ).map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE stock_take_items SET adjustment_applied=1,
             updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id=?1",
            params![item_id],
        ).map_err(|e| e.to_string())?;
    }

    conn.execute(
        "UPDATE stock_takes SET status='completed', confirmed_by=?1,
         completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
         updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id=?2 AND tenant_id=?3",
        params![user_id, stock_take_id, tenant_id],
    ).map_err(|e| e.to_string())?;

    if let Err(e) = audit::log_action(&conn, &tenant_id, &user_id, "confirm", "stock_take", &stock_take_id, None) {
        log::warn!("audit log failed after confirm_stock_take: {}", e);
    }
    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "stock_take_confirmed") {
        log::warn!("cloud sync enqueue failed after confirm_stock_take: {}", e);
    }

    Ok(())
}

#[tauri::command]
pub fn cancel_stock_take(
    stock_take_id: String,
    tenant_id: String,
    db: State<Database>,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_WAREHOUSE)?;

    conn.execute(
        "UPDATE stock_takes SET status='cancelled',
         updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id=?1 AND tenant_id=?2 AND status='in_progress' AND deleted_at IS NULL",
        params![stock_take_id, tenant_id],
    ).map_err(|e| e.to_string())?;

    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "stock_take_cancelled") {
        log::warn!("cloud sync enqueue failed after cancel_stock_take: {}", e);
    }
    Ok(())
}
