use rusqlite::params;
use serde::Serialize;
use tauri::State;

use crate::db::Database;

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
