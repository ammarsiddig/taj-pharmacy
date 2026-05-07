use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::cloud_sync;
use crate::commands::license_guard;
use crate::commands::guard;
use crate::commands::audit;

const FLAG_WAREHOUSE: i64 = 8;

// ────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StorageLocation {
    pub id: String,
    pub tenant_id: String,
    pub branch_id: String,
    pub name: String,
    pub name_ar: Option<String>,
    pub location_type: String,
    pub location_code: Option<String>,
    pub is_active: bool,
    pub item_count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StorageLocationData {
    pub name: String,
    pub name_ar: Option<String>,
    pub location_type: String,
    pub location_code: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StockMovementRow {
    pub id: String,
    pub product_id: String,
    pub product_name: String,
    pub batch_id: String,
    pub batch_number: Option<String>,
    pub movement_type: String,
    pub quantity_change: i64,
    pub quantity_before: i64,
    pub quantity_after: i64,
    pub reference_type: Option<String>,
    pub reference_id: Option<String>,
    pub notes: Option<String>,
    pub created_by: String,
    pub created_by_name: String,
    pub created_at: String,
}

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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SupplierReturnRow {
    pub id: String,
    pub supplier_id: String,
    pub supplier_name: String,
    pub invoice_id: String,
    pub invoice_number: Option<String>,
    pub return_number: String,
    pub return_date: String,
    pub total_amount: i64,
    pub status: String,
    pub reason: Option<String>,
    pub created_by_name: String,
    pub created_at: String,
    pub item_count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SupplierReturnItemData {
    pub product_id: String,
    pub batch_id: String,
    pub quantity: i64,
    pub unit_cost: i64,
    pub reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SupplierReturnCreateData {
    pub supplier_id: String,
    pub invoice_id: String,
    pub return_date: String,
    pub reason: Option<String>,
    pub notes: Option<String>,
    pub items: Vec<SupplierReturnItemData>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BatchRow {
    pub id: String,
    pub product_id: String,
    pub product_name: String,
    pub product_name_ar: Option<String>,
    pub location_id: String,
    pub location_name: String,
    pub supplier_invoice_id: Option<String>,
    pub batch_number: Option<String>,
    pub expiry_date: Option<String>,
    pub quantity_received: i64,
    pub quantity_current: i64,
    pub unit_cost: i64,
    pub status: String,
}

// ────────────────────────────────────────────────────────────────
// STORAGE LOCATIONS
// ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_storage_locations(
    tenant_id: String,
    branch_id: String,
    db: State<Database>,
) -> Result<Vec<StorageLocation>, String> {
    let conn = db.conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT sl.id, sl.tenant_id, sl.branch_id, sl.name, sl.name_ar,
                sl.location_type, sl.location_code, sl.is_active,
                COUNT(DISTINCT b.id) as item_count
         FROM storage_locations sl
         LEFT JOIN batches b ON b.location_id = sl.id
             AND b.status = 'active' AND b.deleted_at IS NULL
         WHERE sl.tenant_id = ?1 AND sl.branch_id = ?2 AND sl.deleted_at IS NULL
         GROUP BY sl.id
         ORDER BY sl.location_type, sl.name",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![tenant_id, branch_id], |row| {
        Ok(StorageLocation {
            id: row.get(0)?,
            tenant_id: row.get(1)?,
            branch_id: row.get(2)?,
            name: row.get(3)?,
            name_ar: row.get(4)?,
            location_type: row.get(5)?,
            location_code: row.get(6)?,
            is_active: row.get::<_, i64>(7)? == 1,
            item_count: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows { result.push(row.map_err(|e| e.to_string())?); }
    Ok(result)
}

#[tauri::command]
pub fn create_storage_location(
    tenant_id: String,
    branch_id: String,
    data: StorageLocationData,
    db: State<Database>,
) -> Result<StorageLocation, String> {
    let conn = db.conn.lock().unwrap();
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_WAREHOUSE)?;
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO storage_locations (id, tenant_id, branch_id, name, name_ar, location_type, location_code)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, tenant_id, branch_id, data.name, data.name_ar, data.location_type, data.location_code],
    ).map_err(|e| e.to_string())?;

    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "warehouse_location_created") {
        log::warn!("cloud sync enqueue failed after create_storage_location: {}", e);
    }

    Ok(StorageLocation {
        id,
        tenant_id,
        branch_id,
        name: data.name,
        name_ar: data.name_ar,
        location_type: data.location_type,
        location_code: data.location_code,
        is_active: true,
        item_count: 0,
    })
}

#[tauri::command]
pub fn update_storage_location(
    location_id: String,
    tenant_id: String,
    data: StorageLocationData,
    db: State<Database>,
) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_WAREHOUSE)?;

    conn.execute(
        "UPDATE storage_locations SET name=?1, name_ar=?2, location_type=?3, location_code=?4,
         updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id=?5 AND tenant_id=?6 AND deleted_at IS NULL",
        params![data.name, data.name_ar, data.location_type, data.location_code, location_id, tenant_id],
    ).map_err(|e| e.to_string())?;

    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "warehouse_location_updated") {
        log::warn!("cloud sync enqueue failed after update_storage_location: {}", e);
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_storage_location_active(
    location_id: String,
    tenant_id: String,
    db: State<Database>,
) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_WAREHOUSE)?;

    conn.execute(
        "UPDATE storage_locations SET is_active = CASE WHEN is_active=1 THEN 0 ELSE 1 END,
         updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id=?1 AND tenant_id=?2 AND deleted_at IS NULL",
        params![location_id, tenant_id],
    ).map_err(|e| e.to_string())?;

    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "warehouse_location_toggled") {
        log::warn!("cloud sync enqueue failed after toggle_storage_location_active: {}", e);
    }
    Ok(())
}

