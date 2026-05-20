use rusqlite::params;

const GRACE_DAYS: i64 = 7;

pub fn require_active(conn: &rusqlite::Connection, tenant_id: &str) -> Result<(), String> {
    let result = conn.query_row(
        "SELECT subscription_status, subscription_expiry
         FROM tenants WHERE id = ?1 AND deleted_at IS NULL",
        params![tenant_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
    );

    let (status, expiry) = match result {
        Err(e) => return Err(format!("license_check_failed: {}", e)),
        Ok(v) => v,
    };

    if status == "suspended" {
        return Err("الترخيص غير نشط. يرجى التواصل مع الدعم للتجديد.".into());
    }

    if let Some(exp) = expiry {
        use chrono::NaiveDate;
        let today_str = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let exp_date = NaiveDate::parse_from_str(&exp, "%Y-%m-%d");
        let today_date = NaiveDate::parse_from_str(&today_str, "%Y-%m-%d");

        if let (Ok(e), Ok(t)) = (exp_date, today_date) {
            let diff = (e - t).num_days();
            if diff < -GRACE_DAYS {
                return Err(
                    "انتهت صلاحية ترخيصك وانتهت فترة السماح. \
                     يرجى تجديد الترخيص للمتابعة."
                        .into(),
                );
            }
        }
    }

    if status == "expired" {
        return Err(
            "انتهت صلاحية ترخيصك والنظام الآن في وضع القراءة فقط. \
             يرجى تجديد الترخيص لإجراء التغييرات."
                .into(),
        );
    }

    Ok(())
}

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
        Err(e) => Err(format!("license_check_failed: {}", e)),
        Ok(flags) => {
            if flags == 0 || (flags & flag) != 0 {
                Ok(())
            } else {
                Err(
                    "هذه الميزة غير مضمنة في خطة اشتراكك الحالية. \
                     يرجى الترقية للوصول إليها."
                        .into(),
                )
            }
        }
    }
}

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
        Err(e) => Err(format!("license_check_failed: {}", e)),
        Ok((count, max)) => {
            if count >= max {
                Err(format!(
                    "تم الوصول للحد الأقصى للفروع ({}/{}). قم بترقية خطتك لإضافة المزيد من الفروع.",
                    count, max
                ))
            } else {
                Ok(())
            }
        }
    }
}

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
        Err(e) => Err(format!("license_check_failed: {}", e)),
        Ok((count, max)) => {
            if count >= max {
                Err(format!(
                    "تم الوصول للحد الأقصى للمستخدمين ({}/{}). قم بترقية خطتك لإضافة المزيد من المستخدمين.",
                    count, max
                ))
            } else {
                Ok(())
            }
        }
    }
}
