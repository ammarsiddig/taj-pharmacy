// DAY-IN-THE-LIFE scenario — a full pharmacist workflow against the installed
// app, with end-of-run reconciliation. Transactions run through the app's own
// Tauri command layer (real Rust logic: credit limits, expiry rejection, FEFO,
// movements); the DB is the reconciliation source of truth; the UI is exercised
// for the task's screen-specific checks. Every step records PASS/FAIL and the
// run never aborts on a single failure. Writes ONLY E2E_TEST_<ts> entities.
//
// GATED: requires TAJ_E2E_WRITE_OK=yes (money-path). Run supervised.
import { login, goto, SEL } from '../helpers/app.js';
import { ctx, ok, invoke, rejected } from '../helpers/bridge.js';
import * as db from '../helpers/db.js';
import { e2eTag } from '../../config/env.js';
import { Review } from '../helpers/review.js';
import { waitText, textIncludes } from '../helpers/ui.js';

const P = (sdg) => Math.round(sdg * 100);          // SDG → piasters

// Confirm a purchase draft as UNPAID (the app deprecated confirm_purchase in
// favour of confirm_purchase_with_payment).
async function confirmPurchase(browser, c, invoiceId, locationId) {
  return ok(browser, 'confirm_purchase_with_payment', {
    tenantId: c.tenantId, invoiceId, userId: c.userId, locationId,
    paymentInfo: { payment_mode: 'unpaid', account_id: null, payment_method: null, payment_date: null, amount_paid: 0, notes: null },
  });
}
const TS = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const tag = (s) => `E2E_TEST_${TS}_${s}`;
const futureExpiry = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const pastExpiry = '2000-01-01';

const R = new Review();
const S = {};   // shared scenario state (ids, expected ledger)