#[tauri::command]
pub fn get_location_batches(
    location_id: String,
    tenant_id: String,
    db: State<Database>,
) -> Result<Vec<BatchRow>, String> {
    let conn = db.conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT b.id, b.product_id, p.trade_name, p.trade_name_ar,
                b.location_id, sl.name,
                b.supplier_invoice_id, b.batch_number, b.expiry_date,
                b.quantity_received, b.quantity_current, b.unit_cost, b.status
         FROM batches b
         JOIN products p ON b.product_id = p.id
         JOIN storage_locations sl ON b.location_id = sl.id
         WHERE b.location_id = ?1 AND b.tenant_id = ?2
           AND b.status = 'active' AND b.deleted_at IS NULL
         ORDER BY b.expiry_date ASC",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![location_id, tenant_id], |row| {
        Ok(BatchRow {
            id: row.get(0)?,
            product_id: row.get(1)?,
            product_name: row.get(2)?,
            product_name_ar: row.get(3)?,
            location_id: row.get(4)?,
            location_name: row.get(5)?,
            supplier_invoice_id: row.get(6)?,
            batch_number: row.get(7)?,
            expiry_date: row.get(8)?,
            quantity_received: row.get(9)?,
            quantity_current: row.get(10)?,
            unit_cost: row.get(11)?,
            status: row.get(12)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows { result.push(row.map_err(|e| e.to_string())?); }
    Ok(result)
}

// ────────────────────────────────────────────────────────────────
// STOCK MOVEMENTS
// ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_stock_movements(
    tenant_id: String,
    branch_id: String,
    product_id: Option<String>,
    movement_type: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    limit: Option<i64>,
    db: State<Database>,
) -> Result<Vec<StockMovementRow>, String> {
    let conn = db.conn.lock().unwrap();

    let p_id: Option<String> = product_id;
    let m_type: Option<String> = movement_type;
    let d_from: Option<String> = date_from;
    let d_to: Option<String> = date_to;
    let lim = limit.unwrap_or(500);

    let sql = format!(
        "SELECT sm.id, sm.product_id, p.trade_name, sm.batch_id,
                b.batch_number, sm.movement_type,
                sm.quantity_change, sm.quantity_before, sm.quantity_after,
                sm.reference_type, sm.reference_id, sm.notes,
                sm.created_by, u.full_name, sm.created_at
         FROM stock_movements sm
         JOIN products p ON sm.product_id = p.id
         JOIN batches b ON sm.batch_id = b.id
         JOIN users u ON sm.created_by = u.id
         WHERE sm.tenant_id = ?1 AND sm.branch_id = ?2
           AND (?3 IS NULL OR sm.product_id = ?3)
           AND (?4 IS NULL OR sm.movement_type = ?4)
           AND (?5 IS NULL OR DATE(sm.created_at) >= ?5)
           AND (?6 IS NULL OR DATE(sm.created_at) <= ?6)
         ORDER BY sm.created_at DESC
         LIMIT {}",
        lim
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(
        params![tenant_id, branch_id, p_id, m_type, d_from, d_to],
        |row: &rusqlite::Row| {
            Ok(StockMovementRow {
                id: row.get(0)?,
                product_id: row.get(1)?,
                product_name: row.get(2)?,
                batch_id: row.get(3)?,
                batch_number: row.get(4)?,
                movement_type: row.get(5)?,
                quantity_change: row.get(6)?,
                quantity_before: row.get(7)?,
                quantity_after: row.get(8)?,
                reference_type: row.get(9)?,
                reference_id: row.get(10)?,
                notes: row.get(11)?,
                created_by: row.get(12)?,
                created_by_name: row.get(13)?,
                created_at: row.get(14)?,
            })
        },
    ).map_err(|e: rusqlite::Error| e.to_string())?;

    let mut result = Vec::new();
    for row in rows { result.push(row.map_err(|e: rusqlite::Error| e.to_string())?); }
    Ok(result)
}

// ────────────────────────────────────────────────────────────────
// DISPOSE BATCH
// ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn dispose_batch(
    tenant_id: String,
    branch_id: String,
    user_id: String,
    batch_id: String,
    quantity: i64,
    reason: Option<String>,
    db: State<Database>,
) -> Result<(), String> {
    if quantity <= 0 {
        return Err("الكمية يجب أن تكون أكبر من صفر".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_WAREHOUSE)?;
    guard::require_permission(&conn, &user_id, "warehouse")?;

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

// ────────────────────────────────────────────────────────────────
// RECALL BATCH
// ────────────────────────────────────────────────────────────────

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
pub fn recall_batch(
    tenant_id: String,
    branch_id: String,
    user_id: String,
    batch_number: String,
    reason: Option<String>,
    db: State<Database>,
) -> Result<Vec<RecalledBatch>, String> {
    if batch_number.trim().is_empty() {
        return Err("رقم الدفعة مطلوب".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
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

    if let Err(e) = audit::log_action(&conn, &tenant_id, &user_id, "recall", "batch", &batch_number, reason.as_deref()) {
        log::warn!("audit log failed after recall_batch: {}", e);
    }
    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "batch_recalled") {
        log::warn!("cloud sync enqueue failed after recall_batch: {}", e);
    }

    Ok(recalled)
}

// ────────────────────────────────────────────────────────────────
// STOCK TAKE
// ────────────────────────────────────────────────────────────────

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
) -> Result<String, String> {
    let conn = db.conn.lock().unwrap();
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
        return Err("A stock take is already in progress for this branch".to_string());
    }

    let id = Uuid::new_v4().to_string();
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
) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
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
) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_WAREHOUSE)?;
    guard::require_permission(&conn, &user_id, "warehouse")?;

    // Validate status
    let status: String = conn.query_row(
        "SELECT status FROM stock_takes WHERE id=?1 AND tenant_id=?2 AND deleted_at IS NULL",
        params![stock_take_id, tenant_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    if status != "in_progress" {
        return Err("Stock take is not in progress".to_string());
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

        let movement_type = if difference > 0 { "adjust" } else { "adjust" };
        let qty_change = difference.abs();
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
) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
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

// ────────────────────────────────────────────────────────────────
// SUPPLIER RETURNS
// ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_supplier_returns(
    tenant_id: String,
    supplier_id: Option<String>,
    db: State<Database>,
) -> Result<Vec<SupplierReturnRow>, String> {
    let conn = db.conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT sr.id, sr.supplier_id, s.name, sr.invoice_id,
                si.invoice_number, sr.return_number, sr.return_date,
                sr.total_amount, sr.status, sr.reason, u.full_name, sr.created_at,
                COUNT(sri.id) as item_count
         FROM supplier_returns sr
         JOIN suppliers s ON sr.supplier_id = s.id
         JOIN supplier_invoices si ON sr.invoice_id = si.id
         JOIN users u ON sr.created_by = u.id
         LEFT JOIN supplier_return_items sri ON sri.supplier_return_id = sr.id
         WHERE sr.tenant_id = ?1 AND sr.deleted_at IS NULL
         GROUP BY sr.id
         ORDER BY sr.created_at DESC",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![tenant_id], |row| {
        Ok(SupplierReturnRow {
            id: row.get(0)?,
            supplier_id: row.get(1)?,
            supplier_name: row.get(2)?,
            invoice_id: row.get(3)?,
            invoice_number: row.get(4)?,
            return_number: row.get(5)?,
            return_date: row.get(6)?,
            total_amount: row.get(7)?,
            status: row.get(8)?,
            reason: row.get(9)?,
            created_by_name: row.get(10)?,
            created_at: row.get(11)?,
            item_count: row.get(12)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        let r = row.map_err(|e| e.to_string())?;
        if let Some(ref sid) = supplier_id {
            if &r.supplier_id != sid { continue; }
        }
        result.push(r);
    }
    Ok(result)
}

#[tauri::command]
pub fn create_supplier_return(
    tenant_id: String,
    branch_id: String,
    user_id: String,
    data: SupplierReturnCreateData,
    db: State<Database>,
) -> Result<String, String> {
    let conn = db.conn.lock().unwrap();
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_WAREHOUSE)?;

    // Generate return number
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM supplier_returns WHERE tenant_id=?1",
        params![tenant_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    let return_number = format!("SRET-{:05}", count + 1);

    let total_amount: i64 = data.items.iter().map(|i| i.unit_cost * i.quantity).sum();
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO supplier_returns (id, tenant_id, supplier_id, invoice_id, branch_id,
          return_number, return_date, total_amount, status, reason, notes, created_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?9, ?10, ?11)",
        params![
            id, tenant_id, data.supplier_id, data.invoice_id, branch_id,
            return_number, data.return_date, total_amount,
            data.reason, data.notes, user_id
        ],
    ).map_err(|e| e.to_string())?;

    for item in &data.items {
        let item_id = Uuid::new_v4().to_string();
        let total_price = item.unit_cost * item.quantity;
        conn.execute(
            "INSERT INTO supplier_return_items (id, tenant_id, supplier_return_id, product_id,
              batch_id, quantity, unit_cost, total_price, reason)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![item_id, tenant_id, id, item.product_id, item.batch_id,
                    item.quantity, item.unit_cost, total_price, item.reason],
        ).map_err(|e| e.to_string())?;
    }

    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "supplier_return_created") {
        log::warn!("cloud sync enqueue failed after create_supplier_return: {}", e);
    }

    Ok(id)
}

