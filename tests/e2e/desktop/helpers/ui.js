// UI interaction helpers tuned to this app + WebDriver/WebView2 quirks:
//  - Arabic text matching is done via innerText.includes (WebdriverIO `*=` is
//    unreliable with RTL Arabic).
//  - <button> onClick (React) needs a REAL WebDriver click; <a> nav links are
//    overlap-prone so use a JS click there.
//  - Inputs from <Input label=…> have no name/id, so target them by adjacent
//    <label> text via XPath.

export async function textIncludes(browser, needle, root = 'body') {
  return browser.execute((sel, t) => {
    const el = document.querySelector(sel);
    return !!el && el.innerText.includes(t);
  }, root, needle);
}

export async function waitText(browser, needle, { timeout = 15000, root = 'body' } = {}) {
  await browser.waitUntil(async () => textIncludes(browser, needle, root),
    { timeout, timeoutMsg: `text not found: "${needle}"` });
}

// Fill an <Input label="X"> by its label text.
export async function fillByLabel(browser, labelText, value) {
  const input = await browser.$(`//label[contains(normalize-space(.), ${xpq(labelText)})]/following::input[1]`);
  await input.waitForExist({ timeout: 10000 });
  await input.setValue(String(value));
  return input;
}

// Click a <button> whose visible text contains `text` (real click for React).
export async function clickButtonText(browser, text, { timeout = 10000, nth = 0 } = {}) {
  const btns = await browser.$$(`//button[contains(normalize-space(.), ${xpq(text)})]`);
  // Fallback: title attribute.
  let target = btns[nth];
  if (!target) {
    const byTitle = await browser.$(`button[title="${text}"]`);
    if (await byTitle.isExisting()) target = byTitle;
  }
  if (!target) throw new Error(`button not found: "${text}"`);
  await target.waitForExist({ timeout });
  await target.scrollIntoView();
  await target.click();
  return target;
}

// Read the latest toast text (Toast component), if any.
export async function getToast(browser) {
  return browser.execute(() => {
    // Toasts are fixed, small, and contain the message text.
    const nodes = Array.from(document.querySelectorAll('[class*="fixed"]'));
    for (const n of nodes) {
      const t = n.innerText.trim();
      if (t && t.length < 200 && (n.className.includes('bottom') || n.className.includes('top'))) return t;
    }
    return '';
  });
}

// Wait until a toast containing `needle` appears; returns the toast text.
export async function waitToast(browser, needle, { timeout = 10000 } = {}) {
  let seen = '';
  await browser.waitUntil(async () => {
    seen = await getToast(browser);
    return seen.includes(needle);
  }, { timeout, timeoutMsg: `toast "${needle}" not seen (last: "${seen}")` });
  return seen;
}

// Select an <option> in the nth <select> on screen by visible text.
export async function selectByText(browser, selectSel, optionText) {
  const sel = await browser.$(selectSel);
  await sel.waitForExist({ timeout: 8000 });
  await sel.selectByVisibleText(optionText);
}

function xpq(s) {
  // Quote a string for XPath, handling embedded quotes.
  if (!s.includes("'")) return `'${s}'`;
  if (!s.includes('"')) return `"${s}"`;
  return `concat('${s.replace(/'/g, `',"'",'`)}')`;
}
