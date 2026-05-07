use serde::{Deserialize, Serialize};
use tauri::State;
use rusqlite::params;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::cloud_sync;
use crate::commands::license_guard;
use crate::commands::guard;
use crate::commands::audit;

const FLAG_EXPENSES: i64 = 32;

// ====== Expense Template Structs ======

#[derive(Debug, Serialize)]
pub struct ExpenseTemplate {
    pub id: String,
    pub name: String,
    pub name_ar: Option<String>,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub category_name_ar: Option<String>,
    pub category_color: Option<String>,
    pub default_amount: i64,
    pub payment_method: String,
    pub account_id: Option<String>,
    pub sort_order: i64,
}

#[derive(Debug, Deserialize)]
pub struct ExpenseTemplateData {
    pub name: String,
    pub name_ar: Option<String>,
    pub category_id: Option<String>,
    pub default_amount: i64,
    pub payment_method: String,
    pub account_id: Option<String>,
}

// ====== Structs ======

#[derive(Debug, Serialize)]
pub struct ExpenseCategory {
    pub id: String,
    pub tenant_id: String,
    pub name: String,
    pub name_ar: Option<String>,
    pub color: String,
    pub icon: Option<String>,
    pub is_active: bool,
}

#[derive(Debug, Deserialize)]
pub struct ExpenseCategoryData {
    pub name: String,
    pub name_ar: Option<String>,
    pub color: String,
}

