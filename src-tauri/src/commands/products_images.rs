use tauri::{Manager, State};
use std::fs;
use std::path::PathBuf;
use base64::Engine;
use rusqlite::params;

use crate::db::Database;
use crate::commands::session_state::{AuthSessionState, resolve_identity};

fn product_images_dir(app_handle: &tauri::AppHandle, tenant_id: &str) -> Result<PathBuf, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("فشل الحصول على مجلد بيانات التطبيق: {}", e))?
        .join("product_images")
        .join(tenant_id);
    fs::create_dir_all(&dir).map_err(|e| format!("فشل إنشاء مجلد صور المنتجات: {}", e))?;
    Ok(dir)
}

#[tauri::command]
pub fn save_product_image(
    app_handle: tauri::AppHandle,
    db: State<'_, Database>,
    tenant_id: String,
    product_id: String,
    base64_data: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<String, String> {
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("صورة base64 غير صالحة: {}", e))?;

    if bytes.len() > 1_000_000 {
        return Err("حجم الصورة يجب أن لا يتجاوز 1MB".into());
    }

    let dir = product_images_dir(&app_handle, &tenant_id)?;
    let path = dir.join(format!("{}.jpg", product_id));
    fs::write(&path, &bytes).map_err(|e| format!("فشل حفظ الصورة: {}", e))?;

    let path_str = path.to_string_lossy().to_string();

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE products SET image_path = ?1 WHERE id = ?2 AND tenant_id = ?3",
        params![path_str, product_id, tenant_id],
    ).map_err(|e| format!("فشل تحديث مسار صورة المنتج: {}", e))?;

    Ok(path_str)
}

#[tauri::command]
pub fn get_product_image(
    app_handle: tauri::AppHandle,
    tenant_id: String,
    product_id: String,
) -> Result<Option<String>, String> {
    let dir = product_images_dir(&app_handle, &tenant_id)?;
    let path = dir.join(format!("{}.jpg", product_id));
    if path.exists() {
        let bytes = fs::read(&path).map_err(|e| format!("فشل قراءة الصورة: {}", e))?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        Ok(Some(format!("data:image/jpeg;base64,{}", b64)))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn delete_product_image(
    app_handle: tauri::AppHandle,
    db: State<'_, Database>,
    tenant_id: String,
    product_id: String,
    auth_session: State<'_, AuthSessionState>,
) -> Result<(), String> {
    let (_tid, _uid, _bid) = resolve_identity(&auth_session, &tenant_id, "", "")?;
    let dir = product_images_dir(&app_handle, &tenant_id)?;
    let path = dir.join(format!("{}.jpg", product_id));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("فشل حذف الصورة: {}", e))?;
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE products SET image_path = NULL WHERE id = ?1 AND tenant_id = ?2",
        params![product_id, tenant_id],
    ).map_err(|e| format!("فشل مسح مسار صورة المنتج: {}", e))?;

    Ok(())
}
