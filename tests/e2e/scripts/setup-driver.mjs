// Downloads the msedgedriver that matches this machine's WebView2 runtime and
// places it in tests/e2e/.drivers/. The desktop suites need a msedgedriver whose
// version matches the installed WebView2 (the WebView2 IS the browser Tauri
// drives). Re-run this after a WebView2 update.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { DRIVERS_DIR, MSEDGEDRIVER } from '../config/env.js';

function webview2Version() {
  const ps = [
    '$c = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";',
    '$p = @("HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\$c",',
    '        "HKCU:\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\$c");',
    'foreach ($x in $p) { if (Test-Path $x) { (Get-ItemProperty $x).pv; break } }',
  ].join(' ');
  return execSync(`powershell -NoProfile -Command "${ps}"`, { encoding: 'utf8' }).trim();
}

const version = process.env.TAJ_WEBVIEW2_VERSION || webview2Version();
if (!version) {
  console.error('Could not read WebView2 version. Set TAJ_WEBVIEW2_VERSION manually.');
  process.exit(1);
}
console.log(`[setup-driver] WebView2 runtime: ${version}`);

mkdirSync(DRIVERS_DIR, { recursive: true });
const zip = path.join(DRIVERS_DIR, 'edgedriver.zip');
const url = `https://msedgedriver.microsoft.com/${version}/edgedriver_win64.zip`;

const dl = [
  `$ErrorActionPreference='Stop';`,
  `Invoke-WebRequest -Uri '${url}' -OutFile '${zip}' -UseBasicParsing;`,
  `Expand-Archive -Path '${zip}' -DestinationPath '${DRIVERS_DIR}' -Force;`,
  `Remove-Item '${zip}';`,
].join(' ');

try {
  console.log(`[setup-driver] downloading ${url}`);
  execSync(`powershell -NoProfile -Command "${dl}"`, { stdio: 'inherit' });
  if (!existsSync(MSEDGEDRIVER)) throw new Error('msedgedriver.exe missing after extract');
  const v = execSync(`"${MSEDGEDRIVER}" --version`, { encoding: 'utf8' }).trim();
  console.log(`[setup-driver] installed: ${v}\n  → ${MSEDGEDRIVER}`);
} catch (e) {
  if (existsSync(zip)) rmSync(zip);
  console.error(`[setup-driver] FAILED: ${e.message}`);
  console.error('If the exact version is unavailable, install the matching msedgedriver manually');
  console.error('from https://developer.microsoft.com/microsoft-edge/tools/webdriver/ and place it at:');
  console.error(`  ${MSEDGEDRIVER}`);
  process.exit(1);
}
