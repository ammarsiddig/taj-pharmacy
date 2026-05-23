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
pub fn void_sale(
    db: State<'_, Database>,
    tenant_id: String,
    sale_id: String,
    cashier_id: String,
    void_reason: Option<String>,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &cashier_id, "main-branch")?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_POS)?;
    guard::require_access(&conn, &cashier_id, "pos.sell", guard::Level::Write)?;

    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();

    let (session_id, sale_date, payment_method, payment_method_id, total, customer_id, payment_status, branch_id):
        (Option<String>, String, String, Option<String>, i64, Option<String>, String, String) = conn.query_row(
        "SELECT session_id, substr(created_at,1,10), payment_method, payment_method_id, total,
                customer_id, payment_status, branch_id
         FROM sales WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        rusqlite::params![sale_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?,
                   row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?)),
    ).map_err(|_| "عملية البيع غير موجودة".to_string())?;

    // Guard: can only void today's sales
    if sale_date != today {
        return Err("لا يمكن إلغاء عملية بيع من يوم سابق".into());
    }

    // Guard: session must still be open
    if let Some(ref sid) = session_id {
        let sess_status: String = conn.query_row(
            "SELECT status FROM pos_sessions WHERE id = ?1",
            rusqlite::params![sid],
            |row| row.get(0),
        ).map_err(|_| "الجلسة غير موجودة".to_string())?;
        if sess_status != "open" {
            return Err("لا يمكن إلغاء بيع بعد إغلاق الجلسة".into());
        }
    }

    // Fetch sale items for stock reversal: (batch_id, product_id, quantity)
    let mut istmt = conn.prepare(
        "SELECT batch_id, product_id, quantity FROM sale_items WHERE sale_id = ?1"
    ).map_err(|e| e.to_string())?;
    let void_items: Vec<(String, String, i64)> = istmt.query_map(rusqlite::params![sale_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        // 1. Soft-delete the sale
        conn.execute(
            "UPDATE sales SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), void_reason = ?2,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1",
            rusqlite::params![sale_id, void_reason],
        ).map_err(|e| e.to_string())?;

        // 2. Reverse stock for each item
        for (batch_id, product_id, quantity) in &void_items {
            let qty_before: i64 = conn.query_row(
                "SELECT quantity_current FROM batches WHERE id = ?1",
                rusqlite::params![batch_id],
                |row| row.get(0),
            ).map_err(|e| e.to_string())?;
            let qty_after = qty_before + quantity;

            conn.execute(
                "UPDATE batches SET quantity_current = ?2,
                         status = CASE WHEN status = 'depleted' THEN 'active' ELSE status END,
                         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                  WHERE id = ?1",
                rusqlite::params![batch_id, qty_after],
            ).map_err(|e| e.to_string())?;

            let mv_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO stock_movements (id, tenant_id, branch_id, product_id, batch_id,
                         movement_type, quantity_change, quantity_before, quantity_after,
                         reference_type, reference_id, created_by)
                  VALUES (?1, ?2, ?3, ?4, ?5, 'void_sale', ?6, ?7, ?8, 'sale_void', ?9, ?10)",
                rusqlite::params![mv_id, tenant_id, branch_id, product_id, batch_id,
                         quantity, qty_before, qty_after, sale_id, cashier_id],
            ).map_err(|e| e.to_string())?;
        }

        // 3. Reverse account transactions from the stored payment breakdown.
        let mut reversed_cash = 0_i64;
        let mut reversal_payments = pos::load_sale_payments(&conn, &sale_id)?;
        if reversal_payments.is_empty() && (payment_method == "cash" || payment_method == "bank_transfer") {
            reversal_payments.push(SalePaymentOut {
                id: String::new(),
                payment_method: payment_method.clone(),
                payment_method_id: payment_method_id.clone(),
                payment_method_name: None,
                amount: total,
            });
        }

        for payment in &reversal_payments {
            let account_id = match payment.payment_method.as_str() {
                "cash" => {
                    reversed_cash += payment.amount;
                    session_id
                        .as_deref()
                        .map(|sid| pos::resolve_session_cash_account_id(&conn, sid))
                        .transpose()?
                }
                "bank_transfer" => payment
                    .payment_method_id
                    .as_deref()
                    .map(|pmid| pos::resolve_bank_payment_info(&conn, &tenant_id, pmid).map(|value| value.0))
                    .transpose()?,
                _ => None,
            };

            if let Some(acct_id) = account_id {
                let bal_before: i64 = conn.query_row(
                    "SELECT current_balance FROM accounts WHERE id = ?1",
                    rusqlite::params![acct_id],
                    |row| row.get(0),
                ).map_err(|e| e.to_string())?;

                if bal_before < payment.amount {
                    return Err(format!("صندوق النقدية يحتوي على {} ج.س فقط. لا يمكن إعادة {} ج.س.", bal_before, payment.amount));
                }

                let bal_after = bal_before - payment.amount;

                conn.execute(
                    "UPDATE accounts SET current_balance = ?2,
                             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                      WHERE id = ?1",
                    rusqlite::params![acct_id, bal_after],
                ).map_err(|e| e.to_string())?;

                let tx_id = Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO account_transactions (id, tenant_id, account_id, transaction_type, direction,
                             amount, balance_before, balance_after, reference_type, reference_id, created_by)
                      VALUES (?1, ?2, ?3, 'sale_void', 'out', ?4, ?5, ?6, 'sale_void', ?7, ?8)",
                    rusqlite::params![tx_id, tenant_id, acct_id, payment.amount, bal_before, bal_after, sale_id, cashier_id],
                ).map_err(|e| e.to_string())?;
            }
        }

        // 4. Reverse customer credit balance if any amount was left on credit.
        let credited_amount = total - reversal_payments.iter().map(|payment| payment.amount).sum::<i64>();
        if (payment_status == "credit" || payment_status == "partial") && credited_amount > 0 {
            if let Some(ref cid) = customer_id {
                conn.execute(
                    "UPDATE customers SET current_balance = current_balance - ?2,
                             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                      WHERE id = ?1",
                    rusqlite::params![cid, credited_amount],
                ).map_err(|e| e.to_string())?;
            }
        }

        // 5. Update session totals
        if let Some(ref sid) = session_id {
            conn.execute(
                "UPDATE pos_sessions SET total_sales = total_sales - ?2, sales_count = sales_count - 1,
                         expected_cash = expected_cash - ?3,
                         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                  WHERE id = ?1",
                rusqlite::params![sid, total, reversed_cash],
            ).map_err(|e| e.to_string())?;
        }

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            audit::log_action(&conn, &tenant_id, &cashier_id, "void", "sale", &sale_id, void_reason.as_deref())?;
            if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "sale_voided") {
                log::warn!("cloud sync enqueue failed after void_sale: {}", e);
            }
            if let Err(e) = cloud_sync::enqueue_cloud_deletion(&conn, &tenant_id, &branch_id, "pos_sales", &sale_id) {
                log::warn!("cloud sync deletion outbox failed after void_sale: {}", e);
            }
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}
