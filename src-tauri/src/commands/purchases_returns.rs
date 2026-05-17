use serde::{Deserialize, Serialize};
use tauri::State;
use rusqlite::params;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::cloud_sync;
use crate::commands::license_guard;
use crate::commands::guard;
use crate::commands::audit;
use crate::commands::session_state::{AuthSessionState, resolve_identity};
use super::purchases::FLAG_PURCHASES;

#[derive(Debug, Serialize, Deserialize)]
pub struct PurchaseReturnItemData {
    pub batch_id: String,
    pub quantity: i64,
    pub reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreatePurchaseReturnData {
    pub return_date: String,
    pub reason: Option<String>,
    pub notes: Option<String>,
    pub account_id: Option<String>,
    pub items: Vec<PurchaseReturnItemData>,
}

fn do_purchase_return(
    conn: &rusqlite::Connection,
    tenant_id: &str,
    invoice_id: &str,
    user_id: &str,
    data: &CreatePurchaseReturnData,
) -> Result<String, String> {
    let (supplier_id, amount_paid, branch_id, status): (String, i64, String, String) = conn.query_row(
        "SELECT supplier_id, amount_paid, branch_id, status FROM supplier_invoices
         WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![invoice_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    if status != "confirmed" {
        return Err("مرتجع المشتريات مسموح فقط للفواتير المؤكدة".into());
    }

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<String, String> {
        let mut total_refund: i64 = 0;
        let mut item_details: Vec<(String, i64)> = Vec::new();

        for item in &data.items {
            if item.quantity <= 0 {
                return Err("الكمية يجب أن تكون أكبر من صفر".into());
            }
            let (product_id, qty_current, unit_cost, batch_inv_id): (String, i64, i64, Option<String>) =
                conn.query_row(
                    "SELECT product_id, quantity_current, unit_cost, supplier_invoice_id
                     FROM batches WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
                    params![item.batch_id, tenant_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
                ).map_err(|_| "الدفعة غير موجودة".to_string())?;

            if batch_inv_id.as_deref() != Some(invoice_id) {
                return Err("الدفعة لا تنتمي لهذه الفاتورة".into());
            }
            if item.quantity > qty_current {
                return Err(format!("كمية الإرجاع ({}) أكبر من المتاح ({})", item.quantity, qty_current));
            }

            let qty_after = qty_current - item.quantity;
            let new_status = if qty_after == 0 { "returned" } else { "active" };
            conn.execute(
                "UPDATE batches SET quantity_current = ?1, status = ?2,
                         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?3",
                params![qty_after, new_status, item.batch_id],
            ).map_err(|e| e.to_string())?;

            let mv_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO stock_movements (id, tenant_id, branch_id, product_id, batch_id,
                         movement_type, quantity_change, quantity_before, quantity_after,
                         reference_type, reference_id, notes, created_by)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'supplier_return', ?6, ?7, ?8, 'supplier_return', ?9, ?10, ?11)",
                params![mv_id, tenant_id, branch_id, product_id, item.batch_id,
                        -item.quantity, qty_current, qty_after, invoice_id, item.reason, user_id],
            ).map_err(|e| e.to_string())?;

            total_refund += unit_cost * item.quantity;
            item_details.push((product_id, unit_cost));
        }

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM supplier_returns WHERE tenant_id = ?1",
            params![tenant_id], |row| row.get(0),
        ).map_err(|e| e.to_string())?;
        let return_number = format!("PRET-{:05}", count + 1);
        let return_id = Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO supplier_returns (id, tenant_id, supplier_id, invoice_id, branch_id,
                     return_number, return_date, total_amount, status, reason, notes, created_by)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'confirmed', ?9, ?10, ?11)",
            params![return_id, tenant_id, supplier_id, invoice_id, branch_id,
                    return_number, data.return_date, total_refund, data.reason, data.notes, user_id],
        ).map_err(|e| e.to_string())?;

