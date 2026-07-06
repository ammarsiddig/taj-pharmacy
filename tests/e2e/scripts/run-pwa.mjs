// One-command runner for the read-only Owner PWA suite (Playwright/Chromium).
//   node scripts/run-pwa.mjs   (or: npm run pwa)
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PWA_USER, PWA_PASS, PWA_URL } from '../config/env.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const E2E_ROOT = path.dirname(HERE);

if (!PWA_USER || !PWA_PASS) {
  console.error(
    '\nOwner PWA credentials missing. This suite logs into the REAL cloud read-only.\n' +
    'Set them first:\n' +
    '  PowerShell:  $env:TAJ_PWA_USER="owner@email"; $env:TAJ_PWA_PASS="…"\n' +
    `Target: ${PWA_URL}\n`
  );
  process.exit(2);
}

const pwBin = path.join(E2E_ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
console.log(`[pwa] running read-only Owner PWA suite against ${PWA_URL}…\n`);
try {
  execFileSync(process.execPath, [pwBin, 'test', '--config', 'pwa/playwright.config.js'],
    { cwd: E2E_ROOT, stdio: 'inherit' });
} catch (err) {
  // The Activity test is expected to FAIL until the production bug is fixed;
  // a non-zero exit here is meaningful, not a harness error.
  console.error(`\n[pwa] suite finished with failures (exit ${err.status}). ` +
    `If only the Activity test failed, that is the known production bug this suite catches.`);
  process.exit(err.status || 1);
}
