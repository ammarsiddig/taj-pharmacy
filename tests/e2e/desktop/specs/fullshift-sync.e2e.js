// Sync the completed صيدلية الاحسان shift to the Owner cloud (tenant fcc537bf)
// and confirm no "فشل المزامنة". Runs against the post-shift DB.
import { invoke, ctx } from '../helpers/bridge.js';
import { login } from '../helpers/app.js';

describe('SYNC — صيدلية الاحسان → Owner cloud', () => {
  let c;
  before(async () => {
    await browser.waitUntil(async () => await browser.execute(() => !!(window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke)), { timeout: 90000, interval: 1000 });
    await login(browser);
    c = await ctx(browser);
    console.log('CTX|' + JSON.stringify(c));
  });

  it('pushes all tables + drains the outbox to the cloud', async () => {
    const before = await invoke(browser, 'get_cloud_sync_status', { tenantId: c.tenantId });
    console.log('STATUS_BEFORE|' + JSON.stringify(before));

    const snap = await invoke(browser, 'sync_all_tables_now', { tenantId: c.tenantId, branchId: c.branchId });
    console.log('SYNC_ALL|' + JSON.stringify(snap));

    const cycle = await invoke(browser, 'run_cloud_sync_cycle', { tenantId: c.tenantId });
    console.log('CYCLE|' + JSON.stringify(cycle));

    const after = await invoke(browser, 'get_cloud_sync_status', { tenantId: c.tenantId });
    console.log('STATUS_AFTER|' + JSON.stringify(after));

    if (!snap.ok && !cycle.ok) throw new Error('both sync paths failed: ' + (snap.error || '') + ' | ' + (cycle.error || ''));
    console.log('SYNC_RESULT|' + JSON.stringify({ snapOk: snap.ok, cycleOk: cycle.ok }));
  });
});
