use std::sync::Mutex;

/// Holds the current user's authentication context.
/// Populated at login, cleared at logout.
#[derive(Debug, Clone)]
pub struct AuthSession {
    pub user_id: String,
    pub tenant_id: String,
    pub branch_id: String,
    #[allow(dead_code)]
    pub role_name: String,
    #[allow(dead_code)]
    pub username: String,
}

/// Thread-safe holder for AuthSession managed by Tauri.
pub struct AuthSessionState {
    inner: Mutex<Option<AuthSession>>,
}

impl AuthSessionState {
    pub fn new() -> Self {
        Self { inner: Mutex::new(None) }
    }

    pub fn set(&self, session: AuthSession) -> Result<(), String> {
        let mut guard = self.inner.lock().map_err(|e| e.to_string())?;
        *guard = Some(session);
        Ok(())
    }

    pub fn clear(&self) -> Result<(), String> {
        let mut guard = self.inner.lock().map_err(|e| e.to_string())?;
        *guard = None;
        Ok(())
    }

    pub fn get(&self) -> Result<AuthSession, String> {
        let guard = self.inner.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or_else(|| "يجب تسجيل الدخول أولاً".to_string())
    }
}

/// Resolves identity: prefers AuthSession, falls back to params.
/// If both available and mismatch, rejects (prevents IPC spoofing).
pub fn resolve_identity(
    state: &tauri::State<'_, AuthSessionState>,
    param_tenant: &str,
    param_user: &str,
    param_branch: &str,
) -> Result<(String, String, String), String> {
    if let Ok(session) = state.get() {
        if !param_tenant.is_empty() && param_tenant != "default-tenant" && param_tenant != session.tenant_id {
            return Err("هوية المستأجر غير متطابقة".into());
        }
        if !param_user.is_empty() && param_user != session.user_id {
            return Err("هوية المستخدم غير متطابقة".into());
        }
        Ok((session.tenant_id, session.user_id, session.branch_id))
    } else {
        Ok((param_tenant.to_string(), param_user.to_string(), param_branch.to_string()))
    }
}
