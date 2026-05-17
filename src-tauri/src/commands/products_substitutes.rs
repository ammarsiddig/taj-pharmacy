use serde::Serialize;
use tauri::State;
use rusqlite::params;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::license_guard;
use crate::commands::session_state::{AuthSessionState, resolve_identity};

#[derive(Debug, Serialize)]
pub struct ProductSubstitute {
    pub id: String,
    pub substitute_id: String,
    pub trade_name: String,
    pub trade_name_ar: Option<String>,
    pub generic_name: Option<String>,
    pub total_stock: i64,
    pub sale_price: i64,
    pub notes: Option<String>,
}

#[tauri::command]
pub fn get_product_substitutes(
    db: State<'_, Database>,
    tenant_id: String,
    product_id: String,
) -> Result<Vec<ProductSubstitute>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let sql = "
        SELECT ps.id, p.id, p.trade_name, p.trade_name_ar, p.generic_name,
               COALESCE((SELECT SUM(b.quantity_current) FROM batches b
                         WHERE b.product_id = p.id AND b.deleted_at IS NULL), 0),
               p.sale_price, ps.notes
        FROM product_substitutes ps
        JOIN products p ON p.id = ps.substitute_id
        WHERE ps.tenant_id = ?1 AND ps.product_id = ?2 AND p.deleted_at IS NULL
        UNION
        SELECT ps2.id, p2.id, p2.trade_name, p2.trade_name_ar, p2.generic_name,
               COALESCE((SELECT SUM(b2.quantity_current) FROM batches b2
                         WHERE b2.product_id = p2.id AND b2.deleted_at IS NULL), 0),
               p2.sale_price, ps2.notes
        FROM product_substitutes ps2
        JOIN products p2 ON p2.id = ps2.product_id
        WHERE ps2.tenant_id = ?1 AND ps2.substitute_id = ?2 AND p2.deleted_at IS NULL
        ORDER BY 3
    ";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows: Vec<ProductSubstitute> = stmt.query_map(
        params![tenant_id, product_id],
        |row| Ok(ProductSubstitute {
            id: row.get(0)?,
            substitute_id: row.get(1)?,
            trade_name: row.get(2)?,
            trade_name_ar: row.get(3)?,
            generic_name: row.get(4)?,
            total_stock: row.get(5)?,
            sale_price: row.get(6)?,
            notes: row.get(7)?,
        }),
    ).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(rows)
}

#[tauri::command]
pub fn add_product_substitute(
    db: State<'_, Database>,
    tenant_id: String,
    product_id: String,
    substitute_id: String,
    notes: Option<String>,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    if product_id == substitute_id {
        return Err("لا يمكن إضافة المنتج كبديل لنفسه".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    license_guard::require_active(&conn, &tenant_id)?;

    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT OR IGNORE INTO product_substitutes (id, tenant_id, product_id, substitute_id, notes)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, tenant_id, product_id, substitute_id, notes],
    ).map_err(|e| format!("فشل في إضافة البديل: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn remove_product_substitute(
    db: State<'_, Database>,
    tenant_id: String,
    product_id: String,
    substitute_id: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    license_guard::require_active(&conn, &tenant_id)?;

    conn.execute(
        "DELETE FROM product_substitutes
         WHERE tenant_id = ?1
           AND ((product_id = ?2 AND substitute_id = ?3)
             OR (product_id = ?3 AND substitute_id = ?2))",
        params![tenant_id, product_id, substitute_id],
    ).map_err(|e| format!("فشل في حذف البديل: {}", e))?;

    Ok(())
}
