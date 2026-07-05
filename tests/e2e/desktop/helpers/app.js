// Shared page helpers + selectors for the desktop suites.
// Selectors target the CURRENTLY INSTALLED build (v0.2.25) — they rely only on
// markup that already exists in that build (input names, nav hrefs, Arabic
// labels), NOT on data-testid hooks (which would require a rebuild+reinstall).

// Desktop login uses real credentials from the environment. Never hardcode.
export const DESKTOP_USER = process.env.TAJ_DESKTOP_USER || '';
export const DESKTOP_PASS = process.env.TAJ_DESKTOP_PASS || '';

// Known-stable selectors (from src/pages/Login.tsx + src/components/layout/Sidebar.tsx).
export const SEL = {
  loginTitle: 'h1=TAJ Pharmacy',
  username: 'input[name="username"]',
  password: 'input[name="password"]',
  submit: 'button[type="submit"]',
  navPos: 'a[href="/pos"]',
  navProducts: 'a[href="/products"]',
  navWarehouse: 'a[href="/warehouse"]',
  navReports: 'a[href="/reports"]',
  // Products page search box: placeholder is t('products.search').
  productSearch: 'input[placeholder*="بحث"]',
  productRows: 'table.sales-form-table tbody tr',
  // Sync failure banner (src/components/layout/StatusBar.tsx). Absence = healthy.
  syncErrorText: 'فشل المزامنة',
};

export async function login(browser) {
  if (!DESKTOP_USER || !DESKTOP_PASS) {
    throw new Error(
      'Desktop login credentials missing. Set TAJ_DESKTOP_USER and TAJ_DESKTOP_PASS.\n' +
      '  PowerShell:  $env:TAJ_DESKTOP_USER="owner"; $env:TAJ_DESKTOP_PASS="…"'
    );
  }
  // If already logged in (sidebar present), skip.
  if (await (await browser.$(SEL.navPos)).isExisting()) return;

  const u = await browser.$(SEL.username);
  await u.waitForExist({ timeout: 60000 });
  await u.setValue(DESKTOP_USER);
  await (await browser.$(SEL.password)).setValue(DESKTOP_PASS);
  await (await browser.$(SEL.submit)).click();

  // Login succeeds when we leave the login form (the password field unmounts).
  // Permission-gated nav links (e.g. /pos) may be absent for some roles, so we
  // do NOT key success off a specific link.
  try {
    await browser.waitUntil(
      async () => !(await (await browser.$(SEL.password)).isExisting()),
      { timeout: 30000, timeoutMsg: 'still on login form' }
    );
  } catch (e) {
    // Surface an on-screen auth error if one is shown.
    const err = await browser.$('.text-status-danger');
    const msg = (await err.isExisting()) ? (await err.getText()).trim() : '';
    throw new Error(`Desktop login did not complete${msg ? `: "${msg}"` : ' (no error shown — check credentials/permissions)'}`);
  }
  // Wait for app chrome (any sidebar nav link) to mount.
  await (await browser.$('aside nav a')).waitForExist({ timeout: 15000 });

  // The app's LicenseProvider fetches the license ONCE at mount. Under
  // automation the app mounts on the login screen (no tenant yet), so that
  // fetch fails and features stay locked until a 5-minute retry. Reload now,
  // with auth persisted, so the license context re-mounts WITH the tenant and
  // premium pages (POS/Products/Warehouse/Reports) unlock immediately.
  await browser.refresh();
  await (await browser.$('aside nav a')).waitForExist({ timeout: 20000 });
  // Give the license fetch a beat to unlock feature-gated nav.
  await browser.waitUntil(
    async () => (await browser.$('a[href="/pos"]').then((e) => e.isExisting()))
             || (await browser.$('a[href="/products"]').then((e) => e.isExisting())),
    { timeout: 20000, timeoutMsg: 'premium features still locked after login+reload' }
  ).catch(() => { /* some roles legitimately lack these; suites handle absence */ });
}

export async function goto(browser, sel) {
  const link = await browser.$(sel);
  await link.waitForExist({ timeout: 15000 });
  await link.scrollIntoView();
  // Use a DOM click to bypass overlay/stat-card click interception in the layout.
  try {
    await browser.execute((el) => el.click(), link);
  } catch {
    await link.click();
  }
}

// True if the "فشل المزامنة" sync-failure banner is currently shown.
// Uses innerText (WebdriverIO's `*=` matcher is unreliable with RTL Arabic).
export async function syncBannerVisible(browser, text = SEL.syncErrorText) {
  return browser.execute((t) => document.body.innerText.includes(t), text);
}
