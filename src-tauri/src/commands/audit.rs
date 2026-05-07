use rusqlite::{params, Connection};
use uuid::Uuid;

/// Insert a row into `audit_log`.
/// Call this **inside** the same DB lock after a successful mutation.
/// `changes_json` is optional — pass `None` when the full diff is not needed.
pub(crate) fn log_action(
    conn: &Connection,
    tenant_id: &str,
    user_id: &str,
    action: &str,
    entity_type: &str,
    entity_id: &str,
    changes_json: Option<&str>,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO audit_log (id, tenant_id, user_id, action, entity_type, entity_id, changes_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, tenant_id, user_id, action, entity_type, entity_id, changes_json],
    )
    .map_err(|e| format!("audit log failed: {}", e))?;
    Ok(())
}
