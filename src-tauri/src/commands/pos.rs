use tauri::State;
use rusqlite::Connection;
use rusqlite::params;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::cloud_sync;
use crate::commands::license_guard;
use crate::commands::session_state::{AuthSessionState, resolve_identity};
use super::pos_types::*;

// Feature flag bit for POS
pub(crate) const FLAG_POS: i64 = 1;

pub(crate) fn read_session(row: &rusqlite::Row) -> rusqlite::Result<PosSession> {
    Ok(PosSession {
        id: row.get(0)?,
        tenant_id: row.get(1)?,
        branch_id: row.get(2)?,
        cashier_id: row.get(3)?,
        account_id: row.get(4)?,
        status: row.get(5)?,
        opening_cash: row.get(6)?,
        expected_cash: row.get(7)?,
        actual_cash: row.get(8)?,
        cash_difference: row.get(9)?,
        total_sales: row.get(10)?,
        total_returns: row.get(11)?,
        sales_count: row.get(12)?,
        opened_at: row.get(13)?,
        closed_at: row.get(14)?,
        notes: row.get(15)?,
    })
}

const SESSION_COLS: &str = "id, tenant_id, branch_id, cashier_id, account_id, status, opening_cash, expected_cash, actual_cash, cash_difference, total_sales, total_returns, sales_count, opened_at, closed_at, notes";

pub(crate) fn resolve_session_cash_account_id(conn: &Connection, session_id: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT account_id FROM pos_sessions WHERE id = ?1",
        params![session_id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

pub(crate) fn resolve_bank_payment_info(
    conn: &Connection,
    tenant_id: &str,
    payment_method_id: &str,
) -> Result<(String, Option<String>), String> {
    let (account_id, name): (Option<String>, Option<String>) = conn.query_row(
        "SELECT account_id, name
         FROM payment_methods
         WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL AND is_active = 1",
        params![payment_method_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "طريقة الدفع البنكية المختارة غير موجودة".to_string())?;

    account_id
        .filter(|value| !value.is_empty())
        .map(|value| (value, name))
        .ok_or_else(|| "طريقة الدفع البنكية لا تملك حساباً محدداً — يُرجى تعيين حساب بنكي لطريقة الدفع هذه".to_string())
}

fn load_sale_items(conn: &Connection, sale_id: &str) -> Result<Vec<SaleItemOut>, String> {
    let mut stmt = conn.prepare(
        "SELECT si.id, si.product_id, si.batch_id, p.trade_name, b.batch_number, b.expiry_date,
                si.quantity, si.unit_price, si.unit_cost, si.subtotal
         FROM sale_items si
         JOIN products p ON si.product_id = p.id
         JOIN batches b ON si.batch_id = b.id
         WHERE si.sale_id = ?1",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![sale_id], |row| {
        Ok(SaleItemOut {
            id: row.get(0)?,
            product_id: row.get(1)?,
            batch_id: row.get(2)?,
            product_name: row.get(3)?,
            batch_number: row.get(4)?,
            expiry_date: row.get(5)?,
            quantity: row.get(6)?,
            unit_price: row.get(7)?,
            unit_cost: row.get(8)?,
            subtotal: row.get(9)?,
        })
    }).map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|row| row.ok()).collect())
}

pub(crate) fn load_sale_payments(conn: &Connection, sale_id: &str) -> Result<Vec<SalePaymentOut>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, payment_method, payment_method_id, payment_method_name, amount
         FROM sale_payments
         WHERE sale_id = ?1
         ORDER BY created_at ASC, id ASC",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![sale_id], |row| {
        Ok(SalePaymentOut {
            id: row.get(0)?,
            payment_method: row.get(1)?,
            payment_method_id: row.get(2)?,
            payment_method_name: row.get(3)?,
            amount: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|row| row.ok()).collect())
}

