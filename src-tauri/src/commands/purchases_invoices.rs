use tauri::State;
use rusqlite::params;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::cloud_sync;
use crate::commands::license_guard;
use crate::commands::session_state::{AuthSessionState, resolve_identity};
use super::purchases::*;

#[tauri::command]
pub fn get_purchase_invoices(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    supplier_id: Option<String>,
    status: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
) -> Result<Vec<PurchaseInvoiceRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT si.id, si.invoice_number, s.name AS supplier_name, si.invoice_date,
                (SELECT COUNT(*) FROM supplier_invoice_items WHERE invoice_id = si.id) AS items_count,
                si.total, si.amount_paid, si.status, si.payment_status,
                (SELECT EXISTS(SELECT 1 FROM supplier_payment_schedules
                    WHERE invoice_id = si.id AND is_paid = 0
                    AND deleted_at IS NULL AND DATE(due_date) < DATE('now')
                )) AS has_overdue_schedule,
                si.created_at
         FROM supplier_invoices si
         JOIN suppliers s ON si.supplier_id = s.id
         WHERE si.tenant_id = ?1 AND si.branch_id = ?2 AND si.deleted_at IS NULL"
    );

    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = vec![
        Box::new(tenant_id),
        Box::new(branch_id),
    ];
    let mut idx = 3;

    if let Some(ref sid) = supplier_id {
        if !sid.is_empty() {
            sql.push_str(&format!(" AND si.supplier_id = ?{}", idx));
            param_values.push(Box::new(sid.clone()));
            idx += 1;
        }
    }

    if let Some(ref st) = status {
        if !st.is_empty() {
            sql.push_str(&format!(" AND si.status = ?{}", idx));
            param_values.push(Box::new(st.clone()));
            idx += 1;
        }
    }

    if let Some(ref df) = date_from {
        if !df.is_empty() {
            sql.push_str(&format!(" AND si.invoice_date >= ?{}", idx));
            param_values.push(Box::new(df.clone()));
            idx += 1;
        }
    }

    if let Some(ref dt) = date_to {
        if !dt.is_empty() {
            sql.push_str(&format!(" AND si.invoice_date <= ?{}", idx));
            param_values.push(Box::new(dt.clone()));
            let _ = idx;
        }
    }

    sql.push_str(" ORDER BY si.created_at DESC");

    let params_refs: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params_refs.as_slice(), |row| {
        Ok(PurchaseInvoiceRow {
            id: row.get(0)?,
            invoice_number: row.get(1)?,
            supplier_name: row.get(2)?,
            invoice_date: row.get(3)?,
            items_count: row.get(4)?,
            total: row.get(5)?,
            amount_paid: row.get(6)?,
            status: row.get(7)?,
            payment_status: row.get(8)?,
            has_overdue_schedule: row.get::<_, i64>(9)? != 0,
            created_at: row.get(10)?,
        })
    }).map_err(|e| e.to_string())?
      .filter_map(|r| r.ok())
      .collect();

    Ok(rows)
}

