use serde::{Deserialize, Serialize};
use tauri::State;
use rusqlite::params;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::cloud_sync;
use crate::commands::session_state::{AuthSessionState, resolve_identity};
use crate::commands::suppliers::do_supplier_payment;
use super::purchases::{PurchaseCreateData, PurchaseInvoiceDetail};
use super::purchases_invoices::fetch_invoice_detail;

#[derive(Debug, Serialize, Clone)]
pub struct PaymentScheduleRow {
    pub id: String,
    pub invoice_id: String,
    pub due_date: String,
    pub amount: i64,
    pub note: Option<String>,
    pub is_paid: bool,
    pub paid_at: Option<String>,
    pub payment_id: Option<String>,
    pub account_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct PaymentScheduleData {
    pub due_date: String,
    pub amount: i64,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SchedulePaymentData {
    pub account_id: String,
    pub payment_method: String,
    pub payment_date: String,
    pub notes: Option<String>,
}

fn do_update_invoice(
    conn: &rusqlite::Connection,
    tenant_id: &str,
    invoice_id: &str,
    data: &PurchaseCreateData,
) -> Result<(), String> {
    let discount = data.discount.unwrap_or(0);
    let tax_val = data.tax_amount.unwrap_or(0);

    conn.execute(
        "DELETE FROM supplier_invoice_items WHERE invoice_id = ?1",
        params![invoice_id],
    ).map_err(|e| e.to_string())?;

    let mut subtotal: i64 = 0;
    for item in &data.items {
        let item_id = Uuid::new_v4().to_string();
        let item_sub = item.quantity * item.unit_cost;
        subtotal += item_sub;
        conn.execute(
            "INSERT INTO supplier_invoice_items (id, tenant_id, invoice_id, product_id,
                    batch_number, expiry_date, quantity, unit_cost, sale_price, subtotal)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![item_id, tenant_id, invoice_id, item.product_id,
                    item.batch_number, item.expiry_date, item.quantity,
                    item.unit_cost, item.sale_price, item_sub],
        ).map_err(|e| format!("فشل إضافة الصنف: {}", e))?;
    }

    let total = subtotal - discount + tax_val;
    conn.execute(
        "UPDATE supplier_invoices
         SET supplier_id = ?2, invoice_date = ?3, notes = ?4,
             discount = ?5, tax_amount = ?6, subtotal = ?7, total = ?8,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1 AND tenant_id = ?9",
        params![invoice_id, data.supplier_id, data.invoice_date, data.notes,
                discount, tax_val, subtotal, total, tenant_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn update_purchase_invoice(
    db: State<'_, Database>,
    tenant_id: String,
    invoice_id: String,
    data: PurchaseCreateData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<PurchaseInvoiceDetail, String> {
    if data.items.is_empty() {
        return Err("يجب إضافة صنف واحد على الأقل".into());
    }
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;

    let current_status: String = conn.query_row(
        "SELECT status FROM supplier_invoices WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![invoice_id, tenant_id],
        |row| row.get(0),
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    if current_status != "draft" {
        return Err("لا يمكن تعديل فاتورة مؤكدة أو ملغاة".into());
    }

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;
    match do_update_invoice(&conn, &tenant_id, &invoice_id, &data) {
        Ok(()) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            fetch_invoice_detail(&conn, &invoice_id)
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

fn fetch_schedule(conn: &rusqlite::Connection, schedule_id: &str) -> Result<PaymentScheduleRow, String> {
    conn.query_row(
        "SELECT id, invoice_id, due_date, amount, note, is_paid, paid_at, payment_id, account_id, created_at
         FROM supplier_payment_schedules WHERE id = ?1",
        params![schedule_id],
        |row| Ok(PaymentScheduleRow {
            id: row.get(0)?,
            invoice_id: row.get(1)?,
            due_date: row.get(2)?,
            amount: row.get(3)?,
            note: row.get(4)?,
            is_paid: row.get::<_, i64>(5)? != 0,
            paid_at: row.get(6)?,
            payment_id: row.get(7)?,
            account_id: row.get(8)?,
            created_at: row.get(9)?,
        })
    ).map_err(|_| "جدول الدفع غير موجود".into())
}

#[tauri::command]
pub fn get_payment_schedules(
    db: State<'_, Database>,
    tenant_id: String,
    invoice_id: String,
) -> Result<Vec<PaymentScheduleRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, invoice_id, due_date, amount, note, is_paid, paid_at, payment_id, account_id, created_at
         FROM supplier_payment_schedules
         WHERE tenant_id = ?1 AND invoice_id = ?2 AND deleted_at IS NULL
         ORDER BY due_date ASC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![tenant_id, invoice_id], |row| {
        Ok(PaymentScheduleRow {
            id: row.get(0)?,
            invoice_id: row.get(1)?,
            due_date: row.get(2)?,
            amount: row.get(3)?,
            note: row.get(4)?,
            is_paid: row.get::<_, i64>(5)? != 0,
            paid_at: row.get(6)?,
            payment_id: row.get(7)?,
            account_id: row.get(8)?,
            created_at: row.get(9)?,
        })
    }).map_err(|e| e.to_string())?
      .filter_map(|r| r.ok())
      .collect();

    Ok(rows)
}

#[tauri::command]
pub fn create_payment_schedule(
    db: State<'_, Database>,
    tenant_id: String,
    invoice_id: String,
    data: PaymentScheduleData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<PaymentScheduleRow, String> {
    if data.amount <= 0 {
        return Err("المبلغ يجب أن يكون أكبر من صفر".into());
    }
    if data.due_date.trim().is_empty() {
        return Err("تاريخ الاستحقاق مطلوب".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;

    let (inv_status, inv_total, inv_paid): (String, i64, i64) = conn.query_row(
        "SELECT status, total, amount_paid FROM supplier_invoices WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![invoice_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    if inv_status != "confirmed" {
        return Err("جداول الدفع خاصة بالفواتير المؤكدة فقط".into());
    }

    let remaining = inv_total - inv_paid;
    if remaining <= 0 {
        return Err("لا يوجد رصيد متبقِ لهذه الفاتورة".into());
    }

    let scheduled_unpaid: i64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM supplier_payment_schedules
         WHERE invoice_id = ?1 AND is_paid = 0 AND deleted_at IS NULL",
        params![invoice_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    if scheduled_unpaid + data.amount > remaining {
        return Err(format!(
            "إجمالي جداول الدفع يتجاوز الرصيد المتبقي ({}). متاح: {}",
            remaining, remaining - scheduled_unpaid
        ));
    }

    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO supplier_payment_schedules (id, tenant_id, invoice_id, due_date, amount, note)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, tenant_id, invoice_id, data.due_date, data.amount, data.note],
    ).map_err(|e| format!("فشل إنشاء جدول الدفع: {}", e))?;

    fetch_schedule(&conn, &id)
}

#[tauri::command]
pub fn mark_schedule_paid(
    db: State<'_, Database>,
    tenant_id: String,
    schedule_id: String,
    user_id: String,
    data: SchedulePaymentData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<PaymentScheduleRow, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, "")?;

    let (invoice_id, amount, already_paid): (String, i64, i64) = conn.query_row(
        "SELECT invoice_id, amount, is_paid FROM supplier_payment_schedules
         WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![schedule_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|_| "جدول الدفع غير موجود".to_string())?;

    if already_paid != 0 {
        return Err("هذه الدفعة سُدِّدت مسبقاً".into());
    }

    let supplier_id: String = conn.query_row(
        "SELECT supplier_id FROM supplier_invoices WHERE id = ?1 AND tenant_id = ?2",
        params![invoice_id, tenant_id],
        |row| row.get(0),
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    let acct_balance: i64 = conn.query_row(
        "SELECT current_balance FROM accounts WHERE id = ?1 AND is_active = 1 AND deleted_at IS NULL",
        params![data.account_id],
        |row| row.get(0),
    ).map_err(|_| "الحساب غير موجود أو غير نشط".to_string())?;

    if amount > acct_balance {
        return Err(format!("رصيد الحساب غير كافٍ. المتاح: {} والمطلوب: {}", acct_balance, amount));
    }

    let inv_remaining: i64 = conn.query_row(
        "SELECT total - amount_paid FROM supplier_invoices WHERE id = ?1 AND tenant_id = ?2",
        params![invoice_id, tenant_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    if amount > inv_remaining {
        return Err(format!("المبلغ يتجاوز الرصيد المتبقي للفاتورة ({})", inv_remaining));
    }

    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    let res = do_pay_schedule(
        &conn, &tenant_id, &schedule_id, &invoice_id, &supplier_id,
        &user_id, &data, amount, acct_balance,
    );

    match res {
        Ok(()) => { conn.execute_batch("COMMIT").map_err(|e| e.to_string())?; }
        Err(e) => { let _ = conn.execute_batch("ROLLBACK"); return Err(e); }
    }

    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "schedule_paid") {
        log::warn!("cloud sync enqueue failed after mark_schedule_paid: {}", e);
    }

    fetch_schedule(&conn, &schedule_id)
}

fn do_pay_schedule(
    conn: &rusqlite::Connection,
    tenant_id: &str,
    schedule_id: &str,
    invoice_id: &str,
    supplier_id: &str,
    user_id: &str,
    data: &SchedulePaymentData,
    amount: i64,
    acct_balance: i64,
) -> Result<(), String> {
    let payment_id = do_supplier_payment(
        conn, tenant_id, supplier_id, invoice_id,
        amount, &data.payment_method, &data.account_id,
        &data.payment_date, data.notes.as_deref(), user_id, acct_balance,
    )?;

    conn.execute(
        "UPDATE supplier_payment_schedules
         SET is_paid = 1,
             paid_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
             payment_id = ?2,
             account_id = ?3,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1",
        params![schedule_id, payment_id, data.account_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_payment_schedule(
    db: State<'_, Database>,
    tenant_id: String,
    schedule_id: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    conn.execute(
        "UPDATE supplier_payment_schedules
         SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![schedule_id, tenant_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}
