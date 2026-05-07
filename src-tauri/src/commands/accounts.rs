use serde::{Deserialize, Serialize};
use tauri::State;
use rusqlite::params;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::cloud_sync;
use crate::commands::license_guard;

const FLAG_ACCOUNTS: i64 = 256;

// ====== Structs ======

#[derive(Debug, Serialize)]
pub struct AccountRow {
    pub id: String,
    pub name: String,
    pub name_ar: Option<String>,
    pub account_type: String,
    pub current_balance: i64,
    pub is_default: bool,
    pub is_active: bool,
}

#[derive(Debug, Deserialize)]
pub struct AccountData {
    pub name: String,
    pub name_ar: Option<String>,
    pub account_type: String,
    pub opening_balance: Option<i64>,
    pub is_default: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct LedgerRow {
    pub id: String,
    pub created_at: String,
    pub transaction_type: String,
    pub direction: String,
    pub amount: i64,
    pub balance_before: i64,
    pub balance_after: i64,
    pub reference_type: Option<String>,
    pub reference_id: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AccountLedger {
    pub account: AccountRow,
    pub transactions: Vec<LedgerRow>,
    pub total_in: i64,
    pub total_out: i64,
}

#[derive(Debug, Serialize)]
pub struct AccountsSummary {
    pub total_cash: i64,
    pub total_bank: i64,
    pub total_assets: i64,
    pub accounts: Vec<AccountRow>,
}

#[derive(Debug, Deserialize)]
pub struct TransferData {
    pub from_account_id: String,
    pub to_account_id: String,
    pub amount: i64,
    pub notes: Option<String>,
}

// ====== Helpers ======

fn read_account_row(row: &rusqlite::Row) -> rusqlite::Result<AccountRow> {
    Ok(AccountRow {
        id: row.get(0)?,
        name: row.get(1)?,
        name_ar: row.get(2)?,
        account_type: row.get(3)?,
        current_balance: row.get(4)?,
        is_default: row.get(5)?,
        is_active: row.get(6)?,
    })
}

const ACCOUNT_SELECT: &str =
    "SELECT id, name, name_ar, account_type, current_balance, is_default, is_active
     FROM accounts";

// ====== Commands ======

#[tauri::command]
pub fn get_all_accounts(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
) -> Result<Vec<AccountRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let sql = format!("{} WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL ORDER BY is_default DESC, account_type ASC, name ASC", ACCOUNT_SELECT);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![tenant_id, branch_id], |row| {
        read_account_row(row)
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(rows)
}

#[tauri::command]
pub fn create_account(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    user_id: String,
    data: AccountData,
) -> Result<AccountRow, String> {
    if data.name.trim().is_empty() {
        return Err("اسم الحساب مطلوب".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_ACCOUNTS)?;
    let id = Uuid::new_v4().to_string();
    let opening = data.opening_balance.unwrap_or(0);
    let is_def = data.is_default.unwrap_or(false);

    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    let res = (|| -> Result<(), String> {
        // If setting as default cash, unset others
        if is_def && data.account_type == "cash" {
            conn.execute(
                "UPDATE accounts SET is_default = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE tenant_id = ?1 AND branch_id = ?2 AND account_type = 'cash' AND is_default = 1",
                params![tenant_id, branch_id],
            ).map_err(|e| e.to_string())?;
        }

        conn.execute(
            "INSERT INTO accounts (id, tenant_id, branch_id, name, name_ar, account_type, current_balance, is_default, is_active)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1)",
            params![id, tenant_id, branch_id, data.name, data.name_ar, data.account_type, opening, is_def],
        ).map_err(|e| e.to_string())?;

        if opening > 0 {
            let tx_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO account_transactions (id, tenant_id, account_id, transaction_type, direction, amount, balance_before, balance_after, reference_type, reference_id, description, created_by)
                 VALUES (?1, ?2, ?3, 'opening_balance', 'in', ?4, 0, ?4, 'account', ?3, 'رصيد افتتاحي', ?5)",
                params![tx_id, tenant_id, id, opening, user_id],
            ).map_err(|e| e.to_string())?;
        }

        Ok(())
    })();

    match res {
        Ok(_) => { conn.execute_batch("COMMIT").map_err(|e| e.to_string())?; }
        Err(e) => { let _ = conn.execute_batch("ROLLBACK"); return Err(e); }
    }

    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "account_created") {
        log::warn!("cloud sync enqueue failed after create_account: {}", e);
    }

    let sql = format!("{} WHERE id = ?1", ACCOUNT_SELECT);
    conn.query_row(&sql, params![id], |row| read_account_row(row))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_account_ledger(
    db: State<'_, Database>,
    tenant_id: String,
    account_id: String,
    date_from: Option<String>,
    date_to: Option<String>,
) -> Result<AccountLedger, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let sql = format!("{} WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL", ACCOUNT_SELECT);
    let account = conn.query_row(&sql, params![account_id, tenant_id], |row| read_account_row(row))
        .map_err(|_| "الحساب غير موجود".to_string())?;

    let mut tx_sql = String::from(
        "SELECT id, created_at, transaction_type, direction, amount, balance_before, balance_after, reference_type, reference_id, description
         FROM account_transactions
         WHERE account_id = ?1 AND tenant_id = ?2"
    );
    let mut pv: Vec<Box<dyn rusqlite::types::ToSql>> = vec![
        Box::new(account_id),
        Box::new(tenant_id),
    ];
    let mut idx = 3;

    if let Some(ref df) = date_from {
        if !df.is_empty() {
            tx_sql.push_str(&format!(" AND created_at >= ?{}", idx));
            pv.push(Box::new(df.clone()));
            idx += 1;
        }
    }
    if let Some(ref dt) = date_to {
        if !dt.is_empty() {
            tx_sql.push_str(&format!(" AND created_at <= ?{}", idx));
            pv.push(Box::new(format!("{}T23:59:59Z", dt)));
            let _ = idx;
        }
    }

    tx_sql.push_str(" ORDER BY created_at ASC");

    let pr: Vec<&dyn rusqlite::types::ToSql> = pv.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&tx_sql).map_err(|e| e.to_string())?;