#[tauri::command]
pub fn confirm_supplier_return(
    return_id: String,
    tenant_id: String,
    user_id: String,
    db: State<Database>,
) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_WAREHOUSE)?;
    guard::require_permission(&conn, &user_id, "warehouse")?;

    let status: String = conn.query_row(
        "SELECT status FROM supplier_returns WHERE id=?1 AND tenant_id=?2 AND deleted_at IS NULL",
        params![return_id, tenant_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    if status != "pending" {
        return Err("Supplier return is not in pending status".to_string());
    }

    // Get items
    let items: Vec<(String, String, i64, i64)> = {
        let mut stmt = conn.prepare(
            "SELECT product_id, batch_id, quantity, unit_cost
             FROM supplier_return_items WHERE supplier_return_id=?1",
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![return_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get::<_, i64>(2)?, row.get::<_, i64>(3)?))
        }).map_err(|e| e.to_string())?;
        let mut v = Vec::new();
        for r in rows { v.push(r.map_err(|e| e.to_string())?); }
        v
    };

    // Get branch_id
    let branch_id: String = conn.query_row(
        "SELECT branch_id FROM supplier_returns WHERE id=?1",
        params![return_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    for (product_id, batch_id, quantity, _unit_cost) in items {
        let qty_before: i64 = conn.query_row(
            "SELECT quantity_current FROM batches WHERE id=?1",
            params![batch_id],
            |row| row.get(0),
        ).map_err(|e| e.to_string())?;

        let qty_after = (qty_before - quantity).max(0);
        let movement_id = Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO stock_movements (id, tenant_id, branch_id, product_id, batch_id,
              movement_type, quantity_change, quantity_before, quantity_after,
              reference_type, reference_id, created_by)
             VALUES (?1, ?2, ?3, ?4, ?5, 'supplier_return', ?6, ?7, ?8, 'supplier_return', ?9, ?10)",
            params![movement_id, tenant_id, branch_id, product_id, batch_id,
                    quantity, qty_before, qty_after, return_id, user_id],
        ).map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE batches SET quantity_current=?1,
             status=CASE WHEN ?1<=0 THEN 'returned' ELSE 'active' END,
             updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id=?2",
            params![qty_after, batch_id],
        ).map_err(|e| e.to_string())?;
    }

    conn.execute(
        "UPDATE supplier_returns SET status='confirmed', confirmed_by=?1,
         confirmed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
         updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id=?2 AND tenant_id=?3",
        params![user_id, return_id, tenant_id],
    ).map_err(|e| e.to_string())?;

    if let Err(e) = audit::log_action(&conn, &tenant_id, &user_id, "confirm", "supplier_return", &return_id, None) {
        log::warn!("audit log failed after confirm_supplier_return: {}", e);
    }
    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "supplier_return_confirmed") {
        log::warn!("cloud sync enqueue failed after confirm_supplier_return: {}", e);
    }

    Ok(())
}

