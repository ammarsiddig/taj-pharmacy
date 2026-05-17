use rusqlite::params;
use serde::Serialize;
use tauri::State;

use crate::db::Database;

#[derive(Debug, Serialize)]
pub struct AgingRow {
    pub supplier_name: String,
    pub current: i64,
    pub days_30: i64,
    pub days_60: i64,
    pub days_90_plus: i64,
    pub total: i64,
}

#[derive(Debug, Serialize)]
pub struct SupplierAgingReport {
    pub total_payables: i64,
    pub rows: Vec<AgingRow>,
}

#[derive(Debug, Serialize)]
pub struct CustomerCreditRow {
    pub customer_name: String,
    pub phone: Option<String>,
    pub credit_limit: i64,
    pub current_balance: i64,
    pub utilization_pct: f64,
    pub last_purchase_date: Option<String>,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct CustomerCreditReport {
    pub total_receivables: i64,
    pub over_limit_count: i64,
    pub rows: Vec<CustomerCreditRow>,
}

#[derive(Debug, Serialize)]
pub struct AccountBalance {
    pub name: String,
    pub name_ar: Option<String>,
    pub account_type: String,
    pub current_balance: i64,
}

#[derive(Debug, Serialize)]
pub struct BalanceSheetSummary {
    pub accounts: Vec<AccountBalance>,
    pub total_cash: i64,
    pub total_bank: i64,
    pub cash_and_bank: i64,
    pub inventory_value: i64,
    pub customer_receivables: i64,
    pub total_assets: i64,
    pub supplier_payables: i64,
    pub total_liabilities: i64,
    pub net_equity: i64,
}

#[tauri::command]
pub fn get_supplier_aging_report(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<SupplierAgingReport, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT COALESCE(s.name_ar, s.name) AS supplier_name,
                COALESCE(SUM(CASE WHEN days_outstanding BETWEEN 0 AND 30 THEN remaining_due ELSE 0 END), 0) AS current_bucket,
                COALESCE(SUM(CASE WHEN days_outstanding BETWEEN 31 AND 60 THEN remaining_due ELSE 0 END), 0) AS bucket_30,
                COALESCE(SUM(CASE WHEN days_outstanding BETWEEN 61 AND 90 THEN remaining_due ELSE 0 END), 0) AS bucket_60,
                COALESCE(SUM(CASE WHEN days_outstanding > 90 THEN remaining_due ELSE 0 END), 0) AS bucket_90
         FROM (
            SELECT supplier_id,
                   (total - amount_paid) AS remaining_due,
                   CAST(julianday('now', 'localtime') - julianday(confirmed_at) AS INTEGER) AS days_outstanding
            FROM supplier_invoices
            WHERE tenant_id = ?1
              AND status = 'confirmed'
              AND deleted_at IS NULL
              AND payment_status != 'paid'
              AND (total - amount_paid) > 0
         ) inv
         JOIN suppliers s ON s.id = inv.supplier_id
         GROUP BY inv.supplier_id, supplier_name
         HAVING current_bucket + bucket_30 + bucket_60 + bucket_90 > 0
         ORDER BY bucket_90 DESC, bucket_60 DESC, current_bucket + bucket_30 + bucket_60 + bucket_90 DESC"
    ).map_err(|e| e.to_string())?;

