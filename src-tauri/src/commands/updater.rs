use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Serialize)]
pub struct UpdateCheckResult {
    pub configured: bool,
    pub available: bool,
    pub version: String,
    pub current_version: String,
    pub notes: Option<String>,
    pub pub_date: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct InstallResult {
    pub success: bool,
    pub message: String,
}

// The endpoint and pubkey come from `plugins.updater` in tauri.conf.json.
// PMS_UPDATE_ENDPOINT / PMS_UPDATE_PUBKEY env vars can override at runtime
// (useful for QA pointing at a staging release JSON).
pub(crate) fn build_updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    let endpoint_override = std::env::var("PMS_UPDATE_ENDPOINT")
        .ok()
        .filter(|s| !s.trim().is_empty());
    let pubkey_override = std::env::var("PMS_UPDATE_PUBKEY")
        .ok()
        .filter(|s| !s.trim().is_empty());

    let mut builder = app.updater_builder();

    if let Some(endpoint) = endpoint_override {
        let endpoint_url = url::Url::parse(&endpoint)
            .map_err(|e| format!("رابط تحديث غير صالح: {}", e))?;
        builder = builder
            .endpoints(vec![endpoint_url])
            .map_err(|e: tauri_plugin_updater::Error| e.to_string())?;
    }

    if let Some(pubkey) = pubkey_override {
        builder = builder.pubkey(pubkey);
    }

    builder
        .build()
        .map_err(|e: tauri_plugin_updater::Error| e.to_string())
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<UpdateCheckResult, String> {
    // No auth check — backend AuthSessionState is in-memory and goes None on
    // every app restart. The frontend session lives in localStorage so users
    // think they're logged in even when the backend session is empty. Update
    // operations are app-level (signed binaries verified via pubkey), not
    // per-user, so user identity isn't needed. Matches check_pending_update.
    let current = app.package_info().version.to_string();

    let updater = build_updater(&app).map_err(|e| format!("خادم التحديث غير مكون: {}", e))?;

    match updater
        .check()
        .await
        .map_err(|e: tauri_plugin_updater::Error| e.to_string())?
    {
        Some(update) => Ok(UpdateCheckResult {
            configured: true,
            available: true,
            version: update.version.to_string(),
            current_version: update.current_version.to_string(),
            notes: update.body.clone(),
            pub_date: update.date.map(|d| d.to_string()),
        }),
        None => Ok(UpdateCheckResult {
            configured: true,
            available: false,
            version: String::new(),
            current_version: current,
            notes: None,
            pub_date: None,
        }),
    }
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<InstallResult, String> {
    // No auth check — see check_for_update above for rationale.
    let updater = build_updater(&app).map_err(|e| format!("خادم التحديث غير مكون: {}", e))?;

    match updater
        .check()
        .await
        .map_err(|e: tauri_plugin_updater::Error| e.to_string())?
    {
        Some(update) => {
            update
                .download_and_install(|_downloaded, _total| {}, || {})
                .await
                .map_err(|e: tauri_plugin_updater::Error| e.to_string())?;
            app.restart()
        }
        None => Ok(InstallResult {
            success: false,
            message: "لا يوجد تحديث متاح".into(),
        }),
    }
}
