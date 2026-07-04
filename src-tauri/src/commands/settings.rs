use base64::Engine;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::audit;
use crate::commands::cloud_sync;
use crate::commands::guard;
use crate::commands::license_guard;
use crate::commands::session_state::{AuthSessionState, resolve_identity};

// ─── Tenant / General Settings ──────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct TenantSettings {
    pub id: String,
    pub name: String,
    pub name_ar: Option<String>,
    pub license_number: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub currency_code: String,
    pub timezone: String,
    pub receipt_header: Option<String>,
    pub receipt_footer: Option<String>,
    pub print_logo: bool,
    pub logo_position: String,
    pub logo_size: String,
    pub subscription_plan: String,
    pub subscription_status: String,
    pub subscription_expiry: Option<String>,
    pub max_branches: i64,
    pub max_users: i64,
    pub feature_flags: i64,
    /// TASK-939: SDG-piasters per 1 USD (0 = exchange-rate pricing off).
    pub usd_rate_piasters: i64,
}

#[derive(Debug, Deserialize)]
pub struct TenantSettingsUpdate {
    pub name: String,
    pub name_ar: Option<String>,
    pub license_number: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub currency_code: Option<String>,
    pub timezone: Option<String>,
    pub receipt_header: Option<String>,
    pub receipt_footer: Option<String>,
    pub print_logo: Option<bool>,
    pub logo_position: Option<String>,
    pub logo_size: Option<String>,
}

#[tauri::command]
pub fn get_tenant_settings(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<TenantSettings, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, name, name_ar, license_number, phone, address,
                currency_code, timezone, receipt_header, receipt_footer,
                print_logo, subscription_plan, subscription_status,
                subscription_expiry, max_branches, max_users, feature_flags,
                logo_position, logo_size, usd_rate_piasters
         FROM tenants WHERE id = ?1 AND deleted_at IS NULL",
        params![tenant_id],
        |row| {
            Ok(TenantSettings {
                id: row.get(0)?,
                name: row.get(1)?,
                name_ar: row.get(2)?,
                license_number: row.get(3)?,
                phone: row.get(4)?,
                address: row.get(5)?,
                currency_code: row.get(6)?,
                timezone: row.get(7)?,
                receipt_header: row.get(8)?,
                receipt_footer: row.get(9)?,
                print_logo: row.get(10)?,
                subscription_plan: row.get(11)?,
                subscription_status: row.get(12)?,
                subscription_expiry: row.get(13)?,
                max_branches: row.get(14)?,
                max_users: row.get(15)?,
                feature_flags: row.get(16)?,
                logo_position: row.get(17)?,
                logo_size: row.get(18)?,
                usd_rate_piasters: row.get(19)?,
            })
        },
    )
    .map_err(|e| format!("فشل تحميل إعدادات المستأجر: {}", e))
}

#[tauri::command]
pub fn update_tenant_settings(
    db: State<'_, Database>,
    tenant_id: String,
    data: TenantSettingsUpdate,
    auth_session: State<'_, AuthSessionState>,
) -> Result<TenantSettings, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    license_guard::require_active(&conn, &tenant_id)?;
    conn.execute(
        "UPDATE tenants SET
            name = ?2, name_ar = ?3, license_number = ?4,
            phone = ?5, address = ?6,
            currency_code = COALESCE(?7, currency_code),
            timezone = COALESCE(?8, timezone),
            receipt_header = ?9, receipt_footer = ?10,
            print_logo = COALESCE(?11, print_logo),
            logo_position = COALESCE(?12, logo_position),
            logo_size = COALESCE(?13, logo_size),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1 AND deleted_at IS NULL",
        params![
            tenant_id,
            data.name,
            data.name_ar,
            data.license_number,
            data.phone,
            data.address,
            data.currency_code,
            data.timezone,
            data.receipt_header,
            data.receipt_footer,
            data.print_logo.map(|v| v as i32),
            data.logo_position,
            data.logo_size,
        ],
    )
    .map_err(|e| format!("فشل تحديث إعدادات المستأجر: {}", e))?;
    if let Err(e) = audit::log_action(&conn, &tenant_id, "system", "update", "settings", &tenant_id, None) {
        log::warn!("audit log failed after update_tenant_settings: {}", e);
    }
    drop(conn);
    get_tenant_settings(db, tenant_id)
}

