use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tauri::State;

use super::cloud_sync;
use crate::db::Database;

fn sv(row: &Value, key: &str) -> String {
    match row.get(key) {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => if *b { "1" } else { "0" }.to_string(),
        _ => String::new(),
    }
}

fn iv(row: &Value, key: &str) -> i64 {
    match row.get(key) {
        Some(Value::Number(n)) => n.as_i64().unwrap_or(0),
        Some(Value::String(s)) => s.parse::<i64>().unwrap_or(0),
        Some(Value::Bool(b)) => if *b { 1 } else { 0 },
        _ => 0,
    }
}

fn ov(row: &Value, key: &str) -> Option<String> {
    match row.get(key) {
        Some(Value::String(s)) if !s.is_empty() => Some(s.clone()),
        Some(Value::Number(n)) => Some(n.to_string()),
        _ => None,
    }
}

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
                sv(row, "name"),
                sv(row, "name_ar"),
                sv(row, "barcode"),
                sv(row, "category"),
                {
                    let u = sv(row, "unit_measure");
                    if u.is_empty() { "box".to_string() } else { u }
                },
                iv(row, "sale_price"),
                iv(row, "purchase_price"),
                iv(row, "min_stock"),
                sv(row, "generic_name"),
                sv(row, "generic_name_ar"),
                sv(row, "manufacturer"),
                sv(row, "active_ingredient"),
                sv(row, "dosage_form"),
                sv(row, "storage_conditions"),
                iv(row, "is_prescription"),
                sv(row, "image_path"),
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
                iv(row, "current_balance"),
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
    let mut n = 0i64;
    conn.execute("BEGIN IMMEDIATE", []).ok();
    for row in rows {
        let id = sv(row, "id");
        if id.is_empty() { continue; }
        let qty = iv(row, "quantity");
        let is_active = iv(row, "is_active");
        let status = if is_active != 0 { "active" } else { "inactive" };
        let location_id = sv(row, "location_id");
        if location_id.is_empty() { continue; }
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
                qty,
                qty,
                iv(row, "purchase_price"),
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
                total,
                0i64,
                0i64,
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
                sv(row, "account_id"),
                ov(row, "notes"),
                sv(row, "created_by"),
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
                ov(row, "category"),
                description,
                iv(row, "amount"),
                payment_method,
                sv(row, "account_id"),
                expense_date,
                ov(row, "notes"),
                sv(row, "created_by"),
                sv(row, "created_at"),
                sv(row, "created_at"),
            ],
        );
        if ok.is_ok() { n += 1; }
    }
    conn.execute("COMMIT", []).ok();
    n
}

fn restore_pos_sales(conn: &rusqlite::Connection, rows: &[Value]) -> i64 {
    let mut n = 0i64;
    conn.execute("BEGIN IMMEDIATE", []).ok();
    for row in rows {
        let id = sv(row, "id");
        if id.is_empty() { continue; }
        let ok = conn.execute(
            "INSERT OR IGNORE INTO sales
               (id, tenant_id, branch_id, sale_number, sale_type, session_id, cashier_id,
                customer_id, subtotal, discount, tax_amount, total, amount_paid, change_amount,
                payment_method, payment_method_id, payment_method_name, payment_status, notes,
                void_reason, is_active, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,'',?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22)",
            params![
                id,
                sv(row, "tenant_id"),
                sv(row, "branch_id"),
                sv(row, "sale_number"),
                sv(row, "sale_type"),
                sv(row, "session_id"),
                sv(row, "customer_id"),
                iv(row, "total"),
                iv(row, "discount"),
                iv(row, "tax_amount"),
                iv(row, "total"),
                iv(row, "amount_paid"),
                iv(row, "change_amount"),
                sv(row, "payment_method"),
                ov(row, "payment_method_id"),
                ov(row, "payment_method_name"),
                sv(row, "payment_status"),
                ov(row, "notes"),
                ov(row, "void_reason"),
                iv(row, "is_active"),
                sv(row, "created_at"),
                sv(row, "created_at"),
            ],
        );
        if ok.is_ok() { n += 1; }
    }
    conn.execute("COMMIT", []).ok();
    n
}

