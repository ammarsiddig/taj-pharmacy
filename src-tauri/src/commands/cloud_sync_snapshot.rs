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

fn query_table_rows(
    conn: &rusqlite::Connection,
    sql: &str,
    tenant_id: &str,
    branch_id: &str,
) -> Vec<Value> {
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return vec![],
    };
    let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let rows = stmt.query_map(params![tenant_id, branch_id], |row| {
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
    });
    match rows {
        Ok(iter) => iter.filter_map(|r| r.ok()).collect(),
        Err(_) => vec![],
    }
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
        ("users", query_table_rows(&conn,
            "SELECT id, tenant_id, branch_id, role_id, username, full_name, \
             COALESCE(full_name_ar, '') AS full_name_ar, \
             COALESCE(phone, '') AS phone, is_active, last_login_at, created_at, updated_at \
             FROM users \
             WHERE tenant_id = ?1 AND deleted_at IS NULL",
            tenant_id, branch)),
        ("branches", query_table_rows(&conn,
            "SELECT id, tenant_id, name, COALESCE(name_ar, '') AS name_ar, \
             COALESCE(address, '') AS address, COALESCE(phone, '') AS phone, \
             is_main, is_active, created_at, updated_at \
             FROM branches \
             WHERE tenant_id = ?1 AND deleted_at IS NULL",
            tenant_id, branch)),
        ("products", query_table_rows(&conn,
            "SELECT p.id, p.tenant_id, ?2 AS branch_id, \
             p.trade_name AS name, COALESCE(p.trade_name_ar, '') AS name_ar, \
             COALESCE(p.barcode, '') AS barcode, COALESCE(p.category, '') AS category, \
             COALESCE(p.unit, '') AS unit_measure, \
             COALESCE(p.last_purchase_price, 0) AS purchase_price, \
             COALESCE(p.sale_price, 0) AS sale_price, 0 AS tax_percent, \
             COALESCE(p.min_stock_level, 0) AS min_stock, \
             COALESCE(SUM(b.quantity_current), 0) AS current_stock, \
             p.is_active, p.updated_at \
             FROM products p \
             LEFT JOIN batches b ON b.product_id = p.id AND b.status = 'active' AND b.deleted_at IS NULL \
                AND EXISTS (SELECT 1 FROM storage_locations sl WHERE sl.id = b.location_id AND sl.branch_id = ?2 AND sl.deleted_at IS NULL) \
             WHERE p.tenant_id = ?1 AND p.deleted_at IS NULL \
             GROUP BY p.id",
            tenant_id, branch)),
        ("customers", query_table_rows(&conn,
            "SELECT id, tenant_id, ?2 AS branch_id, name, COALESCE(name_ar, '') AS name_ar, \
             COALESCE(phone, '') AS phone, COALESCE(credit_limit, 0) AS credit_limit, \
             COALESCE(current_balance, 0) AS current_balance, 0 AS total_purchases, \
             is_active, updated_at \
             FROM customers WHERE tenant_id = ?1 AND deleted_at IS NULL",
            tenant_id, branch)),
        ("suppliers", query_table_rows(&conn,
            "SELECT id, tenant_id, ?2 AS branch_id, name, \
             COALESCE(phone, '') AS phone, COALESCE(email, '') AS email, \
             COALESCE(address, '') AS address, \
             COALESCE(opening_balance, 0) AS current_balance, \
             is_active, updated_at \
             FROM suppliers WHERE tenant_id = ?1 AND deleted_at IS NULL",
            tenant_id, branch)),
        ("pos_sales", query_table_rows(&conn,
            "SELECT s.id, s.tenant_id, s.branch_id, s.session_id, s.sale_number, \
             s.customer_id, COALESCE(c.name, '') AS customer_name, \
             s.total, COALESCE(s.tax_amount, 0) AS tax_amount, \
             COALESCE(s.discount, 0) AS discount, s.payment_method, s.payment_status, \
             s.amount_paid, (s.total - s.amount_paid) AS balance_due, \
             '' AS cashier_name, \
             COALESCE(s.notes, '') AS notes, 0 AS is_return, s.created_at \
             FROM sales s \
             LEFT JOIN customers c ON c.id = s.customer_id \
             WHERE s.tenant_id = ?1 AND s.branch_id = ?2 AND s.deleted_at IS NULL",
            tenant_id, branch)),
        ("pos_sale_items", query_table_rows(&conn,
            "SELECT si.id, si.tenant_id, s.branch_id, si.sale_id, si.product_id, \
             COALESCE(p.trade_name, '') AS product_name, \
             si.batch_id, COALESCE(b.batch_number, '') AS batch_number, \
             si.quantity, si.unit_price, si.subtotal \
             FROM sale_items si \
             JOIN sales s ON s.id = si.sale_id \
             LEFT JOIN products p ON p.id = si.product_id \
             LEFT JOIN batches b ON b.id = si.batch_id \
             WHERE si.tenant_id = ?1 AND s.branch_id = ?2 AND s.deleted_at IS NULL",
            tenant_id, branch)),
        ("expenses", query_table_rows(&conn,
            "SELECT id, tenant_id, branch_id, \
             COALESCE(category_id, '') AS category, amount, \
             COALESCE(description, '') AS description, expense_date, created_at \
             FROM expenses WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL",
            tenant_id, branch)),
        ("batches", query_table_rows(&conn,
            "SELECT b.id, b.tenant_id, ?2 AS branch_id, b.product_id, \
             COALESCE(b.batch_number, '') AS batch_number, b.expiry_date, \
             b.quantity_current AS quantity, b.unit_cost AS purchase_price, \
             b.location_id, CASE WHEN b.status = 'active' THEN 1 ELSE 0 END AS is_active, \
             b.updated_at \
             FROM batches b \
             JOIN storage_locations sl ON sl.id = b.location_id \
             WHERE b.tenant_id = ?1 AND sl.branch_id = ?2 AND b.deleted_at IS NULL",
            tenant_id, branch)),
        ("stock_movements", query_table_rows(&conn,
            "SELECT id, tenant_id, branch_id, product_id, batch_id, movement_type, \
             quantity_change AS quantity, COALESCE(reference_type, '') AS reference_type, \
             COALESCE(reference_id, '') AS reference_id, COALESCE(notes, '') AS notes, created_at \
             FROM stock_movements WHERE tenant_id = ?1 AND branch_id = ?2",
            tenant_id, branch)),
        ("supplier_invoices", query_table_rows(&conn,
            "SELECT si.id, si.tenant_id, si.branch_id, si.supplier_id, \
             COALESCE(s.name, '') AS supplier_name, \
             si.invoice_number, si.invoice_date, si.status, si.payment_status, \
             si.total, COALESCE(si.amount_paid, 0) AS amount_paid, \
             (si.total - COALESCE(si.amount_paid, 0)) AS balance_due, \
             si.created_at, si.updated_at \
             FROM supplier_invoices si \
             LEFT JOIN suppliers s ON s.id = si.supplier_id \
             WHERE si.tenant_id = ?1 AND si.branch_id = ?2 AND si.deleted_at IS NULL",
            tenant_id, branch)),
        ("supplier_payments", query_table_rows(&conn,
            "SELECT sp.id, sp.tenant_id, si.branch_id, sp.supplier_id, \
             si.id AS invoice_id, \
             COALESCE(sp.amount, 0) AS amount, COALESCE(sp.payment_method, '') AS payment_method, \
             COALESCE(sp.payment_date, '') AS payment_date, sp.created_at, sp.updated_at \
             FROM supplier_payments sp \
             JOIN supplier_invoices si ON si.id = sp.invoice_id \
              WHERE sp.tenant_id = ?1 AND si.branch_id = ?2",
            tenant_id, branch)),
        ("customer_payments", query_table_rows(&conn,
            "SELECT cp.id, cp.tenant_id, a.branch_id, cp.customer_id, \
             COALESCE(cp.amount, 0) AS amount, cp.payment_method, \
             cp.account_id, COALESCE(cp.notes, '') AS notes, \
             cp.created_by, 1 AS is_active, cp.created_at \
             FROM customer_payments cp \
             JOIN accounts a ON a.id = cp.account_id \
             WHERE cp.tenant_id = ?1 AND a.branch_id = ?2",
            tenant_id, branch)),
        ("sale_payments", query_table_rows(&conn,
            "SELECT sp.id, sp.tenant_id, s.branch_id, sp.sale_id, \
             COALESCE(sp.payment_method, '') AS payment_method, \
             COALESCE(sp.amount, 0) AS amount, sp.account_id, sp.created_at, sp.updated_at \
             FROM sale_payments sp \
             JOIN sales s ON s.id = sp.sale_id \
              WHERE sp.tenant_id = ?1 AND s.branch_id = ?2",
            tenant_id, branch)),
        ("accounts", query_table_rows(&conn,
            "SELECT id, tenant_id, branch_id, name, name_ar, account_type, \
             current_balance, is_default, is_active, bank_provider, internal_fee, \
             external_fee, phone_label, created_at, updated_at \
             FROM accounts \
             WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL",
            tenant_id, branch)),
        ("account_transactions", query_table_rows(&conn,
            "SELECT at.id, at.tenant_id, a.branch_id, at.account_id, at.transaction_type, at.direction, \
             at.amount, at.balance_before, at.balance_after, at.reference_type, at.reference_id, \
             at.description, at.created_by, at.created_at \
             FROM account_transactions at \
             JOIN accounts a ON a.id = at.account_id \
             WHERE at.tenant_id = ?1 AND a.branch_id = ?2 \
             ORDER BY at.created_at DESC LIMIT 500",
            tenant_id, branch)),
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