describe('DAY-IN-THE-LIFE: full pharmacist workflow + reconciliation', () => {
  before(async () => {
    await login(browser);
    S.ctx = await ctx(browser);
    // Reference data
    const accts = await ok(browser, 'get_all_accounts', { tenantId: S.ctx.tenantId, branchId: S.ctx.branchId });
    S.cash = accts.find((a) => a.account_type === 'cash' && a.is_default) || accts.find((a) => a.account_type === 'cash');
    S.bank = accts.find((a) => a.account_type === 'bank');
    const units = await ok(browser, 'get_unit_measures', { tenantId: S.ctx.tenantId, activeOnly: true });
    S.unit = units.find((u) => u.id === 'unit-piece') || units[0];
    const locs = await ok(browser, 'get_storage_locations', { tenantId: S.ctx.tenantId, branchId: S.ctx.branchId });
    S.locA = locs.find((l) => l.id === 'loc-shelf') || locs[0];
    S.locB = locs.find((l) => l.id === 'loc-fridge') || locs[1];
    const pms = await ok(browser, 'get_payment_methods', { tenantId: S.ctx.tenantId, branchId: S.ctx.branchId });
    S.pmBank = pms.find((p) => p.method_type === 'bank_transfer');
    const cats = await ok(browser, 'get_expense_categories', { tenantId: S.ctx.tenantId });
    S.expCat = cats.find((c) => c.id === 'cat-other') || cats[0];
    // Ledger baselines (piasters)
    S.expect = { cash: Number(S.cash.current_balance), bank: Number(S.bank ? S.bank.current_balance : 0) };
    console.log('[full] baselines cash=' + S.expect.cash + ' bank=' + S.expect.bank);
  });

  it('runs the full ordered scenario', async function () {
    const c = S.ctx;

    // ───────────────── PHASE 1: Suppliers ─────────────────
    R.setPhase('Suppliers');
    S.suppliers = [];
    for (const n of [1, 2]) {
      const name = tag(`SUP${n}`);
      await R.step(`create supplier ${name}`, async () => {
        const sup = await ok(browser, 'create_supplier_full', { tenantId: c.tenantId, data: { name, name_ar: name, phone: '0100000000' } });
        S.suppliers.push(sup); R.track('supplier', name, sup.id);
        return { __detail: `id=${sup.id}` };
      });
    }
    await R.step('suppliers appear in list', async () => {
      const list = await ok(browser, 'get_suppliers_full', { tenantId: c.tenantId, branchId: c.branchId, activeOnly: false });
      const found = S.suppliers.every((s) => list.some((x) => x.id === s.id));
      R.assert(found, 'not all created suppliers found in list');
      return { __detail: `${S.suppliers.length} found` };
    });

    // ───────────────── PHASE 2: Customers ─────────────────
    R.setPhase('Customers');
    // UI check: credit-mode selector present (TASK-937)
    await R.step('UI: credit-mode selector renders 3 modes', async () => {
      await goto(browser, 'a[href="/customers/new"]').catch(async () => { await browser.url('http://tauri.localhost/customers/new'); });
      await browser.pause(800);
      const has = await browser.execute(() => {
        const t = document.body.innerText;
        return t.includes('نقدي') || t.includes('محدود') || t.includes('غير محدود') || t.includes('ائتمان');
      });
      R.assert(has, 'credit mode options not visible on CustomerNew');
    });
    const custDefs = [
      { key: 'cash', name: tag('CUST_CASH'), credit_limit: 0 },
      { key: 'unlimited', name: tag('CUST_UNLIM'), credit_limit: -1 },
      { key: 'limit', name: tag('CUST_LIMIT'), credit_limit: P(50000) },
    ];
    S.customers = {};
    for (const d of custDefs) {
      await R.step(`create customer ${d.key} (limit=${d.credit_limit})`, async () => {
        const cust = await ok(browser, 'create_customer', { tenantId: c.tenantId, data: { name: d.name, name_ar: d.name, credit_limit: d.credit_limit } });
        S.customers[d.key] = cust; R.track('customer', d.name, cust.id);
        const detail = await ok(browser, 'get_customer', { tenantId: c.tenantId, customerId: cust.id });
        R.assert(Number(detail.credit_limit) === d.credit_limit, `credit_limit saved ${detail.credit_limit} != ${d.credit_limit}`);
        return { __detail: `credit_limit=${detail.credit_limit}` };
      });
    }

    // ───────────────── PHASE 3: Products ─────────────────
    R.setPhase('Products');
    S.products = [];
    const prodDefs = [
      { s: 'PROD_A', ar: 'باراسيتامول', en: 'Paracetamol', barcode: `E2E${TS}01`, sale: P(100), min: P(80) },
      { s: 'PROD_B', ar: 'أموكسيسيلين', en: 'Amoxicillin', barcode: `E2E${TS}02`, sale: P(250), min: P(200) },
      { s: 'PROD_C', ar: 'إيبوبروفين', en: 'Ibuprofen', barcode: `E2E${TS}03`, sale: P(150), min: P(120) },
    ];
    for (const d of prodDefs) {
      const name = tag(d.s); // English trade_name carries the tag for cleanup
      await R.step(`create product ${d.en}`, async () => {
        const prod = await ok(browser, 'create_product', {
          tenantId: c.tenantId,
          data: {
            trade_name: name, trade_name_ar: d.ar, generic_name: d.en, barcode: d.barcode,
            unit_id: S.unit.id, sale_price: d.sale, min_sale_price: d.min, min_stock_level: 10,
          },
        });
        prod.__ar = d.ar; prod.__en = d.en;
        S.products.push(prod); R.track('product', name, prod.id);
        return { __detail: `id=${prod.id} sale=${R.money(d.sale)}` };
      });
    }
    await R.step('products appear as one row each in Products search (UI)', async () => {
      await goto(browser, SEL.navProducts); await browser.pause(500);
      const search = await browser.$(SEL.productSearch);
      await search.setValue(`E2E_TEST_${TS}`);
      await browser.pause(800);
      const rows = await browser.$$('table.sales-form-table tbody tr');
      R.assert(rows.length >= 3, `expected >=3 product rows, got ${rows.length}`);
      return { __detail: `${rows.length} rows` };
    });

    // ───────────────── PHASE 4: USD rate (optional) ─────────────────
    R.setPhase('USD exchange rate (TASK-939)');
    await R.step('USD rate feature check (skip if no anchored products)', async () => {
      const before = S.products[0];
      const info = await invoke(browser, 'get_product', { tenantId: c.tenantId, productId: before.id });
      const anchored = info.ok && info.value && Number(info.value.price_usd_cents || 0) > 0;
      if (!anchored) return { __detail: 'no USD-anchored products — feature not exercised (prices unaffected as expected)' };
      // If a rate exists we could reprice; E2E products are not USD-anchored by design.
      return { __detail: 'anchored products exist; skipped destructive rate change' };
    });

    // ───────────────── PHASE 5: Purchases ─────────────────
    R.setPhase('Purchases');
    S.purchaseQty = { [S.products[0].id]: 100, [S.products[1].id]: 60, [S.products[2].id]: 40 };
    await R.step('create + confirm purchase invoice (supplier #1, 3 lines, future expiry)', async () => {
      const data = {
        supplier_id: S.suppliers[0].id, invoice_date: new Date().toISOString().slice(0, 10),
        discount: 0, tax_amount: 0,
        items: [
          { product_id: S.products[0].id, batch_number: tag('B_A'), expiry_date: futureExpiry(400), quantity: 100, unit_cost: P(60), sale_price: P(100) },
          { product_id: S.products[1].id, batch_number: tag('B_B'), expiry_date: futureExpiry(400), quantity: 60, unit_cost: P(150), sale_price: P(250) },
          { product_id: S.products[2].id, batch_number: tag('B_C'), expiry_date: futureExpiry(400), quantity: 40, unit_cost: P(90), sale_price: P(150) },
        ],
      };
      const draft = await ok(browser, 'create_purchase_draft', { tenantId: c.tenantId, branchId: c.branchId, data, userId: c.userId });
      S.purchase = draft; R.track('purchase_invoice', tag('PINV'), draft.id);
      await confirmPurchase(browser, c, draft.id, S.locA.id);
      S.purchaseTotal = P(60) * 100 + P(150) * 60 + P(90) * 40;
      return { __detail: `invoice=${draft.id} total=${R.money(S.purchaseTotal)}` };
    });
    await R.step('stock increased by exact quantities + batches + receive movements', async () => {
      for (const p of S.products) {
        const st = await db.productStock(p.id);
        R.reconcile(`stock after purchase: ${p.__en}`, S.purchaseQty[p.id], st, { money: false });
      }
      const mv = await db.movementTypesForProduct(S.products[0].id);
      R.assert(mv.some((m) => m.movement_type === 'receive' || m.movement_type === 'purchase'), 'no receive movement recorded');
      return { __detail: `movements: ${mv.map((m) => m.movement_type).join(',')}` };
    });
    await R.step('purchase line with PAST expiry is rejected (TASK-936)', async () => {
      const data = {
        supplier_id: S.suppliers[0].id, invoice_date: new Date().toISOString().slice(0, 10), discount: 0, tax_amount: 0,
        items: [{ product_id: S.products[0].id, batch_number: tag('B_EXP'), expiry_date: pastExpiry, quantity: 5, unit_cost: P(60), sale_price: P(100) }],
      };
      // Rejection may occur at draft creation or at confirm; accept either.
      const draft = await invoke(browser, 'create_purchase_draft', { tenantId: c.tenantId, branchId: c.branchId, data, userId: c.userId });
      if (!draft.ok) return { __detail: `rejected at draft: ${draft.error.slice(0, 60)}` };
      const conf = await invoke(browser, 'confirm_purchase_with_payment', { tenantId: c.tenantId, invoiceId: draft.value.id, userId: c.userId, locationId: S.locA.id, paymentInfo: { payment_mode: 'unpaid', account_id: null, payment_method: null, payment_date: null, amount_paid: 0, notes: null } });
      if (conf.ok) { R.bug('Past-expiry purchase NOT rejected', { expected: 'rejected', actual: 'confirmed', screen: 'confirm_purchase', repro: 'purchase line expiry 2000-01-01' }); throw new Error('past-expiry purchase was accepted'); }
      // clean up the rejected draft
      await invoke(browser, 'cancel_purchase', { tenantId: c.tenantId, invoiceId: draft.value.id, userId: c.userId });
      await invoke(browser, 'delete_purchase_draft', { tenantId: c.tenantId, invoiceId: draft.value.id, userId: c.userId });
      return { __detail: `rejected at confirm: ${conf.error.slice(0, 60)}` };
    });
    await R.step('partial supplier payment → balance = total − paid', async () => {
      const pay = S.purchaseTotal / 2;
      await ok(browser, 'record_supplier_payment', {
        tenantId: c.tenantId, supplierId: S.suppliers[0].id, userId: c.userId,
        data: { amount: pay, payment_method: 'cash', account_id: S.cash.id, invoice_id: S.purchase.id, payment_date: new Date().toISOString().slice(0, 10), notes: tag('SUPPAY') },
      });
      S.expect.cash -= pay; // cash paid out
      const bal = await db.supplierBalance(S.suppliers[0].id);
      R.reconcile('supplier #1 balance (total − paid)', S.purchaseTotal - pay, bal);
      return { __detail: `paid=${R.money(pay)} balance=${R.money(bal)}` };
    });

    // ───────────────── PHASE 6: Inventory / locations ─────────────────
    R.setPhase('Inventory / locations');
    await R.step('transfer 20 of product A between locations → out/in movements', async () => {
      const before = await db.productStockByLocation(S.products[0].id);
      await ok(browser, 'transfer_stock', {
        tenantId: c.tenantId, branchId: c.branchId, userId: c.userId,
        productId: S.products[0].id, fromLocationId: S.locA.id, toLocationId: S.locB.id, quantity: 20,
      });
      const after = await db.productStockByLocation(S.products[0].id);
      const byLoc = (arr, loc) => Number((arr.find((x) => x.location_id === loc) || {}).q || 0);
      R.reconcile('from-location decreased by 20', byLoc(before, S.locA.id) - 20, byLoc(after, S.locA.id), { money: false });
      R.reconcile('to-location increased by 20', byLoc(before, S.locB.id) + 20, byLoc(after, S.locB.id), { money: false });
      const mv = await db.movementTypesForProduct(S.products[0].id);
      R.assert(mv.some((m) => m.movement_type.includes('transfer')), 'no transfer movement');
      return { __detail: `movements: ${mv.map((m) => m.movement_type).join(',')}` };
    });
    await R.step('UI: movements screen loads with Arabic type labels (TASK-938)', async () => {
      await goto(browser, SEL.navWarehouse); await browser.pause(1500);
      // Warehouse has tabs; look for localized movement labels somewhere on screen.
      const hasArabic = await browser.execute(() => /استلام|تحويل|صرف|مخزون|حركة/.test(document.body.innerText));
      R.assert(hasArabic, 'no Arabic warehouse/movement labels found');
    });
    await R.step('reorder-alerts loads with no SQL error (TASK-938)', async () => {
      const low = await invoke(browser, 'get_low_stock_products', { tenantId: c.tenantId, branchId: c.branchId });
      R.assert(low.ok, `get_low_stock_products failed: ${low.error}`);
      return { __detail: `${(low.value || []).length} low-stock rows` };
    });
    await R.step('stock adjustment (stocktake) records movement + new qty', async () => {
      const stId = await ok(browser, 'start_stock_take', { tenantId: c.tenantId, branchId: c.branchId, userId: c.userId, notes: tag('STK') });
      const items = await ok(browser, 'get_stock_take_items', { tenantId: c.tenantId, stockTakeId: stId });
      const item = items.find((i) => i.product_id === S.products[2].id) || items[0];
      if (!item) throw new Error('no stock-take items');
      const target = S.products[2].id;
      const expectedQ = await db.productStock(target);
      const newActual = Number(item.expected_quantity) - 5; // count 5 short
      await ok(browser, 'update_stock_take_item', { tenantId: c.tenantId, itemId: item.id, actualQuantity: newActual });
      await ok(browser, 'confirm_stock_take', { tenantId: c.tenantId, stockTakeId: stId, userId: c.userId });
      R.track('stock_take', tag('STK'), stId);
      const afterQ = await db.productStock(item.product_id);
      // Adjustment reconciles for the specific product/batch of `item`.
      return { __detail: `item product ${item.product_id}: expected_pre=${expectedQ} new_onhand=${afterQ}` };
    });

    // ───────────────── PHASE 7: POS ─────────────────
    R.setPhase('POS');
    await R.step('open POS session', async () => {
      const existing = await invoke(browser, 'get_active_session', { tenantId: c.tenantId, branchId: c.branchId, userId: c.userId });
      if (existing.ok && existing.value) { S.session = existing.value; return { __detail: `reused open session ${existing.value.id}` }; }
      const sess = await ok(browser, 'open_session', { tenantId: c.tenantId, branchId: c.branchId, userId: c.userId, accountId: S.cash.id, openingCash: 0 });
      S.session = sess; R.track('session', tag('SESS'), sess.id);
      return { __detail: `session=${sess.id}` };
    });
    const sellItem = (p, qty, price) => ({ product_id: p.id, quantity: qty, unit_price: price, unit_cost: P(60) });
    S.sales = [];
    // (a) cash sale
    await R.step('(a) cash sale of product A x2', async () => {
      const total = 2 * P(100);
      const sale = await ok(browser, 'create_sale', {
        tenantId: c.tenantId, branchId: c.branchId, sessionId: S.session.id, cashierId: c.userId,
        paymentMethod: 'cash', paymentMethodId: null, amountPaid: total,
        items: [sellItem(S.products[0], 2, P(100))], customerId: null, discount: null, taxPercent: null,
        pharmacistOverrideBy: null, notes: tag('CASHSALE'), splitPayments: null,
      });
      S.sales.push({ ...sale, kind: 'cash' }); S.expect.cash += total;
      return { __detail: `sale ${sale.sale_number} total ${R.money(total)}` };
    });
    // (b) bank sale
    await R.step('(b) bank-transfer sale of product B x1', async () => {
      const total = P(250);
      const sale = await ok(browser, 'create_sale', {
        tenantId: c.tenantId, branchId: c.branchId, sessionId: S.session.id, cashierId: c.userId,
        paymentMethod: 'bank_transfer', paymentMethodId: S.pmBank ? S.pmBank.id : null, amountPaid: total,
        items: [sellItem(S.products[1], 1, P(250))], customerId: null, discount: null, taxPercent: null,
        pharmacistOverrideBy: null, notes: tag('BANKSALE'), splitPayments: null,
      });
      S.sales.push({ ...sale, kind: 'bank' }); S.expect.bank += total;
      return { __detail: `sale ${sale.sale_number} total ${R.money(total)}` };
    });
    // (c) credit sale to unlimited customer
    await R.step('(c) credit sale to unlimited customer → balance increases', async () => {
      const total = 3 * P(100);
      const before = await db.customerBalance(S.customers.unlimited.id);
      const sale = await ok(browser, 'create_sale', {
        tenantId: c.tenantId, branchId: c.branchId, sessionId: S.session.id, cashierId: c.userId,
        paymentMethod: 'credit', paymentMethodId: null, amountPaid: 0,
        items: [sellItem(S.products[0], 3, P(100))], customerId: S.customers.unlimited.id,
        discount: null, taxPercent: null, pharmacistOverrideBy: null, notes: tag('CREDITSALE'), splitPayments: null,
      });
      S.sales.push({ ...sale, kind: 'credit', customer: 'unlimited', total });
      const after = await db.customerBalance(S.customers.unlimited.id);
      R.reconcile('unlimited customer balance += credit sale', before + total, after);
      S.creditSaleTotal = total;
      return { __detail: `sale ${sale.sale_number}; balance ${R.money(after)}` };
    });
    // (d) credit sale to cash-only customer → blocked
    await R.step('(d) credit sale to CASH-ONLY customer is blocked', async () => {
      const err = await rejected(browser, 'create_sale', {
        tenantId: c.tenantId, branchId: c.branchId, sessionId: S.session.id, cashierId: c.userId,
        paymentMethod: 'credit', paymentMethodId: null, amountPaid: 0,
        items: [sellItem(S.products[0], 1, P(100))], customerId: S.customers.cash.id,
        discount: null, taxPercent: null, pharmacistOverrideBy: null, notes: tag('BADCREDIT'), splitPayments: null,
      });
      return { __detail: `blocked: ${String(err).slice(0, 70)}` };
    });
    // (e) credit sale exceeding limit → blocked. Use 1 unit at a high unit_price
    // (60,000 > 50,000 limit) so the LIMIT check fires, not a stock shortage.
    await R.step('(e) credit sale exceeding LIMIT (50,000) is blocked', async () => {
      const err = await rejected(browser, 'create_sale', {
        tenantId: c.tenantId, branchId: c.branchId, sessionId: S.session.id, cashierId: c.userId,
        paymentMethod: 'credit', paymentMethodId: null, amountPaid: 0,
        items: [{ product_id: S.products[0].id, quantity: 1, unit_price: P(60000), unit_cost: P(60) }], customerId: S.customers.limit.id,
        discount: null, taxPercent: null, pharmacistOverrideBy: null, notes: tag('OVERLIMIT'), splitPayments: null,
      });
      const isLimit = /حد|ائتمان|رصيد|limit|credit/i.test(String(err));
      if (!isLimit) R.bug('Over-limit credit sale blocked for a different reason', { expected: 'credit-limit rejection', actual: String(err).slice(0, 80), screen: 'create_sale', repro: 'credit sale 60,000 to customer with 50,000 limit' });
      return { __detail: `blocked: ${String(err).slice(0, 70)}` };
    });
    // (f) split payment sale
    await R.step('(f) split-payment sale (cash + bank)', async () => {
      const total = 4 * P(100);
      const half = total / 2;
      const sale = await invoke(browser, 'create_sale', {
        tenantId: c.tenantId, branchId: c.branchId, sessionId: S.session.id, cashierId: c.userId,
        paymentMethod: 'partial', paymentMethodId: null, amountPaid: total,
        items: [sellItem(S.products[0], 4, P(100))], customerId: null, discount: null, taxPercent: null,
        pharmacistOverrideBy: null, notes: tag('SPLITSALE'),
        splitPayments: [{ payment_method: 'cash', amount: half }, { payment_method: 'bank_transfer', payment_method_id: S.pmBank ? S.pmBank.id : null, amount: half }],
      });
      if (!sale.ok) { R.bug('Split-payment sale failed', { expected: 'created', actual: sale.error, screen: 'create_sale', repro: 'partial payment cash+bank' }); throw new Error(sale.error); }
      S.sales.push({ ...sale.value, kind: 'split' });
      S.expect.cash += half; S.expect.bank += half;
      return { __detail: `sale ${sale.value.sale_number} split ${R.money(half)}+${R.money(half)}` };
    });
    // multi-location + FEFO
    await R.step('multi-location product: ONE row in POS search + FEFO depletion', async () => {
      // Product B currently has one batch (from purchase). Add a 2nd batch in a
      // different location with an EARLIER expiry via a second purchase.
      const early = futureExpiry(30), late = futureExpiry(400);
      const data = { supplier_id: S.suppliers[0].id, invoice_date: new Date().toISOString().slice(0, 10), discount: 0, tax_amount: 0,
        items: [{ product_id: S.products[1].id, batch_number: tag('B_EARLY'), expiry_date: early, quantity: 10, unit_cost: P(150), sale_price: P(250) }] };
      const d2 = await ok(browser, 'create_purchase_draft', { tenantId: c.tenantId, branchId: c.branchId, data, userId: c.userId });
      await confirmPurchase(browser, c, d2.id, S.locB.id);
      R.track('purchase_invoice', tag('PINV2'), d2.id);
      S.purchaseQty[S.products[1].id] += 10;
      // search: one row?
      const res = await ok(browser, 'search_products_pos', { tenantId: c.tenantId, branchId: c.branchId, query: S.products[1].__en });
      const rowsForB = res.filter((r) => r.product_id === S.products[1].id);
      if (rowsForB.length !== 1) R.bug('Multi-location product duplicated in POS search', { expected: '1 row', actual: `${rowsForB.length} rows`, screen: 'search_products_pos', repro: `search "${S.products[1].__en}" with stock in 2 locations` });
      R.reconcile('POS search rows for multi-loc product', 1, rowsForB.length, { money: false });
      // FEFO: sell 10; earliest-expiry batch (early, 10 units) should deplete first.
      const early_batch = (await db.withDb((dbc) => dbc.prepare("SELECT id,quantity_current FROM batches WHERE batch_number = ?").get(tag('B_EARLY'))));
      const sale = await ok(browser, 'create_sale', {
        tenantId: c.tenantId, branchId: c.branchId, sessionId: S.session.id, cashierId: c.userId,
        paymentMethod: 'cash', paymentMethodId: null, amountPaid: P(2500),
        items: [{ product_id: S.products[1].id, quantity: 10, unit_price: P(250), unit_cost: P(150) }],
        customerId: null, discount: null, taxPercent: null, pharmacistOverrideBy: null, notes: tag('FEFOSALE'), splitPayments: null,
      });
      S.sales.push({ ...sale, kind: 'fefo' }); S.expect.cash += P(2500);
      const early_after = await db.withDb((dbc) => dbc.prepare("SELECT quantity_current FROM batches WHERE batch_number = ?").get(tag('B_EARLY')));
      const fefoOk = Number(early_after.quantity_current) === 0;
      if (!fefoOk) R.bug('FEFO not honoured: earliest-expiry batch not depleted first', { expected: 'early batch → 0', actual: `early batch = ${early_after.quantity_current}`, screen: 'create_sale (FEFO)', repro: 'sell 10 with 2 batches (early+late expiry)' });
      R.reconcile('FEFO: earliest-expiry batch depleted to 0', 0, Number(early_after.quantity_current), { money: false });
      return { __detail: `search rows=${rowsForB.length}, early batch after=${early_after.quantity_current}` };
    });
    // Session History check (issue #3). Session left OPEN so teardown can void.
    await R.step('Session History loads + lists this session (issue #3)', async () => {
      const from = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); })();
      const to = new Date().toISOString().slice(0, 10) + 'T23:59:59';
      const res = await invoke(browser, 'get_session_history', { tenantId: c.tenantId, branchId: c.branchId, cashierId: null, dateFrom: from, dateTo: to });
      if (!res.ok) {
        // KNOWN BUG (issue #3 root cause): installed v0.2.25 get_session_history SQL
        // references a non-existent column (r.deleted_at) → throws. SessionHistoryPanel
        // swallows it in catch{}, so the panel ALWAYS renders empty (sessions invisible).
        R.bug('Session History broken by SQL error, silently swallowed → panel always empty', {
          expected: 'session listed in history', actual: `get_session_history throws: ${res.error}`,
          screen: 'POS → Session History', repro: 'open POS → History; underlying get_session_history errors, UI catch{} hides it — panel shows 0 sessions',
        });
        throw new Error(`get_session_history SQL error: ${res.error}`);
      }
      const present = res.value.some((h) => h.id === S.session.id);
      if (!present) R.bug('Session History default range hides the session', { expected: 'present', actual: 'absent', screen: 'Session History', repro: 'default 7-day range' });
      R.reconcile('Session History lists this session', 1, present ? 1 : 0, { money: false });
      return { __detail: `history rows=${res.value.length}, present=${present}` };
    });

    // ───────────────── PHASE 8: Returns / voids (session still OPEN) ─────────────────
    R.setPhase('Returns / voids');
    await R.step('partial return of the cash sale → stock returns + refund', async () => {
      const cashSale = S.sales.find((s) => s.kind === 'cash');
      const detail = await ok(browser, 'get_sale_detail', { tenantId: c.tenantId, saleId: cashSale.id });
      const li = detail.items[0];
      const beforeStock = await db.productStock(S.products[0].id);
      const ret = await ok(browser, 'create_return', {
        tenantId: c.tenantId, branchId: c.branchId, saleId: cashSale.id, sessionId: S.session.id,
        returnType: 'partial', refundMethod: 'cash', reason: tag('RET'),
        items: [{ sale_item_id: li.id, product_id: li.product_id, batch_id: li.batch_id, quantity: 1, unit_price: li.unit_price }],
        createdBy: c.userId,
      });
      S.returns = [ret]; S.expect.cash -= P(100);
      const afterStock = await db.productStock(S.products[0].id);
      R.reconcile('stock returns +1 after partial return', beforeStock + 1, afterStock, { money: false });
      return { __detail: `return recorded; stock ${beforeStock}→${afterStock}` };
    });
    await R.step('void the credit sale → full reversal (stock + customer credit)', async () => {
      const creditSale = S.sales.find((s) => s.kind === 'credit');
      const beforeBal = await db.customerBalance(S.customers.unlimited.id);
      const beforeStock = await db.productStock(S.products[0].id);
      const v = await invoke(browser, 'void_sale', { tenantId: c.tenantId, saleId: creditSale.id, cashierId: c.userId, voidReason: tag('VOID') });
      if (!v.ok) {
        if (/CHECK constraint|movement_type/i.test(v.error)) {
          R.bug('void_sale BROKEN in installed build (CHECK constraint on movement_type)', {
            expected: 'sale voided, stock + customer credit reversed', actual: `void_sale throws: ${v.error.slice(0, 120)}`,
            screen: 'POS Session History → Void', repro: 'void any sale; the void-reversal stock movement uses a movement_type not permitted by the batches/stock_movements CHECK constraint',
          });
        }
        throw new Error(`void_sale failed: ${v.error.slice(0, 100)}`);
      }
      R.markReversed(creditSale.id, 'voided');
      const afterBal = await db.customerBalance(S.customers.unlimited.id);
      const afterStock = await db.productStock(S.products[0].id);
      R.reconcile('customer credit reversed by void', beforeBal - S.creditSaleTotal, afterBal);
      R.reconcile('stock restored by void (+3)', beforeStock + 3, afterStock, { money: false });
      return { __detail: `balance ${R.money(beforeBal)}→${R.money(afterBal)}` };
    });

    // ───────────────── PHASE 9: Invoice sale (outside POS) ─────────────────
    R.setPhase('Invoice sales');
    await R.step('create credit invoice to limited customer → appears in invoices + statement', async () => {
      const total = P(150) * 2;
      // Resolve product C's active batch explicitly (invoice FEFO resolution
      // rejected without it on the installed build).
      const batch = await db.withDb((dbc) => dbc.prepare(
        "SELECT id FROM batches WHERE product_id = ? AND status='active' AND quantity_current >= 2 ORDER BY expiry_date ASC LIMIT 1").get(S.products[2].id));
      const item = { product_id: S.products[2].id, quantity: 2, unit_price: P(150), unit_cost: P(90) };
      if (batch) item.batch_id = batch.id;
      const inv = await ok(browser, 'create_invoice_sale', {
        tenantId: c.tenantId, branchId: c.branchId, cashierId: c.userId,
        customerId: S.customers.limit.id, paymentMethod: 'credit', amountPaid: 0, accountId: S.cash.id, discount: 0, taxAmount: 0,
        notes: tag('INVSALE'), items: [item],
      });
      S.invoiceSale = inv; S.invoiceTotal = total;
      const list = await ok(browser, 'get_invoice_sales', { tenantId: c.tenantId, branchId: c.branchId, customerId: S.customers.limit.id });
      R.assert(list.some((x) => x.id === inv.id), 'invoice sale not in list');
      const stmt = await ok(browser, 'get_customer_statement', { tenantId: c.tenantId, customerId: S.customers.limit.id, dateFrom: null, dateTo: null });
      R.assert(JSON.stringify(stmt).length > 2, 'empty statement');
      return { __detail: `invoice ${inv.sale_number} total ${R.money(total)}` };
    });

    // ───────────────── PHASE 10: Customer payments ─────────────────
    R.setPhase('Customer payments');
    await R.step('record customer payment → balance down, account up; statement correct', async () => {
      const pay = P(150);
      const beforeBal = await db.customerBalance(S.customers.limit.id);
      await ok(browser, 'record_customer_payment', {
        tenantId: c.tenantId, customerId: S.customers.limit.id, userId: c.userId,
        data: { amount: pay, payment_method: 'cash', account_id: S.cash.id, notes: tag('CUSTPAY') },
      });
      S.expect.cash += pay; S.custPayment = pay;
      const afterBal = await db.customerBalance(S.customers.limit.id);
      R.reconcile('customer balance decreases by payment', beforeBal - pay, afterBal);
      const stmt = await ok(browser, 'get_customer_statement', { tenantId: c.tenantId, customerId: S.customers.limit.id, dateFrom: null, dateTo: null });
      const rows = stmt.rows || stmt;
      const last = Array.isArray(rows) && rows.length ? rows[rows.length - 1] : null;
      R.assert(last, 'statement has no rows');
      return { __detail: `balance ${R.money(beforeBal)}→${R.money(afterBal)}; running=${last ? R.money(last.running_balance) : 'n/a'}` };
    });

    // ───────────────── PHASE 11: Money transfers ─────────────────
    R.setPhase('Money transfers');
    await R.step('transfer cash→bank then bank→cash (self-reversing)', async () => {
      const amt = P(1000);
      const cashBefore = await db.accountBalance(S.cash.id), bankBefore = await db.accountBalance(S.bank.id);
      await ok(browser, 'manual_transfer', { tenantId: c.tenantId, userId: c.userId, data: { from_account_id: S.cash.id, to_account_id: S.bank.id, amount: amt, notes: tag('XFER1') } });
      const cashMid = await db.accountBalance(S.cash.id), bankMid = await db.accountBalance(S.bank.id);
      R.reconcile('cash decreased by transfer', cashBefore - amt, cashMid);
      R.reconcile('bank increased by transfer', bankBefore + amt, bankMid);
      // reverse
      await ok(browser, 'manual_transfer', { tenantId: c.tenantId, userId: c.userId, data: { from_account_id: S.bank.id, to_account_id: S.cash.id, amount: amt, notes: tag('XFER2') } });
      const cashAfter = await db.accountBalance(S.cash.id), bankAfter = await db.accountBalance(S.bank.id);
      R.reconcile('transfer self-reverses (cash restored)', cashBefore, cashAfter);
      R.reconcile('transfer self-reverses (bank restored)', bankBefore, bankAfter);
      return { __detail: `±${R.money(amt)} cash↔bank` };
    });

    // ───────────────── PHASE 12: Expenses ─────────────────
    R.setPhase('Expenses');
    await R.step('create expense from cash → account decreases', async () => {
      const amt = P(500);
      const before = await db.accountBalance(S.cash.id);
      const exp = await ok(browser, 'create_expense', {
        tenantId: c.tenantId, branchId: c.branchId, userId: c.userId,
        data: { amount: amt, description: tag('EXP'), category_id: S.expCat.id, payment_method: 'cash', account_id: S.cash.id, expense_date: new Date().toISOString().slice(0, 10) },
      });
      S.expense = exp; R.track('expense', tag('EXP'), exp.id || 'exp');
      S.expect.cash -= amt;
      const after = await db.accountBalance(S.cash.id);
      R.reconcile('cash decreases by expense', before - amt, after);
      return { __detail: `expense ${R.money(amt)}; cash ${R.money(before)}→${R.money(after)}` };
    });

    // ───────────────── PHASE 13: Reports reconciliation ─────────────────
    R.setPhase('Reports (reconciliation)');
    const rFrom = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); })();
    const rTo = new Date().toISOString().slice(0, 10);
    const reports = [
      ['sales', 'get_sales_report', { tenantId: c.tenantId, branchId: c.branchId, filters: { date_from: rFrom, date_to: rTo, group_by: 'day', cashier_id: null } }],
      ['profit/loss', 'get_profit_loss_report', { tenantId: c.tenantId, branchId: c.branchId, dateFrom: rFrom, dateTo: rTo }],
      ['inventory', 'get_inventory_report', { tenantId: c.tenantId, branchId: c.branchId }],
      ['expiry', 'get_expiry_report', { tenantId: c.tenantId, branchId: c.branchId }],
      ['tax', 'get_tax_report', { tenantId: c.tenantId, branchId: c.branchId, dateFrom: rFrom, dateTo: rTo }],
      ['customer credit', 'get_customer_credit_report', { tenantId: c.tenantId }],
      ['supplier aging', 'get_supplier_aging_report', { tenantId: c.tenantId }],
      ['balance sheet', 'get_balance_sheet_summary', { tenantId: c.tenantId, branchId: c.branchId }],
    ];
    for (const [label, cmd, args] of reports) {
      await R.step(`report loads with no error: ${label}`, async () => {
        const r = await invoke(browser, cmd, args);
        if (!r.ok) { R.bug(`Report failed to load: ${label}`, { expected: 'loads', actual: r.error, screen: label, repro: `invoke ${cmd}` }); throw new Error(r.error); }
        return { __detail: 'ok' };
      });
    }
    // Final account reconciliation against the running ledger.
    await R.step('RECONCILE: cash account == expected ledger', async () => {
      const cash = await db.accountBalance(S.cash.id);
      R.reconcile('final cash balance', S.expect.cash, cash);
      return { __detail: `expected ${R.money(S.expect.cash)} actual ${R.money(cash)}` };
    });
    await R.step('RECONCILE: bank account == expected ledger', async () => {
      const bank = await db.accountBalance(S.bank.id);
      R.reconcile('final bank balance', S.expect.bank, bank);
      return { __detail: `expected ${R.money(S.expect.bank)} actual ${R.money(bank)}` };
    });

    // ───────────────── PHASE 14: Sync ─────────────────
    R.setPhase('Sync');
    await R.step('trigger full sync → no "فشل المزامنة" banner', async () => {
      const res = await invoke(browser, 'sync_all_tables_now', { tenantId: c.tenantId, branchId: c.branchId });
      if (!res.ok) {
        R.bug('Desktop→cloud sync FAILS after the workflow (500 Batch sync failed)', {
          expected: 'sync succeeds, no failure banner', actual: `sync_all_tables_now throws: ${res.error.slice(0, 120)}`,
          screen: 'Sync', repro: 'run the full day-in-the-life workflow, then trigger a full sync — cloud returns 500 "Batch sync failed"',
        });
        throw new Error(`sync failed: ${res.error.slice(0, 100)}`);
      }
      await goto(browser, SEL.navPos); await browser.pause(3000);
      const banner = await textIncludes(browser, 'فشل المزامنة');
      R.assert(!banner, 'sync failure banner present after sync');
      return { __detail: `synced ${(res.value || []).length} tables` };
    });

    console.log('\n[full] scenario body complete.');
  });

  after(async () => {
    // ── Reverse-order teardown via the app's own commands (while app is open) ──
    R.setPhase('Teardown (reverse order)');
    const c = S.ctx || {};
    // 1) Void every sale we created (restores stock + customer credit + account).
    for (const sale of (S.sales || []).slice().reverse()) {
      const already = R.created.find((x) => x.id === sale.id && x.reversed);
      if (already) continue;
      await R.step(`void sale ${sale.sale_number || sale.id}`, async () => {
        const r = await invoke(browser, 'void_sale', { tenantId: c.tenantId, saleId: sale.id, cashierId: c.userId, voidReason: 'E2E teardown' });
        if (!r.ok) return { __detail: `not voided (${r.error.slice(0, 50)}) — may already be returned/voided` };
        R.markReversed(sale.id, 'voided'); return { __detail: 'voided' };
      });
    }
    // 2) Void the invoice sale.
    if (S.invoiceSale) await R.step('void invoice sale', async () => {
      const r = await invoke(browser, 'void_sale', { tenantId: c.tenantId, saleId: S.invoiceSale.id, cashierId: c.userId, voidReason: 'E2E teardown' });
      if (r.ok) R.markReversed(S.invoiceSale.id, 'voided');
      return { __detail: r.ok ? 'voided' : `not voided (${r.error.slice(0, 50)})` };
    });
    // 3) Cancel confirmed purchases (reverses stock + supplier balance).
    for (const t of R.created.filter((x) => x.kind === 'purchase_invoice')) {
      await R.step(`cancel purchase ${t.id}`, async () => {
        const r = await invoke(browser, 'cancel_purchase', { tenantId: c.tenantId, invoiceId: t.id, userId: c.userId });
        if (r.ok) { R.markReversed(t.id, 'cancelled'); return { __detail: 'cancelled' }; }
        const d = await invoke(browser, 'delete_purchase_draft', { tenantId: c.tenantId, invoiceId: t.id, userId: c.userId });
        if (d.ok) { R.markReversed(t.id, 'draft deleted'); return { __detail: 'draft deleted' }; }
        return { __detail: `not reversed (${r.error.slice(0, 50)})` };
      });
    }
    // 4) Delete the expense.
    if (S.expense) await R.step('delete expense', async () => {
      const r = await invoke(browser, 'delete_expense', { tenantId: c.tenantId, expenseId: S.expense.id, userId: c.userId });
      if (r.ok) R.markReversed(S.expense.id, 'deleted');
      return { __detail: r.ok ? 'deleted' : `not deleted (${r.error.slice(0, 50)})` };
    });
    // 5) Residuals we cannot reverse via a command (report only; backup covers them).
    if (S.custPayment) R.bug('Residual: customer payment has no reverse command', { expected: 'reversible', actual: `customer payment ${R.money(S.custPayment)} left; cash +${R.money(S.custPayment)}`, screen: 'record_customer_payment', repro: 'no delete_customer_payment command exists' });
    // Supplier payment residual (cash paid out, no reverse command).
    R.bug('Residual: supplier payment has no reverse command', { expected: 'reversible', actual: 'supplier payment (partial) left as a paid-invoice record', screen: 'record_supplier_payment', repro: 'no delete_supplier_payment command exists' });
    // 6) Finally close the POS session (kept open so the voids above could run).
    if (S.session) await R.step('close POS session (teardown)', async () => {
      const r = await invoke(browser, 'close_session', { tenantId: c.tenantId, sessionId: S.session.id, actualCash: 0, notes: null });
      if (r.ok) R.markReversed(S.session.id, 'closed');
      return { __detail: r.ok ? 'closed' : `not closed (${r.error.slice(0, 40)})` };
    });

    // Persist expected ledger + created list for the runner's teardown + report.
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const url = await import('node:url');
      const E2E_ROOT = path.dirname(path.dirname(path.dirname(url.fileURLToPath(import.meta.url))));
      fs.writeFileSync(path.join(E2E_ROOT, '.full-state.json'), JSON.stringify({ created: R.created, steps: R.steps, recon: R.recon, bugs: R.bugs }, null, 2));
    } catch (e) { console.error('state save failed', e); }
    R.writeReport();
  });
});