    let rows: Vec<AgingRow> = stmt.query_map(params![tenant_id], |row| {
        let current: i64 = row.get(1)?;
        let days_30: i64 = row.get(2)?;
        let days_60: i64 = row.get(3)?;
        let days_90_plus: i64 = row.get(4)?;
        Ok(AgingRow {
            supplier_name: row.get(0)?,
            current,
            days_30,
            days_60,
            days_90_plus,
            total: current + days_30 + days_60 + days_90_plus,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(SupplierAgingReport {
        total_payables: rows.iter().map(|row| row.total).sum(),
        rows,
    })
}

#[tauri::command]
pub fn get_customer_credit_report(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<CustomerCreditReport, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT COALESCE(c.name_ar, c.name) AS customer_name,
                c.phone,
                c.credit_limit,
                c.current_balance,
                (SELECT MAX(s.created_at) FROM sales s WHERE s.customer_id = c.id AND s.deleted_at IS NULL) AS last_purchase_date
         FROM customers c
         WHERE c.tenant_id = ?1 AND c.deleted_at IS NULL AND c.current_balance > 0
         ORDER BY c.current_balance DESC, customer_name ASC"
    ).map_err(|e| e.to_string())?;

    let rows: Vec<CustomerCreditRow> = stmt.query_map(params![tenant_id], |row| {
        let credit_limit: i64 = row.get(2)?;
        let current_balance: i64 = row.get(3)?;
        let utilization_pct = if credit_limit > 0 {
            (current_balance as f64 / credit_limit as f64) * 100.0
        } else {
            0.0
        };
        let status = if credit_limit > 0 && current_balance >= credit_limit {
            "over_limit"
        } else if credit_limit > 0 && utilization_pct >= 80.0 {
            "warning"
        } else {
            "normal"
        };

        Ok(CustomerCreditRow {
            customer_name: row.get(0)?,
            phone: row.get(1)?,
            credit_limit,
            current_balance,
            utilization_pct,
            last_purchase_date: row.get(4)?,
            status: status.to_string(),
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(CustomerCreditReport {
        total_receivables: rows.iter().map(|row| row.current_balance).sum(),
        over_limit_count: rows.iter().filter(|row| row.status == "over_limit").count() as i64,
        rows,
    })
}

#[tauri::command]
pub fn get_balance_sheet_summary(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
) -> Result<BalanceSheetSummary, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut acct_stmt = conn.prepare(
        "SELECT name, name_ar, account_type, current_balance
         FROM accounts
         WHERE tenant_id = ?1
           AND branch_id = ?2
           AND is_active = 1
           AND deleted_at IS NULL
         ORDER BY account_type, name"
    ).map_err(|e| e.to_string())?;

    let accounts: Vec<AccountBalance> = acct_stmt.query_map(params![tenant_id, branch_id], |row| {
        Ok(AccountBalance {
            name: row.get(0)?,
            name_ar: row.get(1)?,
            account_type: row.get(2)?,
            current_balance: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let total_cash: i64 = accounts.iter()
        .filter(|a| a.account_type == "cash")
        .map(|a| a.current_balance)
        .sum();
    let total_bank: i64 = accounts.iter()
        .filter(|a| a.account_type == "bank")
        .map(|a| a.current_balance)
        .sum();
    let cash_and_bank = total_cash + total_bank;

    let inventory_value: i64 = conn.query_row(
        "SELECT COALESCE(SUM(b.quantity_current * b.unit_cost), 0)
         FROM batches b
         JOIN storage_locations sl ON sl.id = b.location_id
         WHERE b.tenant_id = ?1
           AND sl.branch_id = ?2
           AND b.status = 'active'
           AND b.deleted_at IS NULL
           AND sl.deleted_at IS NULL",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let customer_receivables: i64 = conn.query_row(
        "SELECT COALESCE(SUM(c.current_balance), 0)
         FROM customers c
         WHERE c.tenant_id = ?1
           AND c.deleted_at IS NULL
           AND c.current_balance > 0
           AND EXISTS (
               SELECT 1 FROM sales s
               WHERE s.customer_id = c.id
                 AND s.branch_id = ?2
                 AND s.deleted_at IS NULL
           )",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let supplier_payables: i64 = conn.query_row(
        "SELECT COALESCE(SUM(CASE WHEN remaining > 0 THEN remaining ELSE 0 END), 0)
         FROM (
             SELECT (total - amount_paid) AS remaining
             FROM supplier_invoices
             WHERE tenant_id = ?1
               AND branch_id = ?2
               AND status = 'confirmed'
               AND deleted_at IS NULL
               AND payment_status != 'paid'
         ) t",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let total_assets = cash_and_bank + inventory_value + customer_receivables;
    let total_liabilities = supplier_payables;
    let net_equity = total_assets - total_liabilities;

    Ok(BalanceSheetSummary {
        accounts,
        total_cash,
        total_bank,
        cash_and_bank,
        inventory_value,
        customer_receivables,
        total_assets,
        supplier_payables,
        total_liabilities,
        net_equity,
    })
}
