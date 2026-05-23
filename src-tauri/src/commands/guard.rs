use rusqlite::{params, Connection};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Level {
    None,
    Read,
    Write,
}

impl Level {
    pub fn from_str(s: &str) -> Self {
        match s {
            "write" => Level::Write,
            "read" => Level::Read,
            _ => Level::None,
        }
    }
}

fn resolve_effective_level(
    conn: &Connection,
    user_id: &str,
    resource: &str,
) -> Result<Level, String> {
    // 1. Check user_permission_overrides first (win over role)
    let override_level: Option<String> = conn
        .query_row(
            "SELECT level FROM user_permission_overrides WHERE user_id = ?1 AND resource = ?2",
            params![user_id, resource],
            |row| row.get(0),
        )
        .ok();

    if let Some(lvl) = override_level {
        return Ok(Level::from_str(&lvl));
    }

    // 2. Fall back to role_permissions
    let role_level: Option<String> = conn
        .query_row(
            "SELECT rp.level FROM role_permissions rp
             JOIN users u ON u.role_id = rp.role_id
             WHERE u.id = ?1 AND rp.resource = ?2",
            params![user_id, resource],
            |row| row.get(0),
        )
        .ok();

    if let Some(lvl) = role_level {
        Ok(Level::from_str(&lvl))
    } else {
        // No permission entry at all = no access
        Ok(Level::None)
    }
}

pub fn require_access(
    conn: &Connection,
    user_id: &str,
    resource: &str,
    min_level: Level,
) -> Result<(), String> {
    let effective = resolve_effective_level(conn, user_id, resource)?;

    if effective >= min_level {
        Ok(())
    } else {
        Err(format!("صلاحية غير كافية: {}", resource))
    }
}

pub fn allowed_branches(
    conn: &Connection,
    user_id: &str,
) -> Result<Vec<String>, String> {
    let see_all: bool = conn
        .query_row(
            "SELECT see_all_branches FROM users WHERE id = ?1",
            params![user_id],
            |row| row.get(0),
        )
        .map_err(|_| "المستخدم غير موجود".to_string())?;

    if see_all {
        let mut stmt = conn
            .prepare(
                "SELECT id FROM branches WHERE is_active = 1 AND deleted_at IS NULL",
            )
            .map_err(|e| e.to_string())?;
        let ids = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        Ok(ids)
    } else {
        let home: String = conn
            .query_row(
                "SELECT COALESCE(home_branch_id, branch_id) FROM users WHERE id = ?1",
                params![user_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("المستخدم غير موجود: {}", e))?;
        Ok(vec![home])
    }
}

pub fn require_branch_access(
    conn: &Connection,
    user_id: &str,
    branch_id: &str,
) -> Result<(), String> {
    let branches = allowed_branches(conn, user_id)?;
    if branches.iter().any(|b| b == branch_id) {
        Ok(())
    } else {
        Err("ليس لديك صلاحية لهذا الفرع".to_string())
    }
}
