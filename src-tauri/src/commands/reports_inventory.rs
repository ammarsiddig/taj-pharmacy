use rusqlite::params;
use serde::Serialize;
use tauri::State;

use crate::db::Database;

#[derive(Debug, Serialize)]
pub struct InventoryStockItem {
    pub product_name: String,
    pub current_qty: i64,
    pub min_stock_level: i64,
    pub last_purchase_price: i64,
}

#[derive(Debug, Serialize)]
pub struct DeadStockItem {
    pub product_name: String,
    pub current_qty: i64,
    pub stock_value: i64,
    pub last_movement_date: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LocationStock {
    pub location_name: String,
    pub location_type: String,
    pub product_count: i64,
    pub total_qty: i64,
    pub total_value: i64,
}

#[derive(Debug, Serialize)]
pub struct InventoryReport {
    pub total_products: i64,
    pub total_stock_value: i64,
    pub total_stock_cost: i64,
    pub total_potential_revenue: i64,
    /// Products that currently hold stock (qty > 0) — the meaningful denominator, excludes catalog.
    pub stocked_products: i64,
    /// Catalog products that have never been stocked in this branch (no batch history, qty 0).
    pub never_stocked_count: i64,
    /// Actionable reorder count = genuinely low + genuinely out (were stocked before).
    pub reorder_count: i64,
    /// Distinct in-stock products whose unit_cost is 0 (opening stock with cost omitted) — value is understated.
    pub zero_cost_items: i64,
    pub low_stock_items: Vec<InventoryStockItem>,
    pub out_of_stock_items: Vec<InventoryStockItem>,
    pub dead_stock_items: Vec<DeadStockItem>,
    pub by_location: Vec<LocationStock>,
}

#[derive(Debug, Serialize)]
pub struct ExpiryItem {
    pub product_name: String,
    pub batch_number: Option<String>,
    pub expiry_date: String,
    pub quantity_current: i64,
    pub location_name: String,
    pub stock_value: i64,
    pub days_until_expiry: i64,
}

#[derive(Debug, Serialize)]
pub struct ExpiryReport {
    pub expired: Vec<ExpiryItem>,
    pub expiring_7: Vec<ExpiryItem>,
    pub expiring_30: Vec<ExpiryItem>,
    pub expiring_60: Vec<ExpiryItem>,
    pub expiring_90: Vec<ExpiryItem>,
    pub total_at_risk_value: i64,
}

fn fetch_expiry_items(
    conn: &rusqlite::Connection,
    tenant_id: &str,
    branch_id: &str,
    condition: &str,
) -> Result<Vec<ExpiryItem>, String> {
    let sql = format!(
        "SELECT COALESCE(p.trade_name_ar, p.trade_name) AS product_name,
                b.batch_number,
                b.expiry_date,
                b.quantity_current,
                sl.name,
                b.quantity_current * b.unit_cost AS stock_value,
                CAST(julianday(DATE(b.expiry_date)) - julianday(DATE('now', 'localtime')) AS INTEGER) AS days_until_expiry
         FROM batches b
         JOIN products p ON b.product_id = p.id
         JOIN storage_locations sl ON b.location_id = sl.id
         WHERE b.tenant_id = ?1
           AND sl.branch_id = ?2
           AND b.deleted_at IS NULL
           AND sl.deleted_at IS NULL
           AND b.status = 'active'
           AND b.quantity_current > 0
           AND b.expiry_date IS NOT NULL
           AND {condition}
         ORDER BY DATE(b.expiry_date) ASC, product_name ASC"
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![tenant_id, branch_id], |row| {
        Ok(ExpiryItem {
            product_name: row.get(0)?,
            batch_number: row.get(1)?,
            expiry_date: row.get(2)?,
            quantity_current: row.get(3)?,
            location_name: row.get(4)?,
            stock_value: row.get(5)?,
            days_until_expiry: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(rows)
}

#[tauri::command]
pub fn get_inventory_report(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
) -> Result<InventoryReport, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let total_products: i64 = conn.query_row(
        "SELECT COUNT(*) FROM products WHERE tenant_id = ?1 AND is_active = 1 AND deleted_at IS NULL",
        params![tenant_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let total_stock_cost: i64 = conn.query_row(
        "SELECT COALESCE(SUM(b.quantity_current * b.unit_cost), 0)
         FROM batches b
         JOIN storage_locations sl ON b.location_id = sl.id
         WHERE b.tenant_id = ?1 AND sl.branch_id = ?2
           AND b.deleted_at IS NULL AND sl.deleted_at IS NULL
           AND b.quantity_current > 0",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let total_potential_revenue: i64 = conn.query_row(
        "SELECT COALESCE(SUM(b.quantity_current * p.sale_price), 0)
         FROM batches b
         JOIN products p ON b.product_id = p.id
         JOIN storage_locations sl ON b.location_id = sl.id
         WHERE b.tenant_id = ?1 AND sl.branch_id = ?2
           AND b.deleted_at IS NULL AND p.deleted_at IS NULL AND sl.deleted_at IS NULL
           AND b.quantity_current > 0 AND p.is_active = 1",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let low_stock_sql =
        "SELECT COALESCE(p.trade_name_ar, p.trade_name) AS product_name,
                COALESCE((
                    SELECT SUM(b.quantity_current)
                    FROM batches b
                    JOIN storage_locations sl ON b.location_id = sl.id
                    WHERE b.product_id = p.id
                      AND b.status = 'active'
                      AND b.deleted_at IS NULL
                      AND sl.deleted_at IS NULL
                      AND sl.branch_id = ?2
                ), 0) AS current_qty,
                p.min_stock_level,
                p.last_purchase_price
         FROM products p
         WHERE p.tenant_id = ?1 AND p.is_active = 1 AND p.deleted_at IS NULL AND p.min_stock_level > 0
           AND current_qty < p.min_stock_level
         ORDER BY current_qty ASC, p.trade_name ASC";

    let mut low_stock_stmt = conn.prepare(low_stock_sql).map_err(|e| e.to_string())?;
    let low_stock_items: Vec<InventoryStockItem> = low_stock_stmt.query_map(params![tenant_id, branch_id], |row| {
        Ok(InventoryStockItem {
            product_name: row.get(0)?,
            current_qty: row.get(1)?,
            min_stock_level: row.get(2)?,
            last_purchase_price: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    // Only genuinely-depleted items: current qty 0 BUT the product has batch history in this branch
    // (was stocked at some point). This excludes the never-stocked catalog imports that made this
    // report useless (hundreds of items showing as "out of stock" with 0 value).
    let out_of_stock_sql =
        "SELECT COALESCE(p.trade_name_ar, p.trade_name) AS product_name,
                0 AS current_qty,
                p.min_stock_level,
                p.last_purchase_price
         FROM products p
         WHERE p.tenant_id = ?1 AND p.is_active = 1 AND p.deleted_at IS NULL
           AND COALESCE((
                SELECT SUM(b.quantity_current)
                FROM batches b
                JOIN storage_locations sl ON b.location_id = sl.id
                WHERE b.product_id = p.id
                  AND b.status = 'active'
                  AND b.deleted_at IS NULL
                  AND sl.deleted_at IS NULL
                  AND sl.branch_id = ?2
           ), 0) = 0
           AND EXISTS (
                SELECT 1 FROM batches b2
                JOIN storage_locations sl2 ON b2.location_id = sl2.id
                WHERE b2.product_id = p.id
                  AND b2.deleted_at IS NULL
                  AND sl2.deleted_at IS NULL
                  AND sl2.branch_id = ?2
           )
         ORDER BY p.trade_name ASC";

    let mut out_stmt = conn.prepare(out_of_stock_sql).map_err(|e| e.to_string())?;
    let out_of_stock_items: Vec<InventoryStockItem> = out_stmt.query_map(params![tenant_id, branch_id], |row| {
        Ok(InventoryStockItem {
            product_name: row.get(0)?,
            current_qty: row.get(1)?,
            min_stock_level: row.get(2)?,
            last_purchase_price: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut dead_stmt = conn.prepare(
        "SELECT COALESCE(p.trade_name_ar, p.trade_name) AS product_name,
                SUM(b.quantity_current) AS current_qty,
                SUM(b.quantity_current * b.unit_cost) AS stock_value,
                MAX(sm.created_at) AS last_movement_date
         FROM products p
         JOIN batches b ON b.product_id = p.id
         JOIN storage_locations sl ON b.location_id = sl.id
         LEFT JOIN stock_movements sm ON sm.product_id = p.id AND sm.branch_id = ?2
         WHERE p.tenant_id = ?1
           AND p.deleted_at IS NULL
           AND p.is_active = 1
           AND b.deleted_at IS NULL
           AND sl.deleted_at IS NULL
           AND sl.branch_id = ?2
           AND b.quantity_current > 0
         GROUP BY p.id, product_name
         HAVING current_qty > 0
            AND (last_movement_date IS NULL OR DATETIME(last_movement_date) <= DATETIME('now', 'localtime', '-90 days'))
         ORDER BY stock_value DESC"
    ).map_err(|e| e.to_string())?;

    let dead_stock_items = dead_stmt.query_map(params![tenant_id, branch_id], |row| {
        Ok(DeadStockItem {
            product_name: row.get(0)?,
            current_qty: row.get(1)?,
            stock_value: row.get(2)?,
            last_movement_date: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut location_stmt = conn.prepare(
        "SELECT sl.name, sl.location_type,
                COUNT(DISTINCT CASE WHEN b.quantity_current > 0 THEN b.product_id END) AS product_count,
                COALESCE(SUM(b.quantity_current), 0) AS total_qty,
                COALESCE(SUM(b.quantity_current * b.unit_cost), 0) AS total_value
         FROM storage_locations sl
         LEFT JOIN batches b ON b.location_id = sl.id AND b.deleted_at IS NULL
         WHERE sl.tenant_id = ?1 AND sl.branch_id = ?2 AND sl.deleted_at IS NULL
         GROUP BY sl.id, sl.name, sl.location_type
         ORDER BY sl.name ASC"
    ).map_err(|e| e.to_string())?;

    let by_location = location_stmt.query_map(params![tenant_id, branch_id], |row| {
        Ok(LocationStock {
            location_name: row.get(0)?,
            location_type: row.get(1)?,
            product_count: row.get(2)?,
            total_qty: row.get(3)?,
            total_value: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    // Distinct products currently holding stock in this branch.
    let stocked_products: i64 = conn.query_row(
        "SELECT COUNT(DISTINCT b.product_id)
         FROM batches b
         JOIN storage_locations sl ON b.location_id = sl.id
         WHERE b.tenant_id = ?1 AND sl.branch_id = ?2
           AND b.deleted_at IS NULL AND sl.deleted_at IS NULL
           AND b.status = 'active' AND b.quantity_current > 0",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    // Active products that have never been stocked in this branch (no batch history at all).
    let never_stocked_count: i64 = conn.query_row(
        "SELECT COUNT(*)
         FROM products p
         WHERE p.tenant_id = ?1 AND p.is_active = 1 AND p.deleted_at IS NULL
           AND NOT EXISTS (
                SELECT 1 FROM batches b
                JOIN storage_locations sl ON b.location_id = sl.id
                WHERE b.product_id = p.id
                  AND b.deleted_at IS NULL AND sl.deleted_at IS NULL
                  AND sl.branch_id = ?2
           )",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    // In-stock products whose stock value is understated because unit_cost is 0.
    let zero_cost_items: i64 = conn.query_row(
        "SELECT COUNT(DISTINCT b.product_id)
         FROM batches b
         JOIN storage_locations sl ON b.location_id = sl.id
         WHERE b.tenant_id = ?1 AND sl.branch_id = ?2
           AND b.deleted_at IS NULL AND sl.deleted_at IS NULL
           AND b.status = 'active' AND b.quantity_current > 0
           AND COALESCE(b.unit_cost, 0) = 0",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let reorder_count = (low_stock_items.len() + out_of_stock_items.len()) as i64;

    Ok(InventoryReport {
        total_products,
        total_stock_value: total_stock_cost,
        total_stock_cost,
        total_potential_revenue,
        stocked_products,
        never_stocked_count,
        reorder_count,
        zero_cost_items,
        low_stock_items,
        out_of_stock_items,
        dead_stock_items,
        by_location,
    })
}

#[tauri::command]
pub fn get_expiry_report(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
) -> Result<ExpiryReport, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let expired = fetch_expiry_items(
        &conn,
        &tenant_id,
        &branch_id,
        "DATE(b.expiry_date) < DATE('now', 'localtime')",
    )?;
    let expiring_7 = fetch_expiry_items(
        &conn,
        &tenant_id,
        &branch_id,
        "DATE(b.expiry_date) > DATE('now', 'localtime') AND DATE(b.expiry_date) <= DATE('now', '+7 days', 'localtime')",
    )?;
    let expiring_30 = fetch_expiry_items(
        &conn,
        &tenant_id,
        &branch_id,
        "DATE(b.expiry_date) > DATE('now', '+7 days', 'localtime') AND DATE(b.expiry_date) <= DATE('now', '+30 days', 'localtime')",
    )?;
    let expiring_60 = fetch_expiry_items(
        &conn,
        &tenant_id,
        &branch_id,
        "DATE(b.expiry_date) > DATE('now', '+30 days', 'localtime') AND DATE(b.expiry_date) <= DATE('now', '+60 days', 'localtime')",
    )?;
    let expiring_90 = fetch_expiry_items(
        &conn,
        &tenant_id,
        &branch_id,
        "DATE(b.expiry_date) > DATE('now', '+60 days', 'localtime') AND DATE(b.expiry_date) <= DATE('now', '+90 days', 'localtime')",
    )?;

    let total_at_risk_value: i64 = conn.query_row(
        "SELECT COALESCE(SUM(b.quantity_current * b.unit_cost), 0)
         FROM batches b
         JOIN storage_locations sl ON b.location_id = sl.id
         WHERE b.tenant_id = ?1 AND sl.branch_id = ?2
           AND b.deleted_at IS NULL AND sl.deleted_at IS NULL
           AND b.status = 'active' AND b.quantity_current > 0
           AND b.expiry_date IS NOT NULL
           AND DATE(b.expiry_date) <= DATE('now', '+90 days', 'localtime')",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    Ok(ExpiryReport {
        expired,
        expiring_7,
        expiring_30,
        expiring_60,
        expiring_90,
        total_at_risk_value,
    })
}
