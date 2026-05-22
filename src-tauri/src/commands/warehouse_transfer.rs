use rusqlite::params;
use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::{license_guard, guard, audit, cloud_sync};
use crate::commands::session_state::{AuthSessionState, resolve_identity};

const FLAG_WAREHOUSE: i64 = 8;

#[tauri::command]
pub fn transfer_stock(
    tenant_id: String,
    branch_id: String,
    user_id: String,
    product_id: String,
    from_location_id: String,
    to_location_id: String,
    quantity: i64,
    db: State<Database>,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    if quantity <= 0 { return Err("الكمية يجب أن تكون أكبر من صفر".into()); }
    if from_location_id == to_location_id { return Err("موقع المصدر والوجهة متطابقان".into()); }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, &branch_id)?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_WAREHOUSE)?;
    guard::require_permission(&conn, &user_id, "warehouse")?;

    let available: i64 = conn.query_row(
        "SELECT COALESCE(SUM(quantity_current),0) FROM batches
         WHERE tenant_id=?1 AND product_id=?2 AND location_id=?3
           AND status='active' AND deleted_at IS NULL",
        params![tenant_id, product_id, from_location_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    if available < quantity {
        return Err(format!("المخزون المتاح ({}) أقل من الكمية المطلوبة ({})", available, quantity));
    }

    let product_name: String = conn.query_row(
        "SELECT COALESCE(trade_name_ar, trade_name) FROM products WHERE id=?1 AND tenant_id=?2",
        params![product_id, tenant_id], |row| row.get(0),
    ).map_err(|_| "المنتج غير موجود".to_string())?;

    let from_name: String = conn.query_row(
        "SELECT COALESCE(name_ar,name) FROM storage_locations WHERE id=?1",
        params![from_location_id], |row| row.get(0),
    ).unwrap_or_else(|_| from_location_id.clone());

    let to_name: String = conn.query_row(
        "SELECT COALESCE(name_ar,name) FROM storage_locations WHERE id=?1",
        params![to_location_id], |row| row.get(0),
    ).unwrap_or_else(|_| to_location_id.clone());

    conn.execute("BEGIN", []).map_err(|e| e.to_string())?;

    let xfer = do_transfer(
        &conn, &tenant_id, &branch_id, &user_id,
        &product_id, &from_location_id, &to_location_id,
        quantity, &from_name, &to_name, &product_name,
    );
    match xfer {
        Err(e) => { conn.execute("ROLLBACK", []).ok(); Err(e) }
        Ok(()) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "warehouse_transfer") {
                log::warn!("cloud sync enqueue failed after transfer_stock: {}", e);
            }
            Ok(())
        }
    }
}

fn do_transfer(
    conn: &rusqlite::Connection,
    tenant_id: &str, branch_id: &str, user_id: &str,
    product_id: &str, from_loc: &str, to_loc: &str,
    quantity: i64, from_name: &str, to_name: &str, product_name: &str,
) -> Result<(), String> {
    let mut stmt = conn.prepare(
        "SELECT id, quantity_current FROM batches
         WHERE tenant_id=?1 AND product_id=?2 AND location_id=?3
           AND status='active' AND deleted_at IS NULL AND quantity_current>0
         ORDER BY COALESCE(expiry_date,'9999-12-31') ASC",
    ).map_err(|e| e.to_string())?;
    let batches: Vec<(String, i64)> = stmt.query_map(
        params![tenant_id, product_id, from_loc],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
    drop(stmt);

    let notes = format!("نقل من {} إلى {}: {}", from_name, to_name, product_name);
    let mut remaining = quantity;

    for (batch_id, qty_cur) in batches {
        if remaining <= 0 { break; }
        let take = remaining.min(qty_cur);
        let new_qty = qty_cur - take;

        conn.execute(
            "UPDATE batches SET quantity_current=?1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2",
            params![new_qty, batch_id],
        ).map_err(|e| e.to_string())?;

        let out_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO stock_movements(id,tenant_id,branch_id,product_id,batch_id,
              movement_type,quantity_change,quantity_before,quantity_after,
              reference_type,reference_id,notes,created_by)
             VALUES(?1,?2,?3,?4,?5,'transfer_out',?6,?7,?8,'transfer',?9,?10,?11)",
            params![out_id,tenant_id,branch_id,product_id,batch_id,-take,qty_cur,new_qty,batch_id,notes,user_id],
        ).map_err(|e| e.to_string())?;

        let (source_unit_cost, source_batch_number): (i64, String) = conn.query_row(
            "SELECT unit_cost, COALESCE(batch_number,'') FROM batches WHERE id = ?1",
            params![batch_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).unwrap_or((0, String::new()));

        let dest_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO batches(id,tenant_id,branch_id,product_id,location_id,batch_number,
              quantity_received,quantity_current,unit_cost,status)
              VALUES(?1,?2,?3,?4,?5,?6,?7,?7,?8,'active')",
            params![dest_id,tenant_id,branch_id,product_id,to_loc,source_batch_number,take,source_unit_cost],
        ).map_err(|e| e.to_string())?;

        let in_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO stock_movements(id,tenant_id,branch_id,product_id,batch_id,
              movement_type,quantity_change,quantity_before,quantity_after,
              reference_type,reference_id,notes,created_by)
             VALUES(?1,?2,?3,?4,?5,'transfer_in',?6,0,?6,'transfer',?7,?8,?9)",
            params![in_id,tenant_id,branch_id,product_id,dest_id,take,dest_id,notes,user_id],
        ).map_err(|e| e.to_string())?;

        remaining -= take;
    }
    if remaining > 0 { return Err("لم يتم نقل الكمية كاملة".into()); }
    if let Err(e) = audit::log_action(&conn, &tenant_id, &user_id, "transfer", "stock", &product_id, None) {
        log::warn!("audit log failed after transfer_stock: {}", e);
    }
    Ok(())
}
