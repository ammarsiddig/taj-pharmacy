use serde::{Deserialize, Serialize};
use tauri::State;
use rusqlite::params;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::cloud_sync;
use crate::commands::license_guard;
use crate::commands::guard;
use crate::commands::audit;
use crate::commands::suppliers::do_supplier_payment;

const FLAG_PURCHASES: i64 = 4;

// ====== Structs ======

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Supplier {
    pub id: String,
    pub tenant_id: String,
    pub name: String,
    pub name_ar: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub contact_person: Option<String>,
    pub opening_balance: i64,
    pub notes: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct SupplierData {
    pub name: String,
    pub name_ar: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub contact_person: Option<String>,
    pub opening_balance: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PurchaseInvoiceRow {
    pub id: String,
    pub invoice_number: String,
    pub supplier_name: String,
    pub invoice_date: String,
    pub items_count: i64,
    pub total: i64,
    pub amount_paid: i64,
    pub status: String,
    pub payment_status: String,
    pub has_overdue_schedule: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PurchaseInvoiceItem {
    pub id: String,
    pub product_id: String,
    pub product_name: String,
    pub batch_number: Option<String>,
    pub expiry_date: Option<String>,
    pub quantity: i64,
    pub unit_cost: i64,
    pub sale_price: i64,
    pub subtotal: i64,
}

#[derive(Debug, Serialize)]
pub struct PurchaseInvoiceDetail {
    pub id: String,
    pub invoice_number: String,
    pub supplier_id: String,
    pub supplier_name: String,
    pub invoice_date: String,
    pub status: String,
    pub payment_status: String,
    pub subtotal: i64,
    pub discount: i64,
    pub tax_amount: i64,
    pub total: i64,
    pub amount_paid: i64,
    pub notes: Option<String>,
    pub items: Vec<PurchaseInvoiceItem>,
}

#[derive(Debug, Deserialize)]
pub struct PurchaseItemInput {
    pub product_id: String,
    pub batch_number: Option<String>,
    pub expiry_date: Option<String>,
    pub quantity: i64,
    pub unit_cost: i64,
    pub sale_price: i64,
}

#[derive(Debug, Deserialize)]
pub struct ConfirmPaymentData {
    /// "unpaid", "paid", or "partial"
    pub payment_mode: String,
    pub account_id: Option<String>,
    pub payment_method: Option<String>,
    pub payment_date: Option<String>,
    pub amount_paid: Option<i64>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PurchaseCreateData {
    pub supplier_id: String,
    pub invoice_date: String,
    #[serde(rename = "invoice_number")]
    pub _invoice_number: Option<String>,
    pub notes: Option<String>,
    pub discount: Option<i64>,
    pub tax_amount: Option<i64>,
    pub items: Vec<PurchaseItemInput>,
}

// ====== Commands ======

#[tauri::command]
pub fn get_suppliers(
    db: State<'_, Database>,
    tenant_id: String,
    search: Option<String>,
) -> Result<Vec<Supplier>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT id, tenant_id, name, name_ar, phone, email, address, contact_person,
                opening_balance, notes, is_active, created_at, updated_at
         FROM suppliers WHERE tenant_id = ?1 AND deleted_at IS NULL"
    );
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(tenant_id)];

    if let Some(ref s) = search {
        if !s.is_empty() {
            sql.push_str(" AND (name LIKE ?2 OR name_ar LIKE ?2 OR phone LIKE ?2)");
            param_values.push(Box::new(format!("%{}%", s)));
        }
    }

    sql.push_str(" ORDER BY name ASC");

    let params_refs: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let suppliers = stmt.query_map(params_refs.as_slice(), |row| {
        Ok(Supplier {
            id: row.get(0)?,
            tenant_id: row.get(1)?,
            name: row.get(2)?,
            name_ar: row.get(3)?,
            phone: row.get(4)?,
            email: row.get(5)?,
            address: row.get(6)?,
            contact_person: row.get(7)?,
            opening_balance: row.get(8)?,
            notes: row.get(9)?,
            is_active: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
        })
    }).map_err(|e| e.to_string())?
      .filter_map(|r| r.ok())
      .collect();

    Ok(suppliers)
}

#[tauri::command]
pub fn create_supplier(
    db: State<'_, Database>,
    tenant_id: String,
    data: SupplierData,
) -> Result<Supplier, String> {
    if data.name.trim().is_empty() {
        return Err("اسم المورد مطلوب".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO suppliers (id, tenant_id, name, name_ar, phone, email, address, contact_person, opening_balance, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![id, tenant_id, data.name, data.name_ar, data.phone, data.email, data.address, data.contact_person, data.opening_balance, data.notes],
    ).map_err(|e| format!("فشل إنشاء المورد: {}", e))?;

    conn.query_row(
        "SELECT id, tenant_id, name, name_ar, phone, email, address, contact_person,
                opening_balance, notes, is_active, created_at, updated_at
         FROM suppliers WHERE id = ?1", params![id],
        |row| Ok(Supplier {
            id: row.get(0)?,
            tenant_id: row.get(1)?,
            name: row.get(2)?,
            name_ar: row.get(3)?,
            phone: row.get(4)?,
            email: row.get(5)?,
            address: row.get(6)?,
            contact_person: row.get(7)?,
            opening_balance: row.get(8)?,
            notes: row.get(9)?,
            is_active: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
        })
    ).map_err(|_| "فشل جلب المورد بعد الإنشاء".into())
}

#[tauri::command]
pub fn update_supplier(
    db: State<'_, Database>,
    tenant_id: String,
    id: String,
    data: SupplierData,
) -> Result<Supplier, String> {
    if data.name.trim().is_empty() {
        return Err("اسم المورد مطلوب".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE suppliers SET name = ?3, name_ar = ?4, phone = ?5, email = ?6,
                address = ?7, contact_person = ?8, opening_balance = ?9, notes = ?10,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE tenant_id = ?1 AND id = ?2 AND deleted_at IS NULL",
        params![tenant_id, id, data.name, data.name_ar, data.phone, data.email, data.address, data.contact_person, data.opening_balance, data.notes],
    ).map_err(|e| format!("فشل تحديث المورد: {}", e))?;

    conn.query_row(
        "SELECT id, tenant_id, name, name_ar, phone, email, address, contact_person,
                opening_balance, notes, is_active, created_at, updated_at
         FROM suppliers WHERE id = ?1", params![id],
        |row| Ok(Supplier {
            id: row.get(0)?,
            tenant_id: row.get(1)?,
            name: row.get(2)?,
            name_ar: row.get(3)?,
            phone: row.get(4)?,
            email: row.get(5)?,
            address: row.get(6)?,
            contact_person: row.get(7)?,
            opening_balance: row.get(8)?,
            notes: row.get(9)?,
            is_active: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
        })
    ).map_err(|_| "فشل جلب المورد بعد التحديث".into())
}

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

fn fetch_invoice_detail(conn: &rusqlite::Connection, invoice_id: &str) -> Result<PurchaseInvoiceDetail, String> {
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

    // Verify tenant
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

fn next_sequence(conn: &rusqlite::Connection, tenant_id: &str, counter_name: &str) -> Result<String, String> {
    conn.execute(
        "UPDATE sequence_counters SET last_value = last_value + 1
         WHERE tenant_id = ?1 AND counter_name = ?2",
        params![tenant_id, counter_name],
    ).map_err(|e| e.to_string())?;

    let (prefix, value): (Option<String>, i64) = conn.query_row(
        "SELECT prefix, last_value FROM sequence_counters
         WHERE tenant_id = ?1 AND counter_name = ?2",
        params![tenant_id, counter_name],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| e.to_string())?;

    let prefix = prefix.unwrap_or_default();
    Ok(format!("{}{:05}", prefix, value))
}

#[tauri::command]
pub fn create_purchase_draft(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    user_id: String,
    data: PurchaseCreateData,
) -> Result<PurchaseInvoiceDetail, String> {
    if data.items.is_empty() {
        return Err("يجب إضافة صنف واحد على الأقل".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_PURCHASES)?;

    // Validate supplier
    let supplier_active: bool = conn.query_row(
        "SELECT is_active FROM suppliers WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![data.supplier_id, tenant_id],
        |row| row.get(0),
    ).map_err(|_| "المورد غير موجود".to_string())?;

    if !supplier_active {
        return Err("المورد غير نشط".into());
    }

    // Validate all products
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

#[allow(dead_code)] // deprecated — kept for one release cycle, remove after v0.2
#[tauri::command]
pub fn confirm_purchase(
    db: State<'_, Database>,
    tenant_id: String,
    invoice_id: String,
    user_id: String,
    location_id: Option<String>,
) -> Result<PurchaseInvoiceDetail, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_PURCHASES)?;

    // Verify status = draft
    let current_status: String = conn.query_row(
        "SELECT status FROM supplier_invoices WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![invoice_id, tenant_id],
        |row| row.get(0),
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    if current_status != "draft" {
        return Err("لا يمكن تأكيد فاتورة ليست مسودة".into());
    }

    // Get items
    let mut stmt = conn.prepare(
        "SELECT id, product_id, batch_number, expiry_date, quantity, unit_cost, sale_price
         FROM supplier_invoice_items WHERE invoice_id = ?1"
    ).map_err(|e| e.to_string())?;

    let items: Vec<(String, String, Option<String>, Option<String>, i64, i64, i64)> = stmt.query_map(
        params![invoice_id],
        |row| Ok((
            row.get(0)?, row.get(1)?, row.get(2)?,
            row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?,
        ))
    ).map_err(|e| e.to_string())?
      .filter_map(|r| r.ok())
      .collect();
    drop(stmt);

    if items.is_empty() {
        return Err("لا يمكن تأكيد فاتورة بدون أصناف".into());
    }

    // Get branch from invoice
    let branch_id: String = conn.query_row(
        "SELECT branch_id FROM supplier_invoices WHERE id = ?1",
        params![invoice_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    // Use provided location or fall back to first active location
    let default_location: String = if let Some(ref loc) = location_id {
        loc.clone()
    } else {
        conn.query_row(
            "SELECT id FROM storage_locations WHERE tenant_id = ?1 AND branch_id = ?2 AND is_active = 1 AND deleted_at IS NULL LIMIT 1",
            params![tenant_id, branch_id],
            |row| row.get(0),
        ).map_err(|_| "لا يوجد موقع تخزين نشط".to_string())?
    };

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        for (_, product_id, batch_number, expiry_date, quantity, unit_cost, sale_price) in &items {
            let batch_id = Uuid::new_v4().to_string();

            // Insert batch
            conn.execute(
                "INSERT INTO batches (id, tenant_id, product_id, supplier_invoice_id, location_id,
                        batch_number, expiry_date, quantity_received, quantity_current, unit_cost, status)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'active')",
                params![batch_id, tenant_id, product_id, invoice_id, default_location,
                        batch_number, expiry_date, quantity, quantity, unit_cost],
            ).map_err(|e| format!("فشل إنشاء الدفعة: {}", e))?;

            // Insert stock movement
            let movement_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO stock_movements (id, tenant_id, branch_id, product_id, batch_id,
                        movement_type, quantity_change, quantity_before, quantity_after,
                        reference_type, reference_id, created_by)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'receive', ?6, 0, ?7, 'supplier_invoice', ?8, ?9)",
                params![movement_id, tenant_id, branch_id, product_id, batch_id,
                        quantity, quantity, invoice_id, user_id],
            ).map_err(|e| format!("فشل تسجيل حركة المخزون: {}", e))?;

            // Update product prices
            if *sale_price > 0 {
                conn.execute(
                    "UPDATE products SET last_purchase_price = ?3, sale_price = ?4,
                            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                     WHERE id = ?2 AND tenant_id = ?1",
                    params![tenant_id, product_id, unit_cost, sale_price],
                ).map_err(|e| e.to_string())?;
            } else {
                conn.execute(
                    "UPDATE products SET last_purchase_price = ?3,
                            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                     WHERE id = ?2 AND tenant_id = ?1",
                    params![tenant_id, product_id, unit_cost],
                ).map_err(|e| e.to_string())?;
            }
        }

        // Update invoice status
        conn.execute(
            "UPDATE supplier_invoices SET status = 'confirmed', confirmed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                    confirmed_by = ?3, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1 AND tenant_id = ?2",
            params![invoice_id, tenant_id, user_id],
        ).map_err(|e| e.to_string())?;

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "purchase_confirmed") {
                log::warn!("cloud sync enqueue failed after confirm_purchase: {}", e);
            }
            fetch_invoice_detail(&conn, &invoice_id)
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

/// Confirm purchase with optional payment at confirmation time.
/// payment_info.payment_mode: "unpaid" | "paid" | "partial"
#[tauri::command]
pub fn confirm_purchase_with_payment(
    db: State<'_, Database>,
    tenant_id: String,
    invoice_id: String,
    user_id: String,
    location_id: Option<String>,
    payment_info: ConfirmPaymentData,
) -> Result<PurchaseInvoiceDetail, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_PURCHASES)?;
    guard::require_permission(&conn, &user_id, "purchases")?;

    // Validate payment_mode values
    match payment_info.payment_mode.as_str() {
        "unpaid" | "paid" | "partial" => {}
        _ => return Err("وضع الدفع غير صالح".into()),
    }

    // For paid/partial: require account, method, date
    let is_paying = payment_info.payment_mode != "unpaid";
    if is_paying {
        if payment_info.account_id.as_deref().unwrap_or("").is_empty() {
            return Err("يجب تحديد الحساب عند الدفع".into());
        }
        if payment_info.payment_method.as_deref().unwrap_or("").is_empty() {
            return Err("يجب تحديد طريقة الدفع".into());
        }
    }

    // Verify status = draft
    let current_status: String = conn.query_row(
        "SELECT status FROM supplier_invoices WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![invoice_id, tenant_id],
        |row| row.get(0),
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    if current_status != "draft" {
        return Err("لا يمكن تأكيد فاتورة ليست مسودة".into());
    }

    // Fetch items
    let mut stmt = conn.prepare(
        "SELECT id, product_id, batch_number, expiry_date, quantity, unit_cost, sale_price
         FROM supplier_invoice_items WHERE invoice_id = ?1"
    ).map_err(|e| e.to_string())?;

    let items: Vec<(String, String, Option<String>, Option<String>, i64, i64, i64)> = stmt.query_map(
        params![invoice_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?,
                  row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)),
    ).map_err(|e| e.to_string())?
      .filter_map(|r| r.ok())
      .collect();
    drop(stmt);

    if items.is_empty() {
        return Err("لا يمكن تأكيد فاتورة بدون أصناف".into());
    }

    // Fetch invoice total and supplier
    let (invoice_total, supplier_id): (i64, String) = conn.query_row(
        "SELECT total, supplier_id FROM supplier_invoices WHERE id = ?1 AND tenant_id = ?2",
        params![invoice_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| e.to_string())?;

    let branch_id: String = conn.query_row(
        "SELECT branch_id FROM supplier_invoices WHERE id = ?1",
        params![invoice_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    // Resolve location
    let default_location: String = if let Some(ref loc) = location_id {
        loc.clone()
    } else {
        conn.query_row(
            "SELECT id FROM storage_locations WHERE tenant_id = ?1 AND branch_id = ?2 AND is_active = 1 AND deleted_at IS NULL LIMIT 1",
            params![tenant_id, branch_id],
            |row| row.get(0),
        ).map_err(|_| "لا يوجد موقع تخزين نشط".to_string())?
    };

    // Validate payment amount
    let pay_amount: i64 = if payment_info.payment_mode == "unpaid" {
        0
    } else if payment_info.payment_mode == "paid" {
        invoice_total
    } else {
        // partial
        let amt = payment_info.amount_paid.unwrap_or(0);
        if amt <= 0 {
            return Err("مبلغ الدفعة الجزئية يجب أن يكون أكبر من صفر".into());
        }
        if amt >= invoice_total {
            return Err("الدفعة الجزئية يجب أن تكون أقل من إجمالي الفاتورة".into());
        }
        amt
    };

    // Validate account balance if paying
    let acct_balance: i64 = if is_paying {
        let acct_id = payment_info.account_id.as_deref().unwrap_or("");
        let bal: i64 = conn.query_row(
            "SELECT current_balance FROM accounts WHERE id = ?1 AND is_active = 1 AND deleted_at IS NULL",
            params![acct_id],
            |row| row.get(0),
        ).map_err(|_| "الحساب غير موجود أو غير نشط".to_string())?;
        if pay_amount > bal {
            return Err(format!("رصيد الحساب غير كافٍ. المتاح: {} والمطلوب: {}", bal, pay_amount));
        }
        bal
    } else {
        0
    };

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        // 1. Receive stock
        for (_, product_id, batch_number, expiry_date, quantity, unit_cost, sale_price) in &items {
            let batch_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO batches (id, tenant_id, product_id, supplier_invoice_id, location_id,
                        batch_number, expiry_date, quantity_received, quantity_current, unit_cost, status)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'active')",
                params![batch_id, tenant_id, product_id, invoice_id, default_location,
                        batch_number, expiry_date, quantity, quantity, unit_cost],
            ).map_err(|e| format!("فشل إنشاء الدفعة: {}", e))?;

            let movement_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO stock_movements (id, tenant_id, branch_id, product_id, batch_id,
                        movement_type, quantity_change, quantity_before, quantity_after,
                        reference_type, reference_id, created_by)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'receive', ?6, 0, ?7, 'supplier_invoice', ?8, ?9)",
                params![movement_id, tenant_id, branch_id, product_id, batch_id,
                        quantity, quantity, invoice_id, user_id],
            ).map_err(|e| format!("فشل تسجيل حركة المخزون: {}", e))?;

            if *sale_price > 0 {
                conn.execute(
                    "UPDATE products SET last_purchase_price = ?3, sale_price = ?4,
                            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                     WHERE id = ?2 AND tenant_id = ?1",
                    params![tenant_id, product_id, unit_cost, sale_price],
                ).map_err(|e| e.to_string())?;
            } else {
                conn.execute(
                    "UPDATE products SET last_purchase_price = ?3,
                            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                     WHERE id = ?2 AND tenant_id = ?1",
                    params![tenant_id, product_id, unit_cost],
                ).map_err(|e| e.to_string())?;
            }
        }

        // 2. Determine final payment_status
        let payment_status = match payment_info.payment_mode.as_str() {
            "paid" => "paid",
            "partial" => "partial",
            _ => "unpaid",
        };

        // 3. Update invoice: confirmed + amount_paid + payment_status
        conn.execute(
            "UPDATE supplier_invoices
             SET status = 'confirmed', confirmed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                 confirmed_by = ?3, amount_paid = ?4, payment_status = ?5,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1 AND tenant_id = ?2",
            params![invoice_id, tenant_id, user_id, pay_amount, payment_status],
        ).map_err(|e| e.to_string())?;

        // 4. If paying, create supplier payment + account transaction
        if is_paying {
            let acct_id = payment_info.account_id.as_deref().unwrap_or("");
            let method = payment_info.payment_method.as_deref().unwrap_or("cash");
            let pay_date = payment_info.payment_date.as_deref()
                .unwrap_or(""); // validated to be non-empty above
            do_supplier_payment(
                &*conn, &tenant_id, &supplier_id, &invoice_id,
                pay_amount, method, acct_id, pay_date,
                payment_info.notes.as_deref(), &user_id, acct_balance,
            )?;
        }

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            if let Err(e) = audit::log_action(&conn, &tenant_id, &user_id, "confirm", "purchase_invoice", &invoice_id, None) {
                log::warn!("audit log failed after confirm_purchase_with_payment: {}", e);
            }
            if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "purchase_confirmed") {
                log::warn!("cloud sync enqueue failed after confirm_purchase_with_payment: {}", e);
            }
            fetch_invoice_detail(&conn, &invoice_id)
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn cancel_purchase(
    db: State<'_, Database>,
    tenant_id: String,
    invoice_id: String,
    user_id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let (current_status, payment_status): (String, String) = conn.query_row(
        "SELECT status, payment_status FROM supplier_invoices WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![invoice_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    if current_status == "cancelled" {
        return Err("الفاتورة ملغاة بالفعل".into());
    }

    if current_status == "draft" {
        conn.execute(
            "UPDATE supplier_invoices SET status = 'cancelled',
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1 AND tenant_id = ?2",
            params![invoice_id, tenant_id],
        ).map_err(|e| e.to_string())?;

        if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "purchase_cancelled") {
            log::warn!("cloud sync enqueue failed after cancel_purchase (draft): {}", e);
        }

        return Ok(());
    }

    // Block cancellation for invoices with payments (paid or partial)
    if payment_status == "paid" || payment_status == "partial" {
        return Err("لا يمكن إلغاء فاتورة تم دفع جزء منها أو كلها. يُرجى إزالة المدفوعات أولاً.".into());
    }

    // Status is confirmed - need to check if any batch was sold
    let sales_from_batches: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sale_items
         WHERE batch_id IN (SELECT id FROM batches WHERE supplier_invoice_id = ?1)",
        params![invoice_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    if sales_from_batches > 0 {
        return Err("لا يمكن إلغاء فاتورة تم البيع منها".into());
    }

    // Fetch branch_id and batch data before transaction
    let branch_id: String = conn.query_row(
        "SELECT branch_id FROM supplier_invoices WHERE id = ?1",
        params![invoice_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let mut bstmt = conn.prepare(
        "SELECT id, product_id, quantity_current FROM batches
         WHERE supplier_invoice_id = ?1 AND deleted_at IS NULL"
    ).map_err(|e| e.to_string())?;
    let batches_data: Vec<(String, String, i64)> = bstmt.query_map(
        params![invoice_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    ).map_err(|e| e.to_string())?
      .filter_map(|r| r.ok())
      .collect();
    drop(bstmt);

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        // Insert reversal movements (preserve audit trail)
        for (batch_id, product_id, qty_current) in &batches_data {
            if *qty_current > 0 {
                let mv_id = Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO stock_movements (id, tenant_id, branch_id, product_id, batch_id,
                            movement_type, quantity_change, quantity_before, quantity_after,
                            reference_type, reference_id, notes, created_by)
                     VALUES (?1, ?2, ?3, ?4, ?5, 'adjust', ?6, ?7, 0, 'supplier_invoice_cancel', ?8, ?9, ?10)",
                    params![mv_id, tenant_id, branch_id, product_id, batch_id,
                            -qty_current, qty_current, invoice_id,
                            "إلغاء فاتورة مؤكدة", user_id],
                ).map_err(|e| e.to_string())?;
            }
        }

        // Deplete batches
        conn.execute(
            "UPDATE batches SET quantity_current = 0, status = 'depleted',
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE supplier_invoice_id = ?1",
            params![invoice_id],
        ).map_err(|e| e.to_string())?;

        // Cancel invoice
        conn.execute(
            "UPDATE supplier_invoices SET status = 'cancelled',
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1 AND tenant_id = ?2",
            params![invoice_id, tenant_id],
        ).map_err(|e| e.to_string())?;

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;

            if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "purchase_cancelled") {
                log::warn!("cloud sync enqueue failed after cancel_purchase (confirmed): {}", e);
            }

            Ok(())
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

// ====== Payment Schedules ======

#[derive(Debug, Serialize, Clone)]
pub struct PaymentScheduleRow {
    pub id: String,
    pub invoice_id: String,
    pub due_date: String,
    pub amount: i64,
    pub note: Option<String>,
    pub is_paid: bool,
    pub paid_at: Option<String>,
    pub payment_id: Option<String>,
    pub account_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct PaymentScheduleData {
    pub due_date: String,
    pub amount: i64,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SchedulePaymentData {
    pub account_id: String,
    pub payment_method: String,
    pub payment_date: String,
    pub notes: Option<String>,
}

fn do_update_invoice(
    conn: &rusqlite::Connection,
    tenant_id: &str,
    invoice_id: &str,
    data: &PurchaseCreateData,
) -> Result<(), String> {
    let discount = data.discount.unwrap_or(0);
    let tax_val = data.tax_amount.unwrap_or(0);

    conn.execute(
        "DELETE FROM supplier_invoice_items WHERE invoice_id = ?1",
        params![invoice_id],
    ).map_err(|e| e.to_string())?;

    let mut subtotal: i64 = 0;
    for item in &data.items {
        let item_id = Uuid::new_v4().to_string();
        let item_sub = item.quantity * item.unit_cost;
        subtotal += item_sub;
        conn.execute(
            "INSERT INTO supplier_invoice_items (id, tenant_id, invoice_id, product_id,
                    batch_number, expiry_date, quantity, unit_cost, sale_price, subtotal)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![item_id, tenant_id, invoice_id, item.product_id,
                    item.batch_number, item.expiry_date, item.quantity,
                    item.unit_cost, item.sale_price, item_sub],
        ).map_err(|e| format!("فشل إضافة الصنف: {}", e))?;
    }

    let total = subtotal - discount + tax_val;
    conn.execute(
        "UPDATE supplier_invoices
         SET supplier_id = ?2, invoice_date = ?3, notes = ?4,
             discount = ?5, tax_amount = ?6, subtotal = ?7, total = ?8,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1 AND tenant_id = ?9",
        params![invoice_id, data.supplier_id, data.invoice_date, data.notes,
                discount, tax_val, subtotal, total, tenant_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn update_purchase_invoice(
    db: State<'_, Database>,
    tenant_id: String,
    invoice_id: String,
    data: PurchaseCreateData,
) -> Result<PurchaseInvoiceDetail, String> {
    if data.items.is_empty() {
        return Err("يجب إضافة صنف واحد على الأقل".into());
    }
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let current_status: String = conn.query_row(
        "SELECT status FROM supplier_invoices WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![invoice_id, tenant_id],
        |row| row.get(0),
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    if current_status != "draft" {
        return Err("لا يمكن تعديل فاتورة مؤكدة أو ملغاة".into());
    }

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;
    match do_update_invoice(&conn, &tenant_id, &invoice_id, &data) {
        Ok(()) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            fetch_invoice_detail(&conn, &invoice_id)
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

fn fetch_schedule(conn: &rusqlite::Connection, schedule_id: &str) -> Result<PaymentScheduleRow, String> {
    conn.query_row(
        "SELECT id, invoice_id, due_date, amount, note, is_paid, paid_at, payment_id, account_id, created_at
         FROM supplier_payment_schedules WHERE id = ?1",
        params![schedule_id],
        |row| Ok(PaymentScheduleRow {
            id: row.get(0)?,
            invoice_id: row.get(1)?,
            due_date: row.get(2)?,
            amount: row.get(3)?,
            note: row.get(4)?,
            is_paid: row.get::<_, i64>(5)? != 0,
            paid_at: row.get(6)?,
            payment_id: row.get(7)?,
            account_id: row.get(8)?,
            created_at: row.get(9)?,
        })
    ).map_err(|_| "جدول الدفع غير موجود".into())
}

#[tauri::command]
pub fn get_payment_schedules(
    db: State<'_, Database>,
    tenant_id: String,
    invoice_id: String,
) -> Result<Vec<PaymentScheduleRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, invoice_id, due_date, amount, note, is_paid, paid_at, payment_id, account_id, created_at
         FROM supplier_payment_schedules
         WHERE tenant_id = ?1 AND invoice_id = ?2 AND deleted_at IS NULL
         ORDER BY due_date ASC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![tenant_id, invoice_id], |row| {
        Ok(PaymentScheduleRow {
            id: row.get(0)?,
            invoice_id: row.get(1)?,
            due_date: row.get(2)?,
            amount: row.get(3)?,
            note: row.get(4)?,
            is_paid: row.get::<_, i64>(5)? != 0,
            paid_at: row.get(6)?,
            payment_id: row.get(7)?,
            account_id: row.get(8)?,
            created_at: row.get(9)?,
        })
    }).map_err(|e| e.to_string())?
      .filter_map(|r| r.ok())
      .collect();

    Ok(rows)
}

#[tauri::command]
pub fn create_payment_schedule(
    db: State<'_, Database>,
    tenant_id: String,
    invoice_id: String,
    data: PaymentScheduleData,
) -> Result<PaymentScheduleRow, String> {
    if data.amount <= 0 {
        return Err("المبلغ يجب أن يكون أكبر من صفر".into());
    }
    if data.due_date.trim().is_empty() {
        return Err("تاريخ الاستحقاق مطلوب".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Only allow schedules on confirmed invoices with remaining balance
    let (inv_status, inv_total, inv_paid): (String, i64, i64) = conn.query_row(
        "SELECT status, total, amount_paid FROM supplier_invoices WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![invoice_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    if inv_status != "confirmed" {
        return Err("جداول الدفع خاصة بالفواتير المؤكدة فقط".into());
    }

    let remaining = inv_total - inv_paid;
    if remaining <= 0 {
        return Err("لا يوجد رصيد متبقِ لهذه الفاتورة".into());
    }

    // Sum of existing unpaid schedules
    let scheduled_unpaid: i64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM supplier_payment_schedules
         WHERE invoice_id = ?1 AND is_paid = 0 AND deleted_at IS NULL",
        params![invoice_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    if scheduled_unpaid + data.amount > remaining {
        return Err(format!(
            "إجمالي جداول الدفع يتجاوز الرصيد المتبقي ({}). متاح: {}",
            remaining, remaining - scheduled_unpaid
        ));
    }

    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO supplier_payment_schedules (id, tenant_id, invoice_id, due_date, amount, note)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, tenant_id, invoice_id, data.due_date, data.amount, data.note],
    ).map_err(|e| format!("فشل إنشاء جدول الدفع: {}", e))?;

    fetch_schedule(&conn, &id)
}

#[tauri::command]
pub fn mark_schedule_paid(
    db: State<'_, Database>,
    tenant_id: String,
    schedule_id: String,
    user_id: String,
    data: SchedulePaymentData,
) -> Result<PaymentScheduleRow, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Load schedule — verify unpaid
    let (invoice_id, amount, already_paid): (String, i64, i64) = conn.query_row(
        "SELECT invoice_id, amount, is_paid FROM supplier_payment_schedules
         WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![schedule_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|_| "جدول الدفع غير موجود".to_string())?;

    if already_paid != 0 {
        return Err("هذه الدفعة سُدِّدت مسبقاً".into());
    }

    // Load supplier_id from invoice
    let supplier_id: String = conn.query_row(
        "SELECT supplier_id FROM supplier_invoices WHERE id = ?1 AND tenant_id = ?2",
        params![invoice_id, tenant_id],
        |row| row.get(0),
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    // Validate account balance
    let acct_balance: i64 = conn.query_row(
        "SELECT current_balance FROM accounts WHERE id = ?1 AND is_active = 1 AND deleted_at IS NULL",
        params![data.account_id],
        |row| row.get(0),
    ).map_err(|_| "الحساب غير موجود أو غير نشط".to_string())?;

    if amount > acct_balance {
        return Err(format!("رصيد الحساب غير كافٍ. المتاح: {} والمطلوب: {}", acct_balance, amount));
    }

    // Prevent paying more than remaining invoice balance
    let inv_remaining: i64 = conn.query_row(
        "SELECT total - amount_paid FROM supplier_invoices WHERE id = ?1 AND tenant_id = ?2",
        params![invoice_id, tenant_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    if amount > inv_remaining {
        return Err(format!("المبلغ يتجاوز الرصيد المتبقي للفاتورة ({})", inv_remaining));
    }

    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    let res = do_pay_schedule(
        &conn, &tenant_id, &schedule_id, &invoice_id, &supplier_id,
        &user_id, &data, amount, acct_balance,
    );

    match res {
        Ok(()) => { conn.execute_batch("COMMIT").map_err(|e| e.to_string())?; }
        Err(e) => { let _ = conn.execute_batch("ROLLBACK"); return Err(e); }
    }

    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "schedule_paid") {
        log::warn!("cloud sync enqueue failed after mark_schedule_paid: {}", e);
    }

    fetch_schedule(&conn, &schedule_id)
}

fn do_pay_schedule(
    conn: &rusqlite::Connection,
    tenant_id: &str,
    schedule_id: &str,
    invoice_id: &str,
    supplier_id: &str,
    user_id: &str,
    data: &SchedulePaymentData,
    amount: i64,
    acct_balance: i64,
) -> Result<(), String> {
    // Use shared payment helper for steps 1-4
    let payment_id = do_supplier_payment(
        conn, tenant_id, supplier_id, invoice_id,
        amount, &data.payment_method, &data.account_id,
        &data.payment_date, data.notes.as_deref(), user_id, acct_balance,
    )?;

    // 5. Mark schedule as paid and store payment reference
    conn.execute(
        "UPDATE supplier_payment_schedules
         SET is_paid = 1,
             paid_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
             payment_id = ?2,
             account_id = ?3,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1",
        params![schedule_id, payment_id, data.account_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

/// Soft-delete a draft purchase invoice. Draft only — no stock effects.
#[tauri::command]
pub fn delete_purchase_draft(
    db: State<'_, Database>,
    tenant_id: String,
    invoice_id: String,
    user_id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_PURCHASES)?;
    guard::require_permission(&conn, &user_id, "purchases")?;

    let current_status: String = conn.query_row(
        "SELECT status FROM supplier_invoices WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![invoice_id, tenant_id],
        |row| row.get(0),
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    if current_status != "draft" {
        return Err("يمكن حذف المسودات فقط".into());
    }

    conn.execute(
        "UPDATE supplier_invoices
         SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
             confirmed_by = ?3
         WHERE id = ?1 AND tenant_id = ?2",
        params![invoice_id, tenant_id, user_id],
    ).map_err(|e| e.to_string())?;

    if let Err(e) = audit::log_action(&conn, &tenant_id, &user_id, "delete", "purchase_invoice", &invoice_id, None) {
        log::warn!("audit log failed after delete_purchase_draft: {}", e);
    }
    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "purchase_draft_deleted") {
        log::warn!("cloud sync enqueue failed after delete_purchase_draft: {}", e);
    }

    Ok(())
}

/// Return a confirmed invoice back to draft status.
/// Allowed only when: no payments, no paid schedules, no stock from its batches has been sold.
/// Reverses stock movements and removes the batches created on confirmation.
#[tauri::command]
pub fn return_purchase_to_draft(
    db: State<'_, Database>,
    tenant_id: String,
    invoice_id: String,
    user_id: String,
) -> Result<PurchaseInvoiceDetail, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_PURCHASES)?;
    guard::require_permission(&conn, &user_id, "purchases")?;

    // Must be confirmed
    let (current_status, payment_status): (String, String) = conn.query_row(
        "SELECT status, payment_status FROM supplier_invoices WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![invoice_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    if current_status != "confirmed" {
        return Err("الإرجاع للمسودة ممكن فقط للفواتير المؤكدة".into());
    }

    // Block if any payment recorded
    if payment_status == "paid" || payment_status == "partial" {
        return Err("لا يمكن الإرجاع للمسودة: توجد مدفوعات مسجّلة. استخدم مرتجع المشتريات.".into());
    }

    // Block if any paid payment schedule
    let paid_schedules: i64 = conn.query_row(
        "SELECT COUNT(*) FROM supplier_payment_schedules WHERE invoice_id = ?1 AND is_paid = 1 AND deleted_at IS NULL",
        params![invoice_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    if paid_schedules > 0 {
        return Err("لا يمكن الإرجاع للمسودة: تم سداد بعض الدفعات المجدولة.".into());
    }

    // Block if any batch item was sold
    let sold_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sale_items
         WHERE batch_id IN (SELECT id FROM batches WHERE supplier_invoice_id = ?1 AND deleted_at IS NULL)",
        params![invoice_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    if sold_count > 0 {
        return Err("لا يمكن الإرجاع للمسودة: تم بيع بعض الأصناف. استخدم مرتجع المشتريات.".into());
    }

    let branch_id: String = conn.query_row(
        "SELECT branch_id FROM supplier_invoices WHERE id = ?1",
        params![invoice_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    // Fetch batches to reverse
    let mut bstmt = conn.prepare(
        "SELECT id, product_id, quantity_current FROM batches
         WHERE supplier_invoice_id = ?1 AND deleted_at IS NULL"
    ).map_err(|e| e.to_string())?;
    let batches_data: Vec<(String, String, i64)> = bstmt.query_map(
        params![invoice_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    ).map_err(|e| e.to_string())?
      .filter_map(|r| r.ok())
      .collect();
    drop(bstmt);

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        // Insert reversal stock movements for audit trail
        for (batch_id, product_id, qty_current) in &batches_data {
            if *qty_current > 0 {
                let mv_id = Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO stock_movements (id, tenant_id, branch_id, product_id, batch_id,
                            movement_type, quantity_change, quantity_before, quantity_after,
                            reference_type, reference_id, notes, created_by)
                     VALUES (?1, ?2, ?3, ?4, ?5, 'adjust', ?6, ?7, 0, 'return_to_draft', ?8, ?9, ?10)",
                    params![mv_id, tenant_id, branch_id, product_id, batch_id,
                            -qty_current, qty_current, invoice_id,
                            "إرجاع فاتورة مؤكدة للمسودة", user_id],
                ).map_err(|e| e.to_string())?;
            }
        }

        // Soft-delete the batches created on confirmation
        conn.execute(
            "UPDATE batches SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                    quantity_current = 0, status = 'depleted',
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE supplier_invoice_id = ?1 AND deleted_at IS NULL",
            params![invoice_id],
        ).map_err(|e| e.to_string())?;

        // Delete any unpaid payment schedules
        conn.execute(
            "UPDATE supplier_payment_schedules
             SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE invoice_id = ?1 AND is_paid = 0 AND deleted_at IS NULL",
            params![invoice_id],
        ).map_err(|e| e.to_string())?;

        // Reset invoice to draft, clear confirmed fields and payment state
        conn.execute(
            "UPDATE supplier_invoices
             SET status = 'draft', confirmed_at = NULL, confirmed_by = NULL,
                 amount_paid = 0, payment_status = 'unpaid',
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1 AND tenant_id = ?2",
            params![invoice_id, tenant_id],
        ).map_err(|e| e.to_string())?;

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            if let Err(e) = audit::log_action(&conn, &tenant_id, &user_id, "return_to_draft", "purchase_invoice", &invoice_id, None) {
                log::warn!("audit log failed after return_purchase_to_draft: {}", e);
            }
            if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "purchase_returned_to_draft") {
                log::warn!("cloud sync enqueue failed after return_purchase_to_draft: {}", e);
            }
            fetch_invoice_detail(&conn, &invoice_id)
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn delete_payment_schedule(
    db: State<'_, Database>,
    tenant_id: String,
    schedule_id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE supplier_payment_schedules
         SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![schedule_id, tenant_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Purchase Return ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct PurchaseReturnItemData {
    pub batch_id: String,
    pub quantity: i64,
    pub reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreatePurchaseReturnData {
    pub return_date: String,
    pub reason: Option<String>,
    pub notes: Option<String>,
    pub account_id: Option<String>,
    pub items: Vec<PurchaseReturnItemData>,
}

fn do_purchase_return(
    conn: &rusqlite::Connection,
    tenant_id: &str,
    invoice_id: &str,
    user_id: &str,
    data: &CreatePurchaseReturnData,
) -> Result<String, String> {
    let (supplier_id, amount_paid, branch_id, status): (String, i64, String, String) = conn.query_row(
        "SELECT supplier_id, amount_paid, branch_id, status FROM supplier_invoices
         WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![invoice_id, tenant_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    ).map_err(|_| "الفاتورة غير موجودة".to_string())?;

    if status != "confirmed" {
        return Err("مرتجع المشتريات مسموح فقط للفواتير المؤكدة".into());
    }

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<String, String> {
        let mut total_refund: i64 = 0;
        let mut item_details: Vec<(String, i64)> = Vec::new(); // (product_id, unit_cost)

        for item in &data.items {
            if item.quantity <= 0 {
                return Err("الكمية يجب أن تكون أكبر من صفر".into());
            }
            let (product_id, qty_current, unit_cost, batch_inv_id): (String, i64, i64, Option<String>) =
                conn.query_row(
                    "SELECT product_id, quantity_current, unit_cost, supplier_invoice_id
                     FROM batches WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
                    params![item.batch_id, tenant_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
                ).map_err(|_| "الدفعة غير موجودة".to_string())?;

            if batch_inv_id.as_deref() != Some(invoice_id) {
                return Err("الدفعة لا تنتمي لهذه الفاتورة".into());
            }
            if item.quantity > qty_current {
                return Err(format!("كمية الإرجاع ({}) أكبر من المتاح ({})", item.quantity, qty_current));
            }

            let qty_after = qty_current - item.quantity;
            let new_status = if qty_after == 0 { "returned" } else { "active" };
            conn.execute(
                "UPDATE batches SET quantity_current = ?1, status = ?2,
                         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?3",
                params![qty_after, new_status, item.batch_id],
            ).map_err(|e| e.to_string())?;

            let mv_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO stock_movements (id, tenant_id, branch_id, product_id, batch_id,
                         movement_type, quantity_change, quantity_before, quantity_after,
                         reference_type, reference_id, notes, created_by)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'supplier_return', ?6, ?7, ?8, 'supplier_return', ?9, ?10, ?11)",
                params![mv_id, tenant_id, branch_id, product_id, item.batch_id,
                        -item.quantity, qty_current, qty_after, invoice_id, item.reason, user_id],
            ).map_err(|e| e.to_string())?;

            total_refund += unit_cost * item.quantity;
            item_details.push((product_id, unit_cost));
        }

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM supplier_returns WHERE tenant_id = ?1",
            params![tenant_id], |row| row.get(0),
        ).map_err(|e| e.to_string())?;
        let return_number = format!("PRET-{:05}", count + 1);
        let return_id = Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO supplier_returns (id, tenant_id, supplier_id, invoice_id, branch_id,
                     return_number, return_date, total_amount, status, reason, notes, created_by)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'confirmed', ?9, ?10, ?11)",
            params![return_id, tenant_id, supplier_id, invoice_id, branch_id,
                    return_number, data.return_date, total_refund, data.reason, data.notes, user_id],
        ).map_err(|e| e.to_string())?;

        for (item, (product_id, unit_cost)) in data.items.iter().zip(item_details.iter()) {
            let item_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO supplier_return_items (id, tenant_id, supplier_return_id, product_id,
                         batch_id, quantity, unit_cost, total_price, reason)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![item_id, tenant_id, return_id, product_id,
                        item.batch_id, item.quantity, unit_cost,
                        unit_cost * item.quantity, item.reason],
            ).map_err(|e| e.to_string())?;
        }

        let payment_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO supplier_payments (id, tenant_id, supplier_id, invoice_id, amount,
                     payment_method, account_id, payment_date, notes, created_by)
             VALUES (?1, ?2, ?3, ?4, ?5, 'credit_note', '', ?6, ?7, ?8)",
            params![payment_id, tenant_id, supplier_id, invoice_id, -total_refund,
                    data.return_date, data.reason, user_id],
        ).map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE supplier_invoices
             SET amount_paid = MAX(0, amount_paid - ?2),
                 payment_status = CASE
                     WHEN MAX(0, amount_paid - ?2) = 0 THEN 'unpaid'
                     WHEN MAX(0, amount_paid - ?2) >= total THEN 'paid'
                     ELSE 'partial' END,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1 AND tenant_id = ?3",
            params![invoice_id, total_refund, tenant_id],
        ).map_err(|e| e.to_string())?;

        if let Some(ref account_id) = data.account_id {
            if !account_id.is_empty() {
                let refund_applied = total_refund.min(amount_paid);
                if refund_applied > 0 {
                    let acct_balance: i64 = conn.query_row(
                        "SELECT current_balance FROM accounts WHERE id = ?1 AND is_active = 1 AND deleted_at IS NULL",
                        params![account_id], |row| row.get(0),
                    ).map_err(|_| "الحساب غير موجود أو غير نشط".to_string())?;

                    let tx_id = Uuid::new_v4().to_string();
                    conn.execute(
                        "INSERT INTO account_transactions (id, tenant_id, account_id, transaction_type,
                                 direction, amount, balance_before, balance_after,
                                 reference_type, reference_id, description, created_by)
                         VALUES (?1, ?2, ?3, 'supplier_return', 'in', ?4, ?5, ?6, 'supplier_return', ?7, 'مرتجع مشتريات', ?8)",
                        params![tx_id, tenant_id, account_id, refund_applied,
                                acct_balance, acct_balance + refund_applied, return_id, user_id],
                    ).map_err(|e| e.to_string())?;

                    conn.execute(
                        "UPDATE accounts SET current_balance = current_balance + ?2,
                                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
                        params![account_id, refund_applied],
                    ).map_err(|e| e.to_string())?;
                }
            }
        }

        Ok(return_id)
    })();

    match result {
        Ok(id) => { conn.execute("COMMIT", []).map_err(|e| e.to_string())?; Ok(id) }
        Err(e) => { let _ = conn.execute("ROLLBACK", []); Err(e) }
    }
}

#[tauri::command]
pub fn create_purchase_return(
    db: State<'_, Database>,
    tenant_id: String,
    invoice_id: String,
    user_id: String,
    data: CreatePurchaseReturnData,
) -> Result<String, String> {
    if data.items.is_empty() {
        return Err("يجب اختيار صنف واحد على الأقل للإرجاع".into());
    }
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_PURCHASES)?;
    guard::require_permission(&conn, &user_id, "purchases")?;

    let return_id = do_purchase_return(&conn, &tenant_id, &invoice_id, &user_id, &data)?;

    if let Err(e) = audit::log_action(&conn, &tenant_id, &user_id, "return", "purchase_invoice", &invoice_id, data.reason.as_deref()) {
        log::warn!("audit log failed after create_purchase_return: {}", e);
    }
    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "purchase_returned") {
        log::warn!("cloud sync enqueue failed after create_purchase_return: {}", e);
    }

    Ok(return_id)
}

// ─── Lot Traceability ────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct BatchSaleRow {
    pub sale_id: String,
    pub sale_number: String,
    pub sale_date: String,
    pub customer_id: Option<String>,
    pub customer_name: Option<String>,
    pub quantity: i64,
    pub unit_price: i64,
    pub subtotal: i64,
}

#[tauri::command]
pub fn get_batch_sales(
    db: State<'_, Database>,
    tenant_id: String,
    batch_id: String,
) -> Result<Vec<BatchSaleRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT s.id, s.sale_number, s.created_at,
                s.customer_id, c.name,
                si.quantity, si.unit_price, si.subtotal
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         LEFT JOIN customers c ON c.id = s.customer_id
         WHERE si.tenant_id = ?1
           AND si.batch_id = ?2
           AND s.deleted_at IS NULL
         ORDER BY s.created_at DESC",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![tenant_id, batch_id], |row| {
        Ok(BatchSaleRow {
            sale_id: row.get(0)?,
            sale_number: row.get(1)?,
            sale_date: row.get(2)?,
            customer_id: row.get(3)?,
            customer_name: row.get(4)?,
            quantity: row.get(5)?,
            unit_price: row.get(6)?,
            subtotal: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(rows)
}
