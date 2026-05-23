use std::collections::HashMap;

use chrono::{Duration, Local};
use rusqlite::{params, types::ToSql};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Database;
use crate::commands::guard;
use crate::commands::session_state::{AuthSessionState, resolve_identity};

#[derive(Debug, Serialize)]
pub struct DashboardDailySales {
    pub date: String,
    pub total: i64,
}

#[derive(Debug, Serialize)]
pub struct OverdueSupplier {
    pub supplier_name: String,
    pub balance_due: i64,
    pub days_overdue: i64,
}

#[derive(Debug, Serialize)]
pub struct TopProduct {
    pub product_name: String,
    pub total_qty: i64,
    pub total_revenue: i64,
}

#[derive(Debug, Serialize)]
pub struct OpenSession {
    pub cashier_name: String,
    pub opened_at: String,
    pub sales_count: i64,
    pub total_sales: i64,
}

#[derive(Debug, Serialize)]
pub struct RecentSale {
    pub sale_number: String,
    pub total: i64,
    pub payment_method: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct DashboardStats {
    pub today_sales_total: i64,
    pub today_sales_count: i64,
    pub today_avg_sale: i64,
    pub yesterday_sales_total: i64,
    pub sales_change_pct: f64,
    pub month_sales_total: i64,
    pub month_expenses_total: i64,
    pub month_gross_profit: i64,
    pub month_net_profit: i64,
    pub low_stock_count: i64,
    pub out_of_stock_count: i64,
    pub expiring_30_count: i64,
    pub expired_count: i64,
    pub total_cash_balance: i64,
    pub total_bank_balance: i64,
    pub supplier_payables: i64,
    pub customer_receivables: i64,
    pub overdue_suppliers: Vec<OverdueSupplier>,
    pub top_products: Vec<TopProduct>,
    pub open_sessions: Vec<OpenSession>,
    pub recent_sales: Vec<RecentSale>,
    pub last_7_days_sales: Vec<DashboardDailySales>,
}

#[derive(Debug, Deserialize)]
pub struct SalesReportFilters {
    pub date_from: String,
    pub date_to: String,
    pub group_by: String,
    pub cashier_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SalesReportRow {
    pub label: String,
    pub date: Option<String>,
    pub product_name: Option<String>,
    pub cashier_name: Option<String>,
    pub count: i64,
    pub quantity: i64,
    pub revenue: i64,
    pub profit: i64,
}

#[derive(Debug, Serialize)]
pub struct PaymentBreakdown {
    pub cash_total: i64,
    pub bank_transfer_total: i64,
    pub credit_total: i64,
}

#[derive(Debug, Serialize)]
pub struct SalesReport {
    pub date_from: String,
    pub date_to: String,
    pub total_revenue: i64,
    pub total_cost: i64,
    pub gross_profit: i64,
    pub profit_margin: f64,
    pub total_sales_count: i64,
    pub avg_sale_value: i64,
    pub rows: Vec<SalesReportRow>,
    pub payment_breakdown: PaymentBreakdown,
}

pub(crate) fn percentage(numerator: i64, denominator: i64) -> f64 {
    if denominator <= 0 {
        0.0
    } else {
        (numerator as f64 / denominator as f64) * 100.0
    }
}

fn change_percentage(current: i64, previous: i64) -> f64 {
    if previous == 0 {
        if current == 0 { 0.0 } else { 100.0 }
    } else {
        ((current - previous) as f64 / previous as f64) * 100.0
    }
}

fn build_sales_filter(
    tenant_id: &str,
    branch_id: &str,
    date_from: &str,
    date_to: &str,
    cashier_id: Option<&str>,
) -> (String, Vec<Box<dyn ToSql>>) {
    let mut filter = String::from(
        " WHERE s.tenant_id = ?1 AND s.branch_id = ?2 AND s.deleted_at IS NULL
          AND DATE(s.created_at, 'localtime') >= DATE(?3)
          AND DATE(s.created_at, 'localtime') <= DATE(?4)"
    );
    let mut params: Vec<Box<dyn ToSql>> = vec![
        Box::new(tenant_id.to_string()),
        Box::new(branch_id.to_string()),
        Box::new(date_from.to_string()),
        Box::new(date_to.to_string()),
    ];
    if let Some(cid) = cashier_id {
        if !cid.is_empty() {
            filter.push_str(" AND s.cashier_id = ?5");
            params.push(Box::new(cid.to_string()));
        }
    }
    (filter, params)
}

#[tauri::command]
pub fn get_dashboard_stats(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    user_id: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<DashboardStats, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, &branch_id)?;
    guard::require_access(&conn, &user_id, "reports.financial", guard::Level::Read)?;

