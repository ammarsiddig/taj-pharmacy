// One-command runner for the desktop suites: spike | safe | write.
//
//   node scripts/run-desktop.mjs spike   (or: npm run spike)
//   node scripts/run-desktop.mjs safe    (npm run safe)
//   node scripts/run-desktop.mjs write   (npm run write   — money-path, gated)
//
// Sequence: guard running app → back up DB → run wdio suite → report.
// The 'write' suite requires an explicit confirmation flag so it can never
// run by accident (see below).
import { execFileSync, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { createBackup, restoreBackup } from '../desktop/helpers/db-backup.js';
import { sweep } from '../desktop/helpers/cleanup.js';
import { assertPreconditions } from '../config/env.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const E2E_ROOT = path.dirname(HERE);
const suite = (process.argv[2] || '').toLowerCase();

const CONFIGS = {
  spike: 'config/wdio.spike.js',
  safe: 'config/wdio.safe.js',
  write: 'config/wdio.write.js',
  full: 'config/wdio.full.js',
  exhaustive: 'config/wdio.exhaustive.js',
  screenshots: 'config/wdio.screenshots.js',
};
// Suites that write demo/money data and restore a pre-run snapshot at teardown.
const RESTORE_SUITES = new Set(['full', 'exhaustive', 'screenshots']);

if (!CONFIGS[suite]) {
  console.error(`Unknown suite "${suite}". Use: spike | safe | write | full | exhaustive | screenshots`);
  process.exit(2);
}

// --- Gate: the money-path suites must be invoked deliberately ---------------
if ((suite === 'write' || RESTORE_SUITES.has(suite)) && process.env.TAJ_E2E_WRITE_OK !== 'yes') {
  console.error(
    '\nThe WRITE suite performs money-path flows (sale/purchase) against REAL data.\n' +
    'Each flow self-reverses (void/cancel) and only touches E2E_TEST_-tagged rows,\n' +
    'but it will not run without explicit opt-in.\n\n' +
    'To run it:  set TAJ_E2E_WRITE_OK=yes  then  npm run write\n' +
    '  PowerShell:  $env:TAJ_E2E_WRITE_OK="yes"; npm run write\n'
  );
  process.exit(3);
}

// --- Guard: the app must be closed so WebDriver drives its own instance -----
function appIsRunning() {
  try {
    const out = execSync(
      'powershell -NoProfile -Command "(Get-Process app -ErrorAction SilentlyContinue | Measure-Object).Count"',
      { encoding: 'utf8' }
    );
    return Number(out.trim()) > 0;
  } catch { return false; }
}

function closeApp() {
  try {
    execSync('powershell -NoProfile -Command "Stop-Process -Name app -Force -ErrorAction SilentlyContinue"');
  } catch { /* ignore */ }
}

async function main() {
  assertPreconditions({ requireDriver: true });

  if (appIsRunning()) {
    if (process.env.TAJ_E2E_CLOSE_APP === '1') {
      console.log('[runner] TAJ_E2E_CLOSE_APP=1 → closing the running app…');
      closeApp();
      await new Promise((r) => setTimeout(r, 1500));
    } else {
      console.error(
        '\nTAJ Pharmacy (app.exe) is currently RUNNING.\n' +
        'Close it before running desktop E2E tests — WebDriver launches its own\n' +
        'instance, and two instances on one SQLite database is unsafe.\n\n' +
        'Close the app manually and re-run, or set TAJ_E2E_CLOSE_APP=1 to let the\n' +
        'runner close it for you.\n'
      );
      process.exit(4);
    }
  }

  // Safety backup BEFORE any launch (app is now closed → consistent snapshot).
  console.log('[runner] creating safety backup of the desktop database…');
  const backupDir = createBackup();

  // Run the WebdriverIO suite. Invoke the CLI's JS entry via node directly —
  // the .cmd/.bin shims report a bogus exit code on Windows execFileSync.
  const wdioJs = path.join(E2E_ROOT, 'node_modules', '@wdio', 'cli', 'bin', 'wdio.js');
  console.log(`[runner] running "${suite}" suite…\n`);
  let suiteError = null;
  try {
    execFileSync(process.execPath, [wdioJs, 'run', CONFIGS[suite]], { cwd: E2E_ROOT, stdio: 'inherit' });
  } catch (err) {
    suiteError = err;
  }

  // Teardown sweep: app is already closed here, so hard-delete any leftover
  // E2E_TEST_ rows (pass OR fail). The 'full' suite uses the comprehensive sweep.
  if (suite === 'write') {
    console.log('\n[runner] teardown: sweeping E2E_TEST_ rows from the database…');
    try { await sweep({ del: true }); }
    catch (e) { console.error(`[runner] cleanup sweep failed: ${e.message}\n  Run manually: node desktop/helpers/cleanup.js --delete`); }
  } else if (RESTORE_SUITES.has(suite)) {
    // DEFINITIVE teardown: restore the pre-run snapshot. The app closed the
    // moment WebDriver ended, and nothing but the E2E ops touched the DB in
    // between, so restoring returns REAL data to its exact pre-run state —
    // balances included. This is required because void_sale is broken in the
    // installed build and payments have no reverse command, so command-based
    // teardown alone cannot restore account balances (see REPORT.md).
    console.log('\n[runner] teardown: restoring pre-run DB snapshot (guaranteed zero residue)…');
    let restored = false;
    try { restoreBackup(backupDir); restored = true; }
    catch (e) { console.error(`[runner] restore FAILED: ${e.message}\n  Restore manually: node desktop/helpers/db-backup.js restore "${backupDir}"`); }
    if (suite === 'screenshots') {
      console.log(`[runner] ${restored ? 'DB restored to pre-run snapshot (zero residue).' : 'RESTORE FAILED — restore manually.'}`);
    } else try {
      const note = `\n---\n\n## Final cleanup (post-run)\n\n` +
        (restored
          ? `✅ **Real data restored to the pre-run snapshot** — \`${backupDir}\`. All E2E_TEST_ entities and every money-path effect (including balances that \`void_sale\` could not reverse) were undone by restoring the database. Net residue: **zero**.\n`
          : `⚠️ **Automatic restore failed** — restore manually from \`${backupDir}\` via \`node desktop/helpers/db-backup.js restore "…"\`.\n`);
      fs.appendFileSync(path.join(E2E_ROOT, 'REPORT.md'), note);
    } catch { /* ignore */ }
    console.log('[runner] REPORT at tests/e2e/REPORT.md');
  }

  if (suiteError) {
    console.error(`\n[runner] "${suite}" suite FAILED (exit ${suiteError.status}).`);
    console.error(`[runner] Real data is unchanged by design; if anything looks off,\n  restore from: ${backupDir}\n  via: node desktop/helpers/db-backup.js restore "${backupDir}"`);
    process.exit(suiteError.status || 1);
  }
  console.log(`\n[runner] "${suite}" suite PASSED. Safety backup kept at:\n  ${backupDir}`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
