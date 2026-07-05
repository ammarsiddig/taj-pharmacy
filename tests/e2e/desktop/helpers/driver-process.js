// Spawns and tears down tauri-driver (which in turn spawns msedgedriver).
// tauri-driver is the WebDriver intermediary for Tauri apps; on Windows it
// proxies to Microsoft Edge WebDriver (msedgedriver) to drive the WebView2.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import {
  TAURI_DRIVER, MSEDGEDRIVER, TAURI_DRIVER_PORT, NATIVE_DRIVER_PORT, WEBVIEW2_PROFILE,
} from '../../config/env.js';

let proc = null;

export function startTauriDriver() {
  if (proc) return proc;
  const args = [
    '--port', String(TAURI_DRIVER_PORT),
    '--native-driver', MSEDGEDRIVER,
    '--native-port', String(NATIVE_DRIVER_PORT),
  ];
  console.log(`[tauri-driver] ${TAURI_DRIVER} ${args.join(' ')}`);
  // Share the app's real WebView2 profile so it stays in its normal, onboarded,
  // activated state (tenant context + license). The launched app inherits this
  // env; WebView2 reads WEBVIEW2_USER_DATA_FOLDER at init.
  const env = { ...process.env };
  if (WEBVIEW2_PROFILE && fs.existsSync(WEBVIEW2_PROFILE)) {
    env.WEBVIEW2_USER_DATA_FOLDER = WEBVIEW2_PROFILE;
    console.log(`[tauri-driver] WEBVIEW2_USER_DATA_FOLDER=${WEBVIEW2_PROFILE}`);
  }
  proc = spawn(TAURI_DRIVER, args, { stdio: ['ignore', 'inherit', 'inherit'], env });
  proc.on('exit', (code) => {
    if (code && code !== 0) console.error(`[tauri-driver] exited with code ${code}`);
    proc = null;
  });
  return proc;
}

export function stopTauriDriver() {
  if (proc) {
    try { proc.kill(); } catch { /* already gone */ }
    proc = null;
  }
}

// A short wait so tauri-driver is listening before the session connects.
export function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