        for (item, (product_id, unit_cost)) in data.items.iter().zip(item_details.iter()) {
            let item_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO supplier_return_items (id, tenant_id, supplier_return_id, product_id,
                         batch_id, quantity, unit_cost, total_price, reason)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![item_id, tenant_id, return_id, product_id,
                        item.batch_id, item.quantity, unit_cost,
                        unit_cost * item.quantity, item.reason],
            ).map_err(|e| e.to_string())?;
        }

        let payment_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO supplier_payments (id, tenant_id, supplier_id, invoice_id, amount,
                     payment_method, account_id, payment_date, notes, created_by)
             VALUES (?1, ?2, ?3, ?4, ?5, 'credit_note', '', ?6, ?7, ?8)",
            params![payment_id, tenant_id, supplier_id, invoice_id, -total_refund,
                    data.return_date, data.reason, user_id],
        ).map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE supplier_invoices
             SET amount_paid = MAX(0, amount_paid - ?2),
                 payment_status = CASE
                     WHEN MAX(0, amount_paid - ?2) = 0 THEN 'unpaid'
                     WHEN MAX(0, amount_paid - ?2) >= total THEN 'paid'
                     ELSE 'partial' END,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1 AND tenant_id = ?3",
            params![invoice_id, total_refund, tenant_id],
        ).map_err(|e| e.to_string())?;

        if let Some(ref account_id) = data.account_id {
            if !account_id.is_empty() {
                let refund_applied = total_refund.min(amount_paid);
                if refund_applied > 0 {
                    let acct_balance: i64 = conn.query_row(
                        "SELECT current_balance FROM accounts WHERE id = ?1 AND is_active = 1 AND deleted_at IS NULL",
                        params![account_id], |row| row.get(0),
                    ).map_err(|_| "الحساب غير موجود أو غير نشط".to_string())?;

                    let tx_id = Uuid::new_v4().to_string();
                    conn.execute(
                        "INSERT INTO account_transactions (id, tenant_id, account_id, transaction_type,
                                 direction, amount, balance_before, balance_after,
                                 reference_type, reference_id, description, created_by)
                         VALUES (?1, ?2, ?3, 'supplier_return', 'in', ?4, ?5, ?6, 'supplier_return', ?7, 'مرتجع مشتريات', ?8)",
                        params![tx_id, tenant_id, account_id, refund_applied,
                                acct_balance, acct_balance + refund_applied, return_id, user_id],
                    ).map_err(|e| e.to_string())?;

                    conn.execute(
                        "UPDATE accounts SET current_balance = current_balance + ?2,
                                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
                        params![account_id, refund_applied],
                    ).map_err(|e| e.to_string())?;
                }
            }
        }

        Ok(return_id)
    })();

    match result {
        Ok(id) => { conn.execute("COMMIT", []).map_err(|e| e.to_string())?; Ok(id) }
        Err(e) => { let _ = conn.execute("ROLLBACK", []); Err(e) }
    }
}

#[tauri::command]
pub fn create_purchase_return(
    db: State<'_, Database>,
    tenant_id: String,
    invoice_id: String,
    user_id: String,
    data: CreatePurchaseReturnData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<String, String> {
    if data.items.is_empty() { return Err("يجب اختيار صنف واحد على الأقل للإرجاع".into()); }
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, "main-branch")?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_PURCHASES)?;
    guard::require_permission(&conn, &user_id, "purchases")?;

    let return_id = do_purchase_return(&conn, &tenant_id, &invoice_id, &user_id, &data)?;

    if let Err(e) = audit::log_action(&conn, &tenant_id, &user_id, "return", "purchase_invoice", &invoice_id, data.reason.as_deref()) {
        log::warn!("audit log failed after create_purchase_return: {}", e);
    }
    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "purchase_returned") {
        log::warn!("cloud sync enqueue failed after create_purchase_return: {}", e);
    }

    Ok(return_id)
}

#[derive(Debug, Serialize)]
pub struct BatchSaleRow {
    pub sale_id: String,
    pub sale_number: String,
    pub sale_date: String,
    pub customer_id: Option<String>,
    pub customer_name: Option<String>,
    pub quantity: i64,
    pub unit_price: i64,
    pub subtotal: i64,
}

#[tauri::command]
pub fn get_batch_sales(
    db: State<'_, Database>,
    tenant_id: String,
    batch_id: String,
) -> Result<Vec<BatchSaleRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT s.id, s.sale_number, s.created_at,
                s.customer_id, c.name,
                si.quantity, si.unit_price, si.subtotal
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         LEFT JOIN customers c ON c.id = s.customer_id
         WHERE si.tenant_id = ?1
           AND si.batch_id = ?2
           AND s.deleted_at IS NULL
         ORDER BY s.created_at DESC",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![tenant_id, batch_id], |row| {
        Ok(BatchSaleRow {
            sale_id: row.get(0)?,
            sale_number: row.get(1)?,
            sale_date: row.get(2)?,
            customer_id: row.get(3)?,
            customer_name: row.get(4)?,
            quantity: row.get(5)?,
            unit_price: row.get(6)?,
            subtotal: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(rows)
}
