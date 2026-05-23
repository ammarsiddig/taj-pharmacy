use serde::{Deserialize, Serialize};
use tauri::State;
use rusqlite::params;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::cloud_sync;
use crate::commands::license_guard;
use crate::commands::guard;
use crate::commands::audit;
use crate::commands::suppliers::do_supplier_payment;
use crate::commands::session_state::{AuthSessionState, resolve_identity};
use super::purchases_invoices::fetch_invoice_detail;

pub(crate) const FLAG_PURCHASES: i64 = 4;

// ====== Structs ======

#[derive(Debug, Serialize)]
pub struct PurchaseInvoiceRow {
    pub id: String,
    pub invoice_number: String,
    pub supplier_name: String,
    pub invoice_date: String,
    pub items_count: i64,
    pub total: i64,
    pub amount_paid: i64,
    pub status: String,
    pub payment_status: String,
    pub has_overdue_schedule: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PurchaseInvoiceItem {
    pub id: String,
    pub product_id: String,
    pub product_name: String,
    pub batch_number: Option<String>,
    pub expiry_date: Option<String>,
    pub quantity: i64,
    pub unit_cost: i64,
    pub sale_price: i64,
    pub subtotal: i64,
}

#[derive(Debug, Serialize)]
pub struct PurchaseInvoiceDetail {
    pub id: String,
    pub invoice_number: String,
    pub supplier_id: String,
    pub supplier_name: String,
    pub invoice_date: String,
    pub status: String,
    pub payment_status: String,
    pub subtotal: i64,
    pub discount: i64,
    pub tax_amount: i64,
    pub total: i64,
    pub amount_paid: i64,
    pub notes: Option<String>,
    pub items: Vec<PurchaseInvoiceItem>,
}

#[derive(Debug, Deserialize)]
pub struct PurchaseItemInput {
    pub product_id: String,
    pub batch_number: Option<String>,
    pub expiry_date: Option<String>,
    pub quantity: i64,
    pub unit_cost: i64,
    pub sale_price: i64,
}

#[derive(Debug, Deserialize)]
pub struct ConfirmPaymentData {
    /// "unpaid", "paid", or "partial"
    pub payment_mode: String,
    pub account_id: Option<String>,
    pub payment_method: Option<String>,
    pub payment_date: Option<String>,
    pub amount_paid: Option<i64>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PurchaseCreateData {
    pub supplier_id: String,
    pub invoice_date: String,
    #[serde(rename = "invoice_number")]
    pub _invoice_number: Option<String>,
    pub notes: Option<String>,
    pub discount: Option<i64>,
    pub tax_amount: Option<i64>,
    pub items: Vec<PurchaseItemInput>,
}

pub(crate) fn next_sequence(conn: &rusqlite::Connection, tenant_id: &str, counter_name: &str) -> Result<String, String> {
    conn.execute(
        "UPDATE sequence_counters SET last_value = last_value + 1
         WHERE tenant_id = ?1 AND counter_name = ?2",
        params![tenant_id, counter_name],
    ).map_err(|e| e.to_string())?;

    let (prefix, value): (Option<String>, i64) = conn.query_row(
        "SELECT prefix, last_value FROM sequence_counters
         WHERE tenant_id = ?1 AND counter_name = ?2",
        params![tenant_id, counter_name],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| e.to_string())?;

    let prefix = prefix.unwrap_or_default();
    Ok(format!("{}{:05}", prefix, value))
}

#[allow(dead_code)] // deprecated — kept for one release cycle, remove after v0.2
#[tauri::command]
pub fn confirm_purchase(
    db: State<'_, Database>,
    tenant_id: String,
    invoice_id: String,
    user_id: String,
    location_id: Option<String>,
    auth_session: State<'_, AuthSessionState>,
) -> Result<PurchaseInvoiceDetail, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, "")?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_PURCHASES)?;

    // Verify status = draft
    let current_status: String = conn.query_row(
        "SELECT status FROM supplier_invoices WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![invoice_id, tenant_id],
        |row| row.get(0),
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    if current_status != "draft" {
        return Err("لا يمكن تأكيد فاتورة ليست مسودة".into());
    }

    // Get items
    let mut stmt = conn.prepare(
        "SELECT id, product_id, batch_number, expiry_date, quantity, unit_cost, sale_price
         FROM supplier_invoice_items WHERE invoice_id = ?1"
    ).map_err(|e| e.to_string())?;

    let items: Vec<(String, String, Option<String>, Option<String>, i64, i64, i64)> = stmt.query_map(
        params![invoice_id],
        |row| Ok((
            row.get(0)?, row.get(1)?, row.get(2)?,
            row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?,
        ))
    ).map_err(|e| e.to_string())?
      .filter_map(|r| r.ok())
      .collect();
    drop(stmt);

    if items.is_empty() {
        return Err("لا يمكن تأكيد فاتورة بدون أصناف".into());
    }

    // Get branch from invoice
    let branch_id: String = conn.query_row(
        "SELECT branch_id FROM supplier_invoices WHERE id = ?1",
        params![invoice_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    // Use provided location or fall back to first active location
    let default_location: String = if let Some(ref loc) = location_id {
        loc.clone()
    } else {
        conn.query_row(
            "SELECT id FROM storage_locations WHERE tenant_id = ?1 AND branch_id = ?2 AND is_active = 1 AND deleted_at IS NULL LIMIT 1",
            params![tenant_id, branch_id],
            |row| row.get(0),
        ).map_err(|_| "لا يوجد موقع تخزين نشط".to_string())?
    };

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        for (_, product_id, batch_number, expiry_date, quantity, unit_cost, sale_price) in &items {
            let batch_id = Uuid::new_v4().to_string();

            // Insert batch
            conn.execute(
                "INSERT INTO batches (id, tenant_id, product_id, supplier_invoice_id, location_id,
                        batch_number, expiry_date, quantity_received, quantity_current, unit_cost, status)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'active')",
                params![batch_id, tenant_id, product_id, invoice_id, default_location,
                        batch_number, expiry_date, quantity, quantity, unit_cost],
            ).map_err(|e| format!("فشل إنشاء الدفعة: {}", e))?;

            // Insert stock movement
            let movement_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO stock_movements (id, tenant_id, branch_id, product_id, batch_id,
                        movement_type, quantity_change, quantity_before, quantity_after,
                        reference_type, reference_id, created_by)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'receive', ?6, 0, ?7, 'supplier_invoice', ?8, ?9)",
                params![movement_id, tenant_id, branch_id, product_id, batch_id,
                        quantity, quantity, invoice_id, user_id],
            ).map_err(|e| format!("فشل تسجيل حركة المخزون: {}", e))?;

            // Update product prices
            if *sale_price > 0 {
                conn.execute(
                    "UPDATE products SET last_purchase_price = ?3, sale_price = ?4,
                            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                     WHERE id = ?2 AND tenant_id = ?1",
                    params![tenant_id, product_id, unit_cost, sale_price],
                ).map_err(|e| e.to_string())?;
            } else {
                conn.execute(
                    "UPDATE products SET last_purchase_price = ?3,
                            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                     WHERE id = ?2 AND tenant_id = ?1",
                    params![tenant_id, product_id, unit_cost],
                ).map_err(|e| e.to_string())?;
            }
        }

        // Update invoice status
        conn.execute(
            "UPDATE supplier_invoices SET status = 'confirmed', confirmed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                    confirmed_by = ?3, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1 AND tenant_id = ?2",
            params![invoice_id, tenant_id, user_id],
        ).map_err(|e| e.to_string())?;

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "purchase_confirmed") {
                log::warn!("cloud sync enqueue failed after confirm_purchase: {}", e);
            }
            fetch_invoice_detail(&conn, &invoice_id)
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

