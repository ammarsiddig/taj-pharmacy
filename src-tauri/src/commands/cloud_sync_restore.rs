/// TASK-302 — pull_all_tables: one-time restore from cloud snapshot.
///
/// Calls GET /v1/sync/dump, then inserts each row into the corresponding
/// local SQLite table. Only runs on a fresh install (aborts if products exist).
/// Uses INSERT OR IGNORE throughout so constraint mismatches are skipped
/// rather than returning errors.
///
/// Tables restored: products, customers, suppliers, batches, accounts,
///   supplier_invoices, customer_payments, expenses.
/// Tables skipped (structural issues): pos_sales, pos_sale_items,
///   sale_payments, supplier_payments, stock_movements, account_transactions.

use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tauri::State;

use super::cloud_sync;
use crate::db::Database;

// ── Value-extraction helpers ──────────────────────────────────────────────────

/// Text value or empty string.
fn sv(row: &Value, key: &str) -> String {
    match row.get(key) {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => if *b { "1" } else { "0" }.to_string(),
        _ => String::new(),
    }
}

/// Integer value or 0.
fn iv(row: &Value, key: &str) -> i64 {
    match row.get(key) {
        Some(Value::Number(n)) => n.as_i64().unwrap_or(0),
        Some(Value::String(s)) => s.parse::<i64>().unwrap_or(0),
        Some(Value::Bool(b)) => if *b { 1 } else { 0 },
        _ => 0,
    }
}

/// Optional text — returns None for empty / null.
fn ov(row: &Value, key: &str) -> Option<String> {
    match row.get(key) {
        Some(Value::String(s)) if !s.is_empty() => Some(s.clone()),
        Some(Value::Number(n)) => Some(n.to_string()),
        _ => None,
    }
}

// ── Per-table restore functions ───────────────────────────────────────────────

fn restore_products(conn: &rusqlite::Connection, rows: &[Value]) -> i64 {
    let mut n = 0i64;
    conn.execute("BEGIN IMMEDIATE", []).ok();
    for row in rows {
        let id = sv(row, "id");
        if id.is_empty() { continue; }
        let ok = conn.execute(
            "INSERT OR IGNORE INTO products
               (id, tenant_id, trade_name, trade_name_ar, barcode, category, unit,
                sale_price, last_purchase_price, min_stock_level,
                generic_name, generic_name_ar, manufacturer, active_ingredient,
                dosage_form, storage_conditions, is_prescription, image_path,
                is_active, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21)",
            params![
                id,
                sv(row, "tenant_id"),
                sv(row, "name"),              // trade_name ← name
                sv(row, "name_ar"),           // trade_name_ar ← name_ar
                sv(row, "barcode"),
                sv(row, "category"),
                {
                    let u = sv(row, "unit_measure");
                    if u.is_empty() { "box".to_string() } else { u }
                },                            // unit ← unit_measure
                iv(row, "sale_price"),
                iv(row, "purchase_price"),    // last_purchase_price ← purchase_price
                iv(row, "min_stock"),         // min_stock_level ← min_stock
                sv(row, "generic_name"),
                sv(row, "generic_name_ar"),
                sv(row, "manufacturer"),
                sv(row, "active_ingredient"),
                sv(row, "dosage_form"),
                sv(row, "storage_conditions"),
                iv(row, "is_prescription"),
                sv(row, "image_path"),
                iv(row, "is_active"),
                sv(row, "updated_at"),        // created_at ← updated_at (best guess)
                sv(row, "updated_at"),
            ],
        );
        if ok.is_ok() { n += 1; }
    }
    conn.execute("COMMIT", []).ok();
    n
}

