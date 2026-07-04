use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use tauri::State;

use super::cloud_sync;
use crate::db::Database;
use crate::commands::session_state::{AuthSessionState, resolve_identity};

#[derive(Debug, Serialize, Deserialize)]
pub struct TableSyncResult {
    pub table: String,
    pub upserted: i64,
    pub deleted: i64,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncStatusResult {
    pub last_sync_at: Option<String>,
    pub total_syncs: i64,
    pub tables: HashMap<String, TableSyncInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TableSyncInfo {
    pub last_sync_at: Option<String>,
    pub row_count: i64,
}

#[tauri::command]
pub fn sync_table_snapshot(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: Option<String>,
    table: String,
    rows: Vec<Value>,
    deleted_ids: Vec<String>,
    auth_session: State<'_, AuthSessionState>,
) -> Result<TableSyncResult, String> {
    let branch_id_str = branch_id.as_deref().unwrap_or("");
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", branch_id_str)?;
    let endpoint = cloud_sync::cloud_sync_endpoint()
        .ok_or_else(|| "لم يتم تكوين PMS_OWNER_SYNC_ENDPOINT".to_string())?;
    let token = cloud_sync::cloud_sync_token()
        .ok_or_else(|| "لم يتم تكوين PMS_OWNER_SYNC_TOKEN".to_string())?;

    let client = cloud_sync::build_cloud_sync_client()?;
    let url = format!("{}/v1/sync/{}", endpoint.trim_end_matches('/'), table);

    let payload = json!({
        "rows": rows,
        "deletedIds": deleted_ids,
    });

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .header("X-Branch-ID", branch_id.unwrap_or_else(|| "main-branch".to_string()))
        .json(&payload)
        .send()
        .map_err(|e| format!("فشل طلب HTTP: {}", e))?;

    let status = response.status();
    let body: Value = response
        .json()
        .map_err(|e| format!("فشل تحليل الاستجابة: {}", e))?;

    if !status.is_success() {
        let error_msg = body
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("خطأ غير معروف")
            .to_string();
        return Ok(TableSyncResult {
            table,
            upserted: 0,
            deleted: 0,
            success: false,
            error: Some(format!("HTTP {}: {}", status, error_msg)),
        });
    }

    let upserted = body
        .get("upserted")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let deleted = body
        .get("deleted")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = cloud_sync::now_iso();
    conn.execute(
        "INSERT INTO cloud_sync_table_state (tenant_id, table_name, last_sync_at, row_count)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(tenant_id, table_name) DO UPDATE SET
         last_sync_at = excluded.last_sync_at,
         row_count = excluded.row_count",
        params![tenant_id, table, now, upserted],
    )
    .ok();

    Ok(TableSyncResult {
        table,
        upserted,
        deleted,
        success: true,
        error: None,
    })
}

#[tauri::command]
pub fn sync_tables_batch(
    _db: State<'_, Database>,
    tenant_id: String,
    branch_id: Option<String>,
    tables: HashMap<String, TableBatchData>,
    auth_session: State<'_, AuthSessionState>,
) -> Result<Vec<TableSyncResult>, String> {
    let branch_id_str = branch_id.as_deref().unwrap_or("");
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", branch_id_str)?;
    let endpoint = cloud_sync::cloud_sync_endpoint()
        .ok_or_else(|| "لم يتم تكوين PMS_OWNER_SYNC_ENDPOINT".to_string())?;
    let token = cloud_sync::cloud_sync_token()
        .ok_or_else(|| "لم يتم تكوين PMS_OWNER_SYNC_TOKEN".to_string())?;

    let client = cloud_sync::build_cloud_sync_client()?;
    let url = format!("{}/v1/sync/batch", endpoint.trim_end_matches('/'));

    let payload: Value = tables
        .iter()
        .map(|(name, data)| {
            (
                name.clone(),
                json!({
                    "rows": data.rows,
                    "deletedIds": data.deleted_ids,
                }),
            )
        })
        .collect::<serde_json::Map<String, Value>>()
        .into();

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .header("X-Branch-ID", branch_id.unwrap_or_else(|| "main-branch".to_string()))
        .json(&payload)
        .send()
        .map_err(|e| format!("فشل طلب HTTP: {}", e))?;

    let status = response.status();
    let body: Value = response
        .json()
        .map_err(|e| format!("فشل تحليل الاستجابة: {}", e))?;

    if !status.is_success() {
        let error_msg = body
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("خطأ غير معروف")
            .to_string();
        return Err(format!("فشلت المزامنة المجمعة: {}", error_msg));
    }

    let results: Vec<TableSyncResult> = tables
        .keys()
        .map(|name| {
            let table_result = body.get("results").and_then(|r| r.get(name));
            TableSyncResult {
                table: name.clone(),
                upserted: table_result
                    .and_then(|r| r.get("upserted"))
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0),
                deleted: table_result
                    .and_then(|r| r.get("deleted"))
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0),
                success: true,
                error: None,
            }
        })
        .collect();