/// TASK-939: set the USD→SDG exchange rate and auto-reprice products.
///
/// Units: `new_rate_piasters` = SDG-piasters per 1 USD (must be > 0).
/// sale_price / min_sale_price are SDG piasters; price_usd_cents /
/// min_price_usd_cents are USD-cent anchors.
///
/// - First activation (previous rate 0): derive each product's USD anchors from
///   its current SDG price. Prices do NOT change on activation.
/// - Rate change (previous rate > 0): for every anchored product (price_usd_cents
///   > 0), recompute the SDG sale_price/min_sale_price from the anchors at the new
///   rate. last_purchase_price (historical cost) is never touched.
///
/// Returns the number of products repriced/anchored.
#[tauri::command]
pub fn set_usd_rate(
    db: State<'_, Database>,
    tenant_id: String,
    user_id: String,
    new_rate_piasters: i64,
    auth_session: State<'_, AuthSessionState>,
) -> Result<i64, String> {
    if new_rate_piasters <= 0 {
        return Err("سعر صرف الدولار يجب أن يكون أكبر من صفر".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, "")?;
    license_guard::require_active(&conn, &tenant_id)?;
    guard::require_access(&conn, &uid, "products", guard::Level::Write)?;

    let prev_rate: i64 = conn
        .query_row(
            "SELECT usd_rate_piasters FROM tenants WHERE id = ?1 AND deleted_at IS NULL",
            params![tenant_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("فشل قراءة سعر الصرف الحالي: {}", e))?;

    conn.execute("BEGIN IMMEDIATE", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<i64, String> {
        let repriced: i64 = if prev_rate == 0 {
            // First activation: derive USD anchors from current SDG prices.
            // Prices themselves must not change here.
            //   price_usd_cents = round(sale_price * 100 / rate)
            conn.execute(
                "UPDATE products SET
                    price_usd_cents = (sale_price * 100 + ?2 / 2) / ?2,
                    min_price_usd_cents = (min_sale_price * 100 + ?2 / 2) / ?2
                 WHERE tenant_id = ?1 AND deleted_at IS NULL",
                params![tenant_id, new_rate_piasters],
            )
            .map_err(|e| format!("فشل اشتقاق مرجع الدولار: {}", e))? as i64
        } else {
            // Rate change: recompute SDG prices from anchors at the new rate.
            //   sale_price = round(price_usd_cents * rate / 100)
            // MAX(...,1) guards the rule "never write a zero/negative price from a
            // positive anchor". A zero min anchor legitimately stays a zero min price.
            conn.execute(
                "UPDATE products SET
                    sale_price = MAX(1, (price_usd_cents * ?2 + 50) / 100),
                    min_sale_price = CASE
                        WHEN min_price_usd_cents > 0
                        THEN MAX(1, (min_price_usd_cents * ?2 + 50) / 100)
                        ELSE 0 END,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE tenant_id = ?1 AND deleted_at IS NULL AND price_usd_cents > 0",
                params![tenant_id, new_rate_piasters],
            )
            .map_err(|e| format!("فشل إعادة تسعير المنتجات: {}", e))? as i64
        };

        conn.execute(
            "UPDATE tenants SET usd_rate_piasters = ?2,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1 AND deleted_at IS NULL",
            params![tenant_id, new_rate_piasters],
        )
        .map_err(|e| format!("فشل تحديث سعر الصرف: {}", e))?;

        let changes = format!(
            "{{\"prev_rate_piasters\":{},\"new_rate_piasters\":{},\"products_repriced\":{}}}",
            prev_rate, new_rate_piasters, repriced
        );
        audit::log_action(
            &conn, &tenant_id, &uid, "update", "usd_rate", &tenant_id, Some(&changes),
        )?;

        Ok(repriced)
    })();

    match result {
        Ok(repriced) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            if let Err(e) =
                cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "usd_rate_changed")
            {
                log::warn!("cloud sync enqueue failed after set_usd_rate: {}", e);
            }
            Ok(repriced)
        }
        Err(err) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(err)
        }
    }
}

// ─── Pharmacy Logo ──────────────────────────────────────────────────────────

fn logo_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("فشل الحصول على مجلد بيانات التطبيق: {}", e))?
        .join("logos");
    fs::create_dir_all(&dir).map_err(|e| format!("فشل إنشاء مجلد الشعارات: {}", e))?;
    Ok(dir)
}

