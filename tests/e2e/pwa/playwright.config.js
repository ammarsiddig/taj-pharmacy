// Playwright config for the Owner PWA suite (read-only, Chromium, own window).
import { defineConfig, devices } from '@playwright/test';
import { PWA_URL } from '../config/env.js';

export default defineConfig({
  testDir: './specs',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1, // one real owner session; never parallelise against production
  reporter: [['list']],
  use: {
    baseURL: PWA_URL,
    headless: false,        // owner watches its own window
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: false,
    // Read-only guarantee: we never POST/PUT/DELETE. This suite only navigates
    // and reads. (There is no mutating action wired in the specs.)
    actionTimeout: 15_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