fn restore_customers(conn: &rusqlite::Connection, rows: &[Value]) -> i64 {
    let mut n = 0i64;
    conn.execute("BEGIN IMMEDIATE", []).ok();
    for row in rows {
        let id = sv(row, "id");
        if id.is_empty() { continue; }
        let ok = conn.execute(
            "INSERT OR IGNORE INTO customers
               (id, tenant_id, name, name_ar, phone, credit_limit, current_balance,
                email, address, notes, is_active, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
            params![
                id,
                sv(row, "tenant_id"),
                sv(row, "name"),
                sv(row, "name_ar"),
                sv(row, "phone"),
                iv(row, "credit_limit"),
                iv(row, "current_balance"),
                sv(row, "email"),
                sv(row, "address"),
                sv(row, "notes"),
                iv(row, "is_active"),
                sv(row, "updated_at"),
                sv(row, "updated_at"),
            ],
        );
        if ok.is_ok() { n += 1; }
    }
    conn.execute("COMMIT", []).ok();
    n
}

fn restore_suppliers(conn: &rusqlite::Connection, rows: &[Value]) -> i64 {
    let mut n = 0i64;
    conn.execute("BEGIN IMMEDIATE", []).ok();
    for row in rows {
        let id = sv(row, "id");
        if id.is_empty() { continue; }
        // Cloud stores current_balance; desktop has opening_balance
        let ok = conn.execute(
            "INSERT OR IGNORE INTO suppliers
               (id, tenant_id, name, name_ar, phone, email, address,
                opening_balance, contact_person, notes, is_active, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
            params![
                id,
                sv(row, "tenant_id"),
                sv(row, "name"),
                sv(row, "name_ar"),
                sv(row, "phone"),
                sv(row, "email"),
                sv(row, "address"),
                iv(row, "current_balance"),   // opening_balance ← current_balance
                sv(row, "contact_person"),
                sv(row, "notes"),
                iv(row, "is_active"),
                sv(row, "updated_at"),
                sv(row, "updated_at"),
            ],
        );
        if ok.is_ok() { n += 1; }
    }
    conn.execute("COMMIT", []).ok();
    n
}

fn restore_batches(conn: &rusqlite::Connection, rows: &[Value]) -> i64 {
    // batches.location_id is NOT NULL (FK to storage_locations).
    // On a fresh install that FK won't exist, but SQLite FK enforcement
    // is off by default so the INSERT succeeds. The location_id is stored
    // as-is for reference; the operator may re-map locations manually.
    //
    // quantity_received is NOT NULL; we set it = quantity_current from cloud
    // since we don't track the original received amount separately.
    //
    // Cloud is_active (0/1) → desktop status ('active'/'inactive').
    let mut n = 0i64;
    conn.execute("BEGIN IMMEDIATE", []).ok();
    for row in rows {
        let id = sv(row, "id");
        if id.is_empty() { continue; }
        let qty = iv(row, "quantity");
        let is_active = iv(row, "is_active");
        let status = if is_active != 0 { "active" } else { "inactive" };
        // location_id: use value from cloud, fallback to empty string
        let location_id = sv(row, "location_id");
        if location_id.is_empty() { continue; } // can't insert without location
        let ok = conn.execute(
            "INSERT OR IGNORE INTO batches
               (id, tenant_id, product_id, location_id, batch_number, expiry_date,
                quantity_received, quantity_current, unit_cost, status, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
            params![
                id,
                sv(row, "tenant_id"),
                sv(row, "product_id"),
                location_id,
                ov(row, "batch_number"),
                ov(row, "expiry_date"),
                qty,                          // quantity_received ← quantity (best guess)
                qty,                          // quantity_current ← quantity
                iv(row, "purchase_price"),    // unit_cost ← purchase_price
                status,
                sv(row, "updated_at"),
                sv(row, "updated_at"),
            ],
        );
        if ok.is_ok() { n += 1; }
    }
    conn.execute("COMMIT", []).ok();
    n
}

fn restore_accounts(conn: &rusqlite::Connection, rows: &[Value]) -> i64 {
    let mut n = 0i64;
    conn.execute("BEGIN IMMEDIATE", []).ok();
    for row in rows {
        let id = sv(row, "id");
        if id.is_empty() { continue; }
        let account_type = {
            let t = sv(row, "account_type");
            if t.is_empty() { "cash".to_string() } else { t }
        };
        let ok = conn.execute(
            "INSERT OR IGNORE INTO accounts
               (id, tenant_id, branch_id, name, name_ar, account_type, current_balance,
                is_default, is_active, bank_provider, internal_fee, external_fee,
                phone_label, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
            params![
                id,
                sv(row, "tenant_id"),
                sv(row, "branch_id"),
                sv(row, "name"),
                sv(row, "name_ar"),
                account_type,
                iv(row, "current_balance"),
                iv(row, "is_default"),
                iv(row, "is_active"),
                ov(row, "bank_provider"),
                iv(row, "internal_fee"),
                iv(row, "external_fee"),
                ov(row, "phone_label"),
                sv(row, "created_at"),
                sv(row, "updated_at"),
            ],
        );
        if ok.is_ok() { n += 1; }
    }
    conn.execute("COMMIT", []).ok();
    n
}

fn restore_supplier_invoices(conn: &rusqlite::Connection, rows: &[Value]) -> i64 {
    let mut n = 0i64;
    conn.execute("BEGIN IMMEDIATE", []).ok();
    for row in rows {
        let id = sv(row, "id");
        if id.is_empty() { continue; }
        let status = {
            let s = sv(row, "status");
            match s.as_str() {
                "draft" | "confirmed" | "cancelled" => s,
                _ => "confirmed".to_string(),
            }
        };
        let payment_status = {
            let ps = sv(row, "payment_status");
            match ps.as_str() {
                "unpaid" | "partial" | "paid" => ps,
                _ => "unpaid".to_string(),
            }
        };
        let invoice_date = {
            let d = sv(row, "invoice_date");
            if d.is_empty() { sv(row, "created_at") } else { d }
        };
        let total = iv(row, "total");
        let ok = conn.execute(
            "INSERT OR IGNORE INTO supplier_invoices
               (id, tenant_id, branch_id, supplier_id, invoice_number, invoice_date,
                status, payment_status, subtotal, discount, tax_amount, total, amount_paid,
                created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
            params![
                id,
                sv(row, "tenant_id"),
                sv(row, "branch_id"),
                sv(row, "supplier_id"),
                ov(row, "invoice_number"),
                invoice_date,
                status,
                payment_status,
                total,   // subtotal ← total (no breakdown in cloud)
                0i64,    // discount
                0i64,    // tax_amount
                total,
                iv(row, "amount_paid"),
                sv(row, "created_at"),
                sv(row, "updated_at"),
            ],
        );
        if ok.is_ok() { n += 1; }
    }
    conn.execute("COMMIT", []).ok();
    n
}

fn restore_customer_payments(conn: &rusqlite::Connection, rows: &[Value]) -> i64 {
    // created_by is NOT NULL; use '' if missing (SQLite won't reject empty text).
    let mut n = 0i64;
    conn.execute("BEGIN IMMEDIATE", []).ok();
    for row in rows {
        let id = sv(row, "id");
        if id.is_empty() { continue; }
        let payment_method = {
            let pm = sv(row, "payment_method");
            match pm.as_str() {
                "cash" | "bank_transfer" => pm,
                _ => "cash".to_string(),
            }
        };
        let ok = conn.execute(
            "INSERT OR IGNORE INTO customer_payments
               (id, tenant_id, customer_id, amount, payment_method,
                account_id, notes, created_by, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![
                id,
                sv(row, "tenant_id"),
                sv(row, "customer_id"),
                iv(row, "amount"),
                payment_method,
                sv(row, "account_id"),        // may be empty → constraint OK (NOT NULL but '')
                ov(row, "notes"),
                sv(row, "created_by"),        // may be empty → OK
                sv(row, "created_at"),
                sv(row, "created_at"),
            ],
        );
        if ok.is_ok() { n += 1; }
    }
    conn.execute("COMMIT", []).ok();
    n
}

fn restore_expenses(conn: &rusqlite::Connection, rows: &[Value]) -> i64 {
    // account_id and created_by are NOT NULL; use '' if missing.
    let mut n = 0i64;
    conn.execute("BEGIN IMMEDIATE", []).ok();
    for row in rows {
        let id = sv(row, "id");
        if id.is_empty() { continue; }
        let expense_date = {
            let d = sv(row, "expense_date");
            if d.is_empty() { sv(row, "created_at") } else { d }
        };
        let payment_method = {
            let pm = sv(row, "payment_method");
            match pm.as_str() {
                "cash" | "bank_transfer" => pm,
                _ => "cash".to_string(),
            }
        };
        let description = {
            let d = sv(row, "description");
            if d.is_empty() { sv(row, "category") } else { d }
        };
        let ok = conn.execute(
            "INSERT OR IGNORE INTO expenses
               (id, tenant_id, branch_id, category_id, description, amount,
                payment_method, account_id, expense_date, notes, created_by,
                created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
            params![
                id,
                sv(row, "tenant_id"),
                sv(row, "branch_id"),
                ov(row, "category"),          // category_id ← category
                description,
                iv(row, "amount"),
                payment_method,
                sv(row, "account_id"),        // may be empty → OK
                expense_date,
                ov(row, "notes"),
                sv(row, "created_by"),        // may be empty → OK
                sv(row, "created_at"),
                sv(row, "created_at"),
            ],
        );
        if ok.is_ok() { n += 1; }
    }
    conn.execute("COMMIT", []).ok();
    n
}

// ── Public result type ────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct RestoreResult {
    pub success: bool,
    /// Rows inserted per table.
    pub tables: HashMap<String, i64>,
    pub total_rows: i64,
    /// Tables not attempted (structural issues, see HANDOFF).
    pub skipped_tables: Vec<String>,
    pub error: Option<String>,
}

// ── Tauri command ─────────────────────────────────────────────────────────────

/// One-time restore from cloud snapshot (TASK-302).
///
/// Parameters:
/// - `endpoint`: Cloud base URL (e.g. "https://cloud.taj-pharmacy.com")
/// - `sync_token`: Active sync token for this tenant
///
/// Aborts with an error if any local data already exists (products.count > 0).
#[tauri::command]
pub fn pull_all_tables(
    db: State<'_, Database>,
    endpoint: String,
    sync_token: String,
) -> Result<RestoreResult, String> {
    // 1. Abort if local data exists
    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM products", [], |row| row.get(0))
            .unwrap_or(0);
        if count > 0 {
            return Err(
                "الاستعادة تتطلب تثبيتاً جديداً. يوجد بيانات محلية موجودة بالفعل.".to_string(),
            );
        }
    }

    // 2. Fetch dump from cloud
    let client = cloud_sync::build_cloud_sync_client()?;
    let url = format!("{}/v1/sync/dump", endpoint.trim_end_matches('/'));
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", sync_token))
        .send()
        .map_err(|e| format!("فشل طلب HTTP: {}", e))?;

    let status = response.status();
    let body: Value = response
        .json()
        .map_err(|e| format!("فشل تحليل الاستجابة: {}", e))?;

    if !status.is_success() {
        let msg = body
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("خطأ غير معروف")
            .to_string();
        return Err(format!("فشل جلب البيانات: {}", msg));
    }

    let tables_json = body
        .get("tables")
        .ok_or_else(|| "استجابة غير صالحة: حقل tables مفقود".to_string())?;

    // 3. Restore each table in dependency order
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut counts: HashMap<String, i64> = HashMap::new();

    let skipped = vec![
        "pos_sales".to_string(),
        "pos_sale_items".to_string(),
        "sale_payments".to_string(),
        "supplier_payments".to_string(),
        "stock_movements".to_string(),
        "account_transactions".to_string(),
    ];

    macro_rules! do_table {
        ($key:expr, $fn:ident) => {
            if let Some(arr) = tables_json.get($key).and_then(|v| v.as_array()) {
                let n = $fn(&conn, arr.as_slice());
                counts.insert($key.to_string(), n);
            }
        };
    }

    // Independent tables first, then tables with FK dependencies
    do_table!("products",           restore_products);
    do_table!("customers",          restore_customers);
    do_table!("suppliers",          restore_suppliers);
    do_table!("accounts",           restore_accounts);
    // batches depend on products; supplier_invoices depend on suppliers
    do_table!("batches",            restore_batches);
    do_table!("supplier_invoices",  restore_supplier_invoices);
    // payments depend on customers/accounts
    do_table!("customer_payments",  restore_customer_payments);
    do_table!("expenses",           restore_expenses);

    let total_rows: i64 = counts.values().sum();

    Ok(RestoreResult {
        success: true,
        tables: counts,
        total_rows,
        skipped_tables: skipped,
        error: None,
    })
}