#[derive(Debug, Serialize)]
pub struct ExpenseRow {
    pub id: String,
    pub description: String,
    pub amount: i64,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub category_name_ar: Option<String>,
    pub category_color: Option<String>,
    pub payment_method: String,
    pub expense_date: String,
    pub account_id: String,
    pub account_name: String,
    pub created_by_name: String,
    pub created_at: String,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ExpenseData {
    pub description: String,
    pub amount: i64,
    pub category_id: Option<String>,
    pub payment_method: String,
    pub account_id: String,
    pub expense_date: String,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CategorySummary {
    pub category_name: String,
    pub category_name_ar: String,
    pub category_color: String,
    pub total: i64,
}

#[derive(Debug, Serialize)]
pub struct ExpenseSummary {
    pub total: i64,
    pub today: i64,
    pub this_month: i64,
    pub by_category: Vec<CategorySummary>,
}

// ====== Commands ======

#[tauri::command]
pub fn get_expense_categories(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<Vec<ExpenseCategory>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, tenant_id, name, name_ar, color, icon, is_active
         FROM expense_categories
         WHERE tenant_id = ?1 AND deleted_at IS NULL AND is_active = 1
         ORDER BY name_ar"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![tenant_id], |row| {
        Ok(ExpenseCategory {
            id: row.get(0)?,
            tenant_id: row.get(1)?,
            name: row.get(2)?,
            name_ar: row.get(3)?,
            color: row.get(4)?,
            icon: row.get(5)?,
            is_active: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(rows)
}

#[tauri::command]
pub fn create_expense_category(
    db: State<'_, Database>,
    tenant_id: String,
    data: ExpenseCategoryData,
) -> Result<ExpenseCategory, String> {
    if data.name.trim().is_empty() {
        return Err("اسم الفئة مطلوب".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_EXPENSES)?;
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO expense_categories (id, tenant_id, name, name_ar, color)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, tenant_id, data.name, data.name_ar, data.color],
    ).map_err(|e| format!("فشل إنشاء الفئة: {}", e))?;

    conn.query_row(
        "SELECT id, tenant_id, name, name_ar, color, icon, is_active
         FROM expense_categories WHERE id = ?1",
        params![id],
        |row| Ok(ExpenseCategory {
            id: row.get(0)?,
            tenant_id: row.get(1)?,
            name: row.get(2)?,
            name_ar: row.get(3)?,
            color: row.get(4)?,
            icon: row.get(5)?,
            is_active: row.get(6)?,
        }),
    ).map_err(|e| e.to_string())
}

fn build_expense_row(row: &rusqlite::Row) -> rusqlite::Result<ExpenseRow> {
    Ok(ExpenseRow {
        id: row.get(0)?,
        description: row.get(1)?,
        amount: row.get(2)?,
        category_id: row.get(3)?,
        category_name: row.get(4)?,
        category_name_ar: row.get(5)?,
        category_color: row.get(6)?,
        payment_method: row.get(7)?,
        expense_date: row.get(8)?,
        account_id: row.get(9)?,
        account_name: row.get(10)?,
        created_by_name: row.get(11)?,
        created_at: row.get(12)?,
        notes: row.get(13)?,
    })
}

const EXPENSE_SELECT: &str =
    "SELECT e.id, e.description, e.amount,
            e.category_id, ec.name, ec.name_ar, ec.color,
            e.payment_method, e.expense_date,
            e.account_id, a.name, u.full_name,
            e.created_at, e.notes
     FROM expenses e
     LEFT JOIN expense_categories ec ON e.category_id = ec.id
     JOIN accounts a ON e.account_id = a.id
     JOIN users u ON e.created_by = u.id";

#[tauri::command]
pub fn get_expenses(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    category_id: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    search: Option<String>,
    payment_method: Option<String>,
) -> Result<Vec<ExpenseRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut sql = format!(
        "{} WHERE e.tenant_id = ?1 AND e.branch_id = ?2 AND e.deleted_at IS NULL",
        EXPENSE_SELECT
    );
    let mut pv: Vec<Box<dyn rusqlite::types::ToSql>> = vec![
        Box::new(tenant_id),
        Box::new(branch_id),
    ];
    let mut idx = 3;

    if let Some(ref cid) = category_id {
        if !cid.is_empty() {
            sql.push_str(&format!(" AND e.category_id = ?{}", idx));
            pv.push(Box::new(cid.clone()));
            idx += 1;
        }
    }
    if let Some(ref df) = date_from {
        if !df.is_empty() {
            sql.push_str(&format!(" AND e.expense_date >= ?{}", idx));
            pv.push(Box::new(df.clone()));
            idx += 1;
        }
    }
    if let Some(ref dt) = date_to {
        if !dt.is_empty() {
            sql.push_str(&format!(" AND e.expense_date <= ?{}", idx));
            pv.push(Box::new(dt.clone()));
            idx += 1;
        }
    }
    if let Some(ref s) = search {
        if !s.is_empty() {
            sql.push_str(&format!(" AND e.description LIKE ?{}", idx));
            pv.push(Box::new(format!("%{}%", s)));
            idx += 1;
        }
    }
    if let Some(ref pm) = payment_method {
        if !pm.is_empty() {
            sql.push_str(&format!(" AND e.payment_method = ?{}", idx));
            pv.push(Box::new(pm.clone()));
            let _ = idx;
        }
    }

    sql.push_str(" ORDER BY e.expense_date DESC, e.created_at DESC");

    let pr: Vec<&dyn rusqlite::types::ToSql> = pv.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(pr.as_slice(), build_expense_row)
        .map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(rows)
}

#[tauri::command]
pub fn create_expense(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    user_id: String,
    data: ExpenseData,
) -> Result<ExpenseRow, String> {
    if data.description.trim().is_empty() {
        return Err("وصف المصروف مطلوب".into());
    }
    if data.amount <= 0 {
        return Err("المبلغ يجب أن يكون أكبر من صفر".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_EXPENSES)?;
    guard::require_permission(&conn, &user_id, "expenses")?;

    // Validate account
    let (acct_active, acct_balance): (bool, i64) = conn.query_row(
        "SELECT is_active, current_balance FROM accounts WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![data.account_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "الحساب غير موجود".to_string())?;

    if !acct_active {
        return Err("الحساب غير نشط".into());
    }

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<String, String> {
        let expense_id = Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO expenses (id, tenant_id, branch_id, category_id, description, amount,
                    payment_method, account_id, expense_date, notes, created_by)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![expense_id, tenant_id, branch_id, data.category_id, data.description,
                    data.amount, data.payment_method, data.account_id, data.expense_date,
                    data.notes, user_id],
        ).map_err(|e| format!("فشل إنشاء المصروف: {}", e))?;

        // Account transaction
        let bal_after = acct_balance - data.amount;
        let tx_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO account_transactions (id, tenant_id, account_id, transaction_type, direction,
                    amount, balance_before, balance_after, reference_type, reference_id, created_by)
             VALUES (?1, ?2, ?3, 'expense', 'out', ?4, ?5, ?6, 'expense', ?7, ?8)",
            params![tx_id, tenant_id, data.account_id, data.amount, acct_balance, bal_after, expense_id, user_id],
        ).map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE accounts SET current_balance = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
            params![data.account_id, bal_after],
        ).map_err(|e| e.to_string())?;

        Ok(expense_id)
    })();

