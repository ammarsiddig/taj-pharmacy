use serde::{Deserialize, Serialize};
use tauri::State;
use rusqlite::Connection;
use rusqlite::params;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::cloud_sync;
use crate::commands::license_guard;
use crate::commands::guard;
use crate::commands::audit;

// Feature flag bit for POS
const FLAG_POS: i64 = 1;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PosSession {
    pub id: String,
    pub tenant_id: String,
    pub branch_id: String,
    pub cashier_id: String,
    pub account_id: String,
    pub status: String,
    pub opening_cash: i64,
    pub expected_cash: i64,
    pub actual_cash: Option<i64>,
    pub cash_difference: Option<i64>,
    pub total_sales: i64,
    pub total_returns: i64,
    pub sales_count: i64,
    pub opened_at: String,
    pub closed_at: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PosBatch {
    pub batch_id: String,
    pub batch_number: Option<String>,
    pub expiry_date: Option<String>,
    pub quantity_current: i64,
    pub unit_cost: i64,
    pub location_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PosProduct {
    pub product_id: String,
    pub product_name: String,
    pub product_name_ar: Option<String>,
    pub barcode: Option<String>,
    pub sale_price: i64,
    pub unit: String,
    pub is_prescription: bool,
    pub batches: Vec<PosBatch>,
}

#[derive(Debug, Serialize)]
pub struct SaleItemOut {
    pub id: String,
    pub product_id: String,
    pub batch_id: String,
    pub product_name: Option<String>,
    pub batch_number: Option<String>,
    pub expiry_date: Option<String>,
    pub quantity: i64,
    pub unit_price: i64,
    pub unit_cost: i64,
    pub subtotal: i64,
}

#[derive(Debug, Serialize)]
pub struct SaleOut {
    pub id: String,
    pub sale_number: String,
    pub sale_type: String,
    pub session_id: Option<String>,
    pub cashier_id: String,
    pub customer_id: Option<String>,
    pub customer_name: Option<String>,
    pub subtotal: i64,
    pub discount: i64,
    pub tax_amount: i64,
    pub total: i64,
    pub amount_paid: i64,
    pub change_amount: i64,
    pub payment_method: String,
    pub payment_method_name: Option<String>,
    pub payment_status: String,
    pub notes: Option<String>,
    pub split_payments: Vec<SalePaymentOut>,
    pub items: Vec<SaleItemOut>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct SalePaymentOut {
    pub id: String,
    pub payment_method: String,
    pub payment_method_id: Option<String>,
    pub payment_method_name: Option<String>,
    pub amount: i64,
}

#[derive(Debug, Deserialize)]
pub struct SaleItemInput {
    pub product_id: String,
    pub batch_id: Option<String>,
    pub quantity: i64,
    pub unit_price: i64,
    pub unit_cost: i64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct SalePaymentInput {
    pub payment_method: String,
    pub payment_method_id: Option<String>,
    pub amount: i64,
}

#[derive(Debug, Clone)]
struct ResolvedSaleItem {
    product_id: String,
    batch_id: String,
    quantity: i64,
    unit_price: i64,
    unit_cost: i64,
}

#[derive(Debug, Serialize)]
pub struct SessionRow {
    pub id: String,
    pub cashier_name: String,
    pub opened_at: String,
    pub closed_at: Option<String>,
    pub sales_count: i64,
    pub total_sales: i64,
    pub total_returns: i64,
    pub opening_cash: i64,
    pub actual_cash: Option<i64>,
    pub cash_difference: Option<i64>,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct AccountInfo {
    pub id: String,
    pub tenant_id: String,
    pub branch_id: String,
    pub name: String,
    pub name_ar: Option<String>,
    pub account_type: String,
    pub current_balance: i64,
    pub is_default: bool,
    pub is_active: bool,
}

#[derive(Debug, Serialize)]
pub struct SessionSaleRow {
    pub id: String,
    pub sale_number: String,
    pub total: i64,
    pub payment_method: String,
    pub items_count: i64,
    pub customer_name: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct ProductSummaryRow {
    pub product_id: String,
    pub product_name: String,
    pub total_qty: i64,
    pub total_returned: i64,
    pub net_qty: i64,
    pub unit_price: i64,
    pub unit_cost: i64,
    pub total_amount: i64,
    pub net_amount: i64,
    pub profit: i64,
}

#[derive(Debug, Serialize)]
pub struct ReturnOut {
    pub id: String,
    pub return_number: String,
    pub sale_id: Option<String>,
    pub sale_number: String,
    pub return_type: String,
    pub total: i64,
    pub refund_method: String,
    pub status: String,
    pub reason: Option<String>,
    pub items: Vec<ReturnItemOut>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct ReturnItemOut {
    pub id: String,
    pub product_id: String,
    pub product_name: String,
    pub batch_id: String,
    pub quantity: i64,
    pub unit_price: i64,
    pub subtotal: i64,
}

#[derive(Debug, Deserialize)]
pub struct ReturnItemInput {
    pub sale_item_id: String,
    pub product_id: String,
    pub batch_id: String,
    pub quantity: i64,
    pub unit_price: i64,
}

#[derive(Debug, Serialize)]
pub struct SessionReturnRow {
    pub id: String,
    pub return_number: String,
    pub sale_number: String,
    pub return_type: String,
    pub total: i64,
    pub refund_method: String,
    pub created_at: String,
}

fn read_session(row: &rusqlite::Row) -> rusqlite::Result<PosSession> {
    Ok(PosSession {
        id: row.get(0)?,
        tenant_id: row.get(1)?,
        branch_id: row.get(2)?,
        cashier_id: row.get(3)?,
        account_id: row.get(4)?,
        status: row.get(5)?,
        opening_cash: row.get(6)?,
        expected_cash: row.get(7)?,
        actual_cash: row.get(8)?,
        cash_difference: row.get(9)?,
        total_sales: row.get(10)?,
        total_returns: row.get(11)?,
        sales_count: row.get(12)?,
        opened_at: row.get(13)?,
        closed_at: row.get(14)?,
        notes: row.get(15)?,
    })
}

const SESSION_COLS: &str = "id, tenant_id, branch_id, cashier_id, account_id, status, opening_cash, expected_cash, actual_cash, cash_difference, total_sales, total_returns, sales_count, opened_at, closed_at, notes";

fn resolve_session_cash_account_id(conn: &Connection, session_id: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT account_id FROM pos_sessions WHERE id = ?1",
        params![session_id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

fn resolve_bank_payment_info(
    conn: &Connection,
    tenant_id: &str,
    payment_method_id: &str,
) -> Result<(String, Option<String>), String> {
    let (account_id, name): (Option<String>, Option<String>) = conn.query_row(
        "SELECT account_id, name
         FROM payment_methods
         WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL AND is_active = 1",
        params![payment_method_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "طريقة الدفع البنكية المختارة غير موجودة".to_string())?;

    account_id
        .filter(|value| !value.is_empty())
        .map(|value| (value, name))
        .ok_or_else(|| "طريقة الدفع البنكية لا تملك حساباً محدداً — يُرجى تعيين حساب بنكي لطريقة الدفع هذه".to_string())
}

fn load_sale_items(conn: &Connection, sale_id: &str) -> Result<Vec<SaleItemOut>, String> {
    let mut stmt = conn.prepare(
        "SELECT si.id, si.product_id, si.batch_id, p.trade_name, b.batch_number, b.expiry_date,
                si.quantity, si.unit_price, si.unit_cost, si.subtotal
         FROM sale_items si
         JOIN products p ON si.product_id = p.id
         JOIN batches b ON si.batch_id = b.id
         WHERE si.sale_id = ?1",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![sale_id], |row| {
        Ok(SaleItemOut {
            id: row.get(0)?,
            product_id: row.get(1)?,
            batch_id: row.get(2)?,
            product_name: row.get(3)?,
            batch_number: row.get(4)?,
            expiry_date: row.get(5)?,
            quantity: row.get(6)?,
            unit_price: row.get(7)?,
            unit_cost: row.get(8)?,
            subtotal: row.get(9)?,
        })
    }).map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|row| row.ok()).collect())
}

fn load_sale_payments(conn: &Connection, sale_id: &str) -> Result<Vec<SalePaymentOut>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, payment_method, payment_method_id, payment_method_name, amount
         FROM sale_payments
         WHERE sale_id = ?1
         ORDER BY created_at ASC, id ASC",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![sale_id], |row| {
        Ok(SalePaymentOut {
            id: row.get(0)?,
            payment_method: row.get(1)?,
            payment_method_id: row.get(2)?,
            payment_method_name: row.get(3)?,
            amount: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|row| row.ok()).collect())
}

fn build_sale_out(conn: &Connection, tenant_id: &str, sale_id: &str) -> Result<SaleOut, String> {
    let sale = conn.query_row(
        "SELECT s.sale_number, s.sale_type, s.session_id, s.cashier_id, s.customer_id,
                COALESCE(c.name_ar, c.name), s.subtotal, s.discount, s.tax_amount, s.total,
                s.amount_paid, s.change_amount, s.payment_method, s.payment_method_name,
                s.payment_status, s.notes, s.created_at
         FROM sales s
         LEFT JOIN customers c ON s.customer_id = c.id
         WHERE s.id = ?1 AND s.tenant_id = ?2 AND s.deleted_at IS NULL",
        params![sale_id, tenant_id],
        |row| {
            Ok(SaleOut {
                id: sale_id.to_string(),
                sale_number: row.get(0)?,
                sale_type: row.get(1)?,
                session_id: row.get(2)?,
                cashier_id: row.get(3)?,
                customer_id: row.get(4)?,
                customer_name: row.get(5)?,
                subtotal: row.get(6)?,
                discount: row.get(7)?,
                tax_amount: row.get(8)?,
                total: row.get(9)?,
                amount_paid: row.get(10)?,
                change_amount: row.get(11)?,
                payment_method: row.get(12)?,
                payment_method_name: row.get(13)?,
                payment_status: row.get(14)?,
                notes: row.get(15)?,
                split_payments: Vec::new(),
                items: Vec::new(),
                created_at: row.get(16)?,
            })
        },
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    Ok(SaleOut {
        split_payments: load_sale_payments(conn, sale_id)?,
        items: load_sale_items(conn, sale_id)?,
        ..sale
    })
}

#[tauri::command]
pub fn get_active_session(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    user_id: String,
) -> Result<Option<PosSession>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let sql = format!("SELECT {} FROM pos_sessions WHERE tenant_id = ?1 AND branch_id = ?2 AND cashier_id = ?3 AND status = 'open' LIMIT 1", SESSION_COLS);
    let result = conn.query_row(&sql, params![tenant_id, branch_id, user_id], read_session);
    match result {
        Ok(s) => Ok(Some(s)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn open_session(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    user_id: String,
    account_id: String,
    opening_cash: i64,
) -> Result<PosSession, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_POS)?;

    // Check no open session
    let has_open: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM pos_sessions WHERE tenant_id = ?1 AND cashier_id = ?2 AND status = 'open')",
        params![tenant_id, user_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    if has_open {
        return Err("يوجد جلسة مفتوحة بالفعل لهذا المستخدم".into());
    }

    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO pos_sessions (id, tenant_id, branch_id, cashier_id, account_id, opening_cash, expected_cash, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'open')",
        params![id, tenant_id, branch_id, user_id, account_id, opening_cash, opening_cash],
    ).map_err(|e| format!("فشل فتح الجلسة: {}", e))?;

    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "pos_session_opened") {
        log::warn!("cloud sync enqueue failed after open_session: {}", e);
    }

    let sql = format!("SELECT {} FROM pos_sessions WHERE id = ?1", SESSION_COLS);
    conn.query_row(&sql, params![id], read_session).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_products_pos(
    db: State<'_, Database>,
    tenant_id: String,
    _branch_id: String,
    query: String,
) -> Result<Vec<PosProduct>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let like = format!("%{}%", query);
    let mut stmt = conn.prepare(
        "SELECT DISTINCT p.id, p.trade_name, p.trade_name_ar, p.barcode, p.sale_price, p.unit, p.is_prescription
         FROM products p
         WHERE p.tenant_id = ?1 AND p.deleted_at IS NULL AND p.is_active = 1
           AND (p.barcode = ?2 OR p.trade_name LIKE ?3 OR p.trade_name_ar LIKE ?3 OR p.generic_name LIKE ?3)
         ORDER BY p.trade_name LIMIT 20"
    ).map_err(|e| e.to_string())?;

    let products: Vec<(String, String, Option<String>, Option<String>, i64, String, bool)> = stmt.query_map(
        params![tenant_id, query, like],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?))
    ).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
    drop(stmt);

    let mut result = Vec::new();
    for (pid, name, name_ar, barcode, price, unit, is_rx) in products {
        let mut bstmt = conn.prepare(
            "SELECT b.id, b.batch_number, b.expiry_date, b.quantity_current, b.unit_cost, sl.name
             FROM batches b
             LEFT JOIN storage_locations sl ON b.location_id = sl.id
             WHERE b.product_id = ?1 AND b.status = 'active' AND b.quantity_current > 0 AND b.deleted_at IS NULL
             ORDER BY b.expiry_date ASC"
        ).map_err(|e| e.to_string())?;

        let batches: Vec<PosBatch> = bstmt.query_map(params![pid], |row| {
            Ok(PosBatch {
                batch_id: row.get(0)?,
                batch_number: row.get(1)?,
                expiry_date: row.get(2)?,
                quantity_current: row.get(3)?,
                unit_cost: row.get(4)?,
                location_name: row.get(5)?,
            })
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

        result.push(PosProduct {
            product_id: pid,
            product_name: name,
            product_name_ar: name_ar,
            barcode,
            sale_price: price,
            unit,
            is_prescription: is_rx,
            batches,
        });
    }

    Ok(result)
}

#[tauri::command]
pub fn get_pos_substitutes(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    product_id: String,
) -> Result<Vec<PosProduct>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Get product IDs from both directions of the symmetric relationship
    let sub_ids: Vec<String> = {
        let mut stmt = conn.prepare(
            "SELECT substitute_id FROM product_substitutes WHERE tenant_id = ?1 AND product_id = ?2
             UNION
             SELECT product_id FROM product_substitutes WHERE tenant_id = ?1 AND substitute_id = ?2"
        ).map_err(|e| e.to_string())?;
        let ids: Vec<String> = stmt.query_map(params![tenant_id, product_id], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        ids
    };

    if sub_ids.is_empty() {
        return Ok(vec![]);
    }

    let mut result = Vec::new();
    for sub_id in sub_ids {
        // Get product info
        let row = conn.query_row(
            "SELECT p.id, p.trade_name, p.trade_name_ar, p.barcode, p.sale_price, p.unit, p.is_prescription
             FROM products p
             WHERE p.id = ?1 AND p.tenant_id = ?2 AND p.deleted_at IS NULL AND p.is_active = 1",
            params![sub_id, tenant_id],
            |row| Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, bool>(6)?,
            )),
        );
        let (pid, name, name_ar, barcode, price, unit, is_rx) = match row {
            Ok(r) => r,
            Err(_) => continue,
        };

        let mut bstmt = conn.prepare(
            "SELECT b.id, b.batch_number, b.expiry_date, b.quantity_current, b.unit_cost, sl.name
             FROM batches b
             LEFT JOIN storage_locations sl ON b.location_id = sl.id
             WHERE b.product_id = ?1 AND b.status = 'active' AND b.quantity_current > 0 AND b.deleted_at IS NULL
             ORDER BY b.expiry_date ASC"
        ).map_err(|e| e.to_string())?;

        let batches: Vec<PosBatch> = bstmt.query_map(params![pid], |row| {
            Ok(PosBatch {
                batch_id: row.get(0)?,
                batch_number: row.get(1)?,
                expiry_date: row.get(2)?,
                quantity_current: row.get(3)?,
                unit_cost: row.get(4)?,
                location_name: row.get(5)?,
            })
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

        let _ = branch_id.as_str(); // reserved for future branch scoping
        result.push(PosProduct {
            product_id: pid,
            product_name: name,
            product_name_ar: name_ar,
            barcode,
            sale_price: price,
            unit,
            is_prescription: is_rx,
            batches,
        });
    }

    Ok(result)
}

fn next_sequence(conn: &rusqlite::Connection, tenant_id: &str, counter_name: &str) -> Result<String, String> {
    conn.execute(
        "UPDATE sequence_counters SET last_value = last_value + 1 WHERE tenant_id = ?1 AND counter_name = ?2",
        params![tenant_id, counter_name],
    ).map_err(|e| e.to_string())?;
    let (prefix, value): (Option<String>, i64) = conn.query_row(
        "SELECT prefix, last_value FROM sequence_counters WHERE tenant_id = ?1 AND counter_name = ?2",
        params![tenant_id, counter_name],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| e.to_string())?;
    Ok(format!("{}{:05}", prefix.unwrap_or_default(), value))
}

/// For each item: if `batch_id` is provided, return it as-is.
/// Otherwise, auto-select the earliest-expiring active batch(es) for that product (FEFO policy),
/// splitting across batches if a single batch lacks sufficient stock.
fn resolve_fefo_items(
    conn: &rusqlite::Connection,
    tenant_id: &str,
    items: &[SaleItemInput],
    today: &str,
) -> Result<Vec<ResolvedSaleItem>, String> {
    let mut resolved: Vec<ResolvedSaleItem> = Vec::new();

    for item in items {
        if let Some(ref bid) = item.batch_id {
            if !bid.is_empty() {
                // Explicit batch supplied — use as-is
                resolved.push(ResolvedSaleItem {
                    product_id: item.product_id.clone(),
                    batch_id: bid.clone(),
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    unit_cost: item.unit_cost,
                });
                continue;
            }
        }

        // FEFO: pick batches ordered by earliest non-expired expiry first, then created_at
        let mut stmt = conn.prepare(
            "SELECT id, quantity_current, unit_cost
             FROM batches
             WHERE tenant_id = ?1 AND product_id = ?2
               AND status = 'active' AND deleted_at IS NULL
               AND quantity_current > 0
               AND (expiry_date IS NULL OR expiry_date >= ?3)
             ORDER BY expiry_date ASC NULLS LAST, created_at ASC",
        ).map_err(|e| e.to_string())?;

        let batches: Vec<(String, i64, i64)> = stmt
            .query_map(params![tenant_id, item.product_id, today], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let total_available: i64 = batches.iter().map(|(_, q, _)| q).sum();
        if total_available < item.quantity {
            let pname: String = conn.query_row(
                "SELECT trade_name FROM products WHERE id = ?1",
                params![item.product_id],
                |row| row.get(0),
            ).unwrap_or_else(|_| item.product_id.clone());
            return Err(format!("كمية غير كافية في المخزون: {}", pname));
        }

        let mut remaining = item.quantity;
        for (batch_id, qty_available, unit_cost) in batches {
            if remaining <= 0 { break; }
            let take = remaining.min(qty_available);
            resolved.push(ResolvedSaleItem {
                product_id: item.product_id.clone(),
                batch_id,
                quantity: take,
                unit_price: item.unit_price,
                unit_cost,
            });
            remaining -= take;
        }
    }

    Ok(resolved)
}

#[tauri::command]
pub fn create_sale(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    session_id: String,
    cashier_id: String,
    payment_method: String,
    payment_method_id: Option<String>,
    amount_paid: i64,
    items: Vec<SaleItemInput>,
    customer_id: Option<String>,
    discount: Option<i64>,
    tax_percent: Option<i64>,
    pharmacist_override_by: Option<String>,
    notes: Option<String>,
    split_payments: Option<Vec<SalePaymentInput>>,
) -> Result<SaleOut, String> {
    if items.is_empty() {
        return Err("يجب إضافة صنف واحد على الأقل".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_POS)?;
    guard::require_permission(&conn, &cashier_id, "pos")?;

    // Validate session open
    let session_status: String = conn.query_row(
        "SELECT status FROM pos_sessions WHERE id = ?1 AND tenant_id = ?2",
        params![session_id, tenant_id],
        |row| row.get(0),
    ).map_err(|_| "الجلسة غير موجودة".to_string())?;
    if session_status != "open" {
        return Err("الجلسة مغلقة".into());
    }

    if !matches!(payment_method.as_str(), "cash" | "bank_transfer" | "credit" | "partial") {
        return Err("طريقة الدفع غير صالحة".into());
    }

    let split_payments = split_payments.unwrap_or_default();
    if split_payments.iter().any(|payment| {
        !matches!(payment.payment_method.as_str(), "cash" | "bank_transfer") || payment.amount <= 0
    }) {
        return Err("تفاصيل الدفع المقسّم غير صالحة".into());
    }

    // Resolve batch IDs: explicit batch_id used as-is; absent = FEFO auto-select
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let resolved = resolve_fefo_items(&conn, &tenant_id, &items, &today)?;

    // Prescription gate: any Rx item requires pharmacist_override_by
    for item in &resolved {
        let is_rx: bool = conn.query_row(
            "SELECT is_prescription FROM products WHERE id = ?1 AND tenant_id = ?2",
            params![item.product_id, tenant_id],
            |row| row.get(0),
        ).unwrap_or(false);
        if is_rx {
            match &pharmacist_override_by {
                Some(id) if !id.trim().is_empty() => {}
                _ => {
                    let pname: String = conn.query_row(
                        "SELECT trade_name FROM products WHERE id = ?1",
                        params![item.product_id],
                        |row| row.get(0),
                    ).unwrap_or_else(|_| item.product_id.clone());
                    return Err(format!("يتطلب وصفة طبية: {} — يجب تحديد الصيدلاني المسؤول", pname));
                }
            }
        }
    }

    // Validate resolved batches (safety + stock sufficiency)
    for item in &resolved {
        let (qty, expiry_date, batch_status): (i64, Option<String>, String) = conn.query_row(
            "SELECT quantity_current, expiry_date, status FROM batches WHERE id = ?1 AND tenant_id = ?2",
            params![item.batch_id, tenant_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).map_err(|_| "الدفعة غير موجودة".to_string())?;

        if batch_status == "disposed" {
            let pname: String = conn.query_row(
                "SELECT trade_name FROM products WHERE id = ?1",
                params![item.product_id],
                |row| row.get(0),
            ).unwrap_or_else(|_| item.product_id.clone());
            return Err(format!("الدفعة محجوبة أو تالفة ولا يمكن بيعها: {}", pname));
        }

        if let Some(ref exp) = expiry_date {
            if exp.as_str() < today.as_str() {
                let pname: String = conn.query_row(
                    "SELECT trade_name FROM products WHERE id = ?1",
                    params![item.product_id],
                    |row| row.get(0),
                ).unwrap_or_else(|_| item.product_id.clone());
                return Err(format!("الدفعة منتهية الصلاحية: {}", pname));
            }
        }

        if qty < item.quantity {
            let pname: String = conn.query_row(
                "SELECT trade_name FROM products WHERE id = ?1",
                params![item.product_id],
                |row| row.get(0),
            ).unwrap_or_else(|_| item.product_id.clone());
            return Err(format!("كمية غير كافية: {}", pname));
        }
    }

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<String, String> {
        let sale_number = next_sequence(&conn, &tenant_id, "sale_number")?;
        let sale_id = Uuid::new_v4().to_string();

        let subtotal: i64 = resolved.iter().map(|i| i.quantity * i.unit_price).sum();
        let disc_amount = discount.unwrap_or(0).max(0);
        let after_discount = (subtotal - disc_amount).max(0);
        let tax_amount = tax_percent.map(|tp| after_discount * tp / 10000).unwrap_or(0);
        let total = after_discount + tax_amount;
        let split_paid_total: i64 = split_payments.iter().map(|payment| payment.amount).sum();
        let effective_amount_paid = if split_payments.is_empty() {
            amount_paid
        } else {
            if amount_paid != split_paid_total {
                return Err("المبلغ المدفوع لا يطابق تفاصيل الدفع المقسّم".into());
            }
            split_paid_total
        };

        if !split_payments.is_empty() && effective_amount_paid > total {
            return Err("مجموع الدفعات المقسمة لا يمكن أن يتجاوز الإجمالي".into());
        }

        if split_payments.is_empty()
            && matches!(payment_method.as_str(), "cash" | "bank_transfer")
            && effective_amount_paid < total
        {
            return Err("المبلغ المدفوع أقل من الإجمالي".into());
        }

        let outstanding = (total - effective_amount_paid).max(0);
        let change_amount = if split_payments.is_empty() && payment_method == "cash" {
            (effective_amount_paid - total).max(0)
        } else {
            0
        };
        let stored_payment_method = if split_payments.is_empty() {
            payment_method.clone()
        } else {
            "partial".to_string()
        };
        let payment_status = if outstanding > 0 {
            if effective_amount_paid == 0 { "credit" } else { "partial" }
        } else {
            "paid"
        };

        let payment_method_name: Option<String> = if split_payments.is_empty() && payment_method == "bank_transfer" {
            if let Some(ref pmid) = payment_method_id {
                Some(resolve_bank_payment_info(&conn, &tenant_id, pmid)?.1.unwrap_or_else(|| "Bank".to_string()))
            } else {
                None
            }
        } else {
            None
        };

        conn.execute(
            "INSERT INTO sales (id, tenant_id, branch_id, sale_number, sale_type, session_id, cashier_id,
                customer_id, subtotal, discount, tax_amount, total, amount_paid, change_amount,
                payment_method, payment_method_id, payment_method_name, payment_status, notes)
             VALUES (?1, ?2, ?3, ?4, 'pos', ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
            params![sale_id, tenant_id, branch_id, sale_number, session_id, cashier_id,
                    customer_id, subtotal, disc_amount, tax_amount, total, effective_amount_paid, change_amount,
                    stored_payment_method, payment_method_id, payment_method_name, payment_status, notes],
        ).map_err(|e| format!("فشل إنشاء عملية البيع: {}", e))?;

        for item in &resolved {
            let item_id = Uuid::new_v4().to_string();
            let item_subtotal = item.quantity * item.unit_price;

            conn.execute(
                "INSERT INTO sale_items (id, tenant_id, sale_id, product_id, batch_id, quantity, unit_price, unit_cost, subtotal)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![item_id, tenant_id, sale_id, item.product_id, item.batch_id,
                        item.quantity, item.unit_price, item.unit_cost, item_subtotal],
            ).map_err(|e| format!("فشل إضافة صنف البيع: {}", e))?;

            // Get current batch qty
            let qty_before: i64 = conn.query_row(
                "SELECT quantity_current FROM batches WHERE id = ?1",
                params![item.batch_id],
                |row| row.get(0),
            ).map_err(|e| e.to_string())?;

            let qty_after = qty_before - item.quantity;

            conn.execute(
                "UPDATE batches SET quantity_current = ?2, status = CASE WHEN ?2 = 0 THEN 'depleted' ELSE status END,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE id = ?1",
                params![item.batch_id, qty_after],
            ).map_err(|e| e.to_string())?;

            let mv_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO stock_movements (id, tenant_id, branch_id, product_id, batch_id,
                        movement_type, quantity_change, quantity_before, quantity_after,
                        reference_type, reference_id, created_by)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'sell', ?6, ?7, ?8, 'sale', ?9, ?10)",
                params![mv_id, tenant_id, branch_id, item.product_id, item.batch_id,
                        -item.quantity, qty_before, qty_after, sale_id, cashier_id],
            ).map_err(|e| e.to_string())?;
        }

        // Credit / partial sale: update customer balance
        if outstanding > 0 {
            if let Some(ref cid) = customer_id {
                let (cust_balance, cust_limit): (i64, i64) = conn.query_row(
                    "SELECT current_balance, credit_limit FROM customers WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL AND is_active = 1",
                    params![cid, tenant_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                ).map_err(|_| "العميل غير موجود أو غير نشط".to_string())?;

                if cust_limit > 0 && cust_balance + outstanding > cust_limit {
                    return Err(format!("تجاوز حد الائتمان المسموح به: الرصيد {} + المبلغ {} > الحد {}", cust_balance, outstanding, cust_limit));
                }

                conn.execute(
                    "UPDATE customers SET current_balance = current_balance + ?2,
                            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                     WHERE id = ?1",
                    params![cid, outstanding],
                ).map_err(|e| e.to_string())?;
            } else {
                return Err("يجب اختيار عميل للبيع بالآجل أو الدفع الجزئي".into());
            }
        }

        let payments_to_record = if split_payments.is_empty() {
            let collected_amount = effective_amount_paid.min(total);
            if collected_amount > 0 && matches!(payment_method.as_str(), "cash" | "bank_transfer") {
                vec![SalePaymentInput {
                    payment_method: payment_method.clone(),
                    payment_method_id: payment_method_id.clone(),
                    amount: collected_amount,
                }]
            } else {
                Vec::new()
            }
        } else {
            split_payments.clone()
        };

        let mut cash_collected = 0_i64;
        for payment in payments_to_record {
            let (account_id, payment_name) = match payment.payment_method.as_str() {
                "cash" => (resolve_session_cash_account_id(&conn, &session_id)?, None),
                "bank_transfer" => {
                    let pmid = payment.payment_method_id.as_deref()
                        .filter(|value| !value.is_empty())
                        .ok_or_else(|| "يجب اختيار حساب بنكي لعمليات التحويل البنكي".to_string())?;
                    resolve_bank_payment_info(&conn, &tenant_id, pmid)?
                }
                _ => return Err("طريقة دفع غير مدعومة ضمن الدفع المقسّم".into()),
            };

            let pay_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO sale_payments (id, tenant_id, sale_id, payment_method, payment_method_id, payment_method_name, amount)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![pay_id, tenant_id, sale_id, payment.payment_method, payment.payment_method_id, payment_name, payment.amount],
            ).map_err(|e| e.to_string())?;

            let bal_before: i64 = conn.query_row(
                "SELECT current_balance FROM accounts WHERE id = ?1",
                params![account_id],
                |row| row.get(0),
            ).map_err(|e| e.to_string())?;

            let bal_after = bal_before + payment.amount;
            let tx_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO account_transactions (id, tenant_id, account_id, transaction_type, direction,
                        amount, balance_before, balance_after, reference_type, reference_id, created_by)
                 VALUES (?1, ?2, ?3, 'sale_income', 'in', ?4, ?5, ?6, 'sale', ?7, ?8)",
                params![tx_id, tenant_id, account_id, payment.amount, bal_before, bal_after, sale_id, cashier_id],
            ).map_err(|e| e.to_string())?;

            conn.execute(
                "UPDATE accounts SET current_balance = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
                params![account_id, bal_after],
            ).map_err(|e| e.to_string())?;

            if payment.payment_method == "cash" {
                cash_collected += payment.amount;
            }
        }

        // Update session stats
        conn.execute(
            "UPDATE pos_sessions SET total_sales = total_sales + ?2, sales_count = sales_count + 1,
                    expected_cash = expected_cash + ?3,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1",
            params![session_id, total, cash_collected],
        ).map_err(|e| e.to_string())?;

        Ok(sale_id)
    })();

    match result {
        Ok(sale_id) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            if let Err(e) = audit::log_action(&conn, &tenant_id, &cashier_id, "create", "sale", &sale_id, None) {
                log::warn!("audit log failed after create_sale: {}", e);
            }
            if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "sale_created") {
                log::warn!("cloud sync enqueue failed after create_sale: {}", e);
            }
            build_sale_out(&conn, &tenant_id, &sale_id)
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn close_session(
    db: State<'_, Database>,
    tenant_id: String,
    session_id: String,
    actual_cash: i64,
    notes: Option<String>,
) -> Result<PosSession, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let (status, expected): (String, i64) = conn.query_row(
        "SELECT status, expected_cash FROM pos_sessions WHERE id = ?1 AND tenant_id = ?2",
        params![session_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "الجلسة غير موجودة".to_string())?;

    if status != "open" {
        return Err("الجلسة مغلقة بالفعل".into());
    }

    let difference = actual_cash - expected;

    conn.execute(
        "UPDATE pos_sessions SET status = 'closed', actual_cash = ?2, cash_difference = ?3,
                closed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), notes = ?4,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1",
        params![session_id, actual_cash, difference, notes],
    ).map_err(|e| e.to_string())?;

    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "pos_session_closed") {
        log::warn!("cloud sync enqueue failed after close_session: {}", e);
    }

    let sql = format!("SELECT {} FROM pos_sessions WHERE id = ?1", SESSION_COLS);
    conn.query_row(&sql, params![session_id], read_session).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_session_history(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    cashier_id: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
) -> Result<Vec<SessionRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT ps.id, u.full_name, ps.opened_at, ps.closed_at, ps.sales_count,
                ps.total_sales,
                COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.session_id = ps.id AND r.deleted_at IS NULL), 0) as total_returns,
                ps.opening_cash, ps.actual_cash, ps.cash_difference, ps.status
         FROM pos_sessions ps
         JOIN users u ON ps.cashier_id = u.id
         WHERE ps.tenant_id = ?1 AND ps.branch_id = ?2"
    );
    let mut pv: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(tenant_id), Box::new(branch_id)];
    let mut idx = 3;

    if let Some(ref cid) = cashier_id {
        if !cid.is_empty() {
            sql.push_str(&format!(" AND ps.cashier_id = ?{}", idx));
            pv.push(Box::new(cid.clone()));
            idx += 1;
        }
    }
    if let Some(ref df) = date_from {
        if !df.is_empty() {
            sql.push_str(&format!(" AND ps.opened_at >= ?{}", idx));
            pv.push(Box::new(df.clone()));
            idx += 1;
        }
    }
    if let Some(ref dt) = date_to {
        if !dt.is_empty() {
            sql.push_str(&format!(" AND ps.opened_at <= ?{}", idx));
            pv.push(Box::new(dt.clone()));
            let _ = idx;
        }
    }
    sql.push_str(" ORDER BY ps.opened_at DESC");

    let pr: Vec<&dyn rusqlite::types::ToSql> = pv.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(pr.as_slice(), |row| {
        Ok(SessionRow {
            id: row.get(0)?, cashier_name: row.get(1)?, opened_at: row.get(2)?,
            closed_at: row.get(3)?, sales_count: row.get(4)?, total_sales: row.get(5)?,
            total_returns: row.get(6)?,
            opening_cash: row.get(7)?, actual_cash: row.get(8)?, cash_difference: row.get(9)?,
            status: row.get(10)?
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(rows)
}

#[tauri::command]
pub fn get_accounts(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
) -> Result<Vec<AccountInfo>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, tenant_id, branch_id, name, name_ar, account_type, current_balance, is_default, is_active
         FROM accounts WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL AND is_active = 1
         ORDER BY is_default DESC, name ASC"
    ).map_err(|e| e.to_string())?;

    let accts = stmt.query_map(params![tenant_id, branch_id], |row| {
        Ok(AccountInfo {
            id: row.get(0)?, tenant_id: row.get(1)?, branch_id: row.get(2)?,
            name: row.get(3)?, name_ar: row.get(4)?, account_type: row.get(5)?,
            current_balance: row.get(6)?, is_default: row.get(7)?, is_active: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(accts)
}

// ====== Session detail commands ======

#[tauri::command]
pub fn get_session_sales(
    db: State<'_, Database>,
    tenant_id: String,
    session_id: String,
) -> Result<Vec<SessionSaleRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT s.id, s.sale_number, s.total, s.payment_method,
                (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) as items_count,
                c.name_ar, c.name,
                s.created_at
         FROM sales s
         LEFT JOIN customers c ON s.customer_id = c.id
         WHERE s.tenant_id = ?1 AND s.session_id = ?2 AND s.deleted_at IS NULL
         ORDER BY s.created_at ASC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![tenant_id, session_id], |row| {
        let name_ar: Option<String> = row.get(5)?;
        let name_en: Option<String> = row.get(6)?;
        Ok(SessionSaleRow {
            id: row.get(0)?,
            sale_number: row.get(1)?,
            total: row.get(2)?,
            payment_method: row.get(3)?,
            items_count: row.get(4)?,
            customer_name: name_ar.or(name_en),
            created_at: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(rows)
}

#[tauri::command]
pub fn get_session_product_summary(
    db: State<'_, Database>,
    tenant_id: String,
    session_id: String,
) -> Result<Vec<ProductSummaryRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT si.product_id, p.trade_name, SUM(si.quantity) as total_qty,
                COALESCE((SELECT SUM(ri.quantity) FROM return_items ri
                          JOIN returns r ON ri.return_id = r.id
                          WHERE ri.product_id = si.product_id
                          AND r.session_id = ?2), 0) as total_returned,
                si.unit_price, COALESCE(AVG(si.unit_cost), 0) as avg_unit_cost,
                SUM(si.subtotal) as total_amount
         FROM sale_items si
         JOIN sales s ON si.sale_id = s.id AND s.deleted_at IS NULL
         JOIN products p ON si.product_id = p.id
         WHERE s.tenant_id = ?1 AND s.session_id = ?2
         GROUP BY si.product_id, si.unit_price
         ORDER BY p.trade_name"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![tenant_id, session_id], |row| {
        let total_qty: i64 = row.get(2)?;
        let total_returned: i64 = row.get(3)?;
        let unit_price: i64 = row.get(4)?;
        let unit_cost: i64 = row.get(5)?;
        let net_qty = total_qty - total_returned;
        let net_amount = net_qty * unit_price;
        Ok(ProductSummaryRow {
            product_id: row.get(0)?,
            product_name: row.get(1)?,
            total_qty,
            total_returned,
            net_qty,
            unit_price,
            unit_cost,
            total_amount: row.get(6)?,
            net_amount,
            profit: net_qty * (unit_price - unit_cost),
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(rows)
}

#[tauri::command]
pub fn get_sale_detail(
    db: State<'_, Database>,
    tenant_id: String,
    sale_id: String,
) -> Result<SaleOut, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    build_sale_out(&conn, &tenant_id, &sale_id)
}

// ====== Void Sale ======

#[tauri::command]
pub fn void_sale(
    db: State<'_, Database>,
    tenant_id: String,
    sale_id: String,
    cashier_id: String,
    void_reason: Option<String>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_POS)?;
    guard::require_permission(&conn, &cashier_id, "pos")?;

    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();

    let (session_id, sale_date, payment_method, payment_method_id, total, customer_id, payment_status, branch_id):
        (Option<String>, String, String, Option<String>, i64, Option<String>, String, String) = conn.query_row(
        "SELECT session_id, substr(created_at,1,10), payment_method, payment_method_id, total,
                customer_id, payment_status, branch_id
         FROM sales WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![sale_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?,
                   row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?)),
    ).map_err(|_| "عملية البيع غير موجودة".to_string())?;

    // Guard: can only void today's sales
    if sale_date != today {
        return Err("لا يمكن إلغاء عملية بيع من يوم سابق".into());
    }

    // Guard: session must still be open
    if let Some(ref sid) = session_id {
        let sess_status: String = conn.query_row(
            "SELECT status FROM pos_sessions WHERE id = ?1",
            params![sid],
            |row| row.get(0),
        ).map_err(|_| "الجلسة غير موجودة".to_string())?;
        if sess_status != "open" {
            return Err("لا يمكن إلغاء بيع بعد إغلاق الجلسة".into());
        }
    }

    // Fetch sale items for stock reversal: (batch_id, product_id, quantity)
    let mut istmt = conn.prepare(
        "SELECT batch_id, product_id, quantity FROM sale_items WHERE sale_id = ?1"
    ).map_err(|e| e.to_string())?;
    let void_items: Vec<(String, String, i64)> = istmt.query_map(params![sale_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        // 1. Soft-delete the sale
        conn.execute(
            "UPDATE sales SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), void_reason = ?2,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1",
            params![sale_id, void_reason],
        ).map_err(|e| e.to_string())?;

        // 2. Reverse stock for each item
        for (batch_id, product_id, quantity) in &void_items {
            let qty_before: i64 = conn.query_row(
                "SELECT quantity_current FROM batches WHERE id = ?1",
                params![batch_id],
                |row| row.get(0),
            ).map_err(|e| e.to_string())?;
            let qty_after = qty_before + quantity;

            conn.execute(
                "UPDATE batches SET quantity_current = ?2,
                         status = CASE WHEN status = 'depleted' THEN 'active' ELSE status END,
                         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                  WHERE id = ?1",
                params![batch_id, qty_after],
            ).map_err(|e| e.to_string())?;

            let mv_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO stock_movements (id, tenant_id, branch_id, product_id, batch_id,
                         movement_type, quantity_change, quantity_before, quantity_after,
                         reference_type, reference_id, created_by)
                  VALUES (?1, ?2, ?3, ?4, ?5, 'void_sale', ?6, ?7, ?8, 'sale_void', ?9, ?10)",
                params![mv_id, tenant_id, branch_id, product_id, batch_id,
                         quantity, qty_before, qty_after, sale_id, cashier_id],
            ).map_err(|e| e.to_string())?;
        }

        // 3. Reverse account transactions from the stored payment breakdown.
        let mut reversed_cash = 0_i64;
        let mut reversal_payments = load_sale_payments(&conn, &sale_id)?;
        if reversal_payments.is_empty() && (payment_method == "cash" || payment_method == "bank_transfer") {
            reversal_payments.push(SalePaymentOut {
                id: String::new(),
                payment_method: payment_method.clone(),
                payment_method_id: payment_method_id.clone(),
                payment_method_name: None,
                amount: total,
            });
        }

        for payment in &reversal_payments {
            let account_id = match payment.payment_method.as_str() {
                "cash" => {
                    reversed_cash += payment.amount;
                    session_id
                        .as_deref()
                        .map(|sid| resolve_session_cash_account_id(&conn, sid))
                        .transpose()?
                }
                "bank_transfer" => payment
                    .payment_method_id
                    .as_deref()
                    .map(|pmid| resolve_bank_payment_info(&conn, &tenant_id, pmid).map(|value| value.0))
                    .transpose()?,
                _ => None,
            };

            if let Some(acct_id) = account_id {
                let bal_before: i64 = conn.query_row(
                    "SELECT current_balance FROM accounts WHERE id = ?1",
                    params![acct_id],
                    |row| row.get(0),
                ).map_err(|e| e.to_string())?;
                let bal_after = bal_before - payment.amount;

                conn.execute(
                    "UPDATE accounts SET current_balance = ?2,
                             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                      WHERE id = ?1",
                    params![acct_id, bal_after],
                ).map_err(|e| e.to_string())?;

                let tx_id = Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO account_transactions (id, tenant_id, account_id, transaction_type, direction,
                             amount, balance_before, balance_after, reference_type, reference_id, created_by)
                      VALUES (?1, ?2, ?3, 'sale_void', 'out', ?4, ?5, ?6, 'sale_void', ?7, ?8)",
                    params![tx_id, tenant_id, acct_id, payment.amount, bal_before, bal_after, sale_id, cashier_id],
                ).map_err(|e| e.to_string())?;
            }
        }

        // 4. Reverse customer credit balance if any amount was left on credit.
        let credited_amount = total - reversal_payments.iter().map(|payment| payment.amount).sum::<i64>();
        if (payment_status == "credit" || payment_status == "partial") && credited_amount > 0 {
            if let Some(ref cid) = customer_id {
                conn.execute(
                    "UPDATE customers SET current_balance = current_balance - ?2,
                             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                      WHERE id = ?1",
                    params![cid, credited_amount],
                ).map_err(|e| e.to_string())?;
            }
        }

        // 5. Update session totals
        if let Some(ref sid) = session_id {
            conn.execute(
                "UPDATE pos_sessions SET total_sales = total_sales - ?2, sales_count = sales_count - 1,
                         expected_cash = expected_cash - ?3,
                         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                  WHERE id = ?1",
                params![sid, total, reversed_cash],
            ).map_err(|e| e.to_string())?;
        }

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            audit::log_action(&conn, &tenant_id, &cashier_id, "void", "sale", &sale_id, void_reason.as_deref())?;
            if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "sale_voided") {
                log::warn!("cloud sync enqueue failed after void_sale: {}", e);
            }
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

// ====== Returns ======

#[tauri::command]
pub fn create_return(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    sale_id: String,
    session_id: Option<String>,
    return_type: String,
    refund_method: String,
    reason: Option<String>,
    items: Vec<ReturnItemInput>,
    created_by: String,
) -> Result<ReturnOut, String> {
    if items.is_empty() {
        return Err("يجب إضافة صنف واحد على الأقل للمرتجع".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_POS)?;
    guard::require_permission(&conn, &created_by, "pos")?;

    // Validate sale exists
    let sale_number: String = conn.query_row(
        "SELECT sale_number FROM sales WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![sale_id, tenant_id],
        |row| row.get(0),
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    // Validate item quantities against original sale items
    for item in &items {
        let (orig_qty, already_returned): (i64, i64) = conn.query_row(
            "SELECT si.quantity,
                    COALESCE((SELECT SUM(ri.quantity) FROM return_items ri
                              JOIN returns r ON ri.return_id = r.id
                              WHERE ri.sale_item_id = si.id), 0)
             FROM sale_items si WHERE si.id = ?1",
            params![item.sale_item_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|_| "صنف البيع غير موجود".to_string())?;

        if item.quantity > (orig_qty - already_returned) {
            return Err(format!("الكمية المرتجعة ({}) أكبر من المتاح ({})", item.quantity, orig_qty - already_returned));
        }
    }

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<String, String> {
        let return_number = next_sequence(&conn, &tenant_id, "return_number")?;
        let return_id = Uuid::new_v4().to_string();
        let total: i64 = items.iter().map(|i| i.quantity * i.unit_price).sum();

        conn.execute(
            "INSERT INTO returns (id, tenant_id, branch_id, return_number, sale_id, session_id,
                    return_type, subtotal, total, refund_method, reason, created_by)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![return_id, tenant_id, branch_id, return_number, sale_id, session_id,
                    return_type, total, total, refund_method, reason, created_by],
        ).map_err(|e| format!("فشل إنشاء المرتجع: {}", e))?;

        for item in &items {
            let item_id = Uuid::new_v4().to_string();
            let item_subtotal = item.quantity * item.unit_price;

            conn.execute(
                "INSERT INTO return_items (id, tenant_id, return_id, sale_item_id, product_id, batch_id,
                        quantity, unit_price, subtotal)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![item_id, tenant_id, return_id, item.sale_item_id, item.product_id,
                        item.batch_id, item.quantity, item.unit_price, item_subtotal],
            ).map_err(|e| format!("فشل إضافة صنف المرتجع: {}", e))?;

            // Restore stock to batch
            let qty_before: i64 = conn.query_row(
                "SELECT quantity_current FROM batches WHERE id = ?1",
                params![item.batch_id],
                |row| row.get(0),
            ).map_err(|e| e.to_string())?;

            let qty_after = qty_before + item.quantity;

            conn.execute(
                "UPDATE batches SET quantity_current = ?2,
                        status = CASE WHEN ?2 > 0 THEN 'active' ELSE status END,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE id = ?1",
                params![item.batch_id, qty_after],
            ).map_err(|e| e.to_string())?;

            // Stock movement for return
            let mv_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO stock_movements (id, tenant_id, branch_id, product_id, batch_id,
                        movement_type, quantity_change, quantity_before, quantity_after,
                        reference_type, reference_id, created_by)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'customer_return', ?6, ?7, ?8, 'return', ?9, ?10)",
                params![mv_id, tenant_id, branch_id, item.product_id, item.batch_id,
                        item.quantity, qty_before, qty_after, return_id, created_by],
            ).map_err(|e| e.to_string())?;
        }

        // Update session stats if session is provided and open
        if let Some(ref sid) = session_id {
            conn.execute(
                "UPDATE pos_sessions SET total_returns = total_returns + ?2,
                        total_sales = total_sales - ?2,
                        expected_cash = CASE WHEN ?3 = 'cash' THEN expected_cash - ?2 ELSE expected_cash END,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE id = ?1 AND status = 'open'",
                params![sid, total, refund_method],
            ).map_err(|e| e.to_string())?;
        }

        // Credit return: reduce customer balance if original sale was credit
        let (orig_pm, orig_cid): (String, Option<String>) = conn.query_row(
            "SELECT payment_method, customer_id FROM sales WHERE id = ?1 AND tenant_id = ?2",
            params![sale_id, tenant_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|e| e.to_string())?;

        if orig_pm == "credit" {
            if let Some(ref cid) = orig_cid {
                conn.execute(
                    "UPDATE customers SET current_balance = current_balance - ?2,
                            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                     WHERE id = ?1 AND deleted_at IS NULL",
                    params![cid, total],
                ).map_err(|e| e.to_string())?;
            }
        }

        // Account transaction for refund (cash or bank_transfer)
        if refund_method == "cash" || refund_method == "bank_transfer" {
            let account_id: String = if refund_method == "bank_transfer" {
                // Try bank account, fall back to session's default account
                conn.query_row(
                    "SELECT id FROM accounts WHERE tenant_id = ?1 AND branch_id = ?2 AND account_type = 'bank' AND is_active = 1 AND deleted_at IS NULL LIMIT 1",
                    params![tenant_id, branch_id],
                    |r| r.get::<_, String>(0),
                ).unwrap_or_else(|_| {
                    session_id.as_ref().and_then(|sid| {
                        conn.query_row(
                            "SELECT account_id FROM pos_sessions WHERE id = ?1",
                            params![sid],
                            |row| row.get::<_, String>(0),
                        ).ok()
                    }).unwrap_or_default()
                })
            } else if let Some(ref sid) = session_id {
                conn.query_row(
                    "SELECT account_id FROM pos_sessions WHERE id = ?1",
                    params![sid],
                    |row| row.get(0),
                ).map_err(|e| e.to_string())?
            } else {
                // No session, find default cash account
                conn.query_row(
                    "SELECT id FROM accounts WHERE tenant_id = ?1 AND branch_id = ?2 AND is_default = 1 AND is_active = 1 AND deleted_at IS NULL LIMIT 1",
                    params![tenant_id, branch_id],
                    |r| r.get::<_, String>(0),
                ).map_err(|e| e.to_string())?
            };

            if !account_id.is_empty() {
                let bal_before: i64 = conn.query_row(
                    "SELECT current_balance FROM accounts WHERE id = ?1",
                    params![account_id],
                    |row| row.get(0),
                ).map_err(|e| e.to_string())?;

                let bal_after = bal_before - total;
                let tx_id = Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO account_transactions (id, tenant_id, account_id, transaction_type, direction,
                            amount, balance_before, balance_after, reference_type, reference_id, created_by)
                     VALUES (?1, ?2, ?3, 'customer_refund', 'out', ?4, ?5, ?6, 'return', ?7, ?8)",
                    params![tx_id, tenant_id, account_id, total, bal_before, bal_after, return_id, created_by],
                ).map_err(|e| e.to_string())?;

                conn.execute(
                    "UPDATE accounts SET current_balance = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
                    params![account_id, bal_after],
                ).map_err(|e| e.to_string())?;
            }
        }

        Ok(return_id)
    })();

    match result {
        Ok(return_id) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            if let Err(e) = audit::log_action(&conn, &tenant_id, &created_by, "create", "return", &return_id, None) {
                log::warn!("audit log failed after create_return: {}", e);
            }
            if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "return_created") {
                log::warn!("cloud sync enqueue failed after create_return: {}", e);
            }

            // Build response
            let (rnum, rtype, rtotal, rmethod, rstatus, rreason, rcat): (String, String, i64, String, String, Option<String>, String) = conn.query_row(
                "SELECT return_number, return_type, total, refund_method, status, reason, created_at
                 FROM returns WHERE id = ?1",
                params![return_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)),
            ).map_err(|e| e.to_string())?;

            let mut istmt = conn.prepare(
                "SELECT ri.id, ri.product_id, p.trade_name, ri.batch_id, ri.quantity, ri.unit_price, ri.subtotal
                 FROM return_items ri
                 JOIN products p ON ri.product_id = p.id
                 WHERE ri.return_id = ?1"
            ).map_err(|e| e.to_string())?;

            let ritems: Vec<ReturnItemOut> = istmt.query_map(params![return_id], |row| {
                Ok(ReturnItemOut {
                    id: row.get(0)?, product_id: row.get(1)?, product_name: row.get(2)?,
                    batch_id: row.get(3)?, quantity: row.get(4)?, unit_price: row.get(5)?, subtotal: row.get(6)?,
                })
            }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

            Ok(ReturnOut {
                id: return_id, return_number: rnum, sale_id: Some(sale_id), sale_number,
                return_type: rtype, total: rtotal, refund_method: rmethod,
                status: rstatus, reason: rreason, items: ritems, created_at: rcat,
            })
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn get_session_returns(
    db: State<'_, Database>,
    tenant_id: String,
    session_id: String,
) -> Result<Vec<SessionReturnRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT r.id, r.return_number,
                (SELECT s.sale_number FROM sales s WHERE s.id = r.sale_id),
                r.return_type, r.total, r.refund_method, r.created_at
         FROM returns r
         WHERE r.tenant_id = ?1 AND r.session_id = ?2
         ORDER BY r.created_at ASC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![tenant_id, session_id], |row| {
        Ok(SessionReturnRow {
            id: row.get(0)?,
            return_number: row.get(1)?,
            sale_number: row.get(2)?,
            return_type: row.get(3)?,
            total: row.get(4)?,
            refund_method: row.get(5)?,
            created_at: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(rows)
}

#[tauri::command]
pub fn get_sale_by_number(
    db: State<'_, Database>,
    tenant_id: String,
    sale_number: String,
) -> Result<SaleOut, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let sale_id: String = conn.query_row(
        "SELECT id FROM sales WHERE tenant_id = ?1 AND sale_number = ?2 AND deleted_at IS NULL",
        params![tenant_id, sale_number],
        |row| row.get(0),
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    build_sale_out(&conn, &tenant_id, &sale_id)
}

// ────────────────────────────────────────────────────────────────
// INVOICE SALES (non-POS, credit / partial / cash)
// ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct InvoiceSaleRow {
    pub id: String,
    pub sale_number: String,
    pub customer_id: Option<String>,
    pub customer_name: Option<String>,
    pub cashier_name: String,
    pub total: i64,
    pub tax_amount: i64,
    pub amount_paid: i64,
    pub balance_due: i64,
    pub payment_method: String,
    pub payment_status: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub items_count: i64,
}

#[tauri::command]
pub fn get_invoice_sales(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    customer_id: Option<String>,
    payment_status: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
) -> Result<Vec<InvoiceSaleRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let cust_id: Option<String> = customer_id;
    let pay_status: Option<String> = payment_status;
    let d_from: Option<String> = date_from;
    let d_to: Option<String> = date_to;

    let sql = "SELECT s.id, s.sale_number, s.customer_id, c.name, u.full_name,
                      s.total, s.tax_amount, s.amount_paid, (s.total - s.amount_paid) as balance_due,
                      s.payment_method, s.payment_status, s.notes, s.created_at,
                      COUNT(si.id) as items_count
               FROM sales s
               JOIN users u ON s.cashier_id = u.id
               LEFT JOIN customers c ON s.customer_id = c.id
               LEFT JOIN sale_items si ON si.sale_id = s.id
               WHERE s.tenant_id = ?1 AND s.branch_id = ?2
                 AND s.sale_type = 'invoice' AND s.deleted_at IS NULL
                 AND (?3 IS NULL OR s.customer_id = ?3)
                 AND (?4 IS NULL OR s.payment_status = ?4)
                 AND (?5 IS NULL OR DATE(s.created_at) >= ?5)
                 AND (?6 IS NULL OR DATE(s.created_at) <= ?6)
               GROUP BY s.id
               ORDER BY s.created_at DESC
               LIMIT 500";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(
        params![tenant_id, branch_id, cust_id, pay_status, d_from, d_to],
        |row: &rusqlite::Row| {
            Ok(InvoiceSaleRow {
                id: row.get(0)?,
                sale_number: row.get(1)?,
                customer_id: row.get(2)?,
                customer_name: row.get(3)?,
                cashier_name: row.get(4)?,
                total: row.get(5)?,
                tax_amount: row.get(6)?,
                amount_paid: row.get(7)?,
                balance_due: row.get(8)?,
                payment_method: row.get(9)?,
                payment_status: row.get(10)?,
                notes: row.get(11)?,
                created_at: row.get(12)?,
                items_count: row.get(13)?,
            })
        },
    ).map_err(|e: rusqlite::Error| e.to_string())?;

    let mut result = Vec::new();
    for row in rows { result.push(row.map_err(|e: rusqlite::Error| e.to_string())?); }
    Ok(result)
}

#[tauri::command]
pub fn create_invoice_sale(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    cashier_id: String,
    customer_id: Option<String>,
    payment_method: String,
    amount_paid: i64,
    account_id: String,
    discount: i64,
    tax_amount: i64,
    notes: Option<String>,
    items: Vec<SaleItemInput>,
) -> Result<SaleOut, String> {
    if items.is_empty() {
        return Err("Must add at least one item".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_POS)?;

    // Validate stock
    for item in &items {
        let qty: i64 = conn.query_row(
            "SELECT quantity_current FROM batches WHERE id = ?1 AND tenant_id = ?2",
            params![item.batch_id, tenant_id],
            |row| row.get(0),
        ).map_err(|_| "Batch not found".to_string())?;
        if qty < item.quantity {
            let pname: String = conn.query_row(
                "SELECT trade_name FROM products WHERE id = ?1",
                params![item.product_id],
                |row| row.get(0),
            ).unwrap_or_else(|_| item.product_id.clone());
            return Err(format!("Insufficient stock: {}", pname));
        }
    }

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<String, String> {
        let sale_number = next_sequence(&conn, &tenant_id, "sale_number")?;
        let sale_id = Uuid::new_v4().to_string();

        let subtotal: i64 = items.iter().map(|i| i.quantity * i.unit_price).sum();
        let total = subtotal - discount + tax_amount;
        let change_amount = if payment_method == "cash" && amount_paid > total { amount_paid - total } else { 0 };
        let payment_status = if payment_method == "credit" {
            "credit"
        } else if amount_paid < total {
            "partial"
        } else {
            "paid"
        };

        conn.execute(
            "INSERT INTO sales (id, tenant_id, branch_id, sale_number, sale_type, session_id, cashier_id,
                  customer_id, subtotal, discount, tax_amount, total, amount_paid, change_amount,
                  payment_method, payment_status, notes)
              VALUES (?1, ?2, ?3, ?4, 'invoice', NULL, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![sale_id, tenant_id, branch_id, sale_number, cashier_id,
                  customer_id, subtotal, discount, tax_amount, total, amount_paid, change_amount,
                    payment_method, payment_status, notes],
        ).map_err(|e| format!("Failed to create sale: {}", e))?;

        for item in &items {
            let item_id = Uuid::new_v4().to_string();
            let item_subtotal = item.quantity * item.unit_price;

            conn.execute(
                "INSERT INTO sale_items (id, tenant_id, sale_id, product_id, batch_id, quantity, unit_price, unit_cost, subtotal)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![item_id, tenant_id, sale_id, item.product_id, item.batch_id,
                        item.quantity, item.unit_price, item.unit_cost, item_subtotal],
            ).map_err(|e| format!("Failed to add sale item: {}", e))?;

            let qty_before: i64 = conn.query_row(
                "SELECT quantity_current FROM batches WHERE id = ?1",
                params![item.batch_id],
                |row| row.get(0),
            ).map_err(|e| e.to_string())?;
            let qty_after = qty_before - item.quantity;

            conn.execute(
                "UPDATE batches SET quantity_current = ?2,
                        status = CASE WHEN ?2 = 0 THEN 'depleted' ELSE status END,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE id = ?1",
                params![item.batch_id, qty_after],
            ).map_err(|e| e.to_string())?;

            let mv_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO stock_movements (id, tenant_id, branch_id, product_id, batch_id,
                        movement_type, quantity_change, quantity_before, quantity_after,
                        reference_type, reference_id, created_by)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'sell', ?6, ?7, ?8, 'sale', ?9, ?10)",
                params![mv_id, tenant_id, branch_id, item.product_id, item.batch_id,
                        -item.quantity, qty_before, qty_after, sale_id, cashier_id],
            ).map_err(|e| e.to_string())?;
        }

        // Credit sale: update customer balance
        if payment_method == "credit" || payment_status == "partial" {
            if let Some(ref cid) = customer_id {
                let outstanding = total - amount_paid;
                let (cust_balance, cust_limit): (i64, i64) = conn.query_row(
                    "SELECT current_balance, credit_limit FROM customers WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL AND is_active = 1",
                    params![cid, tenant_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                ).map_err(|_| "Customer not found or inactive".to_string())?;

                if cust_limit > 0 && cust_balance + outstanding > cust_limit {
                    return Err(format!("Credit limit exceeded: balance {} + amount {} > limit {}", cust_balance, outstanding, cust_limit));
                }

                conn.execute(
                    "UPDATE customers SET current_balance = current_balance + ?2,
                            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                     WHERE id = ?1",
                    params![cid, outstanding],
                ).map_err(|e| e.to_string())?;
            } else {
                return Err("Customer required for credit/partial payment".into());
            }
        }

        // Account transaction for cash/bank/partial amount paid
        if amount_paid > 0 {
            let bal_before: i64 = conn.query_row(
                "SELECT current_balance FROM accounts WHERE id = ?1",
                params![account_id],
                |row| row.get(0),
            ).map_err(|e| e.to_string())?;

            let bal_after = bal_before + amount_paid;
            let tx_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO account_transactions (id, tenant_id, account_id, transaction_type, direction,
                        amount, balance_before, balance_after, reference_type, reference_id, created_by)
                 VALUES (?1, ?2, ?3, 'sale_income', 'in', ?4, ?5, ?6, 'sale', ?7, ?8)",
                params![tx_id, tenant_id, account_id, amount_paid, bal_before, bal_after, sale_id, cashier_id],
            ).map_err(|e| e.to_string())?;

            conn.execute(
                "UPDATE accounts SET current_balance = ?2,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE id = ?1",
                params![account_id, bal_after],
            ).map_err(|e| e.to_string())?;
        }

        Ok(sale_id)
    })();

    match result {
        Ok(sale_id) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;

            if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "invoice_sale_created") {
                log::warn!("cloud sync enqueue failed after create_invoice_sale: {}", e);
            }

            build_sale_out(&conn, &tenant_id, &sale_id)
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

// ─── Parked Cart Persistence ─────────────────────────────────────────────────

#[tauri::command]
pub fn save_pos_workspace_state(
    db: State<'_, Database>,
    tenant_id: String,
    session_id: String,
    state_json: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = format!("{}-{}", tenant_id, session_id);
    conn.execute(
        "INSERT INTO pos_parked_carts (id, session_id, tenant_id, state_json, saved_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         ON CONFLICT(id) DO UPDATE SET
             state_json = excluded.state_json,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        params![id, session_id, tenant_id, state_json],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn load_pos_workspace_state(
    db: State<'_, Database>,
    tenant_id: String,
    session_id: String,
) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = format!("{}-{}", tenant_id, session_id);
    match conn.query_row(
        "SELECT state_json FROM pos_parked_carts WHERE id = ?1",
        params![id],
        |row| row.get::<_, String>(0),
    ) {
        Ok(json) => Ok(json),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn clear_pos_workspace_state(
    db: State<'_, Database>,
    tenant_id: String,
    session_id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = format!("{}-{}", tenant_id, session_id);
    conn.execute(
        "DELETE FROM pos_parked_carts WHERE id = ?1",
        params![id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}
