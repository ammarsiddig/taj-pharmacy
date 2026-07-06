// Shared WebdriverIO config factory for the desktop (tauri-driver) suites.
// Each suite (spike / safe / write) imports this and supplies its own spec glob.
import { APP_EXE, TAURI_DRIVER_PORT, assertPreconditions } from './env.js';
import { startTauriDriver, stopTauriDriver, wait } from '../desktop/helpers/driver-process.js';

export function makeConfig({ specs, suiteName }) {
  return {
    runner: 'local',
    hostname: 'localhost',
    port: TAURI_DRIVER_PORT,
    path: '/',

    specs,
    maxInstances: 1, // exactly one app instance against real data — never parallel

    capabilities: [
      {
        // tauri-driver reads this to launch the installed release exe.
        'tauri:options': {
          application: APP_EXE,
        },
      },
    ],

    logLevel: 'warn',
    bail: 0,
    waitforTimeout: 15000,
    connectionRetryTimeout: 120000,
    connectionRetryCount: 3,

    framework: 'mocha',
    reporters: ['spec'],
    mochaOpts: {
      ui: 'bdd',
      timeout: 120000, // real app + WebView2 cold start is slow
    },

    // --- Lifecycle: bring tauri-driver up before, and down after, the run ---
    onPrepare: async function () {
      assertPreconditions({ requireDriver: true });
      console.log(`\n[${suiteName}] starting tauri-driver…`);
      startTauriDriver();
      await wait(2500); // give it a moment to bind the port
    },
    onComplete: function () {
      stopTauriDriver();
      console.log(`[${suiteName}] tauri-driver stopped.`);
    },
  };
}