pub(crate) fn build_sale_out(conn: &Connection, tenant_id: &str, sale_id: &str) -> Result<SaleOut, String> {
    let sale = conn.query_row(
        "SELECT s.sale_number, s.sale_type, s.session_id, s.cashier_id, s.customer_id,
                COALESCE(c.name_ar, c.name), s.subtotal, s.discount, s.tax_amount, s.total,
                s.amount_paid, s.change_amount, s.payment_method, s.payment_method_name,
                s.payment_status, s.notes, s.created_at
         FROM sales s
         LEFT JOIN customers c ON s.customer_id = c.id
         WHERE s.id = ?1 AND s.tenant_id = ?2 AND s.deleted_at IS NULL",
        params![sale_id, tenant_id],
        |row| {
            Ok(SaleOut {
                id: sale_id.to_string(),
                sale_number: row.get(0)?,
                sale_type: row.get(1)?,
                session_id: row.get(2)?,
                cashier_id: row.get(3)?,
                customer_id: row.get(4)?,
                customer_name: row.get(5)?,
                subtotal: row.get(6)?,
                discount: row.get(7)?,
                tax_amount: row.get(8)?,
                total: row.get(9)?,
                amount_paid: row.get(10)?,
                change_amount: row.get(11)?,
                payment_method: row.get(12)?,
                payment_method_name: row.get(13)?,
                payment_status: row.get(14)?,
                notes: row.get(15)?,
                split_payments: Vec::new(),
                items: Vec::new(),
                created_at: row.get(16)?,
            })
        },
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    Ok(SaleOut {
        split_payments: load_sale_payments(conn, sale_id)?,
        items: load_sale_items(conn, sale_id)?,
        ..sale
    })
}

#[tauri::command]
pub fn get_active_session(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    user_id: String,
) -> Result<Option<PosSession>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let sql = format!("SELECT {} FROM pos_sessions WHERE tenant_id = ?1 AND branch_id = ?2 AND cashier_id = ?3 AND status = 'open' LIMIT 1", SESSION_COLS);
    let result = conn.query_row(&sql, params![tenant_id, branch_id, user_id], read_session);
    match result {
        Ok(s) => Ok(Some(s)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn open_session(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    user_id: String,
    account_id: String,
    opening_cash: i64,
    auth_session: State<'_, AuthSessionState>,
) -> Result<PosSession, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, &branch_id)?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_POS)?;

    // Check no open session
    let has_open: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM pos_sessions WHERE tenant_id = ?1 AND cashier_id = ?2 AND status = 'open')",
        params![tenant_id, user_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    if has_open {
        return Err("يوجد جلسة مفتوحة بالفعل لهذا المستخدم".into());
    }

    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO pos_sessions (id, tenant_id, branch_id, cashier_id, account_id, opening_cash, expected_cash, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'open')",
        params![id, tenant_id, branch_id, user_id, account_id, opening_cash, opening_cash],
    ).map_err(|e| format!("فشل فتح الجلسة: {}", e))?;

    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "pos_session_opened") {
        log::warn!("cloud sync enqueue failed after open_session: {}", e);
    }

    let sql = format!("SELECT {} FROM pos_sessions WHERE id = ?1", SESSION_COLS);
    conn.query_row(&sql, params![id], read_session).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_products_pos(
    db: State<'_, Database>,
    tenant_id: String,
    _branch_id: String,
    query: String,
) -> Result<Vec<PosProduct>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let like = format!("%{}%", query);
    let mut stmt = conn.prepare(
        "SELECT DISTINCT p.id, p.trade_name, p.trade_name_ar, p.barcode, p.sale_price, p.unit, p.is_prescription
         FROM products p
         WHERE p.tenant_id = ?1 AND p.deleted_at IS NULL AND p.is_active = 1
           AND (p.barcode = ?2 OR p.trade_name LIKE ?3 OR p.trade_name_ar LIKE ?3 OR p.generic_name LIKE ?3)
         ORDER BY p.trade_name LIMIT 20"
    ).map_err(|e| e.to_string())?;

    let products: Vec<(String, String, Option<String>, Option<String>, i64, String, bool)> = stmt.query_map(
        params![tenant_id, query, like],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?))
    ).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
    drop(stmt);

    let mut result = Vec::new();
    for (pid, name, name_ar, barcode, price, unit, is_rx) in products {
        let mut bstmt = conn.prepare(
            "SELECT b.id, b.batch_number, b.expiry_date, b.quantity_current, b.unit_cost, sl.name
             FROM batches b
             LEFT JOIN storage_locations sl ON b.location_id = sl.id
             WHERE b.product_id = ?1 AND b.status = 'active' AND b.quantity_current > 0 AND b.deleted_at IS NULL
             ORDER BY b.expiry_date ASC"
        ).map_err(|e| e.to_string())?;

        let batches: Vec<PosBatch> = bstmt.query_map(params![pid], |row| {
            Ok(PosBatch {
                batch_id: row.get(0)?,
                batch_number: row.get(1)?,
                expiry_date: row.get(2)?,
                quantity_current: row.get(3)?,
                unit_cost: row.get(4)?,
                location_name: row.get(5)?,
            })
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

        result.push(PosProduct {
            product_id: pid,
            product_name: name,
            product_name_ar: name_ar,
            barcode,
            sale_price: price,
            unit,
            is_prescription: is_rx,
            batches,
        });
    }

    Ok(result)
}

#[tauri::command]
pub fn get_pos_substitutes(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    product_id: String,
) -> Result<Vec<PosProduct>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Get product IDs from both directions of the symmetric relationship
    let sub_ids: Vec<String> = {
        let mut stmt = conn.prepare(
            "SELECT substitute_id FROM product_substitutes WHERE tenant_id = ?1 AND product_id = ?2
             UNION
             SELECT product_id FROM product_substitutes WHERE tenant_id = ?1 AND substitute_id = ?2"
        ).map_err(|e| e.to_string())?;
        let ids: Vec<String> = stmt.query_map(params![tenant_id, product_id], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        ids
    };

    if sub_ids.is_empty() {
        return Ok(vec![]);
    }

    let mut result = Vec::new();
    for sub_id in sub_ids {
        // Get product info
        let row = conn.query_row(
            "SELECT p.id, p.trade_name, p.trade_name_ar, p.barcode, p.sale_price, p.unit, p.is_prescription
             FROM products p
             WHERE p.id = ?1 AND p.tenant_id = ?2 AND p.deleted_at IS NULL AND p.is_active = 1",
            params![sub_id, tenant_id],
            |row| Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, bool>(6)?,
            )),
        );
        let (pid, name, name_ar, barcode, price, unit, is_rx) = match row {
            Ok(r) => r,
            Err(_) => continue,
        };

        let mut bstmt = conn.prepare(
            "SELECT b.id, b.batch_number, b.expiry_date, b.quantity_current, b.unit_cost, sl.name
             FROM batches b
             LEFT JOIN storage_locations sl ON b.location_id = sl.id
             WHERE b.product_id = ?1 AND b.status = 'active' AND b.quantity_current > 0 AND b.deleted_at IS NULL
             ORDER BY b.expiry_date ASC"
        ).map_err(|e| e.to_string())?;

        let batches: Vec<PosBatch> = bstmt.query_map(params![pid], |row| {
            Ok(PosBatch {
                batch_id: row.get(0)?,
                batch_number: row.get(1)?,
                expiry_date: row.get(2)?,
                quantity_current: row.get(3)?,
                unit_cost: row.get(4)?,
                location_name: row.get(5)?,
            })
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

        let _ = branch_id.as_str(); // reserved for future branch scoping
        result.push(PosProduct {
            product_id: pid,
            product_name: name,
            product_name_ar: name_ar,
            barcode,
            sale_price: price,
            unit,
            is_prescription: is_rx,
            batches,
        });
    }

    Ok(result)
}

pub(crate) fn next_sequence(conn: &rusqlite::Connection, tenant_id: &str, counter_name: &str) -> Result<String, String> {
    conn.execute(
        "UPDATE sequence_counters SET last_value = last_value + 1 WHERE tenant_id = ?1 AND counter_name = ?2",
        params![tenant_id, counter_name],
    ).map_err(|e| e.to_string())?;
    let (prefix, value): (Option<String>, i64) = conn.query_row(
        "SELECT prefix, last_value FROM sequence_counters WHERE tenant_id = ?1 AND counter_name = ?2",
        params![tenant_id, counter_name],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| e.to_string())?;
    Ok(format!("{}{:05}", prefix.unwrap_or_default(), value))
}

/// For each item: if `batch_id` is provided, return it as-is.
/// Otherwise, auto-select the earliest-expiring active batch(es) for that product (FEFO policy),
/// splitting across batches if a single batch lacks sufficient stock.
pub(crate) fn resolve_fefo_items(
    conn: &rusqlite::Connection,
    tenant_id: &str,
    items: &[SaleItemInput],
    today: &str,
) -> Result<Vec<ResolvedSaleItem>, String> {
    let mut resolved: Vec<ResolvedSaleItem> = Vec::new();

    for item in items {
        if let Some(ref bid) = item.batch_id {
            if !bid.is_empty() {
                // Explicit batch supplied — use as-is
                resolved.push(ResolvedSaleItem {
                    product_id: item.product_id.clone(),
                    batch_id: bid.clone(),
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    unit_cost: item.unit_cost,
                });
                continue;
            }
        }

        // FEFO: pick batches ordered by earliest non-expired expiry first, then created_at
        let mut stmt = conn.prepare(
            "SELECT id, quantity_current, unit_cost
             FROM batches
             WHERE tenant_id = ?1 AND product_id = ?2
               AND status = 'active' AND deleted_at IS NULL
               AND quantity_current > 0
               AND (expiry_date IS NULL OR expiry_date >= ?3)
             ORDER BY expiry_date ASC NULLS LAST, created_at ASC",
        ).map_err(|e| e.to_string())?;

        let batches: Vec<(String, i64, i64)> = stmt
            .query_map(params![tenant_id, item.product_id, today], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let total_available: i64 = batches.iter().map(|(_, q, _)| q).sum();
        if total_available < item.quantity {
            let pname: String = conn.query_row(
                "SELECT trade_name FROM products WHERE id = ?1",
                params![item.product_id],
                |row| row.get(0),
            ).unwrap_or_else(|_| item.product_id.clone());
            return Err(format!("كمية غير كافية في المخزون: {}", pname));
        }

        let mut remaining = item.quantity;
        for (batch_id, qty_available, unit_cost) in batches {
            if remaining <= 0 { break; }
            let take = remaining.min(qty_available);
            resolved.push(ResolvedSaleItem {
                product_id: item.product_id.clone(),
                batch_id,
                quantity: take,
                unit_price: item.unit_price,
                unit_cost,
            });
            remaining -= take;
        }
    }

    Ok(resolved)
}

#[tauri::command]
pub fn close_session(
    db: State<'_, Database>,
    tenant_id: String,
    session_id: String,
    actual_cash: i64,
    notes: Option<String>,
    auth_session: State<'_, AuthSessionState>,
) -> Result<PosSession, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;

    let (status, expected): (String, i64) = conn.query_row(
        "SELECT status, expected_cash FROM pos_sessions WHERE id = ?1 AND tenant_id = ?2",
        params![session_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "الجلسة غير موجودة".to_string())?;

    if status != "open" {
        return Err("الجلسة مغلقة بالفعل".into());
    }

    let difference = actual_cash - expected;

    conn.execute(
        "UPDATE pos_sessions SET status = 'closed', actual_cash = ?2, cash_difference = ?3,
                closed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), notes = ?4,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1",
        params![session_id, actual_cash, difference, notes],
    ).map_err(|e| e.to_string())?;

    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "pos_session_closed") {
        log::warn!("cloud sync enqueue failed after close_session: {}", e);
    }

    let sql = format!("SELECT {} FROM pos_sessions WHERE id = ?1", SESSION_COLS);
    conn.query_row(&sql, params![session_id], read_session).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_session_history(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    cashier_id: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
) -> Result<Vec<SessionRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT ps.id, u.full_name, ps.opened_at, ps.closed_at, ps.sales_count,
                ps.total_sales,
                COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.session_id = ps.id AND r.deleted_at IS NULL), 0) as total_returns,
                ps.opening_cash, ps.actual_cash, ps.cash_difference, ps.status
         FROM pos_sessions ps
         JOIN users u ON ps.cashier_id = u.id
         WHERE ps.tenant_id = ?1 AND ps.branch_id = ?2"
    );
    let mut pv: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(tenant_id), Box::new(branch_id)];
    let mut idx = 3;

    if let Some(ref cid) = cashier_id {
        if !cid.is_empty() {
            sql.push_str(&format!(" AND ps.cashier_id = ?{}", idx));
            pv.push(Box::new(cid.clone()));
            idx += 1;
        }
    }
    // Compare on date boundaries: opened_at is a full ISO timestamp, date_from/
    // date_to are bare dates. A raw `opened_at <= '2026-07-04'` string-compares
    // and drops every session opened *today* (TASK-942).
    if let Some(ref df) = date_from {
        if !df.is_empty() {
            sql.push_str(&format!(" AND DATE(ps.opened_at) >= DATE(?{})", idx));
            pv.push(Box::new(df.clone()));
            idx += 1;
        }
    }
    if let Some(ref dt) = date_to {
        if !dt.is_empty() {
            sql.push_str(&format!(" AND DATE(ps.opened_at) <= DATE(?{})", idx));
            pv.push(Box::new(dt.clone()));
            let _ = idx;
        }
    }
    sql.push_str(" ORDER BY ps.opened_at DESC");

    let pr: Vec<&dyn rusqlite::types::ToSql> = pv.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(pr.as_slice(), |row| {
        Ok(SessionRow {
            id: row.get(0)?, cashier_name: row.get(1)?, opened_at: row.get(2)?,
            closed_at: row.get(3)?, sales_count: row.get(4)?, total_sales: row.get(5)?,
            total_returns: row.get(6)?,
            opening_cash: row.get(7)?, actual_cash: row.get(8)?, cash_difference: row.get(9)?,
            status: row.get(10)?
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(rows)
}

#[tauri::command]
pub fn get_accounts(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
) -> Result<Vec<AccountInfo>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, tenant_id, branch_id, name, name_ar, account_type, current_balance, is_default, is_active
         FROM accounts WHERE tenant_id = ?1 AND branch_id = ?2 AND deleted_at IS NULL AND is_active = 1
         ORDER BY is_default DESC, name ASC"
    ).map_err(|e| e.to_string())?;

    let accts = stmt.query_map(params![tenant_id, branch_id], |row| {
        Ok(AccountInfo {
            id: row.get(0)?, tenant_id: row.get(1)?, branch_id: row.get(2)?,
            name: row.get(3)?, name_ar: row.get(4)?, account_type: row.get(5)?,
            current_balance: row.get(6)?, is_default: row.get(7)?, is_active: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(accts)
}
