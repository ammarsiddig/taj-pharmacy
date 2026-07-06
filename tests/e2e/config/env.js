// Central environment configuration for the TAJ Pharmacy E2E harness.
// All machine-specific paths live here. Override any value with an env var
// (see the names below) if this harness is moved to another machine.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const home = os.homedir();
const HERE = path.dirname(fileURLToPath(import.meta.url)); // tests/e2e/config
const E2E_ROOT = path.dirname(HERE);                        // tests/e2e

// --- Desktop app (installed release build) ---------------------------------
// The per-machine installed exe. Confirmed on the owner's box at:
//   C:\Program Files\TAJ Pharmacy\app.exe   (product "TAJ Pharmacy")
export const APP_EXE =
  process.env.TAJ_APP_EXE ||
  path.join('C:\\', 'Program Files', 'TAJ Pharmacy', 'app.exe');

// --- Desktop SQLite database (authoritative real data) ---------------------
// Tauri identifier is com.taj.pharmacy → Roaming app data.
export const APP_DATA_DIR =
  process.env.TAJ_APP_DATA ||
  path.join(home, 'AppData', 'Roaming', 'com.taj.pharmacy');

export const DB_FILE = path.join(APP_DATA_DIR, 'pharmacy.db');
// SQLite is in WAL mode: the -wal and -shm sidecars hold uncheckpointed data
// and MUST be copied/restored together with the main file.
export const DB_SIDECARS = [
  DB_FILE,
  DB_FILE + '-wal',
  DB_FILE + '-shm',
];

// Where the harness writes its own timestamped safety backups. This is
// separate from the app's own `backups/` folder so we never touch that.
export const BACKUP_DIR =
  process.env.TAJ_E2E_BACKUP_DIR ||
  path.join(APP_DATA_DIR, 'e2e-safety-backups');

// --- WebDriver tooling ------------------------------------------------------
// msedgedriver must match the WebView2 runtime major version on this machine.
// Confirmed: WebView2 = 149.0.4022.98  →  msedgedriver 149.0.4022.98.
export const DRIVERS_DIR =
  process.env.TAJ_E2E_DRIVERS_DIR ||
  path.join(E2E_ROOT, '.drivers');

export const MSEDGEDRIVER =
  process.env.TAJ_MSEDGEDRIVER ||
  path.join(DRIVERS_DIR, 'msedgedriver.exe');

// tauri-driver is installed via `cargo install tauri-driver` → ~/.cargo/bin.
export const TAURI_DRIVER =
  process.env.TAJ_TAURI_DRIVER ||
  path.join(home, '.cargo', 'bin', 'tauri-driver.exe');

export const TAURI_DRIVER_PORT = Number(process.env.TAJ_TAURI_DRIVER_PORT || 4444);
export const NATIVE_DRIVER_PORT = Number(process.env.TAJ_NATIVE_DRIVER_PORT || 5556);

// The desktop app's real WebView2 profile (localStorage, onboarding, cached
// license/tenant context). Under automation the native driver otherwise spawns
// a FRESH, empty profile — which leaves getTenantId()/license lookups blank and
// makes the app render every premium page as feature-locked. Pointing WebView2
// at the real profile via WEBVIEW2_USER_DATA_FOLDER keeps the app in its normal,
// activated, onboarded state. The app must be closed while we borrow it.
export const WEBVIEW2_PROFILE =
  process.env.TAJ_WEBVIEW2_PROFILE ||
  path.join(home, 'AppData', 'Local', 'com.taj.pharmacy', 'EBWebView');

// --- Owner PWA (read-only Playwright suite) --------------------------------
export const PWA_URL = process.env.TAJ_PWA_URL || 'https://pharmacy.taj.systems';
export const PWA_USER = process.env.TAJ_PWA_USER || '';
export const PWA_PASS = process.env.TAJ_PWA_PASS || '';

// --- Test-data tagging ------------------------------------------------------
// Every entity this harness creates is prefixed with this + a run timestamp,
// so teardown can find and delete EXACTLY what it made and nothing else.
export const E2E_PREFIX = 'E2E_TEST_';
export function e2eTag(label = '') {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${E2E_PREFIX}${ts}${label ? '_' + label : ''}`;
}

// --- Helpers ----------------------------------------------------------------
export function assertPreconditions({ requireDriver = true } = {}) {
  const problems = [];
  if (!fs.existsSync(APP_EXE)) problems.push(`Installed exe not found: ${APP_EXE}`);
  if (!fs.existsSync(DB_FILE)) problems.push(`Desktop DB not found: ${DB_FILE}`);
  if (requireDriver && !fs.existsSync(MSEDGEDRIVER))
    problems.push(`msedgedriver not found: ${MSEDGEDRIVER} (run: npm run setup:driver)`);
  if (requireDriver && !fs.existsSync(TAURI_DRIVER))
    problems.push(`tauri-driver not found: ${TAURI_DRIVER} (run: cargo install tauri-driver)`);
  if (problems.length) {
    throw new Error('E2E precondition failure:\n  - ' + problems.join('\n  - '));
  }
}