pub(crate) fn fetch_invoice_detail(conn: &rusqlite::Connection, invoice_id: &str) -> Result<PurchaseInvoiceDetail, String> {
        let (id, invoice_number, supplier_id, supplier_name, invoice_date,
            status, payment_status, subtotal, discount, tax_amount, total, amount_paid, notes) = conn.query_row(
        "SELECT si.id, si.invoice_number, si.supplier_id, s.name, si.invoice_date,
                 si.status, si.payment_status, si.subtotal, si.discount, si.tax_amount, si.total,
                 si.amount_paid, si.notes
         FROM supplier_invoices si
         JOIN suppliers s ON si.supplier_id = s.id
         WHERE si.id = ?1 AND si.deleted_at IS NULL",
        params![invoice_id],
        |row| Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, i64>(7)?,
            row.get::<_, i64>(8)?,
            row.get::<_, i64>(9)?,
            row.get::<_, i64>(10)?,
            row.get::<_, i64>(11)?,
            row.get::<_, Option<String>>(12)?,
        ))
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    let mut stmt = conn.prepare(
        "SELECT sii.id, sii.product_id, p.trade_name, sii.batch_number,
                sii.expiry_date, sii.quantity, sii.unit_cost, sii.sale_price, sii.subtotal
         FROM supplier_invoice_items sii
         JOIN products p ON sii.product_id = p.id
         WHERE sii.invoice_id = ?1
         ORDER BY sii.created_at ASC"
    ).map_err(|e| e.to_string())?;

    let items: Vec<PurchaseInvoiceItem> = stmt.query_map(params![invoice_id], |row| {
        Ok(PurchaseInvoiceItem {
            id: row.get(0)?,
            product_id: row.get(1)?,
            product_name: row.get(2)?,
            batch_number: row.get(3)?,
            expiry_date: row.get(4)?,
            quantity: row.get(5)?,
            unit_cost: row.get(6)?,
            sale_price: row.get(7)?,
            subtotal: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?
      .filter_map(|r| r.ok())
      .collect();

    Ok(PurchaseInvoiceDetail {
        id,
        invoice_number,
        supplier_id,
        supplier_name,
        invoice_date,
        status,
        payment_status,
        subtotal,
        discount,
        tax_amount,
        total,
        amount_paid,
        notes,
        items,
    })
}

#[tauri::command]
pub fn get_purchase_invoice(
    db: State<'_, Database>,
    tenant_id: String,
    id: String,
) -> Result<PurchaseInvoiceDetail, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM supplier_invoices WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL)",
        params![id, tenant_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    if !exists {
        return Err("الفاتورة غير موجودة".into());
    }

    fetch_invoice_detail(&conn, &id)
}

#[tauri::command]
pub fn create_purchase_draft(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    user_id: String,
    data: PurchaseCreateData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<PurchaseInvoiceDetail, String> {
    if data.items.is_empty() {
        return Err("يجب إضافة صنف واحد على الأقل".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, &branch_id)?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_PURCHASES)?;

    let supplier_active: bool = conn.query_row(
        "SELECT is_active FROM suppliers WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![data.supplier_id, tenant_id],
        |row| row.get(0),
    ).map_err(|_| "المورد غير موجود".to_string())?;

    if !supplier_active {
        return Err("المورد غير نشط".into());
    }

    for item in &data.items {
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM products WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL)",
            params![item.product_id, tenant_id],
            |row| row.get(0),
        ).map_err(|e| e.to_string())?;
        if !exists {
            return Err(format!("المنتج غير موجود: {}", item.product_id));
        }
    }

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<String, String> {
        let invoice_number = next_sequence(&conn, &tenant_id, "purchase_number")?;
        let invoice_id = Uuid::new_v4().to_string();
        let discount = data.discount.unwrap_or(0);
        let tax_amount = data.tax_amount.unwrap_or(0);

        conn.execute(
            "INSERT INTO supplier_invoices (id, tenant_id, branch_id, supplier_id, invoice_number,
                invoice_date, status, payment_status, subtotal, discount, tax_amount, total, amount_paid, notes, created_by)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'draft', 'unpaid', 0, ?7, ?8, 0, 0, ?9, ?10)",
            params![invoice_id, tenant_id, branch_id, data.supplier_id, invoice_number,
                data.invoice_date, discount, tax_amount, data.notes, user_id],
        ).map_err(|e| format!("فشل إنشاء الفاتورة: {}", e))?;

        let mut subtotal: i64 = 0;
        for item in &data.items {
            let item_id = Uuid::new_v4().to_string();
            let item_subtotal = item.quantity * item.unit_cost;
            subtotal += item_subtotal;

            conn.execute(
                "INSERT INTO supplier_invoice_items (id, tenant_id, invoice_id, product_id,
                        batch_number, expiry_date, quantity, unit_cost, sale_price, subtotal)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![item_id, tenant_id, invoice_id, item.product_id,
                        item.batch_number, item.expiry_date, item.quantity,
                        item.unit_cost, item.sale_price, item_subtotal],
            ).map_err(|e| format!("فشل إضافة الصنف: {}", e))?;
        }

        let total = subtotal - discount + tax_amount;
        conn.execute(
            "UPDATE supplier_invoices SET subtotal = ?2, tax_amount = ?3, total = ?4,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1",
            params![invoice_id, subtotal, tax_amount, total],
        ).map_err(|e| e.to_string())?;

        Ok(invoice_id)
    })();

    match result {
        Ok(invoice_id) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;

            if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "purchase_draft_created") {
                log::warn!("cloud sync enqueue failed after create_purchase_draft: {}", e);
            }

            fetch_invoice_detail(&conn, &invoice_id)
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}
