use tauri::State;

use crate::db::Database;
use crate::commands::session_state::{AuthSessionState, resolve_identity};

#[tauri::command]
pub fn save_pos_workspace_state(
    db: State<'_, Database>,
    tenant_id: String,
    session_id: String,
    state_json: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    let id = format!("{}-{}", tenant_id, session_id);
    conn.execute(
        "INSERT INTO pos_parked_carts (id, session_id, tenant_id, state_json, saved_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         ON CONFLICT(id) DO UPDATE SET
             state_json = excluded.state_json,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        rusqlite::params![id, session_id, tenant_id, state_json],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn load_pos_workspace_state(
    db: State<'_, Database>,
    tenant_id: String,
    session_id: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    let id = format!("{}-{}", tenant_id, session_id);
    match conn.query_row(
        "SELECT state_json FROM pos_parked_carts WHERE id = ?1",
        rusqlite::params![id],
        |row| row.get::<_, String>(0),
    ) {
        Ok(json) => Ok(json),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn clear_pos_workspace_state(
    db: State<'_, Database>,
    tenant_id: String,
    session_id: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    let id = format!("{}-{}", tenant_id, session_id);
    conn.execute(
        "DELETE FROM pos_parked_carts WHERE id = ?1",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}