    let transactions: Vec<LedgerRow> = stmt.query_map(pr.as_slice(), |row| {
        Ok(LedgerRow {
            id: row.get(0)?,
            created_at: row.get(1)?,
            transaction_type: row.get(2)?,
            direction: row.get(3)?,
            amount: row.get(4)?,
            balance_before: row.get(5)?,
            balance_after: row.get(6)?,
            reference_type: row.get(7)?,
            reference_id: row.get(8)?,
            description: row.get(9)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let total_in: i64 = transactions.iter().filter(|t| t.direction == "in").map(|t| t.amount).sum();
    let total_out: i64 = transactions.iter().filter(|t| t.direction == "out").map(|t| t.amount).sum();

    Ok(AccountLedger {
        account,
        transactions,
        total_in,
        total_out,
    })
}

#[tauri::command]
pub fn get_accounts_summary(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
) -> Result<AccountsSummary, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let sql = format!("{} WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL AND is_active = 1 ORDER BY is_default DESC, account_type ASC, name ASC", ACCOUNT_SELECT);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let accounts: Vec<AccountRow> = stmt.query_map(params![tenant_id, branch_id], |row| {
        read_account_row(row)
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let total_cash: i64 = accounts.iter().filter(|a| a.account_type == "cash").map(|a| a.current_balance).sum();
    let total_bank: i64 = accounts.iter().filter(|a| a.account_type == "bank").map(|a| a.current_balance).sum();

    Ok(AccountsSummary {
        total_cash,
        total_bank,
        total_assets: total_cash + total_bank,
        accounts,
    })
}

#[tauri::command]
pub fn manual_transfer(
    db: State<'_, Database>,
    tenant_id: String,
    user_id: String,
    data: TransferData,
) -> Result<String, String> {
    if data.amount <= 0 {
        return Err("المبلغ يجب أن يكون أكبر من صفر".into());
    }
    if data.from_account_id == data.to_account_id {
        return Err("لا يمكن التحويل لنفس الحساب".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_ACCOUNTS)?;

    let from_balance: i64 = conn.query_row(
        "SELECT current_balance FROM accounts WHERE id = ?1 AND tenant_id = ?2 AND is_active = 1 AND deleted_at IS NULL",
        params![data.from_account_id, tenant_id],
        |row| row.get(0),
    ).map_err(|_| "حساب المصدر غير موجود أو غير نشط".to_string())?;

    if from_balance < data.amount {
        return Err("رصيد الحساب غير كافٍ للتحويل".into());
    }

    let to_balance: i64 = conn.query_row(
        "SELECT current_balance FROM accounts WHERE id = ?1 AND tenant_id = ?2 AND is_active = 1 AND deleted_at IS NULL",
        params![data.to_account_id, tenant_id],
        |row| row.get(0),
    ).map_err(|_| "حساب الوجهة غير موجود أو غير نشط".to_string())?;

    let tx_from_id = Uuid::new_v4().to_string();
    let tx_to_id = Uuid::new_v4().to_string();
    let desc = data.notes.as_deref().unwrap_or("تحويل داخلي");

    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    let res = (|| -> Result<(), String> {
        // FROM account: out
        conn.execute(
            "INSERT INTO account_transactions (id, tenant_id, account_id, transaction_type, direction, amount, balance_before, balance_after, reference_type, reference_id, description, created_by)
             VALUES (?1, ?2, ?3, 'adjustment', 'out', ?4, ?5, ?6, 'transfer', ?7, ?8, ?9)",
            params![tx_from_id, tenant_id, data.from_account_id, data.amount, from_balance, from_balance - data.amount, tx_to_id, desc, user_id],
        ).map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE accounts SET current_balance = current_balance - ?2,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1",
            params![data.from_account_id, data.amount],
        ).map_err(|e| e.to_string())?;

        // TO account: in
        conn.execute(
            "INSERT INTO account_transactions (id, tenant_id, account_id, transaction_type, direction, amount, balance_before, balance_after, reference_type, reference_id, description, created_by)
             VALUES (?1, ?2, ?3, 'adjustment', 'in', ?4, ?5, ?6, 'transfer', ?7, ?8, ?9)",
            params![tx_to_id, tenant_id, data.to_account_id, data.amount, to_balance, to_balance + data.amount, tx_from_id, desc, user_id],
        ).map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE accounts SET current_balance = current_balance + ?2,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1",
            params![data.to_account_id, data.amount],
        ).map_err(|e| e.to_string())?;

        Ok(())
    })();

    match res {
        Ok(_) => { conn.execute_batch("COMMIT").map_err(|e| e.to_string())?; }
        Err(e) => { let _ = conn.execute_batch("ROLLBACK"); return Err(e); }
    }

    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "account_transfer_recorded") {
        log::warn!("cloud sync enqueue failed after manual_transfer: {}", e);
    }

    Ok("تم التحويل بنجاح".into())
}
