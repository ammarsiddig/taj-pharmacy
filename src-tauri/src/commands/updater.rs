use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

const DEFAULT_PUBKEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDg2MkFGNDE5RTU0NjI0QzEKUldUQkpFYmxHZlFxaGhsb3QwRkM1c01qSjlIcExVeFhnY2l1VldDYlU1Q0c2K1BpZHM2QnNkaHUK";
const DEFAULT_ENDPOINT: &str = "https://github.com/ammarsiddig/pms-pharmacy-v4/releases/latest/download/latest.json";

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

pub(crate) fn build_updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    let endpoint = std::env::var("PMS_UPDATE_ENDPOINT")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_ENDPOINT.into());
    let pubkey = std::env::var("PMS_UPDATE_PUBKEY")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_PUBKEY.into());

    let endpoint_url = url::Url::parse(&endpoint)
        .map_err(|e| format!("رابط تحديث غير صالح: {}", e))?;

    app.updater_builder()
        .endpoints(vec![endpoint_url])
        .map_err(|e: tauri_plugin_updater::Error| e.to_string())?
        .pubkey(pubkey)
        .build()
        .map_err(|e: tauri_plugin_updater::Error| e.to_string())
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<UpdateCheckResult, String> {
    let current = app.package_info().version.to_string();

    let updater = match build_updater(&app) {
        Ok(u) => u,
        Err(_) => {
            return Ok(UpdateCheckResult {
                configured: false,
                available: false,
                version: String::new(),
                current_version: current,
                notes: None,
                pub_date: None,
            });
        }
    };

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
    let updater = match build_updater(&app) {
        Ok(u) => u,
        Err(e) => {
            return Ok(InstallResult {
                success: false,
                message: format!("خادم التحديث غير مكون: {}", e),
            });
        }
    };

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
