use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::commands::license_guard;
use crate::db::Database;

#[derive(Debug, Serialize)]
pub struct UnitMeasureRow {
    pub id: String,
    pub name: String,
    pub name_ar: Option<String>,
    pub is_active: bool,
}

#[derive(Debug, Deserialize)]
pub struct UnitMeasureData {
    pub name: String,
    pub name_ar: Option<String>,
    pub is_active: Option<bool>,
}

#[tauri::command]
pub fn get_unit_measures(
    db: State<'_, Database>,
    tenant_id: String,
    active_only: Option<bool>,
) -> Result<Vec<UnitMeasureRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut sql = String::from(
        "SELECT id, name, name_ar, is_active
         FROM unit_measures
         WHERE tenant_id = ?1 AND deleted_at IS NULL",
    );
    if active_only.unwrap_or(false) {
        sql.push_str(" AND is_active = 1");
    }
    sql.push_str(" ORDER BY name ASC");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![tenant_id], |row| {
            Ok(UnitMeasureRow {
                id: row.get(0)?,
                name: row.get(1)?,
                name_ar: row.get(2)?,
                is_active: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub fn create_unit_measure(
    db: State<'_, Database>,
    tenant_id: String,
    data: UnitMeasureData,
) -> Result<UnitMeasureRow, String> {
    if data.name.trim().is_empty() {
        return Err("اسم الوحدة مطلوب".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;

    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO unit_measures (id, tenant_id, name, name_ar, is_active)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            id,
            tenant_id,
            data.name.trim(),
            data.name_ar.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()),
            data.is_active.unwrap_or(true) as i32,
        ],
    )
    .map_err(|e| format!("فشل إضافة الوحدة: {}", e))?;

    conn.query_row(
        "SELECT id, name, name_ar, is_active FROM unit_measures WHERE id = ?1",
        params![id],
        |row| {
            Ok(UnitMeasureRow {
                id: row.get(0)?,
                name: row.get(1)?,
                name_ar: row.get(2)?,
                is_active: row.get(3)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_unit_measure(
    db: State<'_, Database>,
    tenant_id: String,
    unit_id: String,
    data: UnitMeasureData,
) -> Result<(), String> {
    if data.name.trim().is_empty() {
        return Err("اسم الوحدة مطلوب".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;

    conn.execute(
        "UPDATE unit_measures
         SET name = ?3,
             name_ar = ?4,
             is_active = COALESCE(?5, is_active),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE tenant_id = ?1 AND id = ?2 AND deleted_at IS NULL",
        params![
            tenant_id,
            unit_id,
            data.name.trim(),
            data.name_ar.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()),
            data.is_active.map(|v| v as i32),
        ],
    )
    .map_err(|e| format!("فشل تحديث الوحدة: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn delete_unit_measure(
    db: State<'_, Database>,
    tenant_id: String,
    unit_id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;

    let in_use: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM products WHERE tenant_id = ?1 AND (unit_id = ?2 OR sub_unit_id = ?2) AND deleted_at IS NULL)",
            params![tenant_id, unit_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if in_use {
        return Err("لا يمكن حذف وحدة مستخدمة في المنتجات".into());
    }

    conn.execute(
        "UPDATE unit_measures
         SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE tenant_id = ?1 AND id = ?2 AND deleted_at IS NULL",
        params![tenant_id, unit_id],
    )
    .map_err(|e| format!("فشل حذف الوحدة: {}", e))?;
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct PaymentMethodRow {
    pub id: String,
    pub name: String,
    pub name_ar: Option<String>,
    pub method_type: String,
    pub account_id: Option<String>,
    pub is_default: bool,
    pub is_active: bool,
    pub sort_order: i64,
}

#[derive(Debug, Deserialize)]
pub struct PaymentMethodData {
    pub name: String,
    pub name_ar: Option<String>,
    pub method_type: String,
    pub account_id: Option<String>,
    pub is_default: Option<bool>,
    pub is_active: Option<bool>,
    pub sort_order: Option<i64>,
}

fn validate_method_type(method_type: &str) -> bool {
    matches!(method_type, "cash" | "bank_transfer" | "credit")
}

#[tauri::command]
pub fn get_payment_methods(
    db: State<'_, Database>,
    tenant_id: String,
    active_only: Option<bool>,
) -> Result<Vec<PaymentMethodRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut sql = String::from(
        "SELECT id, name, name_ar, method_type, account_id, is_default, is_active, sort_order
         FROM payment_methods
         WHERE tenant_id = ?1 AND deleted_at IS NULL",
    );
    if active_only.unwrap_or(false) {
        sql.push_str(" AND is_active = 1");
    }
    sql.push_str(" ORDER BY is_default DESC, sort_order ASC, name ASC");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![tenant_id], |row| {
            Ok(PaymentMethodRow {
                id: row.get(0)?,
                name: row.get(1)?,
                name_ar: row.get(2)?,
                method_type: row.get(3)?,
                account_id: row.get(4)?,
                is_default: row.get(5)?,
                is_active: row.get(6)?,
                sort_order: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub fn create_payment_method(
    db: State<'_, Database>,
    tenant_id: String,
    data: PaymentMethodData,
) -> Result<PaymentMethodRow, String> {
    if data.name.trim().is_empty() {
        return Err("اسم طريقة الدفع مطلوب".into());
    }
    if !validate_method_type(&data.method_type) {
        return Err("نوع طريقة الدفع غير صالح".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;

    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO payment_methods (id, tenant_id, name, name_ar, method_type, account_id, is_default, is_active, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            id,
            tenant_id,
            data.name.trim(),
            data.name_ar.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()),
            data.method_type,
            data.account_id,
            data.is_default.unwrap_or(false) as i32,
            data.is_active.unwrap_or(true) as i32,
            data.sort_order.unwrap_or(0),
        ],
    )
    .map_err(|e| format!("فشل إضافة طريقة الدفع: {}", e))?;

    conn.query_row(
        "SELECT id, name, name_ar, method_type, account_id, is_default, is_active, sort_order
         FROM payment_methods WHERE id = ?1",
        params![id],
        |row| {
            Ok(PaymentMethodRow {
                id: row.get(0)?,
                name: row.get(1)?,
                name_ar: row.get(2)?,
                method_type: row.get(3)?,
                account_id: row.get(4)?,
                is_default: row.get(5)?,
                is_active: row.get(6)?,
                sort_order: row.get(7)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_payment_method(
    db: State<'_, Database>,
    tenant_id: String,
    payment_method_id: String,
    data: PaymentMethodData,
) -> Result<(), String> {
    if data.name.trim().is_empty() {
        return Err("اسم طريقة الدفع مطلوب".into());
    }
    if !validate_method_type(&data.method_type) {
        return Err("نوع طريقة الدفع غير صالح".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;

    conn.execute(
        "UPDATE payment_methods
         SET name = ?3,
             name_ar = ?4,
             method_type = ?5,
             account_id = ?6,
             is_default = COALESCE(?7, is_default),
             is_active = COALESCE(?8, is_active),
             sort_order = COALESCE(?9, sort_order),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE tenant_id = ?1 AND id = ?2 AND deleted_at IS NULL",
        params![
            tenant_id,
            payment_method_id,
            data.name.trim(),
            data.name_ar.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()),
            data.method_type,
            data.account_id,
            data.is_default.map(|v| v as i32),
            data.is_active.map(|v| v as i32),
            data.sort_order,
        ],
    )
    .map_err(|e| format!("فشل تحديث طريقة الدفع: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn delete_payment_method(
    db: State<'_, Database>,
    tenant_id: String,
    payment_method_id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    license_guard::require_active(&conn, &tenant_id)?;

    let in_use: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sales WHERE tenant_id = ?1 AND payment_method_id = ?2 AND deleted_at IS NULL)",
            params![tenant_id, payment_method_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if in_use {
        return Err("لا يمكن حذف طريقة دفع مستخدمة في المبيعات".into());
    }

    conn.execute(
        "UPDATE payment_methods
         SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE tenant_id = ?1 AND id = ?2 AND deleted_at IS NULL",
        params![tenant_id, payment_method_id],
    )
    .map_err(|e| format!("فشل حذف طريقة الدفع: {}", e))?;

    Ok(())
}
