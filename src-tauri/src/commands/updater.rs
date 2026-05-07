use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

/// Returned by check_for_update.
#[derive(Debug, Serialize)]
pub struct UpdateCheckResult {
    /// false when PMS_UPDATE_ENDPOINT / PMS_UPDATE_PUBKEY env vars are not set.
    pub configured: bool,
    pub available: bool,
    pub version: String,
    pub current_version: String,
    pub notes: Option<String>,
    pub pub_date: Option<String>,
}

/// Returned by install_update.
#[derive(Debug, Serialize)]
pub struct InstallResult {
    pub success: bool,
    pub message: String,
}

/// Reads update server config from environment variables:
///   PMS_UPDATE_ENDPOINT  — full URL template, e.g. https://releases.example.com/{{target}}/{{arch}}/{{current_version}}
///   PMS_UPDATE_PUBKEY    — minisign public key string
fn update_config() -> Option<(String, String)> {
    let endpoint = std::env::var("PMS_UPDATE_ENDPOINT")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())?;
    let pubkey = std::env::var("PMS_UPDATE_PUBKEY")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())?;
    Some((endpoint, pubkey))
}

/// Checks whether a new version is available from the configured update server.
/// Returns `configured: false` when env vars are not set — safe to call unconditionally.
#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<UpdateCheckResult, String> {
    let current = app.package_info().version.to_string();

    let (endpoint, pubkey) = match update_config() {
        Some(c) => c,
        None => {
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

    let endpoint_url = url::Url::parse(&endpoint)
        .map_err(|e| format!("Invalid PMS_UPDATE_ENDPOINT URL: {}", e))?;

    let updater = app
        .updater_builder()
        .endpoints(vec![endpoint_url])
        .map_err(|e: tauri_plugin_updater::Error| e.to_string())?
        .pubkey(pubkey)
        .build()
        .map_err(|e: tauri_plugin_updater::Error| e.to_string())?;

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

/// Downloads and installs the available update then restarts the app.
/// Safe to call only when `check_for_update` returned `available: true`.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<InstallResult, String> {
    let (endpoint, pubkey) = match update_config() {
        Some(c) => c,
        None => {
            return Ok(InstallResult {
                success: false,
                message: "Update server not configured (set PMS_UPDATE_ENDPOINT and PMS_UPDATE_PUBKEY)".into(),
            });
        }
    };

    let endpoint_url = url::Url::parse(&endpoint)
        .map_err(|e| format!("Invalid PMS_UPDATE_ENDPOINT URL: {}", e))?;

    let updater = app
        .updater_builder()
        .endpoints(vec![endpoint_url])
        .map_err(|e: tauri_plugin_updater::Error| e.to_string())?
        .pubkey(pubkey)
        .build()
        .map_err(|e: tauri_plugin_updater::Error| e.to_string())?;

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
            app.restart()  // fn restart(self) -> ! diverges; no return needed
        }
        None => Ok(InstallResult {
            success: false,
            message: "No update available".into(),
        }),
    }
}
