use rusqlite::params;
use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::cloud_sync;
use crate::commands::guard;
use crate::commands::license_guard;
use crate::commands::session_state::{AuthSessionState, resolve_identity};
use super::pos::{self, FLAG_POS};
use super::pos_types::*;

#[tauri::command]
pub fn get_invoice_sales(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    customer_id: Option<String>,
    payment_status: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
) -> Result<Vec<InvoiceSaleRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let sql = "SELECT s.id, s.sale_number, s.customer_id, c.name, u.full_name,
                      s.total, s.tax_amount, s.amount_paid, (s.total - s.amount_paid) as balance_due,
                      s.payment_method, s.payment_status, s.notes, s.created_at,
                      COUNT(si.id) as items_count
               FROM sales s
               JOIN users u ON s.cashier_id = u.id
               LEFT JOIN customers c ON s.customer_id = c.id
               LEFT JOIN sale_items si ON si.sale_id = s.id
               WHERE s.tenant_id = ?1 AND s.branch_id = ?2
                 AND s.sale_type = 'invoice' AND s.deleted_at IS NULL
                 AND (?3 IS NULL OR s.customer_id = ?3)
                 AND (?4 IS NULL OR s.payment_status = ?4)
                 AND (?5 IS NULL OR DATE(s.created_at) >= ?5)
                 AND (?6 IS NULL OR DATE(s.created_at) <= ?6)
               GROUP BY s.id
               ORDER BY s.created_at DESC
               LIMIT 500";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(
        params![tenant_id, branch_id, customer_id, payment_status, date_from, date_to],
        |row: &rusqlite::Row| {
            Ok(InvoiceSaleRow {
                id: row.get(0)?,
                sale_number: row.get(1)?,
                customer_id: row.get(2)?,
                customer_name: row.get(3)?,
                cashier_name: row.get(4)?,
                total: row.get(5)?,
                tax_amount: row.get(6)?,
                amount_paid: row.get(7)?,
                balance_due: row.get(8)?,
                payment_method: row.get(9)?,
                payment_status: row.get(10)?,
                notes: row.get(11)?,
                created_at: row.get(12)?,
                items_count: row.get(13)?,
            })
        },
    ).map_err(|e: rusqlite::Error| e.to_string())?;

    let mut result = Vec::new();
    for row in rows { result.push(row.map_err(|e: rusqlite::Error| e.to_string())?); }
    Ok(result)
}

