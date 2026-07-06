// Bridge to the app's OWN Tauri command layer, executed inside the running
// installed app's WebView. This drives the exact Rust commands the UI calls
// (create_sale, transfer_stock, confirm_purchase, …) so all business logic —
// credit limits, past-expiry rejection, FEFO batch selection, stock movements —
// runs for real against the real DB. It is NOT a mock: it is the app doing the
// work, just invoked programmatically instead of via mouse clicks. The UI itself
// is separately exercised for the task's screen-specific checks.

// Read tenant/branch/user context from the app's auth state (localStorage).
export async function ctx(browser) {
  const c = await browser.execute(() => {
    const a = JSON.parse(localStorage.getItem('pms-auth') || '{}');
    return {
      tenantId: a.tenant_id || a.user?.tenant_id || null,
      branchId: a.user?.branch_id || null,
      userId: a.user?.id || null,
      token: a.token || null,
    };
  });
  if (!c.tenantId || !c.branchId || !c.userId) {
    throw new Error(`bridge ctx incomplete: ${JSON.stringify(c)} (is the app logged in?)`);
  }
  return c;
}

// Invoke a command; returns { ok, value, error }. Never throws on a Rust error
// (so callers can assert that a command is REJECTED, e.g. past-expiry/credit).
// Uses executeAsync + done-callback: the classic reliable pattern for awaiting a
// promise in the page and marshalling BOTH resolve and reject back cleanly.
export async function invoke(browser, cmd, args = {}) {
  try {
    return await browser.executeAsync((c, a, done) => {
      const inv = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
      if (!inv) { done({ ok: false, error: 'no invoke bridge (__TAURI_INTERNALS__)' }); return; }
      Promise.resolve()
        .then(() => inv(c, a))
        .then((v) => done({ ok: true, value: v }))
        .catch((e) => done({ ok: false, error: (e && e.message) ? e.message : String(e) }));
    }, cmd, args);
  } catch (e) {
    // Some Tauri command rejections surface as a thrown WebDriverError at the
    // transport level rather than through the page callback. Normalise to a
    // captured error so callers can assert on rejection (e.g. past-expiry/credit).
    const msg = (e && e.message) ? e.message : String(e);
    return { ok: false, error: msg.replace(/\s*when running "execute\/async".*$/s, '').replace(/^WebDriverError:\s*/, '').trim() };
  }
}

// Invoke and require success; throws with the Rust error otherwise.
export async function ok(browser, cmd, args = {}) {
  const r = await invoke(browser, cmd, args);
  if (!r.ok) throw new Error(`${cmd} → ${r.error}`);
  return r.value;
}

// Invoke and require FAILURE (for rejection assertions); returns the error text.
export async function rejected(browser, cmd, args = {}) {
  const r = await invoke(browser, cmd, args);
  if (r.ok) throw new Error(`${cmd} unexpectedly SUCCEEDED (expected rejection)`);
  return r.error;
}
