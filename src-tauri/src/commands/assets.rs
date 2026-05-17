use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::license_guard;
use crate::commands::session_state::{AuthSessionState, resolve_identity};

const FLAG_ASSETS: i64 = 1 << 14; // 16384

// ─── Asset Category ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct AssetCategory {
    pub id: String,
    pub name: String,
    pub name_ar: Option<String>,
    pub useful_life_years: i64,
    pub depreciation_method: String,
    pub salvage_rate: f64,
}

#[derive(Debug, Deserialize)]
pub struct AssetCategoryData {
    pub name: String,
    pub name_ar: Option<String>,
    pub useful_life_years: i64,
    pub depreciation_method: String,
    pub salvage_rate: f64,
}

#[tauri::command]
pub fn get_asset_categories(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<Vec<AssetCategory>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, name_ar, useful_life_years, depreciation_method, salvage_rate
             FROM asset_categories WHERE tenant_id = ?1 AND deleted_at IS NULL
             ORDER BY name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![tenant_id], |row| {
            Ok(AssetCategory {
                id: row.get(0)?,
                name: row.get(1)?,
                name_ar: row.get(2)?,
                useful_life_years: row.get(3)?,
                depreciation_method: row.get(4)?,
                salvage_rate: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub fn create_asset_category(
    db: State<'_, Database>,
    tenant_id: String,
    data: AssetCategoryData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<AssetCategory, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    license_guard::require_active(&conn, &tenant_id)?;
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO asset_categories (id, tenant_id, name, name_ar, useful_life_years, depreciation_method, salvage_rate)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, tenant_id, data.name, data.name_ar, data.useful_life_years, data.depreciation_method, data.salvage_rate],
    )
    .map_err(|e| format!("Create category: {}", e))?;
    Ok(AssetCategory {
        id,
        name: data.name,
        name_ar: data.name_ar,
        useful_life_years: data.useful_life_years,
        depreciation_method: data.depreciation_method,
        salvage_rate: data.salvage_rate,
    })
}

// ─── Assets ─────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct AssetRow {
    pub id: String,
    pub name: String,
    pub name_ar: Option<String>,
    pub asset_code: Option<String>,
    pub serial_number: Option<String>,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub purchase_date: String,
    pub purchase_cost: i64,
    pub salvage_value: i64,
    pub useful_life_years: i64,
    pub depreciation_method: String,
    pub status: String,
    pub disposal_date: Option<String>,
    pub disposal_value: Option<i64>,
    pub notes: Option<String>,
    pub current_nbv: i64,
    pub total_depreciated: i64,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct AssetData {
    pub name: String,
    pub name_ar: Option<String>,
    pub asset_code: Option<String>,
    pub serial_number: Option<String>,
    pub category_id: Option<String>,
    pub branch_id: String,
    pub purchase_date: String,
    pub purchase_cost: i64,
    pub salvage_value: i64,
    pub useful_life_years: i64,
    pub depreciation_method: String,
    pub notes: Option<String>,
    pub created_by: Option<String>,
}

fn compute_nbv(conn: &rusqlite::Connection, asset_id: &str, purchase_cost: i64) -> i64 {
    let total: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(depreciation), 0) FROM depreciation_entries WHERE asset_id = ?1",
            params![asset_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    purchase_cost - total
}

#[tauri::command]
pub fn get_assets(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: Option<String>,
    status: Option<String>,
) -> Result<Vec<AssetRow>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.name, a.name_ar, a.asset_code, a.serial_number,
                    a.category_id, c.name,
                    a.purchase_date, a.purchase_cost, a.salvage_value,
                    a.useful_life_years, a.depreciation_method,
                    a.status, a.disposal_date, a.disposal_value, a.notes, a.created_at,
                    COALESCE(SUM(d.depreciation), 0) AS total_depreciated
             FROM assets a
             LEFT JOIN asset_categories c ON c.id = a.category_id
             LEFT JOIN depreciation_entries d ON d.asset_id = a.id
             WHERE a.tenant_id = ?1
               AND (?2 IS NULL OR a.branch_id = ?2)
               AND (?3 IS NULL OR a.status = ?3)
               AND a.deleted_at IS NULL
             GROUP BY a.id
             ORDER BY a.created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![tenant_id, branch_id, status], |row| {
            let purchase_cost: i64 = row.get(8)?;
            let total_depreciated: i64 = row.get(17)?;
            Ok(AssetRow {
                id: row.get(0)?,
                name: row.get(1)?,
                name_ar: row.get(2)?,
                asset_code: row.get(3)?,
                serial_number: row.get(4)?,
                category_id: row.get(5)?,
                category_name: row.get(6)?,
                purchase_date: row.get(7)?,
                purchase_cost,
                salvage_value: row.get(9)?,
                useful_life_years: row.get(10)?,
                depreciation_method: row.get(11)?,
                status: row.get(12)?,
                disposal_date: row.get(13)?,
                disposal_value: row.get(14)?,
                notes: row.get(15)?,
                created_at: row.get(16)?,
                current_nbv: purchase_cost - total_depreciated,
                total_depreciated,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub fn create_asset(
    db: State<'_, Database>,
    tenant_id: String,
    data: AssetData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<AssetRow, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_ASSETS)?;

    if data.purchase_cost <= 0 {
        return Err("تكلفة الشراء يجب أن تكون أكبر من صفر".into());
    }
    if data.useful_life_years < 1 {
        return Err("العمر الإنتاجي يجب أن يكون سنة على الأقل".into());
    }

    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO assets (id, tenant_id, branch_id, category_id, name, name_ar, asset_code,
                serial_number, purchase_date, purchase_cost, salvage_value, useful_life_years,
                depreciation_method, notes, created_by)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
        params![
            id, tenant_id, data.branch_id, data.category_id,
            data.name, data.name_ar, data.asset_code, data.serial_number,
            data.purchase_date, data.purchase_cost, data.salvage_value,
            data.useful_life_years, data.depreciation_method,
            data.notes, data.created_by,
        ],
    )
    .map_err(|e| format!("Create asset: {}", e))?;

    Ok(AssetRow {
        id,
        name: data.name,
        name_ar: data.name_ar,
        asset_code: data.asset_code,
        serial_number: data.serial_number,
        category_id: data.category_id,
        category_name: None,
        purchase_date: data.purchase_date,
        purchase_cost: data.purchase_cost,
        salvage_value: data.salvage_value,
        useful_life_years: data.useful_life_years,
        depreciation_method: data.depreciation_method,
        status: "active".into(),
        disposal_date: None,
        disposal_value: None,
        notes: data.notes,
        current_nbv: data.purchase_cost,
        total_depreciated: 0,
        created_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
    })
}

#[tauri::command]
pub fn update_asset(
    db: State<'_, Database>,
    tenant_id: String,
    asset_id: String,
    data: AssetData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_ASSETS)?;
    conn.execute(
        "UPDATE assets SET
            name=?1, name_ar=?2, asset_code=?3, serial_number=?4, category_id=?5,
            purchase_date=?6, purchase_cost=?7, salvage_value=?8, useful_life_years=?9,
            depreciation_method=?10, notes=?11,
            updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id=?12 AND tenant_id=?13 AND deleted_at IS NULL",
        params![
            data.name, data.name_ar, data.asset_code, data.serial_number, data.category_id,
            data.purchase_date, data.purchase_cost, data.salvage_value, data.useful_life_years,
            data.depreciation_method, data.notes, asset_id, tenant_id,
        ],
    )
    .map_err(|e| format!("Update asset: {}", e))?;
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct DisposeAssetData {
    pub disposal_date: String,
    pub disposal_value: i64,
    pub write_off: bool,
}

#[tauri::command]
pub fn dispose_asset(
    db: State<'_, Database>,
    tenant_id: String,
    asset_id: String,
    data: DisposeAssetData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    license_guard::require_active(&conn, &tenant_id)?;
    let new_status = if data.write_off { "written_off" } else { "disposed" };
    conn.execute(
        "UPDATE assets SET status=?1, disposal_date=?2, disposal_value=?3,
            updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id=?4 AND tenant_id=?5 AND deleted_at IS NULL",
        params![new_status, data.disposal_date, data.disposal_value, asset_id, tenant_id],
    )
    .map_err(|e| format!("Dispose asset: {}", e))?;
    Ok(())
}

// ─── Depreciation ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct DepreciationEntry {
    pub id: String,
    pub asset_id: String,
    pub asset_name: String,
    pub period_year: i64,
    pub period_month: i64,
    pub opening_nbv: i64,
    pub depreciation: i64,
    pub closing_nbv: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct DepreciationRunResult {
    pub processed: usize,
    pub total_depreciation: i64,
    pub entries: Vec<DepreciationEntry>,
}

#[tauri::command]
pub fn get_depreciation_entries(
    db: State<'_, Database>,
    tenant_id: String,
    asset_id: Option<String>,
    year: Option<i64>,
) -> Result<Vec<DepreciationEntry>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT d.id, d.asset_id, a.name, d.period_year, d.period_month,
                    d.opening_nbv, d.depreciation, d.closing_nbv, d.created_at
             FROM depreciation_entries d
             JOIN assets a ON a.id = d.asset_id
             WHERE a.tenant_id = ?1
               AND (?2 IS NULL OR d.asset_id = ?2)
               AND (?3 IS NULL OR d.period_year = ?3)
             ORDER BY d.period_year DESC, d.period_month DESC, a.name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![tenant_id, asset_id, year], |row| {
            Ok(DepreciationEntry {
                id: row.get(0)?,
                asset_id: row.get(1)?,
                asset_name: row.get(2)?,
                period_year: row.get(3)?,
                period_month: row.get(4)?,
                opening_nbv: row.get(5)?,
                depreciation: row.get(6)?,
                closing_nbv: row.get(7)?,
                created_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

/// Run monthly depreciation for all active assets for a given year+month.
/// Idempotent — skips assets already processed for that period.
#[tauri::command]
pub fn run_depreciation(
    db: State<'_, Database>,
    tenant_id: String,
    year: i64,
    month: i64,
    auth_session: State<'_, AuthSessionState>,
) -> Result<DepreciationRunResult, String> {
    if month < 1 || month > 12 {
        return Err("الشهر يجب أن يكون بين 1 و 12".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    license_guard::require_active(&conn, &tenant_id)?;

    // Load all active assets not yet processed for this period
    let assets: Vec<(String, String, i64, i64, i64, String)> = {
        let mut stmt = conn
            .prepare(
                "SELECT a.id, a.name, a.purchase_cost, a.salvage_value,
                        a.useful_life_years, a.depreciation_method
                 FROM assets a
                 WHERE a.tenant_id = ?1 AND a.status = 'active' AND a.deleted_at IS NULL
                   AND NOT EXISTS (
                       SELECT 1 FROM depreciation_entries d
                       WHERE d.asset_id = a.id
                         AND d.period_year = ?2
                         AND d.period_month = ?3
                   )",
            )
            .map_err(|e| e.to_string())?;
        let rows: Vec<_> = stmt.query_map(params![tenant_id, year, month], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
        rows
    };

    let mut entries = Vec::new();
    let mut total_depreciation: i64 = 0;

    for (asset_id, asset_name, purchase_cost, salvage_value, useful_life_years, method) in &assets {
        let opening_nbv = compute_nbv(&conn, asset_id, *purchase_cost);

        // Don't depreciate below salvage value
        let depreciable_base = (opening_nbv - *salvage_value).max(0);
        if depreciable_base == 0 {
            continue;
        }

        let monthly_depreciation = match method.as_str() {
            "declining_balance" => {
                // Double-declining-balance rate = 2 / useful_life / 12 months
                let rate = 2.0 / (*useful_life_years as f64) / 12.0;
                ((opening_nbv as f64 * rate).round() as i64).min(depreciable_base)
            }
            _ => {
                // Straight-line: (cost - salvage) / (useful_life * 12)
                let monthly = (*purchase_cost - *salvage_value) as f64 / (*useful_life_years as f64 * 12.0);
                (monthly.round() as i64).min(depreciable_base)
            }
        };

        if monthly_depreciation <= 0 {
            continue;
        }

        let closing_nbv = opening_nbv - monthly_depreciation;
        let entry_id = Uuid::new_v4().to_string();

        conn.execute(
            "INSERT OR IGNORE INTO depreciation_entries
                (id, tenant_id, asset_id, period_year, period_month, opening_nbv, depreciation, closing_nbv)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![entry_id, tenant_id, asset_id, year, month, opening_nbv, monthly_depreciation, closing_nbv],
        )
        .map_err(|e| format!("Insert entry: {}", e))?;

        total_depreciation += monthly_depreciation;
        entries.push(DepreciationEntry {
            id: entry_id,
            asset_id: asset_id.clone(),
            asset_name: asset_name.clone(),
            period_year: year,
            period_month: month,
            opening_nbv,
            depreciation: monthly_depreciation,
            closing_nbv,
            created_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
        });
    }

    Ok(DepreciationRunResult {
        processed: entries.len(),
        total_depreciation,
        entries,
    })
}

// ─── Asset Summary ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct AssetSummary {
    pub total_assets: i64,
    pub active_assets: i64,
    pub total_purchase_cost: i64,
    pub total_nbv: i64,
    pub total_depreciated: i64,
    pub disposed_this_year: i64,
}

#[tauri::command]
pub fn get_assets_summary(
    db: State<'_, Database>,
    tenant_id: String,
    branch_id: Option<String>,
) -> Result<AssetSummary, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let current_year = chrono::Utc::now().format("%Y").to_string();

    let row: (i64, i64, i64, i64, i64) = conn
        .query_row(
            "SELECT
                COUNT(*),
                SUM(CASE WHEN status='active' THEN 1 ELSE 0 END),
                COALESCE(SUM(purchase_cost), 0),
                COALESCE(SUM(CASE WHEN status='active' THEN purchase_cost ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status IN ('disposed','written_off')
                              AND substr(disposal_date,1,4) = ?3 THEN 1 ELSE 0 END), 0)
             FROM assets
             WHERE tenant_id = ?1
               AND (?2 IS NULL OR branch_id = ?2)
               AND deleted_at IS NULL",
            params![tenant_id, branch_id, current_year],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .map_err(|e| e.to_string())?;

    let total_depreciated: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(d.depreciation), 0)
             FROM depreciation_entries d
             JOIN assets a ON a.id = d.asset_id
             WHERE a.tenant_id = ?1
               AND (?2 IS NULL OR a.branch_id = ?2)
               AND a.deleted_at IS NULL",
            params![tenant_id, branch_id],
            |r| r.get(0),
        )
        .unwrap_or(0);

    Ok(AssetSummary {
        total_assets: row.0,
        active_assets: row.1,
        total_purchase_cost: row.2,
        total_nbv: row.3 - total_depreciated,
        total_depreciated,
        disposed_this_year: row.4,
    })
}
