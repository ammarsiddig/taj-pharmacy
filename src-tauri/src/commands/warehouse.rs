use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::cloud_sync;
use crate::commands::license_guard;
use crate::commands::guard;
use crate::commands::audit;
use crate::commands::session_state::{AuthSessionState, resolve_identity};

const FLAG_WAREHOUSE: i64 = 8;

// ────────────────────────────────────────────────────────────────
// REORDER POINT TYPES
// ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[allow(dead_code)] // constructed inside get_low_stock_products; false positive from macro
pub struct LowStockProduct {
    pub product_id: String,
    pub product_name: String,
    pub product_name_ar: Option<String>,
    pub barcode: Option<String>,
    pub category: Option<String>,
    pub unit: String,
    pub current_qty: i64,
    pub min_stock_level: i64,
    pub deficit: i64,
    pub last_purchase_price: Option<i64>,
    pub supplier_id: Option<String>,
    pub supplier_name: Option<String>,
}

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
    pub product_name_ar: Option<String>,
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
    auth_session: State<'_, AuthSessionState>,
) -> Result<StorageLocation, String> {
    let conn = db.conn.lock().unwrap();
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", &branch_id)?;
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
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
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
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
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
                sm.created_by, u.full_name, sm.created_at, p.trade_name_ar
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
                product_name_ar: row.get(15)?,
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
    auth_session: State<'_, AuthSessionState>,
) -> Result<String, String> {
    let conn = db.conn.lock().unwrap();
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, &branch_id)?;
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
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, "")?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_WAREHOUSE)?;
    guard::require_access(&conn, &user_id, "supplier_returns", guard::Level::Write)?;

    let status: String = conn.query_row(
        "SELECT status FROM supplier_returns WHERE id=?1 AND tenant_id=?2 AND deleted_at IS NULL",
        params![return_id, tenant_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    if status != "pending" {
        return Err("مرتجعات المورد ليست قيد الانتظار".to_string());
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

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

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

    conn.execute("COMMIT", []).map_err(|e| e.to_string())?;

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
// REORDER POINT ALERTS
// ────────────────────────────────────────────────────────────────

/// Returns products whose current branch stock is below min_stock_level.
/// Sorted by deficit (most critical first).
#[tauri::command]
pub fn get_low_stock_products(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
) -> Result<Vec<LowStockProduct>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_WAREHOUSE)?;

    let mut stmt = conn.prepare(
        "SELECT
            p.id,
            p.trade_name,
            p.trade_name_ar,
            p.barcode,
            p.category,
            p.unit,
            COALESCE(SUM(b.quantity_current), 0) AS current_qty,
            p.min_stock_level,
            p.last_purchase_price,
            (SELECT s.id
             FROM suppliers s
             JOIN supplier_invoices si ON si.supplier_id = s.id
             JOIN supplier_invoice_items sii ON sii.invoice_id = si.id
             WHERE sii.product_id = p.id
               AND si.tenant_id = p.tenant_id
               AND si.deleted_at IS NULL
               AND s.deleted_at IS NULL
             ORDER BY si.confirmed_at DESC, si.created_at DESC
             LIMIT 1) AS supplier_id,
            (SELECT s.name
             FROM suppliers s
             JOIN supplier_invoices si ON si.supplier_id = s.id
             JOIN supplier_invoice_items sii ON sii.invoice_id = si.id
             WHERE sii.product_id = p.id
               AND si.tenant_id = p.tenant_id
               AND si.deleted_at IS NULL
               AND s.deleted_at IS NULL
             ORDER BY si.confirmed_at DESC, si.created_at DESC
             LIMIT 1) AS supplier_name
         FROM products p
         LEFT JOIN batches b
             ON b.product_id = p.id
            AND b.tenant_id  = p.tenant_id
            AND b.branch_id  = ?2
            AND b.status     = 'active'
            AND b.deleted_at IS NULL
         WHERE p.tenant_id    = ?1
           AND p.deleted_at   IS NULL
           AND p.is_active    = 1
           AND p.min_stock_level > 0
         GROUP BY p.id
         HAVING current_qty < p.min_stock_level
         ORDER BY (p.min_stock_level - current_qty) DESC",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![tenant_id, branch_id], |row| {
        let current_qty: i64 = row.get(6)?;
        let min_stock_level: i64 = row.get(7)?;
        Ok(LowStockProduct {
            product_id: row.get(0)?,
            product_name: row.get(1)?,
            product_name_ar: row.get(2)?,
            barcode: row.get(3)?,
            category: row.get(4)?,
            unit: row.get(5)?,
            current_qty,
            min_stock_level,
            deficit: min_stock_level - current_qty,
            last_purchase_price: row.get(8)?,
            supplier_id: row.get(9)?,
            supplier_name: row.get(10)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}
