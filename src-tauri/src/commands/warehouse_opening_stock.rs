use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::{cloud_sync, license_guard, guard, audit};
use crate::commands::session_state::{AuthSessionState, resolve_identity};

const FLAG_WAREHOUSE: i64 = 8;

#[derive(Debug, Serialize, Deserialize)]
pub struct SetupModeStatus {
    pub setup_mode: bool,
}

#[tauri::command]
pub fn get_setup_mode(
    db: State<'_, Database>,
    tenant_id: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<SetupModeStatus, String> {
    let (tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let flag: i64 = conn
        .query_row(
            "SELECT COALESCE(setup_mode, 0) FROM tenants WHERE id = ?1",
            params![tid],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(SetupModeStatus { setup_mode: flag != 0 })
}

#[tauri::command]
pub fn finalize_setup_mode(
    db: State<'_, Database>,
    tenant_id: String,
    user_id: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let (tid, uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, "")?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    guard::require_access(&conn, &uid, "inventory", guard::Level::Write)?;
    conn.execute(
        "UPDATE tenants SET setup_mode = 0,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1",
        params![tid],
    ).map_err(|e| format!("فشل إنهاء وضع الإعداد: {}", e))?;

    if let Err(e) = audit::log_action(&conn, &tid, &uid, "finalize_setup_mode", "tenant", &tid, None) {
        log::warn!("audit log failed after finalize_setup_mode: {}", e);
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct OpeningStockEntry {
    pub product_id: String,
    pub location_id: String,
    pub quantity: i64,
    /// Unit cost in minor units (cents/qirsh). Optional — 0 if unknown.
    pub unit_cost: Option<i64>,
    pub batch_number: Option<String>,
    /// ISO date string, e.g. "2027-03-15".
    pub expiry_date: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OpeningStockResult {
    pub batch_id: String,
    pub movement_id: String,
}

fn require_setup_mode(conn: &rusqlite::Connection, tenant_id: &str) -> Result<(), String> {
    let flag: i64 = conn
        .query_row(
            "SELECT COALESCE(setup_mode, 0) FROM tenants WHERE id = ?1",
            params![tenant_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if flag == 0 {
        return Err("وضع الإعداد منتهي — لا يمكن إدخال كمية افتتاحية بعد بدء البيع".into());
    }
    Ok(())
}

fn insert_opening_batch(
    conn: &rusqlite::Connection,
    tenant_id: &str,
    branch_id: &str,
    user_id: &str,
    entry: &OpeningStockEntry,
) -> Result<OpeningStockResult, String> {
    if entry.quantity <= 0 {
        return Err("الكمية يجب أن تكون أكبر من صفر".into());
    }

    // Verify product exists in this tenant
    let _: String = conn
        .query_row(
            "SELECT id FROM products WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
            params![entry.product_id, tenant_id],
            |r| r.get(0),
        )
        .map_err(|_| format!("المنتج غير موجود: {}", entry.product_id))?;

    // Verify storage location exists
    let _: String = conn
        .query_row(
            "SELECT id FROM storage_locations
             WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
            params![entry.location_id, tenant_id],
            |r| r.get(0),
        )
        .map_err(|_| format!("الموقع غير موجود: {}", entry.location_id))?;

    let batch_id = Uuid::new_v4().to_string();
    let unit_cost = entry.unit_cost.unwrap_or(0).max(0);

    conn.execute(
        "INSERT INTO batches
            (id, tenant_id, product_id, supplier_invoice_id, location_id,
             batch_number, expiry_date, quantity_received, quantity_current,
             unit_cost, status, branch_id)
         VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?7, ?8, 'active', ?9)",
        params![
            batch_id, tenant_id, entry.product_id, entry.location_id,
            entry.batch_number.as_deref(),
            entry.expiry_date.as_deref(),
            entry.quantity, unit_cost, branch_id,
        ],
    ).map_err(|e| format!("فشل إنشاء الدفعة: {}", e))?;

    let movement_id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO stock_movements
            (id, tenant_id, branch_id, product_id, batch_id, movement_type,
             quantity_change, quantity_before, quantity_after,
             reference_type, reference_id, notes, created_by)
         VALUES (?1, ?2, ?3, ?4, ?5, 'opening_stock', ?6, 0, ?6,
                 'opening_stock', ?5, 'الجرد الافتتاحي', ?7)",
        params![
            movement_id, tenant_id, branch_id, entry.product_id,
            batch_id, entry.quantity, user_id,
        ],
    ).map_err(|e| format!("فشل تسجيل حركة المخزون: {}", e))?;

    Ok(OpeningStockResult { batch_id, movement_id })
}

#[tauri::command]
pub fn add_opening_stock_batch(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    user_id: String,
    entry: OpeningStockEntry,
    auth_session: State<'_, AuthSessionState>,
) -> Result<OpeningStockResult, String> {
    let (tid, uid, bid) = resolve_identity(&auth_session, &tenant_id, &user_id, &branch_id)?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tid)?;
    license_guard::require_feature(&conn, &tid, FLAG_WAREHOUSE)?;
    guard::require_access(&conn, &uid, "inventory", guard::Level::Write)?;
    guard::require_branch_access(&conn, &uid, &bid)?;
    require_setup_mode(&conn, &tid)?;

    let result = insert_opening_batch(&conn, &tid, &bid, &uid, &entry)?;

    if let Err(e) = audit::log_action(&conn, &tid, &uid, "opening_stock_add", "batch", &result.batch_id, None) {
        log::warn!("audit log failed after add_opening_stock_batch: {}", e);
    }
    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tid, "opening_stock_added") {
        log::warn!("cloud sync enqueue failed after add_opening_stock_batch: {}", e);
    }

    Ok(result)
}

#[derive(Debug, Deserialize)]
pub struct BulkOpeningStockRow {
    /// Match by barcode if provided; otherwise create product from trade_name.
    pub barcode: Option<String>,
    pub trade_name: Option<String>,
    pub trade_name_ar: Option<String>,
    pub generic_name: Option<String>,
    pub category: Option<String>,
    pub unit: Option<String>,
    pub sale_price: Option<i64>,
    pub quantity: i64,
    pub unit_cost: Option<i64>,
    pub batch_number: Option<String>,
    pub expiry_date: Option<String>,
    /// Optional storage_location id. Falls back to default_location_id if blank.
    pub location_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BulkOpeningStockRowResult {
    pub row_index: usize,
    pub success: bool,
    pub product_id: Option<String>,
    pub batch_id: Option<String>,
    pub created_product: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BulkOpeningStockResult {
    pub total: usize,
    pub success_count: usize,
    pub error_count: usize,
    pub created_products: usize,
    pub rows: Vec<BulkOpeningStockRowResult>,
}

fn find_or_create_product(
    conn: &rusqlite::Connection,
    tenant_id: &str,
    row: &BulkOpeningStockRow,
) -> Result<(String, bool), String> {
    // Try matching by barcode first
    if let Some(bc) = row.barcode.as_deref().filter(|s| !s.trim().is_empty()) {
        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM products WHERE tenant_id = ?1 AND barcode = ?2 AND deleted_at IS NULL",
                params![tenant_id, bc.trim()],
                |r| r.get(0),
            )
            .ok();
        if let Some(id) = existing {
            return Ok((id, false));
        }
    }

    // Match by trade_name (case-insensitive)
    let name = row.trade_name.as_deref().map(str::trim).unwrap_or("");
    let name_ar = row.trade_name_ar.as_deref().map(str::trim).unwrap_or("");
    if name.is_empty() && name_ar.is_empty() {
        return Err("اسم المنتج أو الباركود مطلوب".into());
    }
    if !name.is_empty() {
        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM products WHERE tenant_id = ?1
                   AND LOWER(trade_name) = LOWER(?2) AND deleted_at IS NULL",
                params![tenant_id, name],
                |r| r.get(0),
            )
            .ok();
        if let Some(id) = existing {
            return Ok((id, false));
        }
    }

    // Create new product
    let new_id = Uuid::new_v4().to_string();
    let unit = row.unit.as_deref().filter(|s| !s.is_empty()).unwrap_or("box");
    let sale_price = row.sale_price.unwrap_or(0).max(0);
    let trade_name = if name.is_empty() { name_ar } else { name };
    let trade_name_ar = if name_ar.is_empty() { name } else { name_ar };

    conn.execute(
        "INSERT INTO products
            (id, tenant_id, barcode, trade_name, trade_name_ar, generic_name,
             category, unit, sale_price, last_purchase_price, min_stock_level, is_active)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, 1)",
        params![
            new_id, tenant_id,
            row.barcode.as_deref(),
            trade_name, trade_name_ar,
            row.generic_name.as_deref(),
            row.category.as_deref(),
            unit, sale_price,
            row.unit_cost.unwrap_or(0).max(0),
        ],
    ).map_err(|e| format!("فشل إنشاء المنتج: {}", e))?;

    Ok((new_id, true))
}

fn resolve_location_id(
    conn: &rusqlite::Connection,
    tenant_id: &str,
    branch_id: &str,
    requested: Option<&str>,
) -> Result<String, String> {
    if let Some(loc) = requested.filter(|s| !s.trim().is_empty()) {
        let ok: Option<String> = conn
            .query_row(
                "SELECT id FROM storage_locations
                 WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
                params![loc.trim(), tenant_id],
                |r| r.get(0),
            )
            .ok();
        if let Some(id) = ok {
            return Ok(id);
        }
    }
    // Fall back to the first active location in this branch (typically the shelf)
    conn.query_row(
        "SELECT id FROM storage_locations
         WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL
         ORDER BY CASE location_type WHEN 'shelf' THEN 0 ELSE 1 END, created_at
         LIMIT 1",
        params![tenant_id, branch_id],
        |r| r.get(0),
    ).map_err(|_| "لا يوجد موقع تخزين متاح للفرع".to_string())
}

#[tauri::command]
pub fn import_opening_stock_bulk(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    user_id: String,
    rows: Vec<BulkOpeningStockRow>,
    auth_session: State<'_, AuthSessionState>,
) -> Result<BulkOpeningStockResult, String> {
    let (tid, uid, bid) = resolve_identity(&auth_session, &tenant_id, &user_id, &branch_id)?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tid)?;
    license_guard::require_feature(&conn, &tid, FLAG_WAREHOUSE)?;
    guard::require_access(&conn, &uid, "inventory", guard::Level::Write)?;
    guard::require_branch_access(&conn, &uid, &bid)?;
    require_setup_mode(&conn, &tid)?;

    conn.execute("BEGIN IMMEDIATE", []).ok();

    let mut results = Vec::with_capacity(rows.len());
    let mut success_count = 0usize;
    let mut created_products = 0usize;

    for (idx, row) in rows.iter().enumerate() {
        let outcome = (|| -> Result<(String, String, bool), String> {
            if row.quantity <= 0 {
                return Err("الكمية يجب أن تكون أكبر من صفر".into());
            }
            let (product_id, was_created) = find_or_create_product(&conn, &tid, row)?;
            let location_id = resolve_location_id(&conn, &tid, &bid, row.location_id.as_deref())?;
            let entry = OpeningStockEntry {
                product_id: product_id.clone(),
                location_id,
                quantity: row.quantity,
                unit_cost: row.unit_cost,
                batch_number: row.batch_number.clone(),
                expiry_date: row.expiry_date.clone(),
            };
            let res = insert_opening_batch(&conn, &tid, &bid, &uid, &entry)?;
            Ok((product_id, res.batch_id, was_created))
        })();

        match outcome {
            Ok((product_id, batch_id, was_created)) => {
                if was_created { created_products += 1; }
                success_count += 1;
                results.push(BulkOpeningStockRowResult {
                    row_index: idx,
                    success: true,
                    product_id: Some(product_id),
                    batch_id: Some(batch_id),
                    created_product: was_created,
                    error: None,
                });
            }
            Err(e) => {
                results.push(BulkOpeningStockRowResult {
                    row_index: idx,
                    success: false,
                    product_id: None,
                    batch_id: None,
                    created_product: false,
                    error: Some(e),
                });
            }
        }
    }

    conn.execute("COMMIT", []).ok();

    let total = rows.len();
    let error_count = total - success_count;

    if let Err(e) = audit::log_action(
        &conn, &tid, &uid, "opening_stock_bulk_import", "tenant", &tid,
        Some(&format!("{} ok / {} err", success_count, error_count)),
    ) {
        log::warn!("audit log failed after import_opening_stock_bulk: {}", e);
    }
    if success_count > 0 {
        if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tid, "opening_stock_bulk_imported") {
            log::warn!("cloud sync enqueue failed after import_opening_stock_bulk: {}", e);
        }
    }

    Ok(BulkOpeningStockResult {
        total,
        success_count,
        error_count,
        created_products,
        rows: results,
    })
}
