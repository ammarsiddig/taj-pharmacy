use serde::{Deserialize, Serialize};
use tauri::State;
use rusqlite::params;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::session_state::{AuthSessionState, resolve_identity};

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
    auth_session: State<'_, AuthSessionState>,
) -> Result<Supplier, String> {
    if data.name.trim().is_empty() {
        return Err("اسم المورد مطلوب".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
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
    auth_session: State<'_, AuthSessionState>,
) -> Result<Supplier, String> {
    if data.name.trim().is_empty() {
        return Err("اسم المورد مطلوب".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;

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
