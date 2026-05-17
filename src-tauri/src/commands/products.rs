use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::State;
use rusqlite::params;
use uuid::Uuid;

use crate::db::Database;
use crate::commands::cloud_sync;
use crate::commands::license_guard;
use crate::commands::session_state::{AuthSessionState, resolve_identity};

const FLAG_PRODUCTS: i64 = 2;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Product {
    pub id: String,
    pub tenant_id: String,
    pub barcode: Option<String>,
    pub trade_name: String,
    pub trade_name_ar: Option<String>,
    pub generic_name: Option<String>,
    pub generic_name_ar: Option<String>,
    pub category: Option<String>,
    pub unit: String,
    pub unit_id: Option<String>,
    pub enable_sub_units: bool,
    pub sub_unit_id: Option<String>,
    pub sub_unit_ratio: Option<i64>,
    pub sale_price: i64,
    pub min_sale_price: i64,
    pub last_purchase_price: i64,
    pub min_stock_level: i64,
    pub is_active: bool,
    pub notes: Option<String>,
    pub manufacturer: Option<String>,
    pub active_ingredient: Option<String>,
    pub dosage_form: Option<String>,
    pub storage_conditions: Option<String>,
    pub is_prescription: bool,
    pub total_stock: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct ProductData {
    pub trade_name: String,
    pub trade_name_ar: Option<String>,
    pub generic_name: Option<String>,
    pub generic_name_ar: Option<String>,
    pub barcode: Option<String>,
    pub category: Option<String>,
    pub unit: Option<String>,
    pub unit_id: Option<String>,
    pub enable_sub_units: Option<bool>,
    pub sub_unit_id: Option<String>,
    pub sub_unit_ratio: Option<i64>,
    pub sale_price: i64,
    pub min_sale_price: i64,
    pub min_stock_level: i64,
    pub notes: Option<String>,
    pub manufacturer: Option<String>,
    pub active_ingredient: Option<String>,
    pub dosage_form: Option<String>,
    pub storage_conditions: Option<String>,
    pub is_prescription: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ProductImportRowData {
    pub trade_name: String,
    pub trade_name_ar: Option<String>,
    pub generic_name: Option<String>,
    pub generic_name_ar: Option<String>,
    pub barcode: Option<String>,
    pub category: Option<String>,
    pub unit: Option<String>,
    pub sale_price: i64,
    pub min_sale_price: Option<i64>,
    pub last_purchase_price: Option<i64>,
    pub min_stock_level: Option<i64>,
    pub notes: Option<String>,
    pub manufacturer: Option<String>,
    pub active_ingredient: Option<String>,
    pub dosage_form: Option<String>,
    pub storage_conditions: Option<String>,
    pub is_prescription: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ProductImportData {
    pub rows: Vec<ProductImportRowData>,
    pub update_existing: bool,
    pub user_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ProductImportResult {
    pub imported: i64,
    pub updated: i64,
    pub skipped: i64,
    pub errors: i64,
}

fn normalize_optional_text(value: &Option<String>) -> Option<String> {
    value
        .as_ref()
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

#[tauri::command]
pub fn get_products(
    db: State<'_, Database>,
    tenant_id: String,
    search: Option<String>,
    category: Option<String>,
    is_active: Option<bool>,
) -> Result<Vec<Product>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT p.id, p.tenant_id, p.barcode, p.trade_name, p.trade_name_ar,
            p.generic_name, p.generic_name_ar, p.category, p.unit,
            p.unit_id, p.enable_sub_units, p.sub_unit_id, p.sub_unit_ratio,
            p.sale_price, p.min_sale_price, p.last_purchase_price,
            p.min_stock_level, p.is_active, p.notes,
            p.manufacturer, p.active_ingredient, p.dosage_form,
            p.storage_conditions, p.is_prescription,
            p.created_at, p.updated_at,
                (SELECT COALESCE(SUM(b.quantity_current), 0)
                 FROM batches b
                 WHERE b.product_id = p.id
                   AND b.status = 'active'
                   AND b.deleted_at IS NULL
                ) AS total_stock
         FROM products p
         WHERE p.tenant_id = ?1 AND p.deleted_at IS NULL",
    );

    let mut param_idx = 2;
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(tenant_id.clone())];

    if let Some(ref s) = search {
        sql.push_str(&format!(
            " AND (trade_name LIKE ?{idx} OR trade_name_ar LIKE ?{idx}
                   OR barcode LIKE ?{idx} OR generic_name LIKE ?{idx}
                   OR manufacturer LIKE ?{idx} OR active_ingredient LIKE ?{idx})",
            idx = param_idx
        ));
        param_values.push(Box::new(format!("%{}%", s)));
        param_idx += 1;
    }

    if let Some(ref cat) = category {
        sql.push_str(&format!(" AND category = ?{}", param_idx));
        param_values.push(Box::new(cat.clone()));
        param_idx += 1;
    }

    if let Some(active) = is_active {
        sql.push_str(&format!(" AND is_active = ?{}", param_idx));
        param_values.push(Box::new(active as i32));
    }

    sql.push_str(" ORDER BY trade_name ASC");

    let params_refs: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let products = stmt
        .query_map(params_refs.as_slice(), |row| {
            Ok(Product {
                id: row.get(0)?,
                tenant_id: row.get(1)?,
                barcode: row.get(2)?,
                trade_name: row.get(3)?,
                trade_name_ar: row.get(4)?,
                generic_name: row.get(5)?,
                generic_name_ar: row.get(6)?,
                category: row.get(7)?,
                unit: row.get(8)?,
                unit_id: row.get(9)?,
                enable_sub_units: row.get(10)?,
                sub_unit_id: row.get(11)?,
                sub_unit_ratio: row.get(12)?,
                sale_price: row.get(13)?,
                min_sale_price: row.get(14)?,
                last_purchase_price: row.get(15)?,
                min_stock_level: row.get(16)?,
                is_active: row.get(17)?,
                notes: row.get(18)?,
                manufacturer: row.get(19)?,
                active_ingredient: row.get(20)?,
                dosage_form: row.get(21)?,
                storage_conditions: row.get(22)?,
                is_prescription: row.get(23)?,
                total_stock: Some(row.get(26)?),
                created_at: row.get(24)?,
                updated_at: row.get(25)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(products)
}

#[tauri::command]
pub fn get_product(
    db: State<'_, Database>,
    tenant_id: String,
    product_id: String,
) -> Result<Product, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT p.id, p.tenant_id, p.barcode, p.trade_name, p.trade_name_ar,
            p.generic_name, p.generic_name_ar, p.category, p.unit,
            p.unit_id, p.enable_sub_units, p.sub_unit_id, p.sub_unit_ratio,
            p.sale_price, p.min_sale_price, p.last_purchase_price,
            p.min_stock_level, p.is_active, p.notes,
            p.manufacturer, p.active_ingredient, p.dosage_form,
            p.storage_conditions, p.is_prescription,
            p.created_at, p.updated_at,
                (SELECT COALESCE(SUM(b.quantity_current), 0)
                 FROM batches b
                 WHERE b.product_id = p.id
                   AND b.status = 'active'
                   AND b.deleted_at IS NULL
                ) AS total_stock
         FROM products p
         WHERE p.tenant_id = ?1 AND p.id = ?2 AND p.deleted_at IS NULL",
        params![tenant_id, product_id],
        |row| {
            Ok(Product {
                id: row.get(0)?,
                tenant_id: row.get(1)?,
                barcode: row.get(2)?,
                trade_name: row.get(3)?,
                trade_name_ar: row.get(4)?,
                generic_name: row.get(5)?,
                generic_name_ar: row.get(6)?,
                category: row.get(7)?,
                unit: row.get(8)?,
                unit_id: row.get(9)?,
                enable_sub_units: row.get(10)?,
                sub_unit_id: row.get(11)?,
                sub_unit_ratio: row.get(12)?,
                sale_price: row.get(13)?,
                min_sale_price: row.get(14)?,
                last_purchase_price: row.get(15)?,
                min_stock_level: row.get(16)?,
                is_active: row.get(17)?,
                notes: row.get(18)?,
                manufacturer: row.get(19)?,
                active_ingredient: row.get(20)?,
                dosage_form: row.get(21)?,
                storage_conditions: row.get(22)?,
                is_prescription: row.get(23)?,
                total_stock: Some(row.get(26)?),
                created_at: row.get(24)?,
                updated_at: row.get(25)?,
            })
        },
    )
    .map_err(|_| "المنتج غير موجود".into())
}

#[tauri::command]
pub fn create_product(
    db: State<'_, Database>,
    tenant_id: String,
    data: ProductData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<Product, String> {
    if data.trade_name.trim().is_empty() {
        return Err("اسم الدواء مطلوب".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_PRODUCTS)?;

    // Check barcode uniqueness
    if let Some(ref barcode) = data.barcode {
        if !barcode.is_empty() {
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM products WHERE tenant_id = ?1 AND barcode = ?2 AND deleted_at IS NULL)",
                    params![tenant_id, barcode],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;
            if exists {
                return Err("الباركود مستخدم مسبقاً".into());
            }
        }
    }

    let id = Uuid::new_v4().to_string();

    let (unit_id_value, unit_name): (Option<String>, String) = if let Some(ref unit_id) = data.unit_id {
        let name: String = conn
            .query_row(
                "SELECT name FROM unit_measures WHERE tenant_id = ?1 AND id = ?2 AND deleted_at IS NULL AND is_active = 1",
                params![tenant_id, unit_id],
                |row| row.get(0),
            )
            .map_err(|_| "وحدة البيع غير موجودة".to_string())?;
        (Some(unit_id.clone()), name)
    } else if let Some(ref unit_name_raw) = data.unit {
        let trimmed = unit_name_raw.trim().to_string();
        if trimmed.is_empty() {
            return Err("وحدة البيع مطلوبة".into());
        }
        let maybe_unit_id: Option<String> = conn
            .query_row(
                "SELECT id FROM unit_measures WHERE tenant_id = ?1 AND name = ?2 AND deleted_at IS NULL LIMIT 1",
                params![tenant_id, trimmed],
                |row| row.get(0),
            )
            .ok();
        (maybe_unit_id, trimmed)
    } else {
        return Err("وحدة البيع مطلوبة".into());
    };

    let enable_sub_units = data.enable_sub_units.unwrap_or(false);
    if enable_sub_units {
        if data.sub_unit_id.is_none() || data.sub_unit_ratio.unwrap_or(0) <= 0 {
            return Err("عند تفعيل الوحدات الفرعية يجب تحديد الوحدة الفرعية والنسبة".into());
        }
    }

    conn.execute(
        "INSERT INTO products (id, tenant_id, barcode, trade_name, trade_name_ar,
                              generic_name, generic_name_ar, category, unit, unit_id,
                              enable_sub_units, sub_unit_id, sub_unit_ratio,
                              sale_price, min_sale_price, min_stock_level, notes,
                              manufacturer, active_ingredient, dosage_form,
                              storage_conditions, is_prescription)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)",
        params![
            id, tenant_id,
            data.barcode, data.trade_name, data.trade_name_ar,
            data.generic_name, data.generic_name_ar, data.category, unit_name, unit_id_value,
            enable_sub_units as i32,
            if enable_sub_units { data.sub_unit_id } else { None },
            if enable_sub_units { data.sub_unit_ratio } else { None },
            data.sale_price, data.min_sale_price, data.min_stock_level, data.notes,
            data.manufacturer, data.active_ingredient, data.dosage_form,
            data.storage_conditions, data.is_prescription.unwrap_or(false) as i32,
        ],
    )
    .map_err(|e| format!("فشل في إضافة المنتج: {}", e))?;

    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "product_created") {
        log::warn!("cloud sync enqueue failed after create_product: {}", e);
    }

    drop(conn);
    get_product(db, tenant_id, id)
}

#[tauri::command]
pub fn update_product(
    db: State<'_, Database>,
    tenant_id: String,
    product_id: String,
    data: ProductData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<Product, String> {
    if data.trade_name.trim().is_empty() {
        return Err("اسم الدواء مطلوب".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_PRODUCTS)?;

    // Check barcode uniqueness (exclude self)
    if let Some(ref barcode) = data.barcode {
        if !barcode.is_empty() {
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM products WHERE tenant_id = ?1 AND barcode = ?2 AND id != ?3 AND deleted_at IS NULL)",
                    params![tenant_id, barcode, product_id],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;
            if exists {
                return Err("الباركود مستخدم مسبقاً".into());
            }
        }
    }

    let (unit_id_value, unit_name): (Option<String>, String) = if let Some(ref unit_id) = data.unit_id {
        let name: String = conn
            .query_row(
                "SELECT name FROM unit_measures WHERE tenant_id = ?1 AND id = ?2 AND deleted_at IS NULL AND is_active = 1",
                params![tenant_id, unit_id],
                |row| row.get(0),
            )
            .map_err(|_| "وحدة البيع غير موجودة".to_string())?;
        (Some(unit_id.clone()), name)
    } else if let Some(ref unit_name_raw) = data.unit {
        let trimmed = unit_name_raw.trim().to_string();
        if trimmed.is_empty() {
            return Err("وحدة البيع مطلوبة".into());
        }
        let maybe_unit_id: Option<String> = conn
            .query_row(
                "SELECT id FROM unit_measures WHERE tenant_id = ?1 AND name = ?2 AND deleted_at IS NULL LIMIT 1",
                params![tenant_id, trimmed],
                |row| row.get(0),
            )
            .ok();
        (maybe_unit_id, trimmed)
    } else {
        return Err("وحدة البيع مطلوبة".into());
    };

    let enable_sub_units = data.enable_sub_units.unwrap_or(false);
    if enable_sub_units {
        if data.sub_unit_id.is_none() || data.sub_unit_ratio.unwrap_or(0) <= 0 {
            return Err("عند تفعيل الوحدات الفرعية يجب تحديد الوحدة الفرعية والنسبة".into());
        }
    }

    conn.execute(
        "UPDATE products SET
            barcode = ?3, trade_name = ?4, trade_name_ar = ?5,
            generic_name = ?6, generic_name_ar = ?7, category = ?8, unit = ?9, unit_id = ?10,
            enable_sub_units = ?11, sub_unit_id = ?12, sub_unit_ratio = ?13,
            sale_price = ?14, min_sale_price = ?15, min_stock_level = ?16,
            notes = ?17,
            manufacturer = ?18, active_ingredient = ?19, dosage_form = ?20,
            storage_conditions = ?21, is_prescription = ?22,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE tenant_id = ?1 AND id = ?2 AND deleted_at IS NULL",
        params![
            tenant_id, product_id,
            data.barcode, data.trade_name, data.trade_name_ar,
            data.generic_name, data.generic_name_ar, data.category, unit_name, unit_id_value,
            enable_sub_units as i32,
            if enable_sub_units { data.sub_unit_id } else { None },
            if enable_sub_units { data.sub_unit_ratio } else { None },
            data.sale_price, data.min_sale_price, data.min_stock_level, data.notes,
            data.manufacturer, data.active_ingredient, data.dosage_form,
            data.storage_conditions, data.is_prescription.unwrap_or(false) as i32,
        ],
    )
    .map_err(|e| format!("فشل في تحديث المنتج: {}", e))?;

    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "product_updated") {
        log::warn!("cloud sync enqueue failed after update_product: {}", e);
    }

    drop(conn);
    get_product(db, tenant_id, product_id)
}

#[tauri::command]
pub fn import_products(
    db: State<'_, Database>,
    tenant_id: String,
    data: ProductImportData,
    auth_session: State<'_, AuthSessionState>,
) -> Result<ProductImportResult, String> {
    if data.rows.is_empty() {
        return Err("لا توجد صفوف صالحة للاستيراد".into());
    }

    if data.rows.len() > 50_000 {
        return Err("الحد الأقصى للاستيراد هو 50000 صف".into());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_PRODUCTS)?;
    conn.execute("BEGIN IMMEDIATE", []).map_err(|e| e.to_string())?;

    let result = (|| -> Result<ProductImportResult, String> {
        let mut imported = 0_i64;
        let mut updated = 0_i64;
        let mut skipped = 0_i64;

        for row in &data.rows {
            let trade_name = row.trade_name.trim();
            if trade_name.is_empty() {
                return Err("اسم المنتج مطلوب".into());
            }
            if row.sale_price < 0 {
                return Err("سعر البيع غير صالح".into());
            }

            let barcode = normalize_optional_text(&row.barcode);
            let existing_id = if let Some(ref barcode_value) = barcode {
                conn.query_row(
                    "SELECT id FROM products
                     WHERE tenant_id = ?1 AND barcode = ?2 AND deleted_at IS NULL
                     LIMIT 1",
                    params![tenant_id, barcode_value],
                    |row| row.get::<_, String>(0),
                )
                .ok()
            } else {
                None
            };

            let unit = normalize_optional_text(&row.unit).unwrap_or_else(|| "box".to_string());
            let trade_name_ar = normalize_optional_text(&row.trade_name_ar);
            let generic_name = normalize_optional_text(&row.generic_name);
            let generic_name_ar = normalize_optional_text(&row.generic_name_ar);
            let category = normalize_optional_text(&row.category);
            let notes = normalize_optional_text(&row.notes);
            let manufacturer = normalize_optional_text(&row.manufacturer);
            let active_ingredient = normalize_optional_text(&row.active_ingredient);
            let dosage_form = normalize_optional_text(&row.dosage_form);
            let storage_conditions = normalize_optional_text(&row.storage_conditions);
            let is_prescription = row.is_prescription.unwrap_or(false);
            let min_sale_price = row.min_sale_price.unwrap_or(0).max(0);
            let last_purchase_price = row.last_purchase_price.unwrap_or(0).max(0);
            let min_stock_level = row.min_stock_level.unwrap_or(0).max(0);

            if let Some(product_id) = existing_id {
                if data.update_existing {
                    conn.execute(
                        "UPDATE products SET
                            barcode = ?3,
                            trade_name = ?4,
                            trade_name_ar = ?5,
                            generic_name = ?6,
                            generic_name_ar = ?7,
                            category = ?8,
                            unit = ?9,
                            sale_price = ?10,
                            min_sale_price = ?11,
                            last_purchase_price = ?12,
                            min_stock_level = ?13,
                            notes = ?14,
                            manufacturer = ?15,
                            active_ingredient = ?16,
                            dosage_form = ?17,
                            storage_conditions = ?18,
                            is_prescription = ?19,
                            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                         WHERE tenant_id = ?1 AND id = ?2 AND deleted_at IS NULL",
                        params![
                            tenant_id,
                            product_id,
                            barcode,
                            trade_name,
                            trade_name_ar,
                            generic_name,
                            generic_name_ar,
                            category,
                            unit,
                            row.sale_price,
                            min_sale_price,
                            last_purchase_price,
                            min_stock_level,
                            notes,
                            manufacturer,
                            active_ingredient,
                            dosage_form,
                            storage_conditions,
                            is_prescription as i32,
                        ],
                    )
                    .map_err(|e| format!("فشل تحديث المنتج: {}", e))?;
                    updated += 1;
                } else {
                    skipped += 1;
                }
            } else {
                conn.execute(
                    "INSERT INTO products (
                        id, tenant_id, barcode, trade_name, trade_name_ar,
                        generic_name, generic_name_ar, category, unit,
                        sale_price, min_sale_price, last_purchase_price,
                        min_stock_level, notes,
                        manufacturer, active_ingredient, dosage_form,
                        storage_conditions, is_prescription
                     ) VALUES (
                        ?1, ?2, ?3, ?4, ?5,
                        ?6, ?7, ?8, ?9,
                        ?10, ?11, ?12,
                        ?13, ?14,
                        ?15, ?16, ?17, ?18, ?19
                     )",
                    params![
                        Uuid::new_v4().to_string(),
                        tenant_id,
                        barcode,
                        trade_name,
                        trade_name_ar,
                        generic_name,
                        generic_name_ar,
                        category,
                        unit,
                        row.sale_price,
                        min_sale_price,
                        last_purchase_price,
                        min_stock_level,
                        notes,
                        manufacturer,
                        active_ingredient,
                        dosage_form,
                        storage_conditions,
                        is_prescription as i32,
                    ],
                )
                .map_err(|e| format!("فشل إضافة المنتج: {}", e))?;
                imported += 1;
            }
        }

        if let Some(user_id) = normalize_optional_text(&data.user_id) {
            conn.execute(
                "INSERT INTO audit_log (id, tenant_id, user_id, action, entity_type, entity_id, changes_json)
                 VALUES (?1, ?2, ?3, 'import', 'products', 'bulk', ?4)",
                params![
                    Uuid::new_v4().to_string(),
                    tenant_id,
                    user_id,
                    json!({
                        "imported": imported,
                        "updated": updated,
                        "skipped": skipped,
                        "errors": 0
                    }).to_string(),
                ],
            )
            .map_err(|e| format!("فشل تسجيل عملية الاستيراد: {}", e))?;
        }

        Ok(ProductImportResult {
            imported,
            updated,
            skipped,
            errors: 0,
        })
    })();

    match result {
        Ok(summary) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            Ok(summary)
        }
        Err(err) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(err)
        }
    }
}

#[tauri::command]
pub fn toggle_product_active(
    db: State<'_, Database>,
    tenant_id: String,
    product_id: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<Product, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;

    conn.execute(
        "UPDATE products SET
            is_active = NOT is_active,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE tenant_id = ?1 AND id = ?2 AND deleted_at IS NULL",
        params![tenant_id, product_id],
    )
    .map_err(|e| format!("فشل في تحديث حالة المنتج: {}", e))?;

    if let Err(e) = cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "product_toggled") {
        log::warn!("cloud sync enqueue failed after toggle_product_active: {}", e);
    }

    drop(conn);
    get_product(db, tenant_id, product_id)
}

#[tauri::command]
pub fn get_product_categories(
    db: State<'_, Database>,
    tenant_id: String,
) -> Result<Vec<String>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT category FROM products
             WHERE tenant_id = ?1 AND deleted_at IS NULL AND category IS NOT NULL AND category != ''
             ORDER BY category",
        )
        .map_err(|e| e.to_string())?;

    let categories = stmt
        .query_map(params![tenant_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(categories)
}

