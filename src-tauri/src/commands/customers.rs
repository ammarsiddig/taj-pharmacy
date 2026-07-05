use serde::{Deserialize, Serialize};
use tauri::State;
use rusqlite::params;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::audit;
use crate::commands::cloud_sync;
use crate::commands::license_guard;
use crate::commands::session_state::{AuthSessionState, resolve_identity};

const FLAG_CUSTOMERS: i64 = 64;

// ====== Structs ======

#[derive(Debug, Serialize)]
pub struct CustomerRow {
    pub id: String,
    pub name: String,
    pub name_ar: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub credit_limit: i64,
    pub current_balance: i64,
    pub total_purchases: i64,
    pub last_purchase_date: Option<String>,
    pub is_active: bool,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CustomerData {
    pub name: String,
    pub name_ar: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub credit_limit: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CustomerPaymentRow {
    pub id: String,
    pub amount: i64,
    pub payment_method: String,
    pub account_name: String,
    pub notes: Option<String>,
    pub created_by_name: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct CustomerSaleRow {
    pub id: String,
    pub sale_number: String,
    pub total: i64,
    pub payment_method: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct CustomerDetail {
    pub id: String,
    pub name: String,
    pub name_ar: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub credit_limit: i64,
    pub current_balance: i64,
    pub total_purchases: i64,
    pub last_purchase_date: Option<String>,
    pub is_active: bool,
    pub notes: Option<String>,
    pub recent_sales: Vec<CustomerSaleRow>,
    pub recent_payments: Vec<CustomerPaymentRow>,
}

#[derive(Debug, Deserialize)]
pub struct CustomerPaymentData {
    pub amount: i64,
    pub payment_method: String,
    pub account_id: String,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct StatementRow {
    pub date: String,
    pub row_type: String,
    pub description: String,
    pub debit: i64,
    pub credit: i64,
    pub running_balance: i64,
}

// ====== Helpers ======

fn read_customer_row(conn: &rusqlite::Connection, tenant_id: &str, id: &str) -> Result<CustomerRow, String> {
    conn.query_row(
        "SELECT c.id, c.name, c.name_ar, c.phone, c.email, c.address,
                c.credit_limit, c.current_balance,
                COALESCE((SELECT SUM(s.total) FROM sales s WHERE s.customer_id = c.id AND s.deleted_at IS NULL), 0),
                (SELECT MAX(s.created_at) FROM sales s WHERE s.customer_id = c.id AND s.deleted_at IS NULL),
                c.is_active, c.notes
         FROM customers c
         WHERE c.id = ?1 AND c.tenant_id = ?2 AND c.deleted_at IS NULL",
        params![id, tenant_id],
        |row| Ok(CustomerRow {
            id: row.get(0)?,
            name: row.get(1)?,
            name_ar: row.get(2)?,
            phone: row.get(3)?,
            email: row.get(4)?,
            address: row.get(5)?,
            credit_limit: row.get(6)?,
            current_balance: row.get(7)?,
            total_purchases: row.get(8)?,
            last_purchase_date: row.get(9)?,
            is_active: row.get(10)?,
            notes: row.get(11)?,
        }),
    ).map_err(|_| "العميل غير موجود".to_string())
}

// ====== Commands ======

#[tauri::command]
pub fn get_customers(
    db: State<'_, Database>,
    tenant_id: String,
    search: Option<String>,
    is_active: Option<bool>,
    has_balance: Option<bool>,
) -> Result<Vec<CustomerRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT c.id, c.name, c.name_ar, c.phone, c.email, c.address,
                c.credit_limit, c.current_balance,
                COALESCE((SELECT SUM(s.total) FROM sales s WHERE s.customer_id = c.id AND s.deleted_at IS NULL), 0),
                (SELECT MAX(s.created_at) FROM sales s WHERE s.customer_id = c.id AND s.deleted_at IS NULL),
                c.is_active, c.notes
         FROM customers c
         WHERE c.tenant_id = ?1 AND c.deleted_at IS NULL"
    );
    let mut pv: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(tenant_id.clone())];
    let mut idx = 2;

    if let Some(ref s) = search {
        if !s.is_empty() {
            sql.push_str(&format!(" AND (c.name LIKE ?{} OR c.name_ar LIKE ?{} OR c.phone LIKE ?{})", idx, idx, idx));
            pv.push(Box::new(format!("%{}%", s)));
            idx += 1;
        }
    }

    if let Some(active) = is_active {
        sql.push_str(&format!(" AND c.is_active = ?{}", idx));
        pv.push(Box::new(active));
        idx += 1;
    }

    if let Some(true) = has_balance {
        sql.push_str(" AND c.current_balance > 0");
    }

    let _ = idx;

    sql.push_str(" ORDER BY c.name_ar, c.name");

    let pr: Vec<&dyn rusqlite::types::ToSql> = pv.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(pr.as_slice(), |row| {
        Ok(CustomerRow {
            id: row.get(0)?,
            name: row.get(1)?,
            name_ar: row.get(2)?,
            phone: row.get(3)?,
            email: row.get(4)?,
            address: row.get(5)?,
            credit_limit: row.get(6)?,
            current_balance: row.get(7)?,
            total_purchases: row.get(8)?,
            last_purchase_date: row.get(9)?,
            is_active: row.get(10)?,
            notes: row.get(11)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(rows)
}

#[tauri::command]
pub fn get_customer(
    db: State<'_, Database>,
    tenant_id: String,
    customer_id: String,
) -> Result<CustomerDetail, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let cust = read_customer_row(&conn, &tenant_id, &customer_id)?;

    // Recent sales
    let mut sstmt = conn.prepare(
        "SELECT id, sale_number, total, payment_method, created_at
         FROM sales WHERE customer_id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 10"
    ).map_err(|e| e.to_string())?;

    let recent_sales = sstmt.query_map(params![customer_id, tenant_id], |row| {
        Ok(CustomerSaleRow {
            id: row.get(0)?,
            sale_number: row.get(1)?,
            total: row.get(2)?,
            payment_method: row.get(3)?,
            created_at: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    // Recent payments
    let mut pstmt = conn.prepare(
        "SELECT cp.id, cp.amount, cp.payment_method, a.name, cp.notes, u.full_name, cp.created_at
         FROM customer_payments cp
         JOIN accounts a ON cp.account_id = a.id
         JOIN users u ON cp.created_by = u.id
         WHERE cp.customer_id = ?1 AND cp.tenant_id = ?2
         ORDER BY cp.created_at DESC LIMIT 10"
    ).map_err(|e| e.to_string())?;

    let recent_payments = pstmt.query_map(params![customer_id, tenant_id], |row| {
        Ok(CustomerPaymentRow {
            id: row.get(0)?,
            amount: row.get(1)?,
            payment_method: row.get(2)?,
            account_name: row.get(3)?,
            notes: row.get(4)?,
            created_by_name: row.get(5)?,
            created_at: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(CustomerDetail {
        id: cust.id,
        name: cust.name,
        name_ar: cust.name_ar,
        phone: cust.phone,
        email: cust.email,
        address: cust.address,
        credit_limit: cust.credit_limit,
        current_balance: cust.current_balance,
        total_purchases: cust.total_purchases,
        last_purchase_date: cust.last_purchase_date,
        is_active: cust.is_active,
        notes: cust.notes,
        recent_sales,
        recent_payments,
    })
}

#[tauri::command]
pub fn create_customer(
    db: State<'_, Database>,
    tenant_id: String,
    data: CustomerData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<CustomerRow, String> {
    if data.name.trim().is_empty() {
        return Err("اسم العميل مطلوب".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_CUSTOMERS)?;
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO customers (id, tenant_id, name, name_ar, phone, email, address, credit_limit, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![id, tenant_id, data.name, data.name_ar, data.phone, data.email, data.address, data.credit_limit, data.notes],
    ).map_err(|e| format!("فشل إنشاء العميل: {}", e))?;

    if let Err(e) = audit::log_action(&conn, &tenant_id, "system", "create", "customer", &id, None) {
        log::warn!("audit log failed after create_customer: {}", e);
    }
    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "customer_created") {
        log::warn!("cloud sync enqueue failed after create_customer: {}", e);
    }

    read_customer_row(&conn, &tenant_id, &id)
}

#[tauri::command]
pub fn update_customer(
    db: State<'_, Database>,
    tenant_id: String,
    customer_id: String,
    data: CustomerData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<CustomerRow, String> {
    if data.name.trim().is_empty() {
        return Err("اسم العميل مطلوب".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_CUSTOMERS)?;

    conn.execute(
        "UPDATE customers SET name = ?3, name_ar = ?4, phone = ?5, email = ?6,
                address = ?7, credit_limit = ?8, notes = ?9,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![customer_id, tenant_id, data.name, data.name_ar, data.phone, data.email, data.address, data.credit_limit, data.notes],
    ).map_err(|e| format!("فشل تحديث العميل: {}", e))?;

    if let Err(e) = audit::log_action(&conn, &tenant_id, "system", "update", "customer", &customer_id, None) {
        log::warn!("audit log failed after update_customer: {}", e);
    }
    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "customer_updated") {
        log::warn!("cloud sync enqueue failed after update_customer: {}", e);
    }

    read_customer_row(&conn, &tenant_id, &customer_id)
}

#[tauri::command]
pub fn toggle_customer_active(
    db: State<'_, Database>,
    tenant_id: String,
    customer_id: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<CustomerRow, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_CUSTOMERS)?;

    conn.execute(
        "UPDATE customers SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![customer_id, tenant_id],
    ).map_err(|e| e.to_string())?;

    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "customer_toggled") {
        log::warn!("cloud sync enqueue failed after toggle_customer_active: {}", e);
    }

    read_customer_row(&conn, &tenant_id, &customer_id)
}

#[tauri::command]
pub fn record_customer_payment(
    db: State<'_, Database>,
    tenant_id: String,
    customer_id: String,
    user_id: String,
    data: CustomerPaymentData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<CustomerPaymentRow, String> {
    if data.amount <= 0 {
        return Err("المبلغ يجب أن يكون أكبر من صفر".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, "")?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_CUSTOMERS)?;

    // Validate customer
    let current_balance: i64 = conn.query_row(
        "SELECT current_balance FROM customers WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![customer_id, tenant_id],
        |row| row.get(0),
    ).map_err(|_| "العميل غير موجود".to_string())?;

    if data.amount > current_balance {
        return Err(format!("مبلغ الدفعة ({}) أكبر من الرصيد المستحق ({})", data.amount, current_balance));
    }

    // Validate account
    let (acct_active, acct_bal): (bool, i64) = conn.query_row(
        "SELECT is_active, current_balance FROM accounts WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![data.account_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "الحساب غير موجود".to_string())?;

    if !acct_active {
        return Err("الحساب غير نشط".into());
    }

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<String, String> {
        let payment_id = Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO customer_payments (id, tenant_id, customer_id, amount, payment_method, account_id, notes, created_by)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![payment_id, tenant_id, customer_id, data.amount, data.payment_method,
                    data.account_id, data.notes, user_id],
        ).map_err(|e| format!("فشل تسجيل الدفعة: {}", e))?;

        // Update customer balance
        conn.execute(
            "UPDATE customers SET current_balance = current_balance - ?2,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1",
            params![customer_id, data.amount],
        ).map_err(|e| e.to_string())?;

        // Account transaction
        let bal_after = acct_bal + data.amount;
        let tx_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO account_transactions (id, tenant_id, account_id, transaction_type, direction,
                    amount, balance_before, balance_after, reference_type, reference_id, created_by)
             VALUES (?1, ?2, ?3, 'customer_payment', 'in', ?4, ?5, ?6, 'customer_payment', ?7, ?8)",
            params![tx_id, tenant_id, data.account_id, data.amount, acct_bal, bal_after, payment_id, user_id],
        ).map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE accounts SET current_balance = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
            params![data.account_id, bal_after],
        ).map_err(|e| e.to_string())?;

        Ok(payment_id)
    })();

    match result {
        Ok(payment_id) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            if let Err(e) = audit::log_action(&conn, &tenant_id, &user_id, "payment", "customer", &payment_id, None) {
                log::warn!("audit log failed after record_customer_payment: {}", e);
            }
            if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "customer_payment_recorded") {
                log::warn!("cloud sync enqueue failed after record_customer_payment: {}", e);
            }
            conn.query_row(
                "SELECT cp.id, cp.amount, cp.payment_method, a.name, cp.notes, u.full_name, cp.created_at
                 FROM customer_payments cp
                 JOIN accounts a ON cp.account_id = a.id
                 JOIN users u ON cp.created_by = u.id
                 WHERE cp.id = ?1",
                params![payment_id],
                |row| Ok(CustomerPaymentRow {
                    id: row.get(0)?,
                    amount: row.get(1)?,
                    payment_method: row.get(2)?,
                    account_name: row.get(3)?,
                    notes: row.get(4)?,
                    created_by_name: row.get(5)?,
                    created_at: row.get(6)?,
                }),
            ).map_err(|e| e.to_string())
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn get_customer_statement(
    db: State<'_, Database>,
    tenant_id: String,
    customer_id: String,
    date_from: Option<String>,
    date_to: Option<String>,
) -> Result<Vec<StatementRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Verify customer exists
    let _: String = conn.query_row(
        "SELECT id FROM customers WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![customer_id, tenant_id],
        |row| row.get(0),
    ).map_err(|_| "العميل غير موجود".to_string())?;

    // Build UNION query
    let mut sql = String::from(
        "SELECT date, row_type, description, debit, credit FROM (
            SELECT s.created_at as date, 'sale' as row_type,
                   s.sale_number as description,
                   s.total as debit, 0 as credit
            FROM sales s
            WHERE s.customer_id = ?1 AND s.tenant_id = ?2 AND s.deleted_at IS NULL

            UNION ALL

            SELECT cp.created_at as date, 'payment' as row_type,
                   'دفعة' as description,
                   0 as debit, cp.amount as credit
            FROM customer_payments cp
            WHERE cp.customer_id = ?1 AND cp.tenant_id = ?2

            UNION ALL

            SELECT r.created_at as date, 'return' as row_type,
                   r.return_number as description,
                   0 as debit, r.total as credit
            FROM returns r
            JOIN sales s ON r.sale_id = s.id
            WHERE s.customer_id = ?1 AND r.tenant_id = ?2
        )"
    );

    let mut pv: Vec<Box<dyn rusqlite::types::ToSql>> = vec![
        Box::new(customer_id),
        Box::new(tenant_id),
    ];
    let mut idx = 3;

    // `date` aliases created_at (a full ISO timestamp); compare on date boundaries
    // so a bare date_to like '2026-07-04' still includes rows created today (TASK-942).
    if let Some(ref df) = date_from {
        if !df.is_empty() {
            sql.push_str(&format!(" WHERE DATE(date) >= DATE(?{})", idx));
            pv.push(Box::new(df.clone()));
            idx += 1;
        }
    }
    if let Some(ref dt) = date_to {
        if !dt.is_empty() {
            let keyword = if date_from.as_ref().map_or(true, |s| s.is_empty()) { " WHERE" } else { " AND" };
            sql.push_str(&format!("{} DATE(date) <= DATE(?{})", keyword, idx));
            pv.push(Box::new(dt.clone()));
            let _ = idx;
        }
    }

    sql.push_str(" ORDER BY date ASC");

    let pr: Vec<&dyn rusqlite::types::ToSql> = pv.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let raw_rows: Vec<(String, String, String, i64, i64)> = stmt.query_map(pr.as_slice(), |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    // Compute running balance
    let mut balance: i64 = 0;
    let rows = raw_rows.into_iter().map(|(date, row_type, description, debit, credit)| {
        balance = balance + debit - credit;
        StatementRow {
            date,
            row_type,
            description,
            debit,
            credit,
            running_balance: balance,
        }
    }).collect();

    Ok(rows)
}
