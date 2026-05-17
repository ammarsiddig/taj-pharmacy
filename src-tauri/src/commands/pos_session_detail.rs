use tauri::State;

use crate::db::Database;
use super::pos;
use super::pos_types::*;

#[tauri::command]
pub fn get_session_sales(
    db: State<'_, Database>,
    tenant_id: String,
    session_id: String,
) -> Result<Vec<SessionSaleRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT s.id, s.sale_number, s.total, s.payment_method,
                (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) as items_count,
                c.name_ar, c.name,
                s.created_at
         FROM sales s
         LEFT JOIN customers c ON s.customer_id = c.id
         WHERE s.tenant_id = ?1 AND s.session_id = ?2 AND s.deleted_at IS NULL
         ORDER BY s.created_at ASC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(rusqlite::params![tenant_id, session_id], |row| {
        let name_ar: Option<String> = row.get(5)?;
        let name_en: Option<String> = row.get(6)?;
        Ok(SessionSaleRow {
            id: row.get(0)?,
            sale_number: row.get(1)?,
            total: row.get(2)?,
            payment_method: row.get(3)?,
            items_count: row.get(4)?,
            customer_name: name_ar.or(name_en),
            created_at: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(rows)
}

#[tauri::command]
pub fn get_session_product_summary(
    db: State<'_, Database>,
    tenant_id: String,
    session_id: String,
) -> Result<Vec<ProductSummaryRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT si.product_id, p.trade_name, SUM(si.quantity) as total_qty,
                COALESCE((SELECT SUM(ri.quantity) FROM return_items ri
                          JOIN returns r ON ri.return_id = r.id
                          WHERE ri.product_id = si.product_id
                          AND r.session_id = ?2), 0) as total_returned,
                si.unit_price, COALESCE(AVG(si.unit_cost), 0) as avg_unit_cost,
                SUM(si.subtotal) as total_amount
         FROM sale_items si
         JOIN sales s ON si.sale_id = s.id AND s.deleted_at IS NULL
         JOIN products p ON si.product_id = p.id
         WHERE s.tenant_id = ?1 AND s.session_id = ?2
         GROUP BY si.product_id, si.unit_price
         ORDER BY p.trade_name"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(rusqlite::params![tenant_id, session_id], |row| {
        let total_qty: i64 = row.get(2)?;
        let total_returned: i64 = row.get(3)?;
        let unit_price: i64 = row.get(4)?;
        let unit_cost: i64 = row.get(5)?;
        let net_qty = total_qty - total_returned;
        let net_amount = net_qty * unit_price;
        Ok(ProductSummaryRow {
            product_id: row.get(0)?,
            product_name: row.get(1)?,
            total_qty,
            total_returned,
            net_qty,
            unit_price,
            unit_cost,
            total_amount: row.get(6)?,
            net_amount,
            profit: net_qty * (unit_price - unit_cost),
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(rows)
}

#[tauri::command]
pub fn get_sale_detail(
    db: State<'_, Database>,
    tenant_id: String,
    sale_id: String,
) -> Result<SaleOut, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    pos::build_sale_out(&conn, &tenant_id, &sale_id)
}
