use std::collections::HashMap;

use chrono::{Duration, Local};
use rusqlite::{params, types::ToSql};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Database;

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

#[derive(Debug, Serialize)]
pub struct InventoryStockItem {
    pub product_name: String,
    pub current_qty: i64,
    pub min_stock_level: i64,
    pub last_purchase_price: i64,
}

#[derive(Debug, Serialize)]
pub struct DeadStockItem {
    pub product_name: String,
    pub current_qty: i64,
    pub stock_value: i64,
    pub last_movement_date: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LocationStock {
    pub location_name: String,
    pub location_type: String,
    pub product_count: i64,
    pub total_qty: i64,
    pub total_value: i64,
}

#[derive(Debug, Serialize)]
pub struct InventoryReport {
    pub total_products: i64,
    pub total_stock_value: i64,
    pub total_stock_cost: i64,
    pub total_potential_revenue: i64,
    pub low_stock_items: Vec<InventoryStockItem>,
    pub out_of_stock_items: Vec<InventoryStockItem>,
    pub dead_stock_items: Vec<DeadStockItem>,
    pub by_location: Vec<LocationStock>,
}

#[derive(Debug, Serialize)]
pub struct ExpiryItem {
    pub product_name: String,
    pub batch_number: Option<String>,
    pub expiry_date: String,
    pub quantity_current: i64,
    pub location_name: String,
    pub stock_value: i64,
    pub days_until_expiry: i64,
}

#[derive(Debug, Serialize)]
pub struct ExpiryReport {
    pub expired: Vec<ExpiryItem>,
    pub expiring_7: Vec<ExpiryItem>,
    pub expiring_30: Vec<ExpiryItem>,
    pub expiring_60: Vec<ExpiryItem>,
    pub expiring_90: Vec<ExpiryItem>,
    pub total_at_risk_value: i64,
}

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

fn percentage(numerator: i64, denominator: i64) -> f64 {
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

fn fetch_expiry_items(
    conn: &rusqlite::Connection,
    tenant_id: &str,
    branch_id: &str,
    condition: &str,
) -> Result<Vec<ExpiryItem>, String> {
    let sql = format!(
        "SELECT COALESCE(p.trade_name_ar, p.trade_name) AS product_name,
                b.batch_number,
                b.expiry_date,
                b.quantity_current,
                sl.name,
                b.quantity_current * b.unit_cost AS stock_value,
                CAST(julianday(DATE(b.expiry_date)) - julianday(DATE('now', 'localtime')) AS INTEGER) AS days_until_expiry
         FROM batches b
         JOIN products p ON b.product_id = p.id
         JOIN storage_locations sl ON b.location_id = sl.id
         WHERE b.tenant_id = ?1
           AND sl.branch_id = ?2
           AND b.deleted_at IS NULL
           AND sl.deleted_at IS NULL
           AND b.status = 'active'
           AND b.quantity_current > 0
           AND b.expiry_date IS NOT NULL
           AND {condition}
         ORDER BY DATE(b.expiry_date) ASC, product_name ASC"
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![tenant_id, branch_id], |row| {
        Ok(ExpiryItem {
            product_name: row.get(0)?,
            batch_number: row.get(1)?,
            expiry_date: row.get(2)?,
            quantity_current: row.get(3)?,
            location_name: row.get(4)?,
            stock_value: row.get(5)?,
            days_until_expiry: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(rows)
}

#[tauri::command]
pub fn get_dashboard_stats(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
) -> Result<DashboardStats, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

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

#[tauri::command]
pub fn get_inventory_report(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
) -> Result<InventoryReport, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let total_products: i64 = conn.query_row(
        "SELECT COUNT(*) FROM products WHERE tenant_id = ?1 AND is_active = 1 AND deleted_at IS NULL",
        params![tenant_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let total_stock_cost: i64 = conn.query_row(
        "SELECT COALESCE(SUM(b.quantity_current * b.unit_cost), 0)
         FROM batches b
         JOIN storage_locations sl ON b.location_id = sl.id
         WHERE b.tenant_id = ?1 AND sl.branch_id = ?2
           AND b.deleted_at IS NULL AND sl.deleted_at IS NULL
           AND b.quantity_current > 0",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let total_potential_revenue: i64 = conn.query_row(
        "SELECT COALESCE(SUM(b.quantity_current * p.sale_price), 0)
         FROM batches b
         JOIN products p ON b.product_id = p.id
         JOIN storage_locations sl ON b.location_id = sl.id
         WHERE b.tenant_id = ?1 AND sl.branch_id = ?2
           AND b.deleted_at IS NULL AND p.deleted_at IS NULL AND sl.deleted_at IS NULL
           AND b.quantity_current > 0 AND p.is_active = 1",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let low_stock_sql =
        "SELECT COALESCE(p.trade_name_ar, p.trade_name) AS product_name,
                COALESCE((
                    SELECT SUM(b.quantity_current)
                    FROM batches b
                    JOIN storage_locations sl ON b.location_id = sl.id
                    WHERE b.product_id = p.id
                      AND b.status = 'active'
                      AND b.deleted_at IS NULL
                      AND sl.deleted_at IS NULL
                      AND sl.branch_id = ?2
                ), 0) AS current_qty,
                p.min_stock_level,
                p.last_purchase_price
         FROM products p
         WHERE p.tenant_id = ?1 AND p.is_active = 1 AND p.deleted_at IS NULL AND p.min_stock_level > 0
           AND current_qty < p.min_stock_level
         ORDER BY current_qty ASC, p.trade_name ASC";

    let mut low_stock_stmt = conn.prepare(low_stock_sql).map_err(|e| e.to_string())?;
    let low_stock_items = low_stock_stmt.query_map(params![tenant_id, branch_id], |row| {
        Ok(InventoryStockItem {
            product_name: row.get(0)?,
            current_qty: row.get(1)?,
            min_stock_level: row.get(2)?,
            last_purchase_price: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let out_of_stock_sql =
        "SELECT COALESCE(p.trade_name_ar, p.trade_name) AS product_name,
                0 AS current_qty,
                p.min_stock_level,
                p.last_purchase_price
         FROM products p
         WHERE p.tenant_id = ?1 AND p.is_active = 1 AND p.deleted_at IS NULL
           AND COALESCE((
                SELECT SUM(b.quantity_current)
                FROM batches b
                JOIN storage_locations sl ON b.location_id = sl.id
                WHERE b.product_id = p.id
                  AND b.status = 'active'
                  AND b.deleted_at IS NULL
                  AND sl.deleted_at IS NULL
                  AND sl.branch_id = ?2
           ), 0) = 0
         ORDER BY p.trade_name ASC";

    let mut out_stmt = conn.prepare(out_of_stock_sql).map_err(|e| e.to_string())?;
    let out_of_stock_items = out_stmt.query_map(params![tenant_id, branch_id], |row| {
        Ok(InventoryStockItem {
            product_name: row.get(0)?,
            current_qty: row.get(1)?,
            min_stock_level: row.get(2)?,
            last_purchase_price: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut dead_stmt = conn.prepare(
        "SELECT COALESCE(p.trade_name_ar, p.trade_name) AS product_name,
                SUM(b.quantity_current) AS current_qty,
                SUM(b.quantity_current * b.unit_cost) AS stock_value,
                MAX(sm.created_at) AS last_movement_date
         FROM products p
         JOIN batches b ON b.product_id = p.id
         JOIN storage_locations sl ON b.location_id = sl.id
         LEFT JOIN stock_movements sm ON sm.product_id = p.id AND sm.branch_id = ?2
         WHERE p.tenant_id = ?1
           AND p.deleted_at IS NULL
           AND p.is_active = 1
           AND b.deleted_at IS NULL
           AND sl.deleted_at IS NULL
           AND sl.branch_id = ?2
           AND b.quantity_current > 0
         GROUP BY p.id, product_name
         HAVING current_qty > 0
            AND (last_movement_date IS NULL OR DATETIME(last_movement_date) <= DATETIME('now', 'localtime', '-90 days'))
         ORDER BY stock_value DESC"
    ).map_err(|e| e.to_string())?;

    let dead_stock_items = dead_stmt.query_map(params![tenant_id, branch_id], |row| {
        Ok(DeadStockItem {
            product_name: row.get(0)?,
            current_qty: row.get(1)?,
            stock_value: row.get(2)?,
            last_movement_date: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut location_stmt = conn.prepare(
        "SELECT sl.name, sl.location_type,
                COUNT(DISTINCT CASE WHEN b.quantity_current > 0 THEN b.product_id END) AS product_count,
                COALESCE(SUM(b.quantity_current), 0) AS total_qty,
                COALESCE(SUM(b.quantity_current * b.unit_cost), 0) AS total_value
         FROM storage_locations sl
         LEFT JOIN batches b ON b.location_id = sl.id AND b.deleted_at IS NULL
         WHERE sl.tenant_id = ?1 AND sl.branch_id = ?2 AND sl.deleted_at IS NULL
         GROUP BY sl.id, sl.name, sl.location_type
         ORDER BY sl.name ASC"
    ).map_err(|e| e.to_string())?;

    let by_location = location_stmt.query_map(params![tenant_id, branch_id], |row| {
        Ok(LocationStock {
            location_name: row.get(0)?,
            location_type: row.get(1)?,
            product_count: row.get(2)?,
            total_qty: row.get(3)?,
            total_value: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(InventoryReport {
        total_products,
        total_stock_value: total_stock_cost,
        total_stock_cost,
        total_potential_revenue,
        low_stock_items,
        out_of_stock_items,
        dead_stock_items,
        by_location,
    })
}

#[tauri::command]
pub fn get_expiry_report(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
) -> Result<ExpiryReport, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let expired = fetch_expiry_items(
        &conn,
        &tenant_id,
        &branch_id,
        "DATE(b.expiry_date) < DATE('now', 'localtime')",
    )?;
    let expiring_7 = fetch_expiry_items(
        &conn,
        &tenant_id,
        &branch_id,
        "DATE(b.expiry_date) > DATE('now', 'localtime') AND DATE(b.expiry_date) <= DATE('now', '+7 days', 'localtime')",
    )?;
    let expiring_30 = fetch_expiry_items(
        &conn,
        &tenant_id,
        &branch_id,
        "DATE(b.expiry_date) > DATE('now', '+7 days', 'localtime') AND DATE(b.expiry_date) <= DATE('now', '+30 days', 'localtime')",
    )?;
    let expiring_60 = fetch_expiry_items(
        &conn,
        &tenant_id,
        &branch_id,
        "DATE(b.expiry_date) > DATE('now', '+30 days', 'localtime') AND DATE(b.expiry_date) <= DATE('now', '+60 days', 'localtime')",
    )?;
    let expiring_90 = fetch_expiry_items(
        &conn,
        &tenant_id,
        &branch_id,
        "DATE(b.expiry_date) > DATE('now', '+60 days', 'localtime') AND DATE(b.expiry_date) <= DATE('now', '+90 days', 'localtime')",
    )?;

    let total_at_risk_value: i64 = conn.query_row(
        "SELECT COALESCE(SUM(b.quantity_current * b.unit_cost), 0)
         FROM batches b
         JOIN storage_locations sl ON b.location_id = sl.id
         WHERE b.tenant_id = ?1 AND sl.branch_id = ?2
           AND b.deleted_at IS NULL AND sl.deleted_at IS NULL
           AND b.status = 'active' AND b.quantity_current > 0
           AND b.expiry_date IS NOT NULL
           AND DATE(b.expiry_date) <= DATE('now', '+90 days', 'localtime')",
        params![tenant_id, branch_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    Ok(ExpiryReport {
        expired,
        expiring_7,
        expiring_30,
        expiring_60,
        expiring_90,
        total_at_risk_value,
    })
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

#[derive(Debug, Serialize)]
pub struct TaxReportRow {
    pub sale_number: String,
    pub sale_type: String,
    pub customer_name: Option<String>,
    pub subtotal: i64,
    pub discount: i64,
    pub tax_amount: i64,
    pub total: i64,
    pub payment_method: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct TaxReport {
    pub rows: Vec<TaxReportRow>,
    pub total_subtotal: i64,
    pub total_discount: i64,
    pub total_tax: i64,
    pub total_net: i64,
    pub taxable_sales_count: i64,
    pub exempt_sales_count: i64,
}

#[tauri::command]
pub fn get_tax_report(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    date_from: Option<String>,
    date_to: Option<String>,
) -> Result<TaxReport, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let d_from: Option<String> = date_from;
    let d_to: Option<String> = date_to;

    let sql = "SELECT s.sale_number, s.sale_type, c.name,
                      s.subtotal, s.discount, s.tax_amount, s.total,
                      s.payment_method, s.created_at
               FROM sales s
               LEFT JOIN customers c ON c.id = s.customer_id
               WHERE s.tenant_id = ?1
                 AND s.branch_id = ?2
                 AND s.deleted_at IS NULL
                 AND (?3 IS NULL OR date(s.created_at) >= ?3)
                 AND (?4 IS NULL OR date(s.created_at) <= ?4)
               ORDER BY s.created_at DESC";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows: Vec<TaxReportRow> = stmt.query_map(
        params![tenant_id, branch_id, d_from, d_to],
        |row| {
            Ok(TaxReportRow {
                sale_number: row.get(0)?,
                sale_type: row.get(1)?,
                customer_name: row.get(2)?,
                subtotal: row.get(3)?,
                discount: row.get(4)?,
                tax_amount: row.get(5)?,
                total: row.get(6)?,
                payment_method: row.get(7)?,
                created_at: row.get(8)?,
            })
        },
    ).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let total_subtotal: i64 = rows.iter().map(|r| r.subtotal).sum();
    let total_discount: i64 = rows.iter().map(|r| r.discount).sum();
    let total_tax: i64 = rows.iter().map(|r| r.tax_amount).sum();
    let total_net: i64 = rows.iter().map(|r| r.total).sum();
    let taxable_sales_count = rows.iter().filter(|r| r.tax_amount > 0).count() as i64;
    let exempt_sales_count = rows.iter().filter(|r| r.tax_amount == 0).count() as i64;

    Ok(TaxReport {
        rows,
        total_subtotal,
        total_discount,
        total_tax,
        total_net,
        taxable_sales_count,
        exempt_sales_count,
    })
}