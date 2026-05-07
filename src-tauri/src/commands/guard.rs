use rusqlite::{params, Connection};

/// Check that `user_id` has `feature` permission.
/// Queries the `permissions` table for user-specific overrides, then falls
/// back to role-based defaults.  Returns `Err` with an Arabic message if the
/// user is not authorized.
///
/// The caller must already hold the DB connection lock.
pub fn require_permission(
    conn: &Connection,
    user_id: &str,
    feature: &str,
) -> Result<(), String> {
    // Fetch role name for the user
    let role_name: String = conn
        .query_row(
            "SELECT r.name FROM users u JOIN roles r ON u.role_id = r.id
             WHERE u.id = ?1 AND u.deleted_at IS NULL",
            params![user_id],
            |row| row.get(0),
        )
        .map_err(|_| "المستخدم غير موجود".to_string())?;

    // Check user-specific overrides first
    let override_row: Option<bool> = conn
        .query_row(
            "SELECT allowed FROM permissions WHERE user_id = ?1 AND feature = ?2 AND deleted_at IS NULL",
            params![user_id, feature],
            |row| row.get(0),
        )
        .ok();

    if let Some(allowed) = override_row {
        if allowed {
            return Ok(());
        } else {
            return Err(format!("ليس لديك صلاحية: {}", feature));
        }
    }

    // Fall back to role defaults
    let role_has_permission = get_role_default_permissions(&role_name)
        .iter()
        .any(|p| *p == feature);

    if role_has_permission {
        Ok(())
    } else {
        Err(format!("ليس لديك صلاحية: {}", feature))
    }
}

fn get_role_default_permissions(role_name: &str) -> Vec<&'static str> {
    match role_name {
        "owner" => vec![
            "pos", "products", "products.create", "products.edit", "products.delete",
            "purchases", "warehouse", "sales", "expenses", "customers", "suppliers",
            "accounts", "reports", "settings", "settings.users", "settings.license",
        ],
        "manager" => vec![
            "pos", "products", "products.create", "products.edit", "products.delete",
            "purchases", "warehouse", "sales", "expenses", "customers", "suppliers",
            "accounts", "reports", "settings",
        ],
        "pharmacist" => vec![
            "pos", "products", "warehouse", "purchases", "reports",
        ],
        "cashier" => vec!["pos"],
        _ => vec![],
    }
}