    Ok(results)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TableBatchData {
    pub rows: Vec<Value>,
    pub deleted_ids: Vec<String>,
}

#[tauri::command]
pub fn get_sync_status(
    _tenant_id: String,
) -> Result<SyncStatusResult, String> {
    let endpoint = cloud_sync::cloud_sync_endpoint()
        .ok_or_else(|| "لم يتم تكوين PMS_OWNER_SYNC_ENDPOINT".to_string())?;
    let token = cloud_sync::cloud_sync_token()
        .ok_or_else(|| "لم يتم تكوين PMS_OWNER_SYNC_TOKEN".to_string())?;

    let client = cloud_sync::build_cloud_sync_client()?;
    let url = format!("{}/v1/sync/status", endpoint.trim_end_matches('/'));

    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .map_err(|e| format!("فشل طلب HTTP: {}", e))?;

    let status = response.status();
    let body: Value = response
        .json()
        .map_err(|e| format!("فشل تحليل الاستجابة: {}", e))?;

    if !status.is_success() {
        let error_msg = body
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("خطأ غير معروف")
            .to_string();
        return Err(format!("فشل الحصول على حالة المزامنة: {}", error_msg));
    }

    let tables = body
        .get("tables")
        .and_then(|t| t.as_object())
        .map(|obj| {
            obj.iter()
                .map(|(k, v)| {
                    let info = TableSyncInfo {
                        last_sync_at: v
                            .get("lastSyncAt")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        row_count: v
                            .get("rowCount")
                            .and_then(|v| v.as_i64())
                            .unwrap_or(0),
                    };
                    (k.clone(), info)
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(SyncStatusResult {
        last_sync_at: body
            .get("lastSyncAt")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        total_syncs: body
            .get("totalSyncs")
            .and_then(|v| v.as_i64())
            .unwrap_or(0),
        tables,
    })
}

/// Run one snapshot query and return the rows as JSON objects.
///
/// This used to swallow every error and return an empty vec, so a malformed
/// query (a bad column, a duplicated alias) synced *nothing* for that table with
/// no signal — the batch still "succeeded" while silently dropping data, or a
/// type-mismatched row blew up the whole cloud transaction with no local trace.
/// It now logs the failing table + SQL error and propagates it so a broken table
/// fails loudly (and visibly, via the "فشل المزامنة" banner) instead of invisibly.
fn query_table_rows(
    conn: &rusqlite::Connection,
    table: &str,
    sql: &str,
    tenant_id: &str,
    branch_id: &str,
) -> Result<Vec<Value>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| {
        let msg = format!("cloud sync: prepare failed for table '{}': {}", table, e);
        log::error!("{}", msg);
        msg
    })?;
    let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let mapped = stmt
        .query_map(params![tenant_id, branch_id], |row| {
            let mut map = serde_json::Map::new();
            for (i, col) in cols.iter().enumerate() {
                let val: Value = match row.get_ref(i) {
                    Ok(rusqlite::types::ValueRef::Null) => Value::Null,
                    Ok(rusqlite::types::ValueRef::Integer(n)) => Value::Number(n.into()),
                    Ok(rusqlite::types::ValueRef::Real(f)) => {
                        Value::Number(serde_json::Number::from_f64(f).unwrap_or(0.into()))
                    }
                    Ok(rusqlite::types::ValueRef::Text(s)) => {
                        Value::String(String::from_utf8_lossy(s).to_string())
                    }
                    Ok(rusqlite::types::ValueRef::Blob(_)) => Value::Null,
                    Err(_) => Value::Null,
                };
                map.insert(col.clone(), val);
            }
            Ok(Value::Object(map))
        })
        .map_err(|e| {
            let msg = format!("cloud sync: query failed for table '{}': {}", table, e);
            log::error!("{}", msg);
            msg
        })?;
    let mut out = Vec::new();
    for r in mapped {
        match r {
            Ok(v) => out.push(v),
            Err(e) => log::error!("cloud sync: row decode error in table '{}': {}", table, e),
        }
    }
    Ok(out)
}

pub(crate) fn list_branch_ids_for_tenant(db: &Database, tenant_id: &str) -> Result<Vec<String>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id FROM branches
             WHERE tenant_id = ?1 AND is_active = 1 AND deleted_at IS NULL
             ORDER BY is_main DESC, created_at ASC",
        )
        .map_err(|e| format!("فشل تحضير استعلام الفرع: {}", e))?;
    let rows = stmt
        .query_map(params![tenant_id], |row| row.get::<_, String>(0))
        .map_err(|e| format!("فشل الاستعلام عن الفروع: {}", e))?;
    let mut branches: Vec<String> = rows.filter_map(|r| r.ok()).collect();
    if branches.is_empty() {
        branches.push("main-branch".to_string());
    }
    Ok(branches)
}

pub(crate) fn push_all_tables(db: &Database, tenant_id: &str, branch: &str) -> Result<i64, String> {
    let endpoint = cloud_sync::cloud_sync_endpoint()
        .ok_or_else(|| "لم يتم تكوين PMS_OWNER_SYNC_ENDPOINT".to_string())?;
    let token = cloud_sync::cloud_sync_token()
        .ok_or_else(|| "لم يتم تكوين PMS_OWNER_SYNC_TOKEN".to_string())?;

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let tables_data: Vec<(&str, Vec<Value>)> = vec![
        ("users", query_table_rows(&conn, "users",
            "SELECT id, tenant_id, branch_id, role_id, username, full_name, \
             COALESCE(full_name_ar, '') AS full_name_ar, \
             COALESCE(phone, '') AS phone, is_active, last_login_at, created_at, updated_at \
             FROM users \
             WHERE tenant_id = ?1 AND deleted_at IS NULL",
            tenant_id, branch)?),
        ("branches", query_table_rows(&conn, "branches",
            "SELECT id, tenant_id, name, COALESCE(name_ar, '') AS name_ar, \
             COALESCE(address, '') AS address, COALESCE(phone, '') AS phone, \
             is_main, is_active, created_at, updated_at \
             FROM branches \
             WHERE tenant_id = ?1 AND deleted_at IS NULL",
            tenant_id, branch)?),
        ("products", query_table_rows(&conn, "products",
            "SELECT p.id, p.tenant_id, ?2 AS branch_id, \
             p.trade_name AS name, COALESCE(p.trade_name_ar, '') AS name_ar, \
             COALESCE(p.barcode, '') AS barcode, COALESCE(p.category, '') AS category, \
             COALESCE(p.unit, '') AS unit_measure, \
             COALESCE(p.last_purchase_price, 0) AS purchase_price, \
             COALESCE(p.sale_price, 0) AS sale_price, 0 AS tax_percent, \
             COALESCE(p.min_stock_level, 0) AS min_stock, \
             COALESCE(SUM(b.quantity_current), 0) AS current_stock, \
             COALESCE(p.generic_name, '') AS generic_name, \
             COALESCE(p.generic_name_ar, '') AS generic_name_ar, \
             COALESCE(p.dosage_form, '') AS dosage_form, \
             COALESCE(p.manufacturer, '') AS manufacturer, \
             COALESCE(p.active_ingredient, '') AS active_ingredient, \
             COALESCE(p.storage_conditions, '') AS storage_conditions, \
             COALESCE(p.is_prescription, 0) AS is_prescription, \
             COALESCE(p.image_path, '') AS image_path, \
             p.is_active, p.updated_at \
             FROM products p \
             LEFT JOIN batches b ON b.product_id = p.id AND b.status = 'active' AND b.deleted_at IS NULL \
                AND EXISTS (SELECT 1 FROM storage_locations sl WHERE sl.id = b.location_id AND sl.branch_id = ?2 AND sl.deleted_at IS NULL) \
             WHERE p.tenant_id = ?1 AND p.deleted_at IS NULL \
             GROUP BY p.id",
            tenant_id, branch)?),
        ("customers", query_table_rows(&conn, "customers",
            "SELECT id, tenant_id, ?2 AS branch_id, name, COALESCE(name_ar, '') AS name_ar, \
             COALESCE(phone, '') AS phone, COALESCE(credit_limit, 0) AS credit_limit, \
             COALESCE(current_balance, 0) AS current_balance, 0 AS total_purchases, \
             COALESCE(email, '') AS email, COALESCE(address, '') AS address, \
             COALESCE(notes, '') AS notes, is_active, updated_at \
             FROM customers WHERE tenant_id = ?1 AND deleted_at IS NULL",
            tenant_id, branch)?),
        ("suppliers", query_table_rows(&conn, "suppliers",
            "SELECT id, tenant_id, ?2 AS branch_id, name, \
             COALESCE(phone, '') AS phone, COALESCE(email, '') AS email, \
             COALESCE(address, '') AS address, \
             COALESCE(opening_balance, 0) AS current_balance, \
             COALESCE(name_ar, '') AS name_ar, \
             COALESCE(contact_person, '') AS contact_person, \
             COALESCE(notes, '') AS notes, \
             is_active, updated_at \
             FROM suppliers WHERE tenant_id = ?1 AND deleted_at IS NULL",
            tenant_id, branch)?),
        ("pos_sales", query_table_rows(&conn, "pos_sales",
            "SELECT s.id, s.tenant_id, s.branch_id, s.session_id, s.sale_number, \
             s.customer_id, COALESCE(c.name, '') AS customer_name, \
             s.total, COALESCE(s.tax_amount, 0) AS tax_amount, \
             COALESCE(s.discount, 0) AS discount, s.payment_method, s.payment_status, \
             s.amount_paid, (s.total - s.amount_paid) AS balance_due, \
             '' AS cashier_name, \
             COALESCE(s.notes, '') AS notes, 0 AS is_return, \
             s.sale_type, COALESCE(s.change_amount, 0) AS change_amount, \
             COALESCE(s.payment_method_id, '') AS payment_method_id, \
             COALESCE(s.void_reason, '') AS void_reason, \
             s.created_at \
             FROM sales s \
             LEFT JOIN customers c ON c.id = s.customer_id \
             WHERE s.tenant_id = ?1 AND s.branch_id = ?2 AND s.deleted_at IS NULL",
            tenant_id, branch)?),
        ("pos_sale_items", query_table_rows(&conn, "pos_sale_items",
            "SELECT si.id, si.tenant_id, s.branch_id, si.sale_id, si.product_id, \
             COALESCE(p.trade_name, '') AS product_name, \
             si.batch_id, COALESCE(b.batch_number, '') AS batch_number, \
             si.quantity, si.unit_price, si.subtotal \
             FROM sale_items si \
             JOIN sales s ON s.id = si.sale_id \
             LEFT JOIN products p ON p.id = si.product_id \
             LEFT JOIN batches b ON b.id = si.batch_id \
             WHERE si.tenant_id = ?1 AND s.branch_id = ?2 AND s.deleted_at IS NULL",
            tenant_id, branch)?),
        ("expenses", query_table_rows(&conn, "expenses",
            "SELECT id, tenant_id, branch_id, \
             COALESCE(category_id, '') AS category, amount, \
             COALESCE(description, '') AS description, expense_date, \
             payment_method, COALESCE(notes, '') AS notes, created_by, \
             created_at \
             FROM expenses WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL",
            tenant_id, branch)?),
        ("batches", query_table_rows(&conn, "batches",
            "SELECT b.id, b.tenant_id, ?2 AS branch_id, b.product_id, \
             COALESCE(b.batch_number, '') AS batch_number, b.expiry_date, \
             b.quantity_current AS quantity, b.unit_cost AS purchase_price, \
             b.location_id, CASE WHEN b.status = 'active' THEN 1 ELSE 0 END AS is_active, \
             b.updated_at \
             FROM batches b \
             JOIN storage_locations sl ON sl.id = b.location_id \
             WHERE b.tenant_id = ?1 AND sl.branch_id = ?2 AND b.deleted_at IS NULL",
            tenant_id, branch)?),
        ("stock_movements", query_table_rows(&conn, "stock_movements",
            "SELECT id, tenant_id, branch_id, product_id, batch_id, movement_type, \
             quantity_change AS quantity, COALESCE(reference_type, '') AS reference_type, \
             COALESCE(reference_id, '') AS reference_id, COALESCE(notes, '') AS notes, created_at \
             FROM stock_movements WHERE tenant_id = ?1 AND branch_id = ?2",
            tenant_id, branch)?),
        ("supplier_invoices", query_table_rows(&conn, "supplier_invoices",
            "SELECT si.id, si.tenant_id, si.branch_id, si.supplier_id, \
             COALESCE(s.name, '') AS supplier_name, \
             si.invoice_number, si.invoice_date, si.status, si.payment_status, \
             si.total, COALESCE(si.amount_paid, 0) AS amount_paid, \
             (si.total - COALESCE(si.amount_paid, 0)) AS balance_due, \
             si.created_at, si.updated_at \
             FROM supplier_invoices si \
             LEFT JOIN suppliers s ON s.id = si.supplier_id \
             WHERE si.tenant_id = ?1 AND si.branch_id = ?2 AND si.deleted_at IS NULL",
            tenant_id, branch)?),
        // supplier_payments: account_id / notes / created_by were missing — cloud
        // snapshot_supplier_payments.account_id is NOT NULL, so any payment 500'd the batch.
        ("supplier_payments", query_table_rows(&conn, "supplier_payments",
            "SELECT sp.id, sp.tenant_id, si.branch_id, sp.supplier_id, \
             sp.invoice_id AS invoice_id, \
             COALESCE(sp.amount, 0) AS amount, COALESCE(sp.payment_method, '') AS payment_method, \
             sp.account_id, COALESCE(sp.payment_date, '') AS payment_date, \
             COALESCE(sp.notes, '') AS notes, sp.created_by, sp.created_at \
             FROM supplier_payments sp \
             JOIN supplier_invoices si ON si.id = sp.invoice_id \
              WHERE sp.tenant_id = ?1 AND si.branch_id = ?2",
            tenant_id, branch)?),
        ("customer_payments", query_table_rows(&conn, "customer_payments",
            "SELECT cp.id, cp.tenant_id, a.branch_id, cp.customer_id, \
             COALESCE(cp.amount, 0) AS amount, cp.payment_method, \
             cp.account_id, COALESCE(cp.notes, '') AS notes, \
             cp.created_by, 1 AS is_active, cp.created_at \
             FROM customer_payments cp \
             JOIN accounts a ON a.id = cp.account_id \
             WHERE cp.tenant_id = ?1 AND a.branch_id = ?2",
            tenant_id, branch)?),
        // sale_payments: sale_payments has no account_id column (prepare failed →
        // silently synced nothing). Send the columns the cloud actually stores.
        ("sale_payments", query_table_rows(&conn, "sale_payments",
            "SELECT sp.id, sp.tenant_id, s.branch_id, sp.sale_id, \
             COALESCE(sp.payment_method, '') AS payment_method, \
             COALESCE(sp.payment_method_id, '') AS payment_method_id, \
             COALESCE(sp.payment_method_name, '') AS payment_method_name, \
             COALESCE(sp.amount, 0) AS amount, 1 AS is_active, sp.created_at \
             FROM sale_payments sp \
             JOIN sales s ON s.id = sp.sale_id \
              WHERE sp.tenant_id = ?1 AND s.branch_id = ?2",
            tenant_id, branch)?),
        ("accounts", query_table_rows(&conn, "accounts",
            "SELECT id, tenant_id, branch_id, name, name_ar, account_type, \
             current_balance, is_default, is_active, bank_provider, internal_fee, \
             external_fee, phone_label, created_at, updated_at \
             FROM accounts \
             WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL",
            tenant_id, branch)?),
        ("account_transactions", query_table_rows(&conn, "account_transactions",
            "SELECT at.id, at.tenant_id, a.branch_id, at.account_id, at.transaction_type, at.direction, \
             at.amount, at.balance_before, at.balance_after, at.reference_type, at.reference_id, \
             at.description, at.created_by, 1 AS is_active, at.created_at \
             FROM account_transactions at \
             JOIN accounts a ON a.id = at.account_id \
             WHERE at.tenant_id = ?1 AND a.branch_id = ?2 \
             ORDER BY at.created_at DESC LIMIT 500",
            tenant_id, branch)?),
        ("supplier_returns", query_table_rows(&conn, "supplier_returns",
            "SELECT id, tenant_id, branch_id, supplier_id, invoice_id, return_number, \
             return_date, total_amount, status, COALESCE(reason, '') AS reason, \
             COALESCE(notes, '') AS notes, created_by, \
             COALESCE(confirmed_by, '') AS confirmed_by, \
             COALESCE(confirmed_at, '') AS confirmed_at, \
             1 AS is_active, created_at, updated_at \
             FROM supplier_returns \
             WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL",
            tenant_id, branch)?),
        ("supplier_return_items", query_table_rows(&conn, "supplier_return_items",
            "SELECT sri.id, sri.tenant_id, sr.branch_id, sri.supplier_return_id, \
             sri.product_id, sri.batch_id, sri.quantity, sri.unit_cost, \
             sri.total_price, COALESCE(sri.reason, '') AS reason, \
             1 AS is_active, sri.created_at \
             FROM supplier_return_items sri \
             JOIN supplier_returns sr ON sr.id = sri.supplier_return_id \
             WHERE sri.tenant_id = ?1 AND sr.branch_id = ?2 AND sr.deleted_at IS NULL",
            tenant_id, branch)?),
        // pos_sessions has no deleted_at column — the filter made prepare fail and
        // silently synced no sessions.
        ("pos_sessions", query_table_rows(&conn, "pos_sessions",
            "SELECT id, tenant_id, branch_id, cashier_id, account_id, status, \
             opening_cash, expected_cash, COALESCE(actual_cash, 0) AS actual_cash, \
             COALESCE(cash_difference, 0) AS cash_difference, \
             total_sales, total_returns, sales_count, opened_at, \
             closed_at, COALESCE(notes, '') AS notes, \
             1 AS is_active, created_at, updated_at \
             FROM pos_sessions \
             WHERE tenant_id = ?1 AND branch_id = ?2",
            tenant_id, branch)?),
        ("returns", query_table_rows(&conn, "returns",
            "SELECT id, tenant_id, branch_id, return_number, \
             sale_id, session_id, return_type, status, subtotal, total, \
             refund_method, COALESCE(reason, '') AS reason, created_by, \
             1 AS is_active, created_at \
             FROM returns \
             WHERE tenant_id = ?1 AND branch_id = ?2",
            tenant_id, branch)?),
        ("return_items", query_table_rows(&conn, "return_items",
            "SELECT ri.id, ri.tenant_id, r.branch_id, ri.return_id, ri.sale_item_id, \
             ri.product_id, ri.batch_id, ri.quantity, ri.unit_price, ri.subtotal, \
             1 AS is_active, ri.created_at \
             FROM return_items ri \
             JOIN returns r ON r.id = ri.return_id \
             WHERE ri.tenant_id = ?1 AND r.branch_id = ?2",
            tenant_id, branch)?),
        ("supplier_invoice_items", query_table_rows(&conn, "supplier_invoice_items",
            "SELECT sii.id, sii.tenant_id, si.branch_id, sii.invoice_id, \
             sii.product_id, COALESCE(sii.batch_number, '') AS batch_number, \
             COALESCE(sii.expiry_date, '') AS expiry_date, sii.quantity, \
             sii.unit_cost, sii.sale_price, sii.subtotal, \
             1 AS is_active, sii.created_at, sii.updated_at \
             FROM supplier_invoice_items sii \
             JOIN supplier_invoices si ON si.id = sii.invoice_id \
             WHERE sii.tenant_id = ?1 AND si.branch_id = ?2 AND si.deleted_at IS NULL",
            tenant_id, branch)?),
        ("audit_log", query_table_rows(&conn, "audit_log",
            "SELECT id, tenant_id, user_id, action, entity_type, entity_id, \
             COALESCE(changes_json, '') AS changes_json, \
             1 AS is_active, created_at \
             FROM audit_log \
             WHERE tenant_id = ?1 AND created_at > date('now', '-30 days')",
            tenant_id, branch)?),
    ];

    // Collect deleted record IDs from outbox
    let mut deleted_ids_by_table: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    let mut del_ids_to_clear: Vec<String> = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT id, table_name, record_id FROM cloud_sync_deletions WHERE tenant_id = ?1 AND branch_id = ?2"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![tenant_id, branch], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
        }).map_err(|e| e.to_string())?;
        for r in rows {
            if let Ok((del_id, table_name, record_id)) = r {
                deleted_ids_by_table.entry(table_name).or_default().push(record_id);
                del_ids_to_clear.push(del_id);
            }
        }
    }

    drop(conn);

    let payload: Value = tables_data
        .iter()
        .map(|(name, rows)| {
            let dels = deleted_ids_by_table.remove(*name).unwrap_or_default();
            (name.to_string(), json!({ "rows": rows, "deletedIds": dels }))
        })
        .collect::<serde_json::Map<String, Value>>()
        .into();

    let client = cloud_sync::build_cloud_sync_client()?;
    let url = format!("{}/v1/sync/batch", endpoint.trim_end_matches('/'));
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .header("X-Branch-ID", branch)
        .json(&payload)
        .send()
        .map_err(|e| format!("فشل طلب HTTP: {}", e))?;

    let status = response.status();
    let body: Value = response.json().map_err(|e| format!("فشل تحليل الاستجابة: {}", e))?;

    if !status.is_success() {
        let msg = body.get("error").and_then(|v| v.as_str()).unwrap_or("خطأ غير معروف").to_string();
        return Err(format!("فشلت المزامنة ({}): {}", status, msg));
    }

    // Clear successfully sent deletions
    if !del_ids_to_clear.is_empty() {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        for id in &del_ids_to_clear {
            conn.execute("DELETE FROM cloud_sync_deletions WHERE id = ?1", params![id]).ok();
        }
        drop(conn);
    }

    let total: i64 = tables_data.iter().map(|(_, rows)| rows.len() as i64).sum();
    Ok(total)
}

#[tauri::command]
pub fn sync_all_tables_now(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: Option<String>,
    auth_session: State<'_, AuthSessionState>,
) -> Result<Vec<TableSyncResult>, String> {
    let branch_id_str = branch_id.as_deref().unwrap_or("");
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", branch_id_str)?;
    let branches = match branch_id {
        Some(branch) => vec![branch],
        None => list_branch_ids_for_tenant(&db, &tenant_id)?,
    };
    let mut results = Vec::new();
    for branch in branches {
        let total = push_all_tables(&db, &tenant_id, &branch)?;
        results.push(TableSyncResult {
            table: format!("all:{}", branch),
            upserted: total,
            deleted: 0,
            success: true,
            error: None,
        });
    }
    Ok(results)
}
