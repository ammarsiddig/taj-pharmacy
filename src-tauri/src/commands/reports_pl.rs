use rusqlite::params;
use serde::Serialize;
use tauri::State;

use crate::commands::reports_sales::percentage;
use crate::db::Database;

#[derive(Debug, Serialize)]
pub struct ProfitLossExpenseCategory {
    pub category_name: String,
    pub amount: i64,
}

#[derive(Debug, Serialize)]
pub struct ProfitLossReport {
    pub period: String,
    pub gross_sales: i64,
    pub returns_total: i64,
    pub net_sales: i64,
    pub cogs: i64,
    pub gross_profit: i64,
    pub gross_margin: f64,
    pub total_expenses: i64,
    pub expenses_by_category: Vec<ProfitLossExpenseCategory>,
    pub net_profit: i64,
    pub net_margin: f64,
}

#[tauri::command]
pub fn get_profit_loss_report(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    date_from: String,
    date_to: String,
) -> Result<ProfitLossReport, String> {
    if date_from.trim().is_empty() || date_to.trim().is_empty() {
        return Err("يجب تحديد الفترة الزمنية".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let gross_sales: i64 = conn.query_row(
        "SELECT COALESCE(SUM(total), 0)
         FROM sales
         WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL
           AND DATE(created_at, 'localtime') >= DATE(?3)
           AND DATE(created_at, 'localtime') <= DATE(?4)",
        params![tenant_id, branch_id, date_from, date_to],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let returns_total: i64 = conn.query_row(
        "SELECT COALESCE(SUM(total), 0)
         FROM returns
         WHERE tenant_id = ?1 AND branch_id = ?2 AND status = 'completed'
           AND DATE(created_at, 'localtime') >= DATE(?3)
           AND DATE(created_at, 'localtime') <= DATE(?4)",
        params![tenant_id, branch_id, date_from, date_to],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let cogs: i64 = conn.query_row(
        "SELECT COALESCE(SUM(si.unit_cost * si.quantity), 0)
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         WHERE s.tenant_id = ?1 AND s.branch_id = ?2 AND s.deleted_at IS NULL
           AND DATE(s.created_at, 'localtime') >= DATE(?3)
           AND DATE(s.created_at, 'localtime') <= DATE(?4)",
        params![tenant_id, branch_id, date_from, date_to],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let total_expenses: i64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0)
         FROM expenses
         WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL
           AND DATE(expense_date) >= DATE(?3)
           AND DATE(expense_date) <= DATE(?4)",
        params![tenant_id, branch_id, date_from, date_to],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let mut expense_stmt = conn.prepare(
        "SELECT COALESCE(ec.name_ar, ec.name, 'أخرى') AS category_name,
                COALESCE(SUM(e.amount), 0) AS amount
         FROM expenses e
         LEFT JOIN expense_categories ec ON e.category_id = ec.id
         WHERE e.tenant_id = ?1 AND e.branch_id = ?2 AND e.deleted_at IS NULL
           AND DATE(e.expense_date) >= DATE(?3)
           AND DATE(e.expense_date) <= DATE(?4)
         GROUP BY COALESCE(ec.name_ar, ec.name, 'أخرى')
         ORDER BY amount DESC"
    ).map_err(|e| e.to_string())?;

    let expenses_by_category = expense_stmt.query_map(params![tenant_id, branch_id, date_from, date_to], |row| {
        Ok(ProfitLossExpenseCategory {
            category_name: row.get(0)?,
            amount: row.get(1)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let net_sales = gross_sales - returns_total;
    let gross_profit = net_sales - cogs;
    let net_profit = gross_profit - total_expenses;

    Ok(ProfitLossReport {
        period: format!("{} - {}", date_from, date_to),
        gross_sales,
        returns_total,
        net_sales,
        cogs,
        gross_profit,
        gross_margin: percentage(gross_profit, net_sales),
        total_expenses,
        expenses_by_category,
        net_profit,
        net_margin: percentage(net_profit, net_sales),
    })
}