    let (today_sales_total, today_sales_count): (i64, i64) = conn.query_row(
        "SELECT COALESCE(SUM(total), 0), COUNT(*)
         FROM sales
         WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL
           AND DATE(created_at, 'localtime') = DATE('now', 'localtime')",
        params![tenant_id, branch_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| e.to_string())?;

    let yesterday_sales_total: i64 = conn.query_row(
        "SELECT COALESCE(SUM(total), 0)
         FROM sales
         WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL
           AND DATE(created_at, 'localtime') = DATE('now', 'localtime', '-1 day')",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let month_sales_total: i64 = conn.query_row(
        "SELECT COALESCE(SUM(total), 0)
         FROM sales
         WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL
           AND strftime('%Y-%m', created_at, 'localtime') = strftime('%Y-%m', 'now', 'localtime')",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let month_expenses_total: i64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0)
         FROM expenses
         WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL
           AND strftime('%Y-%m', expense_date) = strftime('%Y-%m', 'now', 'localtime')",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let month_gross_profit: i64 = conn.query_row(
        "SELECT COALESCE(SUM((si.unit_price - si.unit_cost) * si.quantity), 0)
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         WHERE s.tenant_id = ?1 AND s.branch_id = ?2 AND s.deleted_at IS NULL
           AND strftime('%Y-%m', s.created_at, 'localtime') = strftime('%Y-%m', 'now', 'localtime')",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let low_stock_count: i64 = conn.query_row(
        "SELECT COUNT(*)
         FROM products p
         WHERE p.tenant_id = ?1 AND p.is_active = 1 AND p.deleted_at IS NULL
           AND p.min_stock_level > 0
           AND (
             SELECT COALESCE(SUM(b.quantity_current), 0)
             FROM batches b
             JOIN storage_locations sl ON b.location_id = sl.id
             WHERE b.product_id = p.id
               AND b.status = 'active'
               AND b.deleted_at IS NULL
               AND sl.deleted_at IS NULL
               AND sl.branch_id = ?2
           ) < p.min_stock_level",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let out_of_stock_count: i64 = conn.query_row(
        "SELECT COUNT(*)
         FROM products p
         WHERE p.tenant_id = ?1 AND p.is_active = 1 AND p.deleted_at IS NULL
           AND (
             SELECT COALESCE(SUM(b.quantity_current), 0)
             FROM batches b
             JOIN storage_locations sl ON b.location_id = sl.id
             WHERE b.product_id = p.id
               AND b.status = 'active'
               AND b.deleted_at IS NULL
               AND sl.deleted_at IS NULL
               AND sl.branch_id = ?2
           ) = 0",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let expiring_30_count: i64 = conn.query_row(
        "SELECT COUNT(*)
         FROM batches b
         JOIN storage_locations sl ON b.location_id = sl.id
         WHERE b.tenant_id = ?1 AND sl.branch_id = ?2
           AND b.status = 'active'
           AND b.deleted_at IS NULL
           AND sl.deleted_at IS NULL
           AND b.quantity_current > 0
           AND b.expiry_date IS NOT NULL
           AND DATE(b.expiry_date) <= DATE('now', '+30 days', 'localtime')
           AND DATE(b.expiry_date) > DATE('now', 'localtime')",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let expired_count: i64 = conn.query_row(
        "SELECT COUNT(*)
         FROM batches b
         JOIN storage_locations sl ON b.location_id = sl.id
         WHERE b.tenant_id = ?1 AND sl.branch_id = ?2
           AND b.status = 'active'
           AND b.deleted_at IS NULL
           AND sl.deleted_at IS NULL
           AND b.quantity_current > 0
           AND b.expiry_date IS NOT NULL
           AND DATE(b.expiry_date) < DATE('now', 'localtime')",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let total_cash_balance: i64 = conn.query_row(
        "SELECT COALESCE(SUM(current_balance), 0)
         FROM accounts
         WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL AND is_active = 1 AND account_type = 'cash'",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let total_bank_balance: i64 = conn.query_row(
        "SELECT COALESCE(SUM(current_balance), 0)
         FROM accounts
         WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL AND is_active = 1 AND account_type = 'bank'",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let supplier_payables: i64 = conn.query_row(
        "SELECT COALESCE(SUM(CASE WHEN supplier_balance > 0 THEN supplier_balance ELSE 0 END), 0)
         FROM (
            SELECT s.id,
                   COALESCE((
                       SELECT SUM(si.total - si.amount_paid)
                       FROM supplier_invoices si
                       WHERE si.supplier_id = s.id
                         AND si.tenant_id = ?1
                         AND si.branch_id = ?2
                         AND si.status = 'confirmed'
                         AND si.deleted_at IS NULL
                   ), 0) AS supplier_balance
            FROM suppliers s
            WHERE s.tenant_id = ?1 AND s.deleted_at IS NULL
         ) balances",
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

    let mut overdue_stmt = conn.prepare(
        "SELECT COALESCE(s.name_ar, s.name) AS supplier_name,
                SUM(si.total - si.amount_paid) AS balance_due,
                MAX(CAST(julianday('now', 'localtime') - julianday(si.confirmed_at) AS INTEGER)) AS days_overdue
         FROM supplier_invoices si
         JOIN suppliers s ON si.supplier_id = s.id
         WHERE si.tenant_id = ?1
           AND si.branch_id = ?2
           AND si.status = 'confirmed'
           AND si.deleted_at IS NULL
           AND si.payment_status != 'paid'
           AND (si.total - si.amount_paid) > 0
           AND julianday('now', 'localtime') - julianday(si.confirmed_at) > 30
         GROUP BY si.supplier_id, supplier_name
         ORDER BY days_overdue DESC, balance_due DESC
         LIMIT 10"
    ).map_err(|e| e.to_string())?;

    let overdue_suppliers = overdue_stmt.query_map(params![tenant_id, branch_id], |row| {
        Ok(OverdueSupplier {
            supplier_name: row.get(0)?,
            balance_due: row.get(1)?,
            days_overdue: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut top_products_stmt = conn.prepare(
        "SELECT COALESCE(p.trade_name_ar, p.trade_name) AS product_name,
                SUM(si.quantity) AS total_qty,
                SUM(si.subtotal) AS total_revenue
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         JOIN products p ON p.id = si.product_id
         WHERE s.tenant_id = ?1 AND s.branch_id = ?2 AND s.deleted_at IS NULL
           AND strftime('%Y-%m', s.created_at, 'localtime') = strftime('%Y-%m', 'now', 'localtime')
         GROUP BY si.product_id, product_name
         ORDER BY total_qty DESC, total_revenue DESC
         LIMIT 5"
    ).map_err(|e| e.to_string())?;

    let top_products = top_products_stmt.query_map(params![tenant_id, branch_id], |row| {
        Ok(TopProduct {
            product_name: row.get(0)?,
            total_qty: row.get(1)?,
            total_revenue: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut open_sessions_stmt = conn.prepare(
        "SELECT COALESCE(u.full_name_ar, u.full_name), ps.opened_at, ps.sales_count, ps.total_sales
         FROM pos_sessions ps
         JOIN users u ON ps.cashier_id = u.id
         WHERE ps.tenant_id = ?1 AND ps.branch_id = ?2 AND ps.status = 'open'
         ORDER BY ps.opened_at ASC"
    ).map_err(|e| e.to_string())?;

    let open_sessions = open_sessions_stmt.query_map(params![tenant_id, branch_id], |row| {
        Ok(OpenSession {
            cashier_name: row.get(0)?,
            opened_at: row.get(1)?,
            sales_count: row.get(2)?,
            total_sales: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut recent_sales_stmt = conn.prepare(
        "SELECT sale_number, total, payment_method, created_at
         FROM sales
         WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT 5"
    ).map_err(|e| e.to_string())?;

    let recent_sales = recent_sales_stmt.query_map(params![tenant_id, branch_id], |row| {
        Ok(RecentSale {
            sale_number: row.get(0)?,
            total: row.get(1)?,
            payment_method: row.get(2)?,
            created_at: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut daily_map_stmt = conn.prepare(
        "SELECT DATE(created_at, 'localtime') AS sale_date, COALESCE(SUM(total), 0)
         FROM sales
         WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL
           AND DATE(created_at, 'localtime') >= DATE('now', 'localtime', '-6 days')
         GROUP BY sale_date"
    ).map_err(|e| e.to_string())?;

    let mut daily_sales_map = HashMap::new();
    let daily_rows = daily_map_stmt.query_map(params![tenant_id, branch_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    }).map_err(|e| e.to_string())?;
    for item in daily_rows {
        let (date, total) = item.map_err(|e| e.to_string())?;
        daily_sales_map.insert(date, total);
    }

    let today = Local::now().date_naive();
    let mut last_7_days_sales = Vec::with_capacity(7);
    for offset in (0..7).rev() {
        let day = today - Duration::days(offset);
        let key = day.format("%Y-%m-%d").to_string();
        last_7_days_sales.push(DashboardDailySales {
            date: key.clone(),
            total: *daily_sales_map.get(&key).unwrap_or(&0),
        });
    }

    Ok(DashboardStats {
        today_sales_total,
        today_sales_count,
        today_avg_sale: if today_sales_count > 0 { today_sales_total / today_sales_count } else { 0 },
        yesterday_sales_total,
        sales_change_pct: change_percentage(today_sales_total, yesterday_sales_total),
        month_sales_total,
        month_expenses_total,
        month_gross_profit,
        month_net_profit: month_gross_profit - month_expenses_total,
        low_stock_count,
        out_of_stock_count,
        expiring_30_count,
        expired_count,
        total_cash_balance,
        total_bank_balance,
        supplier_payables,
        customer_receivables,
        overdue_suppliers,
        top_products,
        open_sessions,
        recent_sales,
        last_7_days_sales,
    })
}

#[tauri::command]
pub fn get_sales_report(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    filters: SalesReportFilters,
) -> Result<SalesReport, String> {
    if filters.date_from.trim().is_empty() || filters.date_to.trim().is_empty() {
        return Err("يجب تحديد الفترة الزمنية".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let cashier_filter = filters.cashier_id.as_deref();
    let (filter_sql, params_vec) = build_sales_filter(
        &tenant_id,
        &branch_id,
        &filters.date_from,
        &filters.date_to,
        cashier_filter,
    );
    let params_refs: Vec<&dyn ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    let totals_sql = format!(
        "SELECT COALESCE(SUM(s.total), 0), COUNT(*) FROM sales s {}",
        filter_sql
    );
    let (total_revenue, total_sales_count): (i64, i64) = conn.query_row(&totals_sql, params_refs.as_slice(), |row| {
        Ok((row.get(0)?, row.get(1)?))
    }).map_err(|e| e.to_string())?;

    let total_cost_sql = format!(
        "SELECT COALESCE(SUM(si.unit_cost * si.quantity), 0)
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id {}",
        filter_sql
    );
    let total_cost: i64 = conn.query_row(&total_cost_sql, params_refs.as_slice(), |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let payment_sql = format!(
        "SELECT
            COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN s.total ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.payment_method = 'bank_transfer' THEN s.total ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN s.payment_method = 'credit' THEN s.total ELSE 0 END), 0)
         FROM sales s {}",
        filter_sql
    );
    let payment_breakdown = conn.query_row(&payment_sql, params_refs.as_slice(), |row| {
        Ok(PaymentBreakdown {
            cash_total: row.get(0)?,
            bank_transfer_total: row.get(1)?,
            credit_total: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;

    let sale_profit_subquery = "LEFT JOIN (
        SELECT sale_id, SUM((unit_price - unit_cost) * quantity) AS profit
        FROM sale_items
        GROUP BY sale_id
    ) sp ON sp.sale_id = s.id";

    let rows_sql = match filters.group_by.as_str() {
        "product" => format!(
            "SELECT COALESCE(p.trade_name_ar, p.trade_name) AS label,
                    SUM(si.quantity) AS quantity,
                    SUM(si.subtotal) AS revenue,
                    COALESCE(SUM((si.unit_price - si.unit_cost) * si.quantity), 0) AS profit
             FROM sale_items si
             JOIN sales s ON s.id = si.sale_id
             JOIN products p ON p.id = si.product_id
             {}
             GROUP BY si.product_id, label
             ORDER BY revenue DESC, quantity DESC",
            filter_sql
        ),
        "cashier" => format!(
            "SELECT COALESCE(u.full_name_ar, u.full_name) AS label,
                    COUNT(s.id) AS sale_count,
                    COALESCE(SUM(s.total), 0) AS revenue,
                    COALESCE(SUM(sp.profit), 0) AS profit
             FROM sales s
             JOIN users u ON u.id = s.cashier_id
             {}
             {}
             GROUP BY s.cashier_id, label
             ORDER BY revenue DESC, sale_count DESC",
            sale_profit_subquery,
            filter_sql
        ),
        "week" => format!(
            "SELECT strftime('%Y-W%W', s.created_at, 'localtime') AS label,
                    COUNT(s.id) AS sale_count,
                    COALESCE(SUM(s.total), 0) AS revenue,
                    COALESCE(SUM(sp.profit), 0) AS profit
             FROM sales s
             {}
             {}
             GROUP BY label
             ORDER BY label ASC",
            sale_profit_subquery,
            filter_sql
        ),
        "month" => format!(
            "SELECT strftime('%Y-%m', s.created_at, 'localtime') AS label,
                    COUNT(s.id) AS sale_count,
                    COALESCE(SUM(s.total), 0) AS revenue,
                    COALESCE(SUM(sp.profit), 0) AS profit
             FROM sales s
             {}
             {}
             GROUP BY label
             ORDER BY label ASC",
            sale_profit_subquery,
            filter_sql
        ),
        _ => format!(
            "SELECT DATE(s.created_at, 'localtime') AS label,
                    COUNT(s.id) AS sale_count,
                    COALESCE(SUM(s.total), 0) AS revenue,
                    COALESCE(SUM(sp.profit), 0) AS profit
             FROM sales s
             {}
             {}
             GROUP BY label
             ORDER BY label ASC",
            sale_profit_subquery,
            filter_sql
        ),
    };

    let mut stmt = conn.prepare(&rows_sql).map_err(|e| e.to_string())?;
    let rows: Vec<SalesReportRow> = match filters.group_by.as_str() {
        "product" => stmt.query_map(params_refs.as_slice(), |row| {
            Ok(SalesReportRow {
                label: row.get(0)?,
                date: None,
                product_name: row.get(0)?,
                cashier_name: None,
                count: 0,
                quantity: row.get(1)?,
                revenue: row.get(2)?,
                profit: row.get(3)?,
            })
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect(),
        "cashier" => stmt.query_map(params_refs.as_slice(), |row| {
            Ok(SalesReportRow {
                label: row.get(0)?,
                date: None,
                product_name: None,
                cashier_name: row.get(0)?,
                count: row.get(1)?,
                quantity: 0,
                revenue: row.get(2)?,
                profit: row.get(3)?,
            })
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect(),
        _ => stmt.query_map(params_refs.as_slice(), |row| {
            let label: String = row.get(0)?;
            Ok(SalesReportRow {
                date: Some(label.clone()),
                label,
                product_name: None,
                cashier_name: None,
                count: row.get(1)?,
                quantity: 0,
                revenue: row.get(2)?,
                profit: row.get(3)?,
            })
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect(),
    };

    let gross_profit = total_revenue - total_cost;

    Ok(SalesReport {
        date_from: filters.date_from,
        date_to: filters.date_to,
        total_revenue,
        total_cost,
        gross_profit,
        profit_margin: percentage(gross_profit, total_revenue),
        total_sales_count,
        avg_sale_value: if total_sales_count > 0 { total_revenue / total_sales_count } else { 0 },
        rows,
        payment_breakdown,
    })
}