#[tauri::command]
pub fn save_pharmacy_logo(
    app_handle: tauri::AppHandle,
    tenant_id: String,
    base64_data: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<String, String> {
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("صورة base64 غير صالحة: {}", e))?;

    if bytes.len() > 500_000 {
        return Err("حجم الشعار يجب أن لا يتجاوز 500KB".into());
    }

    let dir = logo_dir(&app_handle)?;
    let path = dir.join(format!("{}.png", tenant_id));
    fs::write(&path, &bytes).map_err(|e| format!("فشل حفظ الشعار: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_pharmacy_logo(
    app_handle: tauri::AppHandle,
    tenant_id: String,
) -> Result<Option<String>, String> {
    let dir = logo_dir(&app_handle)?;
    let path = dir.join(format!("{}.png", tenant_id));
    if path.exists() {
        let bytes = fs::read(&path).map_err(|e| format!("فشل قراءة الشعار: {}", e))?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        Ok(Some(format!("data:image/png;base64,{}", b64)))
    } else {
        Ok(None)
    }
}

// ─── Branches CRUD ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct BranchRow {
    pub id: String,
    pub name: String,
    pub name_ar: Option<String>,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub is_main: bool,
    pub is_active: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct BranchData {
    pub name: String,
    pub name_ar: Option<String>,
    pub address: Option<String>,
    pub phone: Option<String>,
}

#[tauri::command]
pub fn get_branches_full(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<Vec<BranchRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, name_ar, address, phone, is_main, is_active, created_at
             FROM branches WHERE tenant_id = ?1 AND deleted_at IS NULL
             ORDER BY is_main DESC, name ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![tenant_id], |row| {
            Ok(BranchRow {
                id: row.get(0)?,
                name: row.get(1)?,
                name_ar: row.get(2)?,
                address: row.get(3)?,
                phone: row.get(4)?,
                is_main: row.get(5)?,
                is_active: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub fn create_branch(
    db: State<'_, Database>,
    tenant_id: String,
    data: BranchData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<BranchRow, String> {
    if data.name.trim().is_empty() {
        return Err("اسم الفرع مطلوب".into());
    }
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::check_branch_limit(&conn, &tenant_id)?;
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO branches (id, tenant_id, name, name_ar, address, phone, is_main, is_active)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 1)",
        params![id, tenant_id, data.name, data.name_ar, data.address, data.phone],
    )
    .map_err(|e| format!("فشل إنشاء الفرع: {}", e))?;
    if let Err(e) = audit::log_action(&conn, &tenant_id, "system", "create", "branch", &id, None) {
        log::warn!("audit log failed after create_branch: {}", e);
    }
    drop(conn);
    let branches = get_branches_full(db, tenant_id)?;
    branches.into_iter().find(|b| b.id == id).ok_or("فشل جلب الفرع المنشأ".into())
}

#[tauri::command]
pub fn update_branch(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    data: BranchData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    if data.name.trim().is_empty() {
        return Err("اسم الفرع مطلوب".into());
    }
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", &branch_id)?;
    license_guard::require_active(&conn, &tenant_id)?;
    conn.execute(
        "UPDATE branches SET name = ?3, name_ar = ?4, address = ?5, phone = ?6,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?2 AND tenant_id = ?1 AND deleted_at IS NULL",
        params![tenant_id, branch_id, data.name, data.name_ar, data.address, data.phone],
    )
    .map_err(|e| format!("فشل تحديث الفرع: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn toggle_branch_active(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", &branch_id)?;
    license_guard::require_active(&conn, &tenant_id)?;
    // Prevent deactivating the main branch
    let is_main: bool = conn
        .query_row(
            "SELECT is_main FROM branches WHERE id = ?1 AND tenant_id = ?2",
            params![branch_id, tenant_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if is_main {
        return Err("لا يمكن تعطيل الفرع الرئيسي".into());
    }
    conn.execute(
        "UPDATE branches SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1 AND tenant_id = ?2 AND deleted_at IS NULL",
        params![branch_id, tenant_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Notification Settings ──────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct NotificationSettingRow {
    pub id: String,
    pub notification_type: String,
    pub is_enabled: bool,
    pub threshold_value: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct NotificationSettingUpdate {
    pub notification_type: String,
    pub is_enabled: bool,
    pub threshold_value: Option<i64>,
}

#[tauri::command]
pub fn get_notification_settings(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<Vec<NotificationSettingRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Ensure all notification types have a row (upsert defaults)
    let types = [
        ("low_stock", 1, None::<i64>),
        ("out_of_stock", 1, None),
        ("expiring_soon", 1, Some(30)),
        ("expired", 1, None),
        ("supplier_overdue", 1, Some(30)),
        ("credit_limit_exceeded", 1, None),
        ("large_expense", 0, Some(100000)), // 1000 SDG in piasters
        ("session_open_long", 1, Some(12)),
        ("stock_take_overdue", 1, Some(30)),
        ("backup_overdue", 1, Some(7)),
    ];
    for (ntype, enabled, threshold) in &types {
        conn.execute(
            "INSERT OR IGNORE INTO notification_settings (id, tenant_id, notification_type, is_enabled, threshold_value)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![Uuid::new_v4().to_string(), tenant_id, ntype, enabled, threshold],
        )
        .ok();
    }

    let mut stmt = conn
        .prepare(
            "SELECT id, notification_type, is_enabled, threshold_value
             FROM notification_settings WHERE tenant_id = ?1
             ORDER BY notification_type ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![tenant_id], |row| {
            Ok(NotificationSettingRow {
                id: row.get(0)?,
                notification_type: row.get(1)?,
                is_enabled: row.get(2)?,
                threshold_value: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub fn update_notification_setting(
    db: State<'_, Database>,
    tenant_id: String,
    data: NotificationSettingUpdate,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    license_guard::require_active(&conn, &tenant_id)?;
    let changed = conn
        .execute(
            "UPDATE notification_settings SET
                is_enabled = ?3, threshold_value = ?4,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE tenant_id = ?1 AND notification_type = ?2",
            params![tenant_id, data.notification_type, data.is_enabled as i32, data.threshold_value],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        // Insert if not exists
        conn.execute(
            "INSERT INTO notification_settings (id, tenant_id, notification_type, is_enabled, threshold_value)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                Uuid::new_v4().to_string(),
                tenant_id,
                data.notification_type,
                data.is_enabled as i32,
                data.threshold_value
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}


// Re-export backup commands from sub-module
pub use crate::commands::settings_backup::*;

// ─── Audit Log ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct AuditLogRow {
    pub id: String,
    pub user_id: String,
    pub user_name: Option<String>,
    pub action: String,
    pub entity_type: String,
    pub entity_id: String,
    pub changes_json: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct AuditLogEntry {
    pub action: String,
    pub entity_type: String,
    pub entity_id: String,
    pub changes_json: Option<String>,
}

#[tauri::command]
pub fn write_audit_log(
    db: State<'_, Database>,
    tenant_id: String,
    user_id: String,
    entry: AuditLogEntry,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, &user_id, "")?;
    license_guard::require_active(&conn, &tenant_id)?;
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO audit_log (id, tenant_id, user_id, action, entity_type, entity_id, changes_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, tenant_id, user_id, entry.action, entry.entity_type, entry.entity_id, entry.changes_json],
    )
    .map_err(|e| format!("فشل كتابة سجل التدقيق: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn get_audit_log(
    db: State<'_, Database>,
    tenant_id: String,
    entity_type: Option<String>,
    entity_id: Option<String>,
    user_id: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<AuditLogRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(100);

    let sql = format!(
        "SELECT a.id, a.user_id, u.full_name, a.action, a.entity_type, a.entity_id,
                a.changes_json, a.created_at
         FROM audit_log a
         LEFT JOIN users u ON a.user_id = u.id
         WHERE a.tenant_id = ?1
           AND (?2 IS NULL OR a.entity_type = ?2)
           AND (?3 IS NULL OR a.entity_id = ?3)
           AND (?4 IS NULL OR a.user_id = ?4)
         ORDER BY a.created_at DESC
         LIMIT {}",
        lim
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![tenant_id, entity_type, entity_id, user_id], |row| {
            Ok(AuditLogRow {
                id: row.get(0)?,
                user_id: row.get(1)?,
                user_name: row.get(2)?,
                action: row.get(3)?,
                entity_type: row.get(4)?,
                entity_id: row.get(5)?,
                changes_json: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub fn get_permissions_upgrade_banner(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<bool, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let acknowledged: i64 = conn
        .query_row(
            "SELECT COALESCE(permissions_upgrade_acknowledged_v1, 0) FROM pharmacy_configs WHERE tenant_id = ?1",
            rusqlite::params![tenant_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    Ok(acknowledged == 0)
}

#[tauri::command]
pub fn dismiss_permissions_upgrade_banner(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE pharmacy_configs SET permissions_upgrade_acknowledged_v1 = 1 WHERE tenant_id = ?1",
        rusqlite::params![tenant_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}