/// Confirm purchase with optional payment at confirmation time.
/// payment_info.payment_mode: "unpaid" | "paid" | "partial"
#[tauri::command]
pub fn confirm_purchase_with_payment(
    db: State<'_, Database>,
    tenant_id: String,
    invoice_id: String,
    user_id: String,
    location_id: Option<String>,
    payment_info: ConfirmPaymentData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<PurchaseInvoiceDetail, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, "main-branch")?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_PURCHASES)?;
    guard::require_access(&conn, &user_id, "purchases", guard::Level::Write)?;

    // Validate payment_mode values
    match payment_info.payment_mode.as_str() {
        "unpaid" | "paid" | "partial" => {}
        _ => return Err("وضع الدفع غير صالح".into()),
    }

    // For paid/partial: require account, method, date
    let is_paying = payment_info.payment_mode != "unpaid";
    if is_paying {
        if payment_info.account_id.as_deref().unwrap_or("").is_empty() {
            return Err("يجب تحديد الحساب عند الدفع".into());
        }
        if payment_info.payment_method.as_deref().unwrap_or("").is_empty() {
            return Err("يجب تحديد طريقة الدفع".into());
        }
    }

    // Verify status = draft
    let current_status: String = conn.query_row(
        "SELECT status FROM supplier_invoices WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![invoice_id, tenant_id],
        |row| row.get(0),
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    if current_status != "draft" {
        return Err("لا يمكن تأكيد فاتورة ليست مسودة".into());
    }

    // Fetch items
    let mut stmt = conn.prepare(
        "SELECT id, product_id, batch_number, expiry_date, quantity, unit_cost, sale_price
         FROM supplier_invoice_items WHERE invoice_id = ?1"
    ).map_err(|e| e.to_string())?;

    let items: Vec<(String, String, Option<String>, Option<String>, i64, i64, i64)> = stmt.query_map(
        params![invoice_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?,
                  row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)),
    ).map_err(|e| e.to_string())?
      .filter_map(|r| r.ok())
      .collect();
    drop(stmt);

    if items.is_empty() {
        return Err("لا يمكن تأكيد فاتورة بدون أصناف".into());
    }

    // Fetch invoice total and supplier
    let (invoice_total, supplier_id): (i64, String) = conn.query_row(
        "SELECT total, supplier_id FROM supplier_invoices WHERE id = ?1 AND tenant_id = ?2",
        params![invoice_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| e.to_string())?;

    let branch_id: String = conn.query_row(
        "SELECT branch_id FROM supplier_invoices WHERE id = ?1",
        params![invoice_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    // Resolve location
    let default_location: String = if let Some(ref loc) = location_id {
        loc.clone()
    } else {
        conn.query_row(
            "SELECT id FROM storage_locations WHERE tenant_id = ?1 AND branch_id = ?2 AND is_active = 1 AND deleted_at IS NULL LIMIT 1",
            params![tenant_id, branch_id],
            |row| row.get(0),
        ).map_err(|_| "لا يوجد موقع تخزين نشط".to_string())?
    };

    // Validate payment amount
    let pay_amount: i64 = if payment_info.payment_mode == "unpaid" {
        0
    } else if payment_info.payment_mode == "paid" {
        invoice_total
    } else {
        // partial
        let amt = payment_info.amount_paid.unwrap_or(0);
        if amt <= 0 {
            return Err("مبلغ الدفعة الجزئية يجب أن يكون أكبر من صفر".into());
        }
        if amt >= invoice_total {
            return Err("الدفعة الجزئية يجب أن تكون أقل من إجمالي الفاتورة".into());
        }
        amt
    };

    // Validate account balance if paying
    let acct_balance: i64 = if is_paying {
        let acct_id = payment_info.account_id.as_deref().unwrap_or("");
        let bal: i64 = conn.query_row(
            "SELECT current_balance FROM accounts WHERE id = ?1 AND is_active = 1 AND deleted_at IS NULL",
            params![acct_id],
            |row| row.get(0),
        ).map_err(|_| "الحساب غير موجود أو غير نشط".to_string())?;
        if pay_amount > bal {
            return Err(format!("رصيد الحساب غير كافٍ. المتاح: {} والمطلوب: {}", bal, pay_amount));
        }
        bal
    } else {
        0
    };

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        // 1. Receive stock
        for (_, product_id, batch_number, expiry_date, quantity, unit_cost, sale_price) in &items {
            let batch_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO batches (id, tenant_id, product_id, supplier_invoice_id, location_id,
                        batch_number, expiry_date, quantity_received, quantity_current, unit_cost, status)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'active')",
                params![batch_id, tenant_id, product_id, invoice_id, default_location,
                        batch_number, expiry_date, quantity, quantity, unit_cost],
            ).map_err(|e| format!("فشل إنشاء الدفعة: {}", e))?;

            let movement_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO stock_movements (id, tenant_id, branch_id, product_id, batch_id,
                        movement_type, quantity_change, quantity_before, quantity_after,
                        reference_type, reference_id, created_by)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'receive', ?6, 0, ?7, 'supplier_invoice', ?8, ?9)",
                params![movement_id, tenant_id, branch_id, product_id, batch_id,
                        quantity, quantity, invoice_id, user_id],
            ).map_err(|e| format!("فشل تسجيل حركة المخزون: {}", e))?;

            if *sale_price > 0 {
                conn.execute(
                    "UPDATE products SET last_purchase_price = ?3, sale_price = ?4,
                            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                     WHERE id = ?2 AND tenant_id = ?1",
                    params![tenant_id, product_id, unit_cost, sale_price],
                ).map_err(|e| e.to_string())?;
            } else {
                conn.execute(
                    "UPDATE products SET last_purchase_price = ?3,
                            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                     WHERE id = ?2 AND tenant_id = ?1",
                    params![tenant_id, product_id, unit_cost],
                ).map_err(|e| e.to_string())?;
            }
        }

        // 2. Determine final payment_status
        let payment_status = match payment_info.payment_mode.as_str() {
            "paid" => "paid",
            "partial" => "partial",
            _ => "unpaid",
        };

        // 3. Update invoice: confirmed + amount_paid + payment_status
        conn.execute(
            "UPDATE supplier_invoices
             SET status = 'confirmed', confirmed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                 confirmed_by = ?3, amount_paid = ?4, payment_status = ?5,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1 AND tenant_id = ?2",
            params![invoice_id, tenant_id, user_id, pay_amount, payment_status],
        ).map_err(|e| e.to_string())?;

        // 4. If paying, create supplier payment + account transaction
        if is_paying {
            let acct_id = payment_info.account_id.as_deref().unwrap_or("");
            let method = payment_info.payment_method.as_deref().unwrap_or("cash");
            let pay_date = payment_info.payment_date.as_deref()
                .unwrap_or(""); // validated to be non-empty above
            do_supplier_payment(
                &*conn, &tenant_id, &supplier_id, &invoice_id,
                pay_amount, method, acct_id, pay_date,
                payment_info.notes.as_deref(), &user_id, acct_balance,
            )?;
        }

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            if let Err(e) = audit::log_action(&conn, &tenant_id, &user_id, "confirm", "purchase_invoice", &invoice_id, None) {
                log::warn!("audit log failed after confirm_purchase_with_payment: {}", e);
            }
            if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "purchase_confirmed") {
                log::warn!("cloud sync enqueue failed after confirm_purchase_with_payment: {}", e);
            }
            fetch_invoice_detail(&conn, &invoice_id)
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn cancel_purchase(
    db: State<'_, Database>,
    tenant_id: String,
    invoice_id: String,
    user_id: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, "")?;

    let (current_status, payment_status): (String, String) = conn.query_row(
        "SELECT status, payment_status FROM supplier_invoices WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![invoice_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    if current_status == "cancelled" {
        return Err("الفاتورة ملغاة بالفعل".into());
    }

    if current_status == "draft" {
        conn.execute(
            "UPDATE supplier_invoices SET status = 'cancelled',
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1 AND tenant_id = ?2",
            params![invoice_id, tenant_id],
        ).map_err(|e| e.to_string())?;

        if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "purchase_cancelled") {
            log::warn!("cloud sync enqueue failed after cancel_purchase (draft): {}", e);
        }

        return Ok(());
    }

    // Block cancellation for invoices with payments (paid or partial)
    if payment_status == "paid" || payment_status == "partial" {
        return Err("لا يمكن إلغاء فاتورة تم دفع جزء منها أو كلها. يُرجى إزالة المدفوعات أولاً.".into());
    }

    // Status is confirmed - need to check if any batch was sold
    let sales_from_batches: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sale_items
         WHERE batch_id IN (SELECT id FROM batches WHERE supplier_invoice_id = ?1)",
        params![invoice_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    if sales_from_batches > 0 {
        return Err("لا يمكن إلغاء فاتورة تم البيع منها".into());
    }

    // Fetch branch_id and batch data before transaction
    let branch_id: String = conn.query_row(
        "SELECT branch_id FROM supplier_invoices WHERE id = ?1",
        params![invoice_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let mut bstmt = conn.prepare(
        "SELECT id, product_id, quantity_current FROM batches
         WHERE supplier_invoice_id = ?1 AND deleted_at IS NULL"
    ).map_err(|e| e.to_string())?;
    let batches_data: Vec<(String, String, i64)> = bstmt.query_map(
        params![invoice_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    ).map_err(|e| e.to_string())?
      .filter_map(|r| r.ok())
      .collect();
    drop(bstmt);

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        // Insert reversal movements (preserve audit trail)
        for (batch_id, product_id, qty_current) in &batches_data {
            if *qty_current > 0 {
                let mv_id = Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO stock_movements (id, tenant_id, branch_id, product_id, batch_id,
                            movement_type, quantity_change, quantity_before, quantity_after,
                            reference_type, reference_id, notes, created_by)
                     VALUES (?1, ?2, ?3, ?4, ?5, 'adjust', ?6, ?7, 0, 'supplier_invoice_cancel', ?8, ?9, ?10)",
                    params![mv_id, tenant_id, branch_id, product_id, batch_id,
                            -qty_current, qty_current, invoice_id,
                            "إلغاء فاتورة مؤكدة", user_id],
                ).map_err(|e| e.to_string())?;
            }
        }

        // Deplete batches
        conn.execute(
            "UPDATE batches SET quantity_current = 0, status = 'depleted',
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE supplier_invoice_id = ?1",
            params![invoice_id],
        ).map_err(|e| e.to_string())?;

        // Cancel invoice
        conn.execute(
            "UPDATE supplier_invoices SET status = 'cancelled',
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1 AND tenant_id = ?2",
            params![invoice_id, tenant_id],
        ).map_err(|e| e.to_string())?;

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;

            if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "purchase_cancelled") {
                log::warn!("cloud sync enqueue failed after cancel_purchase (confirmed): {}", e);
            }

            Ok(())
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}
/// Soft-delete a draft purchase invoice. Draft only — no stock effects.
#[tauri::command]
pub fn delete_purchase_draft(
    db: State<'_, Database>,
    tenant_id: String,
    invoice_id: String,
    user_id: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, "main-branch")?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_PURCHASES)?;
    guard::require_access(&conn, &user_id, "purchases", guard::Level::Write)?;

    // Verify status = draft
    let current_status: String = conn.query_row(
        "SELECT status FROM supplier_invoices WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![invoice_id, tenant_id],
        |row| row.get(0),
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    if current_status != "draft" {
        return Err("يمكن حذف المسودات فقط".into());
    }

    conn.execute(
        "UPDATE supplier_invoices
         SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
             confirmed_by = ?3
         WHERE id = ?1 AND tenant_id = ?2",
        params![invoice_id, tenant_id, user_id],
    ).map_err(|e| e.to_string())?;

    if let Err(e) = audit::log_action(&conn, &tenant_id, &user_id, "delete", "purchase_invoice", &invoice_id, None) {
        log::warn!("audit log failed after delete_purchase_draft: {}", e);
    }
    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "purchase_draft_deleted") {
        log::warn!("cloud sync enqueue failed after delete_purchase_draft: {}", e);
    }

    Ok(())
}