    match result {
        Ok(expense_id) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            if let Err(e) = audit::log_action(&conn, &tenant_id, &user_id, "create", "expense", &expense_id, None) {
                log::warn!("audit log failed after create_expense: {}", e);
            }
            if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "expense_created") {
                log::warn!("cloud sync enqueue failed after create_expense: {}", e);
            }
            let sql = format!("{} WHERE e.id = ?1", EXPENSE_SELECT);
            conn.query_row(&sql, params![expense_id], build_expense_row)
                .map_err(|e| e.to_string())
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn update_expense(
    db: State<'_, Database>,
    tenant_id: String,
    expense_id: String,
    user_id: String,
    data: ExpenseData,
) -> Result<ExpenseRow, String> {
    if data.description.trim().is_empty() {
        return Err("وصف المصروف مطلوب".into());
    }
    if data.amount <= 0 {
        return Err("المبلغ يجب أن يكون أكبر من صفر".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_EXPENSES)?;
    guard::require_permission(&conn, &user_id, "expenses")?;

    // Get original expense
    let (orig_amount, orig_account_id): (i64, String) = conn.query_row(
        "SELECT amount, account_id FROM expenses WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![expense_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "المصروف غير موجود".to_string())?;

    // Validate new account
    let (new_acct_active, _): (bool, i64) = conn.query_row(
        "SELECT is_active, current_balance FROM accounts WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![data.account_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "الحساب غير موجود".to_string())?;

    if !new_acct_active {
        return Err("الحساب غير نشط".into());
    }

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        // 1. Reverse original transaction on original account
        let orig_bal: i64 = conn.query_row(
            "SELECT current_balance FROM accounts WHERE id = ?1",
            params![orig_account_id],
            |row| row.get(0),
        ).map_err(|e| e.to_string())?;

        let orig_bal_after = orig_bal + orig_amount;
        let rev_tx_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO account_transactions (id, tenant_id, account_id, transaction_type, direction,
                    amount, balance_before, balance_after, reference_type, reference_id, created_by)
             VALUES (?1, ?2, ?3, 'adjustment', 'in', ?4, ?5, ?6, 'expense_reversal', ?7, ?8)",
            params![rev_tx_id, tenant_id, orig_account_id, orig_amount, orig_bal, orig_bal_after, expense_id, user_id],
        ).map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE accounts SET current_balance = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
            params![orig_account_id, orig_bal_after],
        ).map_err(|e| e.to_string())?;

        // 2. Update expense record
        conn.execute(
            "UPDATE expenses SET description = ?3, amount = ?4, category_id = ?5,
                    payment_method = ?6, account_id = ?7, expense_date = ?8, notes = ?9,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1 AND tenant_id = ?2",
            params![expense_id, tenant_id, data.description, data.amount, data.category_id,
                    data.payment_method, data.account_id, data.expense_date, data.notes],
        ).map_err(|e| e.to_string())?;

        // 3. Apply new transaction on new account
        let new_bal: i64 = conn.query_row(
            "SELECT current_balance FROM accounts WHERE id = ?1",
            params![data.account_id],
            |row| row.get(0),
        ).map_err(|e| e.to_string())?;

        let new_bal_after = new_bal - data.amount;
        let new_tx_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO account_transactions (id, tenant_id, account_id, transaction_type, direction,
                    amount, balance_before, balance_after, reference_type, reference_id, created_by)
             VALUES (?1, ?2, ?3, 'expense', 'out', ?4, ?5, ?6, 'expense', ?7, ?8)",
            params![new_tx_id, tenant_id, data.account_id, data.amount, new_bal, new_bal_after, expense_id, user_id],
        ).map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE accounts SET current_balance = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
            params![data.account_id, new_bal_after],
        ).map_err(|e| e.to_string())?;

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            if let Err(e) = audit::log_action(&conn, &tenant_id, &user_id, "update", "expense", &expense_id, None) {
                log::warn!("audit log failed after update_expense: {}", e);
            }
            if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "expense_updated") {
                log::warn!("cloud sync enqueue failed after update_expense: {}", e);
            }
            let sql = format!("{} WHERE e.id = ?1", EXPENSE_SELECT);
            conn.query_row(&sql, params![expense_id], build_expense_row)
                .map_err(|e| e.to_string())
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn delete_expense(
    db: State<'_, Database>,
    tenant_id: String,
    expense_id: String,
    user_id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_EXPENSES)?;
    guard::require_permission(&conn, &user_id, "expenses")?;

    let (amount, account_id, deleted_at): (i64, String, Option<String>) = conn.query_row(
        "SELECT amount, account_id, deleted_at FROM expenses WHERE id = ?1 AND tenant_id = ?2",
        params![expense_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|_| "المصروف غير موجود".to_string())?;

    if deleted_at.is_some() {
        return Err("المصروف محذوف بالفعل".into());
    }

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        // Reverse account transaction
        let bal: i64 = conn.query_row(
            "SELECT current_balance FROM accounts WHERE id = ?1",
            params![account_id],
            |row| row.get(0),
        ).map_err(|e| e.to_string())?;

        let bal_after = bal + amount;
        let tx_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO account_transactions (id, tenant_id, account_id, transaction_type, direction,
                    amount, balance_before, balance_after, reference_type, reference_id, created_by)
             VALUES (?1, ?2, ?3, 'adjustment', 'in', ?4, ?5, ?6, 'expense_deletion', ?7, ?8)",
            params![tx_id, tenant_id, account_id, amount, bal, bal_after, expense_id, user_id],
        ).map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE accounts SET current_balance = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
            params![account_id, bal_after],
        ).map_err(|e| e.to_string())?;

        // Soft delete
        conn.execute(
            "UPDATE expenses SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
            params![expense_id],
        ).map_err(|e| e.to_string())?;

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            if let Err(e) = audit::log_action(&conn, &tenant_id, &user_id, "delete", "expense", &expense_id, None) {
                log::warn!("audit log failed after delete_expense: {}", e);
            }
            if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "expense_deleted") {
                log::warn!("cloud sync enqueue failed after delete_expense: {}", e);
            }
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn get_expense_summary(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    date_from: Option<String>,
    date_to: Option<String>,
) -> Result<ExpenseSummary, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let total_amount: i64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let today_amount: i64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM expenses
         WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL
         AND expense_date = date('now')",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let this_month_amount: i64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM expenses
         WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL
         AND expense_date >= date('now','start of month')",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    // By category
    let mut by_cat_sql = String::from(
        "SELECT COALESCE(ec.name, 'Other'), COALESCE(ec.name_ar, ec.name, 'بدون فئة'), COALESCE(ec.color, '#9CA3AF'), SUM(e.amount)
         FROM expenses e
         LEFT JOIN expense_categories ec ON e.category_id = ec.id
         WHERE e.tenant_id = ?1 AND e.branch_id = ?2 AND e.deleted_at IS NULL"
    );
    let mut pv: Vec<Box<dyn rusqlite::types::ToSql>> = vec![
        Box::new(tenant_id),
        Box::new(branch_id),
    ];
    let mut idx = 3;

    if let Some(ref df) = date_from {
        if !df.is_empty() {
            by_cat_sql.push_str(&format!(" AND e.expense_date >= ?{}", idx));
            pv.push(Box::new(df.clone()));
            idx += 1;
        }
    }
    if let Some(ref dt) = date_to {
        if !dt.is_empty() {
            by_cat_sql.push_str(&format!(" AND e.expense_date <= ?{}", idx));
            pv.push(Box::new(dt.clone()));
            let _ = idx;
        }
    }

    by_cat_sql.push_str(" GROUP BY e.category_id ORDER BY SUM(e.amount) DESC");

    let pr: Vec<&dyn rusqlite::types::ToSql> = pv.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&by_cat_sql).map_err(|e| e.to_string())?;
    let by_category = stmt.query_map(pr.as_slice(), |row| {
        Ok(CategorySummary {
            category_name: row.get(0)?,
            category_name_ar: row.get(1)?,
            category_color: row.get(2)?,
            total: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(ExpenseSummary {
        total: total_amount,
        today: today_amount,
        this_month: this_month_amount,
        by_category,
    })
}

// ────────────────────────────────────────────────────────────────
// Expense Templates
// ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_expense_templates(
    tenant_id: String,
    db: State<Database>,
) -> Result<Vec<ExpenseTemplate>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT et.id, et.name, et.name_ar, et.category_id,
                ec.name, ec.name_ar, ec.color,
                et.default_amount, et.payment_method, et.account_id, et.sort_order
         FROM expense_templates et
         LEFT JOIN expense_categories ec ON et.category_id = ec.id AND ec.deleted_at IS NULL
         WHERE et.tenant_id = ?1 AND et.is_active = 1 AND et.deleted_at IS NULL
         ORDER BY et.sort_order ASC, et.name ASC",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![tenant_id], |row| {
        Ok(ExpenseTemplate {
            id: row.get(0)?,
            name: row.get(1)?,
            name_ar: row.get(2)?,
            category_id: row.get(3)?,
            category_name: row.get(4)?,
            category_name_ar: row.get(5)?,
            category_color: row.get(6)?,
            default_amount: row.get(7)?,
            payment_method: row.get(8)?,
            account_id: row.get(9)?,
            sort_order: row.get(10)?,
        })
    }).map_err(|e| e.to_string())?;

    rows.map(|r| r.map_err(|e| e.to_string())).collect()
}

#[tauri::command]
pub fn create_expense_template(
    tenant_id: String,
    data: ExpenseTemplateData,
    db: State<Database>,
) -> Result<ExpenseTemplate, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO expense_templates
         (id, tenant_id, name, name_ar, category_id, default_amount, payment_method, account_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, tenant_id, data.name, data.name_ar, data.category_id,
                data.default_amount, data.payment_method, data.account_id],
    ).map_err(|e| e.to_string())?;

    Ok(ExpenseTemplate {
        id,
        name: data.name,
        name_ar: data.name_ar,
        category_id: data.category_id,
        category_name: None,
        category_name_ar: None,
        category_color: None,
        default_amount: data.default_amount,
        payment_method: data.payment_method,
        account_id: data.account_id,
        sort_order: 0,
    })
}

#[tauri::command]
pub fn delete_expense_template(
    tenant_id: String,
    template_id: String,
    db: State<Database>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    conn.execute(
        "UPDATE expense_templates SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1 AND tenant_id = ?2",
        params![template_id, tenant_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}