fn restore_pos_sale_items(conn: &rusqlite::Connection, rows: &[Value]) -> i64 {
    let mut n = 0i64;
    conn.execute("BEGIN IMMEDIATE", []).ok();
    for row in rows {
        let id = sv(row, "id");
        if id.is_empty() { continue; }
        let ok = conn.execute(
            "INSERT OR IGNORE INTO sale_items
               (id, tenant_id, sale_id, product_id, batch_id, quantity,
                unit_price, unit_cost, subtotal, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![
                id,
                sv(row, "tenant_id"),
                sv(row, "sale_id"),
                sv(row, "product_id"),
                sv(row, "batch_id"),
                iv(row, "quantity"),
                iv(row, "unit_price"),
                iv(row, "unit_price"),
                iv(row, "subtotal"),
                sv(row, "created_at"),
                sv(row, "created_at"),
            ],
        );
        if ok.is_ok() { n += 1; }
    }
    conn.execute("COMMIT", []).ok();
    n
}

fn restore_sale_payments(conn: &rusqlite::Connection, rows: &[Value]) -> i64 {
    let mut n = 0i64;
    conn.execute("BEGIN IMMEDIATE", []).ok();
    for row in rows {
        let id = sv(row, "id");
        if id.is_empty() { continue; }
        let ok = conn.execute(
            "INSERT OR IGNORE INTO sale_payments
               (id, tenant_id, sale_id, payment_method, payment_method_id,
                payment_method_name, amount, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![
                id,
                sv(row, "tenant_id"),
                sv(row, "sale_id"),
                sv(row, "payment_method"),
                ov(row, "payment_method_id"),
                ov(row, "payment_method_name"),
                iv(row, "amount"),
                sv(row, "created_at"),
                sv(row, "created_at"),
            ],
        );
        if ok.is_ok() { n += 1; }
    }
    conn.execute("COMMIT", []).ok();
    n
}

fn restore_supplier_payments(conn: &rusqlite::Connection, rows: &[Value]) -> i64 {
    let mut n = 0i64;
    conn.execute("BEGIN IMMEDIATE", []).ok();
    for row in rows {
        let id = sv(row, "id");
        if id.is_empty() { continue; }
        let ok = conn.execute(
            "INSERT OR IGNORE INTO supplier_payments
               (id, tenant_id, supplier_id, invoice_id, amount, payment_method,
                account_id, payment_date, notes, created_by, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
            params![
                id,
                sv(row, "tenant_id"),
                sv(row, "supplier_id"),
                sv(row, "invoice_id"),
                iv(row, "amount"),
                sv(row, "payment_method"),
                sv(row, "account_id"),
                sv(row, "payment_date"),
                ov(row, "notes"),
                sv(row, "created_by"),
                sv(row, "created_at"),
                sv(row, "created_at"),
            ],
        );
        if ok.is_ok() { n += 1; }
    }
    conn.execute("COMMIT", []).ok();
    n
}

fn restore_stock_movements(conn: &rusqlite::Connection, rows: &[Value]) -> i64 {
    let mut n = 0i64;
    conn.execute("BEGIN IMMEDIATE", []).ok();
    for row in rows {
        let id = sv(row, "id");
        if id.is_empty() { continue; }
        let ok = conn.execute(
            "INSERT OR IGNORE INTO stock_movements
               (id, tenant_id, branch_id, product_id, batch_id, movement_type,
                quantity_change, reference_type, reference_id, notes, created_by, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
            params![
                id,
                sv(row, "tenant_id"),
                sv(row, "branch_id"),
                sv(row, "product_id"),
                ov(row, "batch_id"),
                sv(row, "movement_type"),
                iv(row, "quantity"),
                ov(row, "reference_type"),
                ov(row, "reference_id"),
                ov(row, "notes"),
                sv(row, "created_by"),
                sv(row, "created_at"),
            ],
        );
        if ok.is_ok() { n += 1; }
    }
    conn.execute("COMMIT", []).ok();
    n
}

fn restore_account_transactions(conn: &rusqlite::Connection, rows: &[Value]) -> i64 {
    let mut n = 0i64;
    conn.execute("BEGIN IMMEDIATE", []).ok();
    for row in rows {
        let id = sv(row, "id");
        if id.is_empty() { continue; }
        let ok = conn.execute(
            "INSERT OR IGNORE INTO account_transactions
               (id, tenant_id, account_id, transaction_type, direction,
                amount, balance_before, balance_after, reference_type, reference_id,
                description, created_by, created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
            params![
                id,
                sv(row, "tenant_id"),
                sv(row, "account_id"),
                sv(row, "transaction_type"),
                sv(row, "direction"),
                iv(row, "amount"),
                iv(row, "balance_before"),
                iv(row, "balance_after"),
                ov(row, "reference_type"),
                ov(row, "reference_id"),
                ov(row, "description"),
                sv(row, "created_by"),
                sv(row, "created_at"),
            ],
        );
        if ok.is_ok() { n += 1; }
    }
    conn.execute("COMMIT", []).ok();
    n
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RestoreResult {
    pub success: bool,
    pub tables: HashMap<String, i64>,
    pub total_rows: i64,
    pub skipped_tables: Vec<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn pull_all_tables(
    db: State<'_, Database>,
    endpoint: String,
    sync_token: String,
) -> Result<RestoreResult, String> {
    // Abort only if the user has made real activity (sales). Demo products
    // and expense categories are injected by seed.rs on every fresh install,
    // so checking `products` here would always abort restore. Sales are
    // never seeded — any row in `sales` means the user has used the app.
    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let sales_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM sales", [], |row| row.get(0))
            .unwrap_or(0);
        let expenses_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM expenses", [], |row| row.get(0))
            .unwrap_or(0);
        let customers_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM customers", [], |row| row.get(0))
            .unwrap_or(0);
        if sales_count > 0 || expenses_count > 0 || customers_count > 0 {
            return Err(
                "الاستعادة تتطلب تثبيتاً جديداً. يوجد بيانات محلية موجودة بالفعل.".to_string(),
            );
        }

        // Clear seed demo rows so the restored DB doesn't carry phantom
        // Panadol / Test Supplier / default expense-category entries
        // alongside the real cloud data. Safe because the gate above
        // confirmed no real activity exists.
        let _ = conn.execute("DELETE FROM products", []);
        let _ = conn.execute("DELETE FROM suppliers", []);
        let _ = conn.execute("DELETE FROM expense_categories", []);
    }

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

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut counts: HashMap<String, i64> = HashMap::new();

    let skipped: Vec<String> = Vec::new();

    macro_rules! do_table {
        ($key:expr, $fn:ident) => {
            if let Some(arr) = tables_json.get($key).and_then(|v| v.as_array()) {
                let n = $fn(&conn, arr.as_slice());
                counts.insert($key.to_string(), n);
            }
        };
    }

    do_table!("products",              restore_products);
    do_table!("customers",             restore_customers);
    do_table!("suppliers",             restore_suppliers);
    do_table!("accounts",              restore_accounts);
    do_table!("batches",               restore_batches);
    do_table!("supplier_invoices",     restore_supplier_invoices);
    do_table!("customer_payments",     restore_customer_payments);
    do_table!("expenses",              restore_expenses);
    do_table!("pos_sales",             restore_pos_sales);
    do_table!("pos_sale_items",        restore_pos_sale_items);
    do_table!("sale_payments",         restore_sale_payments);
    do_table!("supplier_payments",     restore_supplier_payments);
    do_table!("stock_movements",       restore_stock_movements);
    do_table!("account_transactions",  restore_account_transactions);

    let total_rows: i64 = counts.values().sum();

    Ok(RestoreResult {
        success: true,
        tables: counts,
        total_rows,
        skipped_tables: skipped,
        error: None,
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecoverResult {
    pub tenant_id: String,
    pub sync_token: String,
    pub pharmacy_name: String,
}

#[tauri::command]
pub fn recover_cloud_credentials(
    license_key: String,
    email: String,
    password: String,
) -> Result<RecoverResult, String> {
    let endpoint = std::env::var("PMS_OWNER_SYNC_ENDPOINT")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "https://pharmacy.taj.systems".to_string());

    let client = cloud_sync::build_cloud_sync_client()?;
    let url = format!("{}/auth/recover", endpoint.trim_end_matches('/'));

    let body = serde_json::json!({
        "license_key": license_key.trim(),
        "email": email.trim().to_lowercase(),
        "password": password,
    });

    let response = client
        .post(&url)
        .json(&body)
        .send()
        .map_err(|e| format!("فشل الاتصال بالخادم: {}", e))?;

    let status = response.status();
    let resp_body: Value = response
        .json()
        .map_err(|e| format!("فشل تحليل استجابة الخادم: {}", e))?;

    if !status.is_success() {
        let raw = resp_body
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("خطأ غير معروف")
            .to_string();
        let msg = if raw.contains("Invalid recovery credentials") {
            "بيانات الاعتماد غير صحيحة. تحقق من مفتاح الترخيص والبريد الإلكتروني وكلمة المرور.".to_string()
        } else if raw.contains("temporarily locked") || status.as_u16() == 429 {
            "الحساب مقفل مؤقتاً بسبب محاولات متكررة. حاول مرة أخرى لاحقاً.".to_string()
        } else {
            raw
        };
        return Err(msg);
    }

    let tenant_id = resp_body
        .get("tenant_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let sync_token = resp_body
        .get("sync_token")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let pharmacy_name = resp_body
        .get("pharmacy_name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if tenant_id.is_empty() || sync_token.is_empty() {
        return Err("استجابة غير متوقعة من الخادم: بيانات ناقصة".to_string());
    }

    Ok(RecoverResult { tenant_id, sync_token, pharmacy_name })
}
