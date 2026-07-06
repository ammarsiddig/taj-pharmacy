// MARKETING SCREENSHOTS — seed clean, realistic Arabic demo data through the
// app's own command layer, then capture 4 marketing shots at 1600×1000. The
// runner takes a DB snapshot before this runs and RESTORES it afterwards, so
// the demo data (nice display names, no ugly test prefix) is fully reverted —
// the snapshot restore is the cleanup mechanism. Run supervised.
//
// GATED: writes demo data → requires TAJ_E2E_WRITE_OK=yes.
import { login } from '../helpers/app.js';
import { ctx, ok, invoke } from '../helpers/bridge.js';
import * as db from '../helpers/db.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const P = (sdg) => Math.round(sdg * 100);
const E2E_ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const REPO_ROOT = path.dirname(path.dirname(E2E_ROOT));
const OUT = path.join(REPO_ROOT, 'pms-cloud', 'marketing', 'assets', 'screenshots');
const dayOff = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

const S = {};

async function shoot(name) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  await browser.saveScreenshot(file);
  const kb = Math.round(fs.statSync(file).size / 1024);
  console.log(`  [SHOT] ${name} — ${kb} KB`);
  return kb;
}

describe('SCREENSHOTS: seed demo data + capture marketing shots', () => {
  before(async () => {
    await login(browser);
    S.c = await ctx(browser);
    const c = S.c;
    const accts = await ok(browser, 'get_all_accounts', { tenantId: c.tenantId, branchId: c.branchId });
    S.cash = accts.find((a) => a.account_type === 'cash' && a.is_default) || accts.find((a) => a.account_type === 'cash');
    const units = await ok(browser, 'get_unit_measures', { tenantId: c.tenantId, activeOnly: true });
    S.unit = units.find((u) => u.id === 'unit-piece') || units[0];
    const locs = await ok(browser, 'get_storage_locations', { tenantId: c.tenantId, branchId: c.branchId });
    S.locA = locs.find((l) => l.id === 'loc-shelf') || locs[0];
    S.locB = locs.find((l) => l.id === 'loc-fridge') || locs[1] || locs[0];
    try { await browser.setWindowSize(1600, 1000); } catch { /* ignore */ }
    await browser.pause(400);
  });

  it('seeds realistic demo data', async () => {
    const c = S.c;
    // Supplier + customers
    S.supplier = await ok(browser, 'create_supplier_full', { tenantId: c.tenantId, data: { name: 'شركة النيل للصناعات الدوائية', name_ar: 'شركة النيل للصناعات الدوائية', phone: '0912345678' } });
    S.custA = await ok(browser, 'create_customer', { tenantId: c.tenantId, data: { name: 'أحمد عبدالله', name_ar: 'أحمد عبدالله', credit_limit: P(50000) } });
    S.custB = await ok(browser, 'create_customer', { tenantId: c.tenantId, data: { name: 'صيدلية النور', name_ar: 'صيدلية النور', credit_limit: -1 } });

    // Products — realistic Arabic pharmacy catalogue. Numeric barcodes (6+ digits,
    // none a substring of another) so the POS barcode auto-add is deterministic.
    const defs = [
      ['باراسيتامول 500 ملجم', 'Paracetamol 500mg', '700111', P(150), P(90), 100, 10],
      ['أموكسيسيلين 500 ملجم', 'Amoxicillin 500mg', '700222', P(400), P(250), 60, 10],
      ['فيتامين سي 1000 فوار', 'Vitamin C 1000mg', '700333', P(600), P(400), 45, 10],
      ['أوميبرازول 20 ملجم', 'Omeprazole 20mg', '700444', P(350), P(220), 80, 10],
      ['سيتيريزين 10 ملجم', 'Cetirizine 10mg', '700555', P(200), P(120), 120, 10],
      ['ديكلوفيناك جل 1%', 'Diclofenac Gel', '700666', P(300), P(180), 8, 15],
    ];
    S.prods = [];
    for (const [ar, en, bc, sale, min, , minStock] of defs) {
      const p = await ok(browser, 'create_product', { tenantId: c.tenantId, data: {
        trade_name: ar, trade_name_ar: ar, generic_name: en, barcode: bc,
        unit_id: S.unit.id, sale_price: sale, min_sale_price: min, min_stock_level: minStock } });
      p.__bc = bc; p.__sale = sale; S.prods.push(p);
    }

    // Purchase to give stock (spread across two locations so inventory-by-location
    // looks real). Diclofenac is intentionally low to light up the low-stock card.
    const items = defs.map((d, i) => ({ product_id: S.prods[i].id, batch_number: `LOT-${1000 + i}`, expiry_date: dayOff(400 - i * 30), quantity: d[5], unit_cost: d[4], sale_price: d[3] }));
    const draft = await ok(browser, 'create_purchase_draft', { tenantId: c.tenantId, branchId: c.branchId, userId: c.userId, data: { supplier_id: S.supplier.id, invoice_date: dayOff(0), discount: 0, tax_amount: 0, items } });
    await ok(browser, 'confirm_purchase_with_payment', { tenantId: c.tenantId, invoiceId: draft.id, userId: c.userId, locationId: S.locA.id, paymentInfo: { payment_mode: 'unpaid', account_id: null, payment_method: null, payment_date: null, amount_paid: 0, notes: null } });
    // Move some stock to a second location for a richer by-location view.
    for (const [i, qty] of [[0, 30], [4, 40], [1, 20]]) {
      await invoke(browser, 'transfer_stock', { tenantId: c.tenantId, branchId: c.branchId, userId: c.userId, productId: S.prods[i].id, fromLocationId: S.locA.id, toLocationId: S.locB.id, quantity: qty });
    }

    // Open a session and ring up several cash sales today so the dashboard and
    // reports look populated with revenue.
    const ex = await invoke(browser, 'get_active_session', { tenantId: c.tenantId, branchId: c.branchId, userId: c.userId });
    S.session = ex.ok && ex.value ? ex.value : await ok(browser, 'open_session', { tenantId: c.tenantId, branchId: c.branchId, userId: c.userId, accountId: S.cash.id, openingCash: P(5000) });
    const sale = (idxQty, method = 'cash', customerId = null) => ok(browser, 'create_sale', {
      tenantId: c.tenantId, branchId: c.branchId, sessionId: S.session.id, cashierId: c.userId,
      paymentMethod: method, paymentMethodId: null, amountPaid: method === 'credit' ? 0 : idxQty.reduce((s, [i, q]) => s + q * S.prods[i].__sale, 0),
      items: idxQty.map(([i, q]) => ({ product_id: S.prods[i].id, quantity: q, unit_price: S.prods[i].__sale, unit_cost: P(100) })),
      customerId, discount: null, taxPercent: null, pharmacistOverrideBy: null, notes: null, splitPayments: null,
    });
    await sale([[0, 3], [4, 2]]);
    await sale([[1, 1], [3, 2]]);
    await sale([[2, 1]]);
    await sale([[0, 5], [1, 2], [4, 4]]);
    await sale([[3, 1], [2, 2]], 'credit', S.custB.id);
    await sale([[4, 6]]);
    await sale([[1, 1], [0, 2]]);
    console.log('[shots] demo data seeded.');
  });

  it('captures hero.png (Dashboard)', async () => {
    await browser.url('http://tauri.localhost/dashboard');
    await browser.pause(3500);
    await shoot('hero.png');
  });

  it('captures pos.png (POS with a cart)', async () => {
    await browser.url('http://tauri.localhost/pos');
    await browser.pause(2500);
    const search = await browser.$('input[placeholder*="F3"]');
    // Add three items by exact barcode (POS auto-adds on a digits-only exact match).
    for (const bc of ['700111', '700222', '700333']) {
      await search.setValue(bc);
      await browser.pause(900);
      await search.clearValue();
      await browser.pause(300);
    }
    await browser.pause(1200);
    await shoot('pos.png');
  });

  it('captures inventory.png (Warehouse inventory-by-location)', async () => {
    await browser.url('http://tauri.localhost/warehouse');
    await browser.pause(1500);
    // Click the "inventory" tab (المخزون).
    const clicked = await browser.execute(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const t = btns.find((b) => /المخزون|الجرد|بحسب/.test(b.innerText) && !/حركات/.test(b.innerText));
      if (t) { t.click(); return t.innerText; }
      return null;
    });
    await browser.pause(1500);
    // Select the shelf location (holds the original batches WITH expiry dates and
    // the full catalogue) for a richer, complete by-location view.
    await browser.execute((locId) => {
      const selects = Array.from(document.querySelectorAll('select'));
      for (const sel of selects) {
        const opt = Array.from(sel.options).find((o) => o.value === locId);
        if (opt) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
          setter.call(sel, locId);
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }, S.locA.id);
    await browser.pause(2000);
    await shoot('inventory.png');
    console.log('  inventory tab:', clicked);
  });

  it('captures reports.png (Reports with data)', async () => {
    await browser.url('http://tauri.localhost/reports');
    await browser.pause(3500);
    await shoot('reports.png');
  });
});
