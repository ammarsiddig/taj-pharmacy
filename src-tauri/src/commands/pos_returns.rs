use rusqlite::params;
use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::cloud_sync;
use crate::commands::license_guard;
use crate::commands::guard;
use crate::commands::audit;
use crate::commands::session_state::{AuthSessionState, resolve_identity};
use super::pos::{self, FLAG_POS};
use super::pos_types::*;

#[tauri::command]
pub fn create_return(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    sale_id: String,
    session_id: Option<String>,
    return_type: String,
    refund_method: String,
    reason: Option<String>,
    items: Vec<ReturnItemInput>,
    created_by: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<ReturnOut, String> {
    if items.is_empty() {
        return Err("يجب إضافة صنف واحد على الأقل للمرتجع".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &created_by, &branch_id)?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_POS)?;
    guard::require_access(&conn, &created_by, "pos.sell", guard::Level::Write)?;
    guard::require_access(&conn, &created_by, "pos.returns", guard::Level::Write)?;

    let sale_number: String = conn.query_row(
        "SELECT sale_number FROM sales WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![sale_id, tenant_id],
        |row| row.get(0),
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    for item in &items {
        if item.quantity <= 0 {
            return Err(format!("الكمية المرتجعة غير صالحة ({}) — يجب أن تكون أكبر من صفر", item.quantity));
        }
        let (orig_qty, already_returned): (i64, i64) = conn.query_row(
            "SELECT si.quantity,
                    COALESCE((SELECT SUM(ri.quantity) FROM return_items ri
                              JOIN returns r ON ri.return_id = r.id
                              WHERE ri.sale_item_id = si.id), 0)
             FROM sale_items si WHERE si.id = ?1",
            params![item.sale_item_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|_| "صنف البيع غير موجود".to_string())?;

        if item.quantity > (orig_qty - already_returned) {
            return Err(format!("الكمية المرتجعة ({}) أكبر من المتاح ({})", item.quantity, orig_qty - already_returned));
        }
    }

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<String, String> {
        let return_number = pos::next_sequence(&conn, &tenant_id, "return_number")?;
        let return_id = Uuid::new_v4().to_string();
        let total: i64 = items.iter().map(|i| i.quantity * i.unit_price).sum();

        conn.execute(
            "INSERT INTO returns (id, tenant_id, branch_id, return_number, sale_id, session_id,
                    return_type, subtotal, total, refund_method, reason, created_by)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![return_id, tenant_id, branch_id, return_number, sale_id, session_id,
                    return_type, total, total, refund_method, reason, created_by],
        ).map_err(|e| format!("فشل إنشاء المرتجع: {}", e))?;

        for item in &items {
            let item_id = Uuid::new_v4().to_string();
            let item_subtotal = item.quantity * item.unit_price;

            conn.execute(
                "INSERT INTO return_items (id, tenant_id, return_id, sale_item_id, product_id, batch_id,
                        quantity, unit_price, subtotal)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![item_id, tenant_id, return_id, item.sale_item_id, item.product_id,
                        item.batch_id, item.quantity, item.unit_price, item_subtotal],
            ).map_err(|e| format!("فشل إضافة صنف المرتجع: {}", e))?;

            let qty_before: i64 = conn.query_row(
                "SELECT quantity_current FROM batches WHERE id = ?1",
                params![item.batch_id],
                |row| row.get(0),
            ).map_err(|e| e.to_string())?;

            let qty_after = qty_before + item.quantity;

            conn.execute(
                "UPDATE batches SET quantity_current = ?2,
                        status = CASE WHEN ?2 > 0 THEN 'active' ELSE status END,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE id = ?1",
                params![item.batch_id, qty_after],
            ).map_err(|e| e.to_string())?;

            let mv_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO stock_movements (id, tenant_id, branch_id, product_id, batch_id,
                        movement_type, quantity_change, quantity_before, quantity_after,
                        reference_type, reference_id, created_by)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'customer_return', ?6, ?7, ?8, 'return', ?9, ?10)",
                params![mv_id, tenant_id, branch_id, item.product_id, item.batch_id,
                        item.quantity, qty_before, qty_after, return_id, created_by],
            ).map_err(|e| e.to_string())?;
        }

        if let Some(ref sid) = session_id {
            conn.execute(
                "UPDATE pos_sessions SET total_returns = total_returns + ?2,
                        total_sales = total_sales - ?2,
                        expected_cash = CASE WHEN ?3 = 'cash' THEN expected_cash - ?2 ELSE expected_cash END,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE id = ?1 AND status = 'open'",
                params![sid, total, refund_method],
            ).map_err(|e| e.to_string())?;
        }

        let (orig_pm, orig_cid): (String, Option<String>) = conn.query_row(
            "SELECT payment_method, customer_id FROM sales WHERE id = ?1 AND tenant_id = ?2",
            params![sale_id, tenant_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|e| e.to_string())?;

        if orig_pm == "credit" {
            if let Some(ref cid) = orig_cid {
                conn.execute(
                    "UPDATE customers SET current_balance = current_balance - ?2,
                            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                     WHERE id = ?1 AND deleted_at IS NULL",
                    params![cid, total],
                ).map_err(|e| e.to_string())?;
            }
        }

        if refund_method == "cash" || refund_method == "bank_transfer" {
            let account_id: String = if refund_method == "bank_transfer" {
                conn.query_row(
                    "SELECT id FROM accounts WHERE tenant_id = ?1 AND branch_id = ?2 AND account_type = 'bank' AND is_active = 1 AND deleted_at IS NULL LIMIT 1",
                    params![tenant_id, branch_id],
                    |r| r.get::<_, String>(0),
                ).or_else(|_| {
                    session_id.as_ref()
                        .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)
                        .and_then(|sid| {
                        conn.query_row(
                            "SELECT account_id FROM pos_sessions WHERE id = ?1",
                            params![sid],
                            |row| row.get::<_, String>(0),
                        )
                    })
                }).map_err(|_| "لا يوجد حساب بنكي نشط لتسجيل الاسترداد البنكي".to_string())?
            } else if let Some(ref sid) = session_id {
                conn.query_row(
                    "SELECT account_id FROM pos_sessions WHERE id = ?1",
                    params![sid],
                    |row| row.get(0),
                ).map_err(|e| e.to_string())?
            } else {
                conn.query_row(
                    "SELECT id FROM accounts WHERE tenant_id = ?1 AND branch_id = ?2 AND is_default = 1 AND is_active = 1 AND deleted_at IS NULL LIMIT 1",
                    params![tenant_id, branch_id],
                    |r| r.get::<_, String>(0),
                ).map_err(|e| e.to_string())?
            };

            if !account_id.is_empty() {
                let bal_before: i64 = conn.query_row(
                    "SELECT current_balance FROM accounts WHERE id = ?1",
                    params![account_id],
                    |row| row.get(0),
                ).map_err(|e| e.to_string())?;

                if bal_before < total {
                    return Err(format!("صندوق النقدية يحتوي على {} ج.س فقط. لا يمكن إعادة {} ج.س.", bal_before, total));
                }

                let bal_after = bal_before - total;
                let tx_id = Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO account_transactions (id, tenant_id, account_id, transaction_type, direction,
                            amount, balance_before, balance_after, reference_type, reference_id, created_by)
                     VALUES (?1, ?2, ?3, 'customer_refund', 'out', ?4, ?5, ?6, 'return', ?7, ?8)",
                    params![tx_id, tenant_id, account_id, total, bal_before, bal_after, return_id, created_by],
                ).map_err(|e| e.to_string())?;

                conn.execute(
                    "UPDATE accounts SET current_balance = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
                    params![account_id, bal_after],
                ).map_err(|e| e.to_string())?;
            }
        }

        Ok(return_id)
    })();

    match result {
        Ok(return_id) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            if let Err(e) = audit::log_action(&conn, &tenant_id, &created_by, "create", "return", &return_id, None) {
                log::warn!("audit log failed after create_return: {}", e);
            }
            if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "return_created") {
                log::warn!("cloud sync enqueue failed after create_return: {}", e);
            }

            let (rnum, rtype, rtotal, rmethod, rstatus, rreason, rcat): (String, String, i64, String, String, Option<String>, String) = conn.query_row(
                "SELECT return_number, return_type, total, refund_method, status, reason, created_at
                 FROM returns WHERE id = ?1",
                params![return_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)),
            ).map_err(|e| e.to_string())?;

            let mut istmt = conn.prepare(
                "SELECT ri.id, ri.product_id, p.trade_name, ri.batch_id, ri.quantity, ri.unit_price, ri.subtotal
                 FROM return_items ri
                 JOIN products p ON ri.product_id = p.id
                 WHERE ri.return_id = ?1"
            ).map_err(|e| e.to_string())?;

            let ritems: Vec<ReturnItemOut> = istmt.query_map(params![return_id], |row| {
                Ok(ReturnItemOut {
                    id: row.get(0)?, product_id: row.get(1)?, product_name: row.get(2)?,
                    batch_id: row.get(3)?, quantity: row.get(4)?, unit_price: row.get(5)?, subtotal: row.get(6)?,
                })
            }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

            Ok(ReturnOut {
                id: return_id, return_number: rnum, sale_id: Some(sale_id), sale_number,
                return_type: rtype, total: rtotal, refund_method: rmethod,
                status: rstatus, reason: rreason, items: ritems, created_at: rcat,
            })
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn get_session_returns(
    db: State<'_, Database>,
    tenant_id: String,
    session_id: String,
) -> Result<Vec<SessionReturnRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT r.id, r.return_number,
                (SELECT s.sale_number FROM sales s WHERE s.id = r.sale_id),
                r.return_type, r.total, r.refund_method, r.created_at
         FROM returns r
         WHERE r.tenant_id = ?1 AND r.session_id = ?2
         ORDER BY r.created_at ASC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![tenant_id, session_id], |row| {
        Ok(SessionReturnRow {
            id: row.get(0)?,
            return_number: row.get(1)?,
            sale_number: row.get(2)?,
            return_type: row.get(3)?,
            total: row.get(4)?,
            refund_method: row.get(5)?,
            created_at: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(rows)
}

#[tauri::command]
pub fn get_sale_by_number(
    db: State<'_, Database>,
    tenant_id: String,
    sale_number: String,
) -> Result<SaleOut, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let sale_id: String = conn.query_row(
        "SELECT id FROM sales WHERE tenant_id = ?1 AND sale_number = ?2 AND deleted_at IS NULL",
        params![tenant_id, sale_number],
        |row| row.get(0),
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    pos::build_sale_out(&conn, &tenant_id, &sale_id)
}
