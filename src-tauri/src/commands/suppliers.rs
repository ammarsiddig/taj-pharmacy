use serde::{Deserialize, Serialize};
use tauri::State;
use rusqlite::params;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::audit;
use crate::commands::cloud_sync;
use crate::commands::license_guard;

const FLAG_SUPPLIERS: i64 = 128;

// ====== Structs ======

#[derive(Debug, Serialize)]
pub struct SupplierRow {
    pub id: String,
    pub name: String,
    pub name_ar: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub contact_person: Option<String>,
    pub total_invoices: i64,
    pub total_purchased: i64,
    pub total_paid: i64,
    pub balance_due: i64,
    pub overdue_amount: i64,
    pub last_purchase_date: Option<String>,
    pub is_active: bool,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SupplierData {
    pub name: String,
    pub name_ar: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub contact_person: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SupplierInvoiceRow {
    pub id: String,
    pub invoice_number: String,
    pub invoice_date: String,
    pub total: i64,
    pub amount_paid: i64,
    pub status: String,
    pub payment_status: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct SupplierPaymentRow {
    pub id: String,
    pub amount: i64,
    pub payment_method: String,
    pub account_name: String,
    pub invoice_number: Option<String>,
    pub payment_date: String,
    pub notes: Option<String>,
    pub created_by_name: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct SupplierDetail {
    pub id: String,
    pub name: String,
    pub name_ar: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub contact_person: Option<String>,
    pub total_invoices: i64,
    pub total_purchased: i64,
    pub total_paid: i64,
    pub balance_due: i64,
    pub overdue_amount: i64,
    pub last_purchase_date: Option<String>,
    pub is_active: bool,
    pub notes: Option<String>,
    pub recent_invoices: Vec<SupplierInvoiceRow>,
    pub recent_payments: Vec<SupplierPaymentRow>,
}

#[derive(Debug, Deserialize)]
pub struct SupplierPaymentData {
    pub amount: i64,
    pub payment_method: String,
    pub account_id: String,
    pub invoice_id: Option<String>,
    pub payment_date: String,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SupplierPayment {
    pub id: String,
    pub supplier_id: String,
    pub amount: i64,
    pub payment_method: String,
    pub account_name: String,
    pub payment_date: String,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct SupplierStatementRow {
    pub date: String,
    pub row_type: String,
    pub description: String,
    pub debit: i64,
    pub credit: i64,
    pub running_balance: i64,
}

// ====== Helpers ======

/// Shared payment helper — callable from confirm_purchase_with_payment and mark_schedule_paid.
/// Caller is responsible for BEGIN/COMMIT/ROLLBACK around this.
#[allow(clippy::too_many_arguments)]
pub(crate) fn do_supplier_payment(
    conn: &rusqlite::Connection,
    tenant_id: &str,
    supplier_id: &str,
    invoice_id: &str,
    amount: i64,
    _payment_method: &str,
    account_id: &str,
    payment_date: &str,
    notes: Option<&str>,
    user_id: &str,
    acct_balance: i64,
) -> Result<String, String> {
    // Derive payment_method from the account's type — backend is authoritative.
    let account_type: String = conn.query_row(
        "SELECT account_type FROM accounts WHERE id = ?1 AND deleted_at IS NULL",
        rusqlite::params![account_id],
        |row| row.get(0),
    ).map_err(|_| "الحساب غير موجود".to_string())?;
    let payment_method = match account_type.as_str() {
        "bank" => "bank_transfer",
        _ => "cash",
    };

    let payment_id = Uuid::new_v4().to_string();
    let tx_id = Uuid::new_v4().to_string();

    // 1. Insert supplier payment
    conn.execute(
        "INSERT INTO supplier_payments (id, tenant_id, supplier_id, invoice_id, amount,
                payment_method, account_id, payment_date, notes, created_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![payment_id, tenant_id, supplier_id, invoice_id, amount,
                payment_method, account_id, payment_date, notes, user_id],
    ).map_err(|e| e.to_string())?;

    // 2. Account transaction
    conn.execute(
        "INSERT INTO account_transactions (id, tenant_id, account_id, transaction_type, direction,
                amount, balance_before, balance_after, reference_type, reference_id, description, created_by)
         VALUES (?1, ?2, ?3, 'supplier_payment', 'out', ?4, ?5, ?6, 'supplier_payment', ?7, 'دفعة مورد', ?8)",
        params![tx_id, tenant_id, account_id, amount,
                acct_balance, acct_balance - amount, payment_id, user_id],
    ).map_err(|e| e.to_string())?;

    // 3. Update account balance
    conn.execute(
        "UPDATE accounts SET current_balance = current_balance - ?2,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1",
        params![account_id, amount],
    ).map_err(|e| e.to_string())?;

    // 4. Update invoice amount_paid + payment_status
    if !invoice_id.is_empty() {
        conn.execute(
            "UPDATE supplier_invoices SET
                amount_paid = amount_paid + ?2,
                payment_status = CASE
                    WHEN amount_paid + ?2 >= total THEN 'paid'
                    WHEN amount_paid + ?2 > 0 THEN 'partial'
                    ELSE 'unpaid'
                END,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1 AND tenant_id = ?3",
            params![invoice_id, amount, tenant_id],
        ).map_err(|e| e.to_string())?;
    }

    Ok(payment_id)
}

fn read_supplier_row(conn: &rusqlite::Connection, tenant_id: &str, id: &str) -> Result<SupplierRow, String> {
    conn.query_row(
        "SELECT s.id, s.name, s.name_ar, s.phone, s.email, s.address, s.contact_person,
                COALESCE((SELECT COUNT(*) FROM supplier_invoices si WHERE si.supplier_id = s.id AND si.status = 'confirmed'), 0),
                COALESCE((SELECT SUM(si.total) FROM supplier_invoices si WHERE si.supplier_id = s.id AND si.status = 'confirmed'), 0),
                COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplier_id = s.id), 0),
                COALESCE((SELECT SUM(si2.total) FROM supplier_invoices si2 WHERE si2.supplier_id = s.id AND si2.status = 'confirmed'), 0)
                  - COALESCE((SELECT SUM(sp2.amount) FROM supplier_payments sp2 WHERE sp2.supplier_id = s.id), 0),
                COALESCE((SELECT SUM(si3.total - si3.amount_paid) FROM supplier_invoices si3
                    WHERE si3.supplier_id = s.id AND si3.status = 'confirmed'
                    AND si3.payment_status != 'paid'
                    AND si3.confirmed_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')), 0),
                (SELECT MAX(si4.invoice_date) FROM supplier_invoices si4 WHERE si4.supplier_id = s.id AND si4.status = 'confirmed'),
                s.is_active, s.notes
         FROM suppliers s
         WHERE s.id = ?1 AND s.tenant_id = ?2 AND s.deleted_at IS NULL",
        params![id, tenant_id],
        |row| Ok(SupplierRow {
            id: row.get(0)?,
            name: row.get(1)?,
            name_ar: row.get(2)?,
            phone: row.get(3)?,
            email: row.get(4)?,
            address: row.get(5)?,
            contact_person: row.get(6)?,
            total_invoices: row.get(7)?,
            total_purchased: row.get(8)?,
            total_paid: row.get(9)?,
            balance_due: row.get(10)?,
            overdue_amount: row.get(11)?,
            last_purchase_date: row.get(12)?,
            is_active: row.get(13)?,
            notes: row.get(14)?,
        }),
    ).map_err(|e| format!("المورد غير موجود: {}", e))
}

// ====== Commands ======

#[tauri::command]
pub fn get_suppliers_full(
    db: State<'_, Database>,
    tenant_id: String,
    search: Option<String>,
    is_active: Option<bool>,
) -> Result<Vec<SupplierRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT s.id, s.name, s.name_ar, s.phone, s.email, s.address, s.contact_person,
                COALESCE((SELECT COUNT(*) FROM supplier_invoices si WHERE si.supplier_id = s.id AND si.status = 'confirmed'), 0),
                COALESCE((SELECT SUM(si.total) FROM supplier_invoices si WHERE si.supplier_id = s.id AND si.status = 'confirmed'), 0),
                COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplier_id = s.id), 0),
                COALESCE((SELECT SUM(si2.total) FROM supplier_invoices si2 WHERE si2.supplier_id = s.id AND si2.status = 'confirmed'), 0)
                  - COALESCE((SELECT SUM(sp2.amount) FROM supplier_payments sp2 WHERE sp2.supplier_id = s.id), 0),
                COALESCE((SELECT SUM(si3.total - si3.amount_paid) FROM supplier_invoices si3
                    WHERE si3.supplier_id = s.id AND si3.status = 'confirmed'
                    AND si3.payment_status != 'paid'
                    AND si3.confirmed_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')), 0),
                (SELECT MAX(si4.invoice_date) FROM supplier_invoices si4 WHERE si4.supplier_id = s.id AND si4.status = 'confirmed'),
                s.is_active, s.notes
         FROM suppliers s
         WHERE s.tenant_id = ?1 AND s.deleted_at IS NULL"
    );
    let mut pv: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(tenant_id.clone())];
    let mut idx = 2;

    if let Some(ref q) = search {
        if !q.is_empty() {
            sql.push_str(&format!(" AND (s.name LIKE ?{0} OR s.name_ar LIKE ?{0} OR s.phone LIKE ?{0})", idx));
            pv.push(Box::new(format!("%{}%", q)));
            idx += 1;
        }
    }

    if let Some(active) = is_active {
        sql.push_str(&format!(" AND s.is_active = ?{}", idx));
        pv.push(Box::new(active));
        let _ = idx;
    }

    sql.push_str(" ORDER BY s.name ASC");

    let pr: Vec<&dyn rusqlite::types::ToSql> = pv.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(pr.as_slice(), |row| {
        Ok(SupplierRow {
            id: row.get(0)?,
            name: row.get(1)?,
            name_ar: row.get(2)?,
            phone: row.get(3)?,
            email: row.get(4)?,
            address: row.get(5)?,
            contact_person: row.get(6)?,
            total_invoices: row.get(7)?,
            total_purchased: row.get(8)?,
            total_paid: row.get(9)?,
            balance_due: row.get(10)?,
            overdue_amount: row.get(11)?,
            last_purchase_date: row.get(12)?,
            is_active: row.get(13)?,
            notes: row.get(14)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(rows)
}

#[tauri::command]
pub fn get_supplier(
    db: State<'_, Database>,
    tenant_id: String,
    supplier_id: String,
) -> Result<SupplierDetail, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let row = read_supplier_row(&conn, &tenant_id, &supplier_id)?;

    // Recent invoices
    let mut inv_stmt = conn.prepare(
        "SELECT id, invoice_number, invoice_date, total, amount_paid, status, payment_status, created_at
         FROM supplier_invoices
         WHERE supplier_id = ?1 AND tenant_id = ?2 AND status != 'cancelled'
         ORDER BY created_at DESC LIMIT 10"
    ).map_err(|e| e.to_string())?;

    let recent_invoices = inv_stmt.query_map(params![supplier_id, tenant_id], |r| {
        Ok(SupplierInvoiceRow {
            id: r.get(0)?,
            invoice_number: r.get(1)?,
            invoice_date: r.get(2)?,
            total: r.get(3)?,
            amount_paid: r.get(4)?,
            status: r.get(5)?,
            payment_status: r.get(6)?,
            created_at: r.get(7)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    // Recent payments
    let mut pay_stmt = conn.prepare(
        "SELECT sp.id, sp.amount, sp.payment_method, a.name, si.invoice_number,
                sp.payment_date, sp.notes, u.full_name, sp.created_at
         FROM supplier_payments sp
         JOIN accounts a ON sp.account_id = a.id
         JOIN users u ON sp.created_by = u.id
         LEFT JOIN supplier_invoices si ON sp.invoice_id = si.id
         WHERE sp.supplier_id = ?1 AND sp.tenant_id = ?2
         ORDER BY sp.created_at DESC LIMIT 10"
    ).map_err(|e| e.to_string())?;

    let recent_payments = pay_stmt.query_map(params![supplier_id, tenant_id], |r| {
        Ok(SupplierPaymentRow {
            id: r.get(0)?,
            amount: r.get(1)?,
            payment_method: r.get(2)?,
            account_name: r.get(3)?,
            invoice_number: r.get(4)?,
            payment_date: r.get(5)?,
            notes: r.get(6)?,
            created_by_name: r.get(7)?,
            created_at: r.get(8)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(SupplierDetail {
        id: row.id,
        name: row.name,
        name_ar: row.name_ar,
        phone: row.phone,
        email: row.email,
        address: row.address,
        contact_person: row.contact_person,
        total_invoices: row.total_invoices,
        total_purchased: row.total_purchased,
        total_paid: row.total_paid,
        balance_due: row.balance_due,
        overdue_amount: row.overdue_amount,
        last_purchase_date: row.last_purchase_date,
        is_active: row.is_active,
        notes: row.notes,
        recent_invoices,
        recent_payments,
    })
}

#[tauri::command]
pub fn create_supplier_full(
    db: State<'_, Database>,
    tenant_id: String,
    data: SupplierData,
) -> Result<SupplierRow, String> {
    if data.name.trim().is_empty() {
        return Err("اسم المورد مطلوب".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_SUPPLIERS)?;
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO suppliers (id, tenant_id, name, name_ar, phone, email, address, contact_person, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![id, tenant_id, data.name, data.name_ar, data.phone, data.email, data.address, data.contact_person, data.notes],
    ).map_err(|e| format!("فشل إنشاء المورد: {}", e))?;

    if let Err(e) = audit::log_action(&conn, &tenant_id, "system", "create", "supplier", &id, None) {
        log::warn!("audit log failed after create_supplier_full: {}", e);
    }
    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "supplier_created") {
        log::warn!("cloud sync enqueue failed after create_supplier_full: {}", e);
    }

    read_supplier_row(&conn, &tenant_id, &id)
}

#[tauri::command]
pub fn update_supplier_full(
    db: State<'_, Database>,
    tenant_id: String,
    supplier_id: String,
    data: SupplierData,
) -> Result<SupplierRow, String> {
    if data.name.trim().is_empty() {
        return Err("اسم المورد مطلوب".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_SUPPLIERS)?;

    conn.execute(
        "UPDATE suppliers SET name = ?3, name_ar = ?4, phone = ?5, email = ?6,
                address = ?7, contact_person = ?8, notes = ?9,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![supplier_id, tenant_id, data.name, data.name_ar, data.phone, data.email, data.address, data.contact_person, data.notes],
    ).map_err(|e| e.to_string())?;

    if let Err(e) = audit::log_action(&conn, &tenant_id, "system", "update", "supplier", &supplier_id, None) {
        log::warn!("audit log failed after update_supplier_full: {}", e);
    }
    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "supplier_updated") {
        log::warn!("cloud sync enqueue failed after update_supplier_full: {}", e);
    }

    read_supplier_row(&conn, &tenant_id, &supplier_id)
}

#[tauri::command]
pub fn toggle_supplier_active(
    db: State<'_, Database>,
    tenant_id: String,
    supplier_id: String,
) -> Result<SupplierRow, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_SUPPLIERS)?;

    conn.execute(
        "UPDATE suppliers SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![supplier_id, tenant_id],
    ).map_err(|e| e.to_string())?;

    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "supplier_toggled") {
        log::warn!("cloud sync enqueue failed after toggle_supplier_active: {}", e);
    }

    read_supplier_row(&conn, &tenant_id, &supplier_id)
}

#[tauri::command]
pub fn record_supplier_payment(
    db: State<'_, Database>,
    tenant_id: String,
    supplier_id: String,
    user_id: String,
    data: SupplierPaymentData,
) -> Result<SupplierPayment, String> {
    if data.amount <= 0 {
        return Err("المبلغ يجب أن يكون أكبر من صفر".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_SUPPLIERS)?;

    // Validate supplier
    let active: bool = conn.query_row(
        "SELECT is_active FROM suppliers WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![supplier_id, tenant_id],
        |row| row.get(0),
    ).map_err(|_| "المورد غير موجود".to_string())?;

    if !active {
        return Err("لا يمكن تسجيل دفعة لمورد غير نشط".to_string());
    }

    // Validate account
    let acct_balance: i64 = conn.query_row(
        "SELECT current_balance FROM accounts WHERE id = ?1 AND is_active = 1 AND deleted_at IS NULL",
        params![data.account_id],
        |row| row.get(0),
    ).map_err(|_| "الحساب غير موجود أو غير نشط".to_string())?;

    if data.amount > acct_balance {
        return Err(format!(
            "رصيد الحساب غير كافٍ. المتاح: {} والمطلوب: {}",
            acct_balance, data.amount
        ));
    }

    // Overpayment guard: if linked to invoice, ensure amount ≤ remaining balance
    if let Some(ref inv_id) = data.invoice_id {
        if !inv_id.is_empty() {
            let remaining: i64 = conn.query_row(
                "SELECT total - amount_paid FROM supplier_invoices WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
                params![inv_id, tenant_id],
                |row| row.get(0),
            ).map_err(|_| "الفاتورة غير موجودة".to_string())?;
            if data.amount > remaining {
                return Err(format!(
                    "المبلغ يتجاوز الرصيد المتبقي للفاتورة. المتبقي: {}",
                    remaining
                ));
            }
        }
    }

    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    let inv_id_str = data.invoice_id.as_deref().unwrap_or("");
    let res = do_supplier_payment(
        &conn, &tenant_id, &supplier_id,
        inv_id_str,
        data.amount, &data.payment_method, &data.account_id,
        &data.payment_date, data.notes.as_deref(),
        &user_id, acct_balance,
    );

    let payment_id = match res {
        Ok(pid) => { conn.execute_batch("COMMIT").map_err(|e| e.to_string())?; pid }
        Err(e) => { let _ = conn.execute_batch("ROLLBACK"); return Err(e); }
    };

    if let Err(e) = audit::log_action(&conn, &tenant_id, &user_id, "payment", "supplier", &payment_id, None) {
        log::warn!("audit log failed after record_supplier_payment: {}", e);
    }
    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "supplier_payment_recorded") {
        log::warn!("cloud sync enqueue failed after record_supplier_payment: {}", e);
    }

    let (acct_name, derived_method, created_at): (String, String, String) = conn.query_row(
        "SELECT a.name, sp.payment_method, sp.created_at
         FROM supplier_payments sp JOIN accounts a ON sp.account_id = a.id
         WHERE sp.id = ?1",
        params![payment_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).unwrap_or_else(|_| (String::new(), data.payment_method.clone(), String::new()));

    Ok(SupplierPayment {
        id: payment_id,
        supplier_id,
        amount: data.amount,
        payment_method: derived_method,
        account_name: acct_name,
        payment_date: data.payment_date,
        notes: data.notes,
        created_at,
    })
}

#[tauri::command]
pub fn get_supplier_statement(
    db: State<'_, Database>,
    tenant_id: String,
    supplier_id: String,
    date_from: Option<String>,
    date_to: Option<String>,
) -> Result<Vec<SupplierStatementRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT date, row_type, description, debit, credit FROM (
            SELECT si.confirmed_at as date, 'invoice' as row_type,
                   COALESCE(si.invoice_number, 'فاتورة') as description,
                   si.total as debit, 0 as credit
            FROM supplier_invoices si
            WHERE si.supplier_id = ?1 AND si.tenant_id = ?2 AND si.status = 'confirmed'
            UNION ALL
            SELECT sp.payment_date as date, 'payment' as row_type,
                   'دفعة' as description,
                   0 as debit, sp.amount as credit
            FROM supplier_payments sp
            WHERE sp.supplier_id = ?1 AND sp.tenant_id = ?2
        ) t WHERE 1=1"
    );

    let mut pv: Vec<Box<dyn rusqlite::types::ToSql>> = vec![
        Box::new(supplier_id),
        Box::new(tenant_id),
    ];
    let mut idx = 3;

    if let Some(ref df) = date_from {
        if !df.is_empty() {
            sql.push_str(&format!(" AND date >= ?{}", idx));
            pv.push(Box::new(df.clone()));
            idx += 1;
        }
    }
    if let Some(ref dt) = date_to {
        if !dt.is_empty() {
            sql.push_str(&format!(" AND date <= ?{}", idx));
            pv.push(Box::new(dt.clone()));
            let _ = idx;
        }
    }

    sql.push_str(" ORDER BY date ASC, row_type ASC");

    let pr: Vec<&dyn rusqlite::types::ToSql> = pv.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let raw_rows: Vec<(String, String, String, i64, i64)> = stmt.query_map(pr.as_slice(), |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut running = 0i64;
    let result = raw_rows.into_iter().map(|(date, row_type, desc, debit, credit)| {
        running += debit - credit;
        SupplierStatementRow {
            date,
            row_type,
            description: desc,
            debit,
            credit,
            running_balance: running,
        }
    }).collect();

    Ok(result)
}
