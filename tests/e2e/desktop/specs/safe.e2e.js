// SAFE desktop suite — read/verify only. No money-path writes, no data changes.
// Requires real login credentials: TAJ_DESKTOP_USER / TAJ_DESKTOP_PASS.
import { login, goto, syncBannerVisible, SEL } from '../helpers/app.js';

// A product known to hold stock in more than one location. Configure to a real
// trade name on this pharmacy's data. If unset, the multi-location assertion
// falls back to a generic "no duplicate product rows" check.
const MULTILOC = process.env.TAJ_E2E_MULTILOC_PRODUCT || '';

describe('SAFE: read-only desktop flows', () => {
  before(async () => {
    await login(browser);
  });

  it('navigates POS / Products / Warehouse / Reports without error', async () => {
    let visited = 0;
    for (const [name, sel] of [
      ['POS', SEL.navPos],
      ['Products', SEL.navProducts],
      ['Warehouse', SEL.navWarehouse],
      ['Reports', SEL.navReports],
    ]) {
      const link = await browser.$(sel);
      if (!(await link.isExisting())) {
        console.log(`[safe] ${name} not available for this user (permission-gated) — skipping`);
        continue;
      }
      await goto(browser, sel);
      // App chrome stays mounted (did not crash to a blank/login screen).
      await expect(await browser.$('aside nav a')).toBeExisting();
      visited++;
      console.log(`[safe] navigated to ${name}`);
    }
    expect(visited).toBeGreaterThan(0);
  });

  it('shows a multi-location product as exactly ONE row', async () => {
    await goto(browser, SEL.navProducts);
    const search = await browser.$(SEL.productSearch);
    await search.waitForExist({ timeout: 15000 });

    const query = MULTILOC || await firstProductName();
    await search.setValue(query);
    await browser.pause(600); // debounced search (150ms) + query round-trip

    const rows = await browser.$$(SEL.productRows);
    const names = [];
    for (const r of rows) {
      const cell = await r.$('td:nth-child(2)');
      names.push((await cell.getText()).trim());
    }
    const matching = names.filter((n) => n.includes(query));

    if (MULTILOC) {
      // Explicit multi-location product must collapse to a single row.
      expect(matching.length).toBe(1);
    } else {
      // Generic guard: search results never duplicate the same product.
      const dupes = names.filter((n, i) => names.indexOf(n) !== i);
      expect(dupes).toEqual([]);
      console.log('[safe] TAJ_E2E_MULTILOC_PRODUCT unset — ran generic no-duplicate-rows check');
    }
  });

  it('loads Session History over a wide date range', async () => {
    await goto(browser, SEL.navPos);
    // History opens either from the no-session "السجل" button (has text) or the
    // in-session icon button (title="السجل"). Try both.
    let historyBtn = await browser.$('button*=السجل');
    if (!(await historyBtn.isExisting())) historyBtn = await browser.$('button[title="السجل"]');
    await historyBtn.waitForExist({ timeout: 15000 });
    await historyBtn.click(); // real click — React handler doesn't fire on JS click

    // The panel renders in a full-screen overlay. Confirm it opened.
    const overlay = await browser.$('.fixed.inset-0');
    await overlay.waitForExist({ timeout: 15000 });

    // Widen the "من تاريخ" (from) date to five years back and refresh.
    const fromDate = await browser.$('.fixed.inset-0 input[type="date"]');
    await fromDate.waitForExist({ timeout: 10000 });
    const wide = new Date();
    wide.setFullYear(wide.getFullYear() - 5);
    await fromDate.setValue(wide.toISOString().slice(0, 10));
    const refresh = await browser.$('button*=تحديث');
    if (await refresh.isExisting()) await refresh.click();
    await browser.pause(1500);

    // Loaded = the panel shows its header + the sessions stat label. Use
    // innerText.includes (WebdriverIO's `*=` matcher is flaky with RTL Arabic).
    const loaded = await browser.execute(() => {
      const el = document.querySelector('.fixed.inset-0');
      const txt = el ? el.innerText : '';
      return txt.includes('سجل الجلسات والمبيعات') && txt.includes('عدد الجلسات');
    });
    expect(loaded).toBe(true);
  });

  it('shows no "فشل المزامنة" banner after a sync settles', async () => {
    await goto(browser, SEL.navPos);
    // The desktop auto-syncs; give any in-flight sync a moment to settle.
    await browser.pause(4000);
    expect(await syncBannerVisible(browser)).toBe(false);
  });
});

async function firstProductName() {
  const rows = await browser.$$(SEL.productRows);
  if (rows.length === 0) throw new Error('No products found to test search against.');
  return (await (await rows[0].$('td:nth-child(2)')).getText()).trim();
}