/// Return a confirmed invoice back to draft status.
/// Allowed only when: no payments, no paid schedules, no stock from its batches has been sold.
/// Reverses stock movements and removes the batches created on confirmation.
#[tauri::command]
pub fn return_purchase_to_draft(
    db: State<'_, Database>,
    tenant_id: String,
    invoice_id: String,
    user_id: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<PurchaseInvoiceDetail, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, "main-branch")?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_PURCHASES)?;
    guard::require_access(&conn, &user_id, "purchases", guard::Level::Write)?;
    // Verify status = confirmed
    let (current_status, payment_status): (String, String) = conn.query_row(
        "SELECT status, payment_status FROM supplier_invoices WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![invoice_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    if current_status != "confirmed" {
        return Err("الإرجاع للمسودة ممكن فقط للفواتير المؤكدة".into());
    }

    // Block if any payment recorded
    if payment_status == "paid" || payment_status == "partial" {
        return Err("لا يمكن الإرجاع للمسودة: توجد مدفوعات مسجّلة. استخدم مرتجع المشتريات.".into());
    }

    // Block if any paid payment schedule
    let paid_schedules: i64 = conn.query_row(
        "SELECT COUNT(*) FROM supplier_payment_schedules WHERE invoice_id = ?1 AND is_paid = 1 AND deleted_at IS NULL",
        params![invoice_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    if paid_schedules > 0 {
        return Err("لا يمكن الإرجاع للمسودة: تم سداد بعض الدفعات المجدولة.".into());
    }

    // Block if any batch item was sold
    let sold_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sale_items
         WHERE batch_id IN (SELECT id FROM batches WHERE supplier_invoice_id = ?1 AND deleted_at IS NULL)",
        params![invoice_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    if sold_count > 0 {
        return Err("لا يمكن الإرجاع للمسودة: تم بيع بعض الأصناف. استخدم مرتجع المشتريات.".into());
    }

    let branch_id: String = conn.query_row(
        "SELECT branch_id FROM supplier_invoices WHERE id = ?1",
        params![invoice_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    // Fetch batches to reverse
    let mut bstmt = conn.prepare(
        "SELECT id, product_id, quantity_current FROM batches
         WHERE supplier_invoice_id = ?1 AND deleted_at IS NULL"
    ).map_err(|e| e.to_string())?;
    let batches_data: Vec<(String, String, i64)> = bstmt.query_map(
        params![invoice_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    ).map_err(|e| e.to_string())?
      .filter_map(|r| r.ok())
      .collect();
    drop(bstmt);

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        // Insert reversal stock movements for audit trail
        for (batch_id, product_id, qty_current) in &batches_data {
            if *qty_current > 0 {
                let mv_id = Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO stock_movements (id, tenant_id, branch_id, product_id, batch_id,
                            movement_type, quantity_change, quantity_before, quantity_after,
                            reference_type, reference_id, notes, created_by)
                     VALUES (?1, ?2, ?3, ?4, ?5, 'adjust', ?6, ?7, 0, 'return_to_draft', ?8, ?9, ?10)",
                    params![mv_id, tenant_id, branch_id, product_id, batch_id,
                            -qty_current, qty_current, invoice_id,
                            "إرجاع فاتورة مؤكدة للمسودة", user_id],
                ).map_err(|e| e.to_string())?;
            }
        }

        // Soft-delete the batches created on confirmation
        conn.execute(
            "UPDATE batches SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                    quantity_current = 0, status = 'depleted',
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE supplier_invoice_id = ?1 AND deleted_at IS NULL",
            params![invoice_id],
        ).map_err(|e| e.to_string())?;

        // Delete any unpaid payment schedules
        conn.execute(
            "UPDATE supplier_payment_schedules
             SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE invoice_id = ?1 AND is_paid = 0 AND deleted_at IS NULL",
            params![invoice_id],
        ).map_err(|e| e.to_string())?;

        // Reset invoice to draft, clear confirmed fields and payment state
        conn.execute(
            "UPDATE supplier_invoices
             SET status = 'draft', confirmed_at = NULL, confirmed_by = NULL,
                 amount_paid = 0, payment_status = 'unpaid',
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1 AND tenant_id = ?2",
            params![invoice_id, tenant_id],
        ).map_err(|e| e.to_string())?;

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            if let Err(e) = audit::log_action(&conn, &tenant_id, &user_id, "return_to_draft", "purchase_invoice", &invoice_id, None) {
                log::warn!("audit log failed after return_purchase_to_draft: {}", e);
            }
            if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "purchase_returned_to_draft") {
                log::warn!("cloud sync enqueue failed after return_purchase_to_draft: {}", e);
            }
            fetch_invoice_detail(&conn, &invoice_id)
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}