#[tauri::command]
pub fn get_invoice_batches(
    invoice_id: String,
    tenant_id: String,
    db: State<Database>,
) -> Result<Vec<BatchRow>, String> {
    let conn = db.conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT b.id, b.product_id, p.trade_name, p.trade_name_ar,
                b.location_id, sl.name,
                b.supplier_invoice_id, b.batch_number, b.expiry_date,
                b.quantity_received, b.quantity_current, b.unit_cost, b.status
         FROM batches b
         JOIN products p ON b.product_id = p.id
         JOIN storage_locations sl ON b.location_id = sl.id
         WHERE b.supplier_invoice_id = ?1 AND b.tenant_id = ?2
           AND b.quantity_current > 0 AND b.deleted_at IS NULL
         ORDER BY p.trade_name",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![invoice_id, tenant_id], |row| {
        Ok(BatchRow {
            id: row.get(0)?,
            product_id: row.get(1)?,
            product_name: row.get(2)?,
            product_name_ar: row.get(3)?,
            location_id: row.get(4)?,
            location_name: row.get(5)?,
            supplier_invoice_id: row.get(6)?,
            batch_number: row.get(7)?,
            expiry_date: row.get(8)?,
            quantity_received: row.get(9)?,
            quantity_current: row.get(10)?,
            unit_cost: row.get(11)?,
            status: row.get(12)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows { result.push(row.map_err(|e| e.to_string())?); }
    Ok(result)
}

// ────────────────────────────────────────────────────────────────
// STOCK TRANSFER
// ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn transfer_stock(
    tenant_id: String,
    branch_id: String,
    user_id: String,
    product_id: String,
    from_location_id: String,
    to_location_id: String,
    quantity: i64,
    db: State<Database>,
) -> Result<(), String> {
    if quantity <= 0 { return Err("الكمية يجب أن تكون أكبر من صفر".into()); }
    if from_location_id == to_location_id { return Err("موقع المصدر والوجهة متطابقان".into()); }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    guard::require_permission(&conn, &user_id, "warehouse")?;

    let available: i64 = conn.query_row(
        "SELECT COALESCE(SUM(quantity_current),0) FROM batches
         WHERE tenant_id=?1 AND product_id=?2 AND location_id=?3
           AND status='active' AND deleted_at IS NULL",
        params![tenant_id, product_id, from_location_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    if available < quantity {
        return Err(format!("المخزون المتاح ({}) أقل من الكمية المطلوبة ({})", available, quantity));
    }

    let product_name: String = conn.query_row(
        "SELECT COALESCE(trade_name_ar, trade_name) FROM products WHERE id=?1 AND tenant_id=?2",
        params![product_id, tenant_id], |row| row.get(0),
    ).map_err(|_| "المنتج غير موجود".to_string())?;

    let from_name: String = conn.query_row(
        "SELECT COALESCE(name_ar,name) FROM storage_locations WHERE id=?1",
        params![from_location_id], |row| row.get(0),
    ).unwrap_or_else(|_| from_location_id.clone());

    let to_name: String = conn.query_row(
        "SELECT COALESCE(name_ar,name) FROM storage_locations WHERE id=?1",
        params![to_location_id], |row| row.get(0),
    ).unwrap_or_else(|_| to_location_id.clone());

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let xfer = do_transfer(
        &conn, &tenant_id, &branch_id, &user_id,
        &product_id, &from_location_id, &to_location_id,
        quantity, &from_name, &to_name, &product_name,
    );
    match xfer {
        Err(e) => { conn.execute("ROLLBACK", []).ok(); Err(e) }
        Ok(()) => { conn.execute("COMMIT", []).map_err(|e| e.to_string())?; Ok(()) }
    }
}

fn do_transfer(
    conn: &rusqlite::Connection,
    tenant_id: &str, branch_id: &str, user_id: &str,
    product_id: &str, from_loc: &str, to_loc: &str,
    quantity: i64, from_name: &str, to_name: &str, product_name: &str,
) -> Result<(), String> {
    let mut stmt = conn.prepare(
        "SELECT id, quantity_current FROM batches
         WHERE tenant_id=?1 AND product_id=?2 AND location_id=?3
           AND status='active' AND deleted_at IS NULL AND quantity_current>0
         ORDER BY COALESCE(expiry_date,'9999-12-31') ASC",
    ).map_err(|e| e.to_string())?;
    let batches: Vec<(String, i64)> = stmt.query_map(
        params![tenant_id, product_id, from_loc],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
    drop(stmt);

    let notes = format!("نقل من {} إلى {}: {}", from_name, to_name, product_name);
    let mut remaining = quantity;

    for (batch_id, qty_cur) in batches {
        if remaining <= 0 { break; }
        let take = remaining.min(qty_cur);
        let new_qty = qty_cur - take;

        conn.execute(
            "UPDATE batches SET quantity_current=?1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2",
            params![new_qty, batch_id],
        ).map_err(|e| e.to_string())?;

        let out_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO stock_movements(id,tenant_id,branch_id,product_id,batch_id,
              movement_type,quantity_change,quantity_before,quantity_after,
              reference_type,reference_id,notes,created_by)
             VALUES(?1,?2,?3,?4,?5,'transfer_out',?6,?7,?8,'transfer',?9,?10,?11)",
            params![out_id,tenant_id,branch_id,product_id,batch_id,-take,qty_cur,new_qty,batch_id,notes,user_id],
        ).map_err(|e| e.to_string())?;

        let dest_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO batches(id,tenant_id,product_id,location_id,batch_number,
              quantity_received,quantity_current,unit_cost,status)
             VALUES(?1,?2,?3,?4,'TRANSFER',?5,?5,0,'active')",
            params![dest_id,tenant_id,product_id,to_loc,take],
        ).map_err(|e| e.to_string())?;

        let in_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO stock_movements(id,tenant_id,branch_id,product_id,batch_id,
              movement_type,quantity_change,quantity_before,quantity_after,
              reference_type,reference_id,notes,created_by)
             VALUES(?1,?2,?3,?4,?5,'transfer_in',?6,0,?6,'transfer',?7,?8,?9)",
            params![in_id,tenant_id,branch_id,product_id,dest_id,take,dest_id,notes,user_id],
        ).map_err(|e| e.to_string())?;

        remaining -= take;
    }
    if remaining > 0 { return Err("لم يتم نقل الكمية كاملة".into()); }
    if let Err(e) = audit::log_action(&conn, &tenant_id, &user_id, "transfer", "stock", &product_id, None) {
        log::warn!("audit log failed after transfer_stock: {}", e);
    }
    Ok(())
}
