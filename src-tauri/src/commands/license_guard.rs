/// License enforcement helpers.
/// Call these at the start of any mutation command to enforce license rules.
///
/// All functions fail-open: if the tenants row cannot be read they return Ok(())
/// so a DB error doesn't accidentally lock users out of the app.

use rusqlite::params;

const GRACE_DAYS: i64 = 7;

/// Block mutations when the license has expired and the grace window has closed.
/// Returns Ok(()) while the license is active or still inside the 7-day grace period.
pub fn require_active(conn: &rusqlite::Connection, tenant_id: &str) -> Result<(), String> {
    let result = conn.query_row(
        "SELECT subscription_status, subscription_expiry
         FROM tenants WHERE id = ?1 AND deleted_at IS NULL",
        params![tenant_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
    );

    let (status, expiry) = match result {
        Err(_) => return Ok(()), // fail-open
        Ok(v) => v,
    };

    if status == "suspended" {
        return Err("License is not active. Please contact support to renew.".into());
    }

    if let Some(exp) = expiry {
        use chrono::NaiveDate;
        let today_str = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let exp_date = NaiveDate::parse_from_str(&exp, "%Y-%m-%d");
        let today_date = NaiveDate::parse_from_str(&today_str, "%Y-%m-%d");

        if let (Ok(e), Ok(t)) = (exp_date, today_date) {
            let diff = (e - t).num_days(); // negative = expired
            if diff < -GRACE_DAYS {
                return Err(
                    "Your license has expired and the grace period has ended. \
                     Please renew your license to continue."
                        .into(),
                );
            }
        }
    }

    // Explicitly block expired records that have no usable expiry date context.
    if status == "expired" {
        return Err(
            "Your license has expired and the system is now in read-only mode. \
             Please renew your license to continue making changes."
                .into(),
        );
    }

    Ok(())
}

/// Block a command if the tenant's feature_flags do not include `flag`.
/// feature_flags == 0 means all features are enabled (seed/basic state).
pub fn require_feature(
    conn: &rusqlite::Connection,
    tenant_id: &str,
    flag: i64,
) -> Result<(), String> {
    let result = conn.query_row(
        "SELECT feature_flags FROM tenants WHERE id = ?1 AND deleted_at IS NULL",
        params![tenant_id],
        |row| row.get::<_, i64>(0),
    );

    match result {
        Err(_) => Ok(()), // fail-open
        Ok(flags) => {
            if flags == 0 || (flags & flag) != 0 {
                Ok(())
            } else {
                Err(
                    "This feature is not included in your current subscription plan. \
                     Please upgrade to access it."
                        .into(),
                )
            }
        }
    }
}

/// Prevent creating a new branch when the plan's branch cap has been reached.
pub fn check_branch_limit(conn: &rusqlite::Connection, tenant_id: &str) -> Result<(), String> {
    let result = conn.query_row(
        "SELECT
             (SELECT COUNT(*) FROM branches WHERE tenant_id = ?1 AND deleted_at IS NULL),
             max_branches
         FROM tenants WHERE id = ?1 AND deleted_at IS NULL",
        params![tenant_id],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
    );

    match result {
        Err(_) => Ok(()), // fail-open
        Ok((count, max)) => {
            if count >= max {
                Err(format!(
                    "Branch limit reached ({}/{}). Upgrade your plan to add more branches.",
                    count, max
                ))
            } else {
                Ok(())
            }
        }
    }
}

/// Prevent creating a new user when the plan's user cap has been reached.
pub fn check_user_limit(conn: &rusqlite::Connection, tenant_id: &str) -> Result<(), String> {
    let result = conn.query_row(
        "SELECT
             (SELECT COUNT(*) FROM users WHERE tenant_id = ?1 AND deleted_at IS NULL AND is_active = 1),
             max_users
         FROM tenants WHERE id = ?1 AND deleted_at IS NULL",
        params![tenant_id],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
    );

    match result {
        Err(_) => Ok(()), // fail-open
        Ok((count, max)) => {
            if count >= max {
                Err(format!(
                    "User limit reached ({}/{}). Upgrade your plan to add more users.",
                    count, max
                ))
            } else {
                Ok(())
            }
        }
    }
}