#[tauri::command]
pub fn create_invoice_sale(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    cashier_id: String,
    customer_id: Option<String>,
    payment_method: String,
    amount_paid: i64,
    account_id: String,
    discount: i64,
    tax_amount: i64,
    notes: Option<String>,
    items: Vec<SaleItemInput>,
    auth_session: State<'_, AuthSessionState>,
) -> Result<SaleOut, String> {
    if items.is_empty() {
        return Err("يجب إضافة صنف واحد على الأقل".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &cashier_id, &branch_id)?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_POS)?;
    guard::require_access(&conn, &cashier_id, "pos.sell", guard::Level::Write)?;

    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();

    let mut item_costs: Vec<(String, i64, i64, i64)> = Vec::new(); // (name, unit_price, unit_cost, qty)

    for item in &items {
        let (qty, expiry_date, batch_status, unit_cost): (i64, Option<String>, String, i64) = conn.query_row(
            "SELECT quantity_current, expiry_date, status, unit_cost FROM batches WHERE id = ?1 AND tenant_id = ?2",
            params![item.batch_id, tenant_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        ).map_err(|_| "الدفعة غير موجودة".to_string())?;

        if batch_status == "disposed" || batch_status == "recalled" {
            let pname: String = conn.query_row(
                "SELECT trade_name FROM products WHERE id = ?1",
                params![item.product_id],
                |row| row.get(0),
            ).unwrap_or_else(|_| item.product_id.clone());
            return Err(format!("الدفعة محجوبة أو تالفة ولا يمكن بيعها: {}", pname));
        }

        if let Some(ref exp) = expiry_date {
            if exp.as_str() < today.as_str() {
                let pname: String = conn.query_row(
                    "SELECT trade_name FROM products WHERE id = ?1",
                    params![item.product_id],
                    |row| row.get(0),
                ).unwrap_or_else(|_| item.product_id.clone());
                return Err(format!("الدفعة منتهية الصلاحية: {}", pname));
            }
        }

        if qty < item.quantity {
            let pname: String = conn.query_row(
                "SELECT trade_name FROM products WHERE id = ?1",
                params![item.product_id],
                |row| row.get(0),
            ).unwrap_or_else(|_| item.product_id.clone());
            return Err(format!("كمية غير كافية: {}", pname));
        }

        let pname: String = conn.query_row(
            "SELECT trade_name FROM products WHERE id = ?1",
            params![item.product_id],
            |row| row.get(0),
        ).unwrap_or_else(|_| item.product_id.clone());
        item_costs.push((pname, item.unit_price, unit_cost, item.quantity));
    }

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<String, String> {
        let sale_number = pos::next_sequence(&conn, &tenant_id, "sale_number")?;
        let sale_id = Uuid::new_v4().to_string();

        let subtotal: i64 = items.iter().map(|i| i.quantity * i.unit_price).sum();
        let total = subtotal - discount + tax_amount;

        if subtotal > 0 && discount > 0 {
            let discount_rate = 1.0 - discount as f64 / subtotal as f64;
            for (pname, unit_price, unit_cost, _qty) in &item_costs {
                if *unit_cost > 0 {
                    let discounted_price = (*unit_price as f64 * discount_rate) as i64;
                    if discounted_price < *unit_cost {
                        return Err(format!("صنف {} سيُباع بـ {} ج.س وهو أقل من سعر التكلفة ({} ج.س). قلل من الخصم.", pname, discounted_price, unit_cost));
                    }
                }
            }
        }

        let change_amount = if payment_method == "cash" && amount_paid > total { amount_paid - total } else { 0 };
        let payment_status = if payment_method == "credit" {
            "credit"
        } else if amount_paid < total {
            "partial"
        } else {
            "paid"
        };

        conn.execute(
            "INSERT INTO sales (id, tenant_id, branch_id, sale_number, sale_type, session_id, cashier_id,
                  customer_id, subtotal, discount, tax_amount, total, amount_paid, change_amount,
                  payment_method, payment_status, notes)
              VALUES (?1, ?2, ?3, ?4, 'invoice', NULL, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![sale_id, tenant_id, branch_id, sale_number, cashier_id,
                  customer_id, subtotal, discount, tax_amount, total, amount_paid, change_amount,
                    payment_method, payment_status, notes],
        ).map_err(|e| format!("فشل إنشاء الفاتورة: {}", e))?;

    for item in &items {
            let item_id = Uuid::new_v4().to_string();
            let item_subtotal = item.quantity * item.unit_price;

            conn.execute(
                "INSERT INTO sale_items (id, tenant_id, sale_id, product_id, batch_id, quantity, unit_price, unit_cost, subtotal)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![item_id, tenant_id, sale_id, item.product_id, item.batch_id,
                        item.quantity, item.unit_price, item.unit_cost, item_subtotal],
            ).map_err(|e| format!("فشل إضافة صنف الفاتورة: {}", e))?;

            let qty_before: i64 = conn.query_row(
                "SELECT quantity_current FROM batches WHERE id = ?1",
                params![item.batch_id],
                |row| row.get(0),
            ).map_err(|e| e.to_string())?;
            let qty_after = qty_before - item.quantity;

            conn.execute(
                "UPDATE batches SET quantity_current = ?2,
                        status = CASE WHEN ?2 = 0 THEN 'depleted' ELSE status END,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE id = ?1",
                params![item.batch_id, qty_after],
            ).map_err(|e| e.to_string())?;

            let mv_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO stock_movements (id, tenant_id, branch_id, product_id, batch_id,
                        movement_type, quantity_change, quantity_before, quantity_after,
                        reference_type, reference_id, created_by)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'sell', ?6, ?7, ?8, 'sale', ?9, ?10)",
                params![mv_id, tenant_id, branch_id, item.product_id, item.batch_id,
                        -item.quantity, qty_before, qty_after, sale_id, cashier_id],
            ).map_err(|e| e.to_string())?;
        }

        if payment_method == "credit" || payment_status == "partial" {
            if let Some(ref cid) = customer_id {
                let outstanding = total - amount_paid;
                let (cust_balance, cust_limit): (i64, i64) = conn.query_row(
                    "SELECT current_balance, credit_limit FROM customers WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL AND is_active = 1",
                    params![cid, tenant_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                 ).map_err(|_| "العميل غير موجود أو غير نشط".to_string())?;

                if cust_limit < 0 {
                    // sentinel -1 = unlimited credit, allow
                } else if cust_limit == 0 {
                    return Err("هذا العميل نقدي فقط (لا يسمح بالائتمان)".to_string());
                } else if cust_balance + outstanding > cust_limit {
                    return Err(format!("تجاوز حد الائتمان: الرصيد {} + المبلغ {} > الحد {}", cust_balance, outstanding, cust_limit));
                }

                conn.execute(
                    "UPDATE customers SET current_balance = current_balance + ?2,
                            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                     WHERE id = ?1",
                    params![cid, outstanding],
                ).map_err(|e| e.to_string())?;
            } else {
                return Err("العميل مطلوب للدفع بالائتمان أو الدفع الجزئي".into());
            }
        }

        if amount_paid > 0 {
            let effective_amount = amount_paid - change_amount;
            let bal_before: i64 = conn.query_row(
                "SELECT current_balance FROM accounts WHERE id = ?1",
                params![account_id],
                |row| row.get(0),
            ).map_err(|e| e.to_string())?;

            let bal_after = bal_before + effective_amount;
            let tx_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO account_transactions (id, tenant_id, account_id, transaction_type, direction,
                        amount, balance_before, balance_after, reference_type, reference_id, created_by)
                 VALUES (?1, ?2, ?3, 'sale_income', 'in', ?4, ?5, ?6, 'sale', ?7, ?8)",
                params![tx_id, tenant_id, account_id, effective_amount, bal_before, bal_after, sale_id, cashier_id],
            ).map_err(|e| e.to_string())?;

            conn.execute(
                "UPDATE accounts SET current_balance = ?2,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE id = ?1",
                params![account_id, bal_after],
            ).map_err(|e| e.to_string())?;
        }

        Ok(sale_id)
    })();

    match result {
        Ok(sale_id) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;

            if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "invoice_sale_created") {
                log::warn!("cloud sync enqueue failed after create_invoice_sale: {}", e);
            }

            pos::build_sale_out(&conn, &tenant_id, &sale_id)
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}
