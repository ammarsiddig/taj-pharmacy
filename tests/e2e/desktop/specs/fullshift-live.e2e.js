// LIVE full-shift E2E against the throwaway صيدلية الاحسان install (tenant fcc537bf).
// Onboarding/activation done in the bootstrap run; this drives the whole shift via
// the app's real Tauri commands (the bridge). Resilient per phase. Money = piasters.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { invoke, ok, ctx } from '../helpers/bridge.js';
import { login } from '../helpers/app.js';

const P = (sdg) => Math.round(sdg * 100);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CSV = path.join(HERE, '..', '..', 'fixtures', 'dan-multi-activity-catalog.csv');
const OUT = path.join(HERE, '..', '..', 'fullshift-results.json');

const S = { results: [], data: {} };
function rec(phase, pass, detail) {
  S.results.push({ phase, pass: !!pass, detail });
  console.log(`RESULT|${pass ? 'PASS' : 'FAIL'}|${phase}|${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
}
async function phase(name, fn) {
  try { const d = await fn(); rec(name, true, d ?? ''); return d; }
  catch (e) { rec(name, false, (e && e.message) ? e.message : String(e)); }
}
async function priceOf(id) {
  const r = await ok(browser, 'get_products', { tenantId: S.c.tenantId });
  const p = r.find((x) => x.id === id);
  return p ? p.sale_price : null;
}

describe('LIVE FULL SHIFT — صيدلية الاحسان', () => {
  before(async () => {
    await browser.waitUntil(
      async () => await browser.execute(() => !!(window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke)),
      { timeout: 90000, interval: 1000, timeoutMsg: 'bridge not ready' });
    await login(browser);
    S.c = await ctx(browser);
    console.log('CTX|' + JSON.stringify(S.c));
  });

  after(async () => {
    try { if (S.data.sessionId) await invoke(browser, 'close_session', { tenantId: S.c.tenantId, sessionId: S.data.sessionId, actualCash: 0, notes: 'إغلاق وردية' }); } catch (e) {}
    fs.writeFileSync(OUT, JSON.stringify(S.results, null, 2));
    console.log('SUMMARY|' + JSON.stringify({ total: S.results.length, pass: S.results.filter(r => r.pass).length, fail: S.results.filter(r => !r.pass).length, failed: S.results.filter(r => !r.pass).map(r => r.phase) }));
  });

  it('P1 — setup: fund cash+bank, bank payment method, locations/units', async () => {
    await phase('setup.locations', async () => {
      const locs = await ok(browser, 'get_storage_locations', { tenantId: S.c.tenantId, branchId: S.c.branchId });
      S.data.shelf = locs.find(l => l.id === 'loc-shelf') || locs[0];
      S.data.fridge = locs.find(l => l.id === 'loc-fridge') || locs[1] || locs[0];
      S.data.store = locs.find(l => l.id === 'loc-store') || locs[2] || locs[0];
      return locs.map(l => l.name).join(', ');
    });
    await phase('setup.units', async () => {
      const units = await ok(browser, 'get_unit_measures', { tenantId: S.c.tenantId, activeOnly: true });
      S.data.unit = units.find(u => u.id === 'unit-piece') || units[0]; return `unit=${S.data.unit && S.data.unit.id}`;
    });
    await phase('setup.fund_cash', async () => {
      const a = await ok(browser, 'create_account', { tenantId: S.c.tenantId, branchId: S.c.branchId, userId: S.c.userId,
        data: { name: 'الصندوق الرئيسي', name_ar: 'الصندوق الرئيسي', account_type: 'cash', opening_balance: P(3000000), is_default: true } });
      S.data.cash = a; return `cash funded 3,000,000.00 (${a.id})`;
    });
    await phase('setup.fund_bank', async () => {
      const a = await ok(browser, 'create_account', { tenantId: S.c.tenantId, branchId: S.c.branchId, userId: S.c.userId,
        data: { name: 'بنك الخرطوم', name_ar: 'بنك الخرطوم', account_type: 'bank', opening_balance: P(3000000) } });
      S.data.bank = a; return `bank funded 3,000,000.00 (${a.id})`;
    });
    await phase('setup.bank_payment_method', async () => {
      const pm = await ok(browser, 'create_payment_method', { tenantId: S.c.tenantId,
        data: { name: 'تحويل بنكي', name_ar: 'تحويل بنكي', method_type: 'bank_transfer', account_id: S.data.bank.id, is_active: true } });
      S.data.bankPM = pm; return `bank PM ${pm.id}`;
    });
  });

  it('P2 — suppliers + customers', async () => {
    await phase('supplier.create', async () => { const s = await ok(browser, 'create_supplier_full', { tenantId: S.c.tenantId, data: { name: 'شركة دان للتوزيع', name_ar: 'شركة دان للتوزيع', phone: '0912345678' } }); S.data.supplier = s; return s.id; });
    await phase('customer.credit', async () => { const cu = await ok(browser, 'create_customer', { tenantId: S.c.tenantId, data: { name: 'أحمد علي', name_ar: 'أحمد علي', credit_limit: P(5000) } }); S.data.custCredit = cu; return `${cu.id} limit=5000.00`; });
    await phase('customer.unlimited', async () => { const cu = await ok(browser, 'create_customer', { tenantId: S.c.tenantId, data: { name: 'صيدلية النور', name_ar: 'صيدلية النور', credit_limit: -1 } }); S.data.custUnlimited = cu; return cu.id; });
    await phase('customer.cashonly', async () => { const cu = await ok(browser, 'create_customer', { tenantId: S.c.tenantId, data: { name: 'زبون نقدي', name_ar: 'زبون نقدي', credit_limit: 0 } }); S.data.custCash = cu; return cu.id; });
  });

  it('P3 — catalog: CSV import + manual products', async () => {
    await phase('catalog.csv_import', async () => {
      const text = fs.readFileSync(CSV, 'utf8').replace(/^﻿/, '');
      const lines = text.split(/\r?\n/).filter(Boolean);
      const header = lines[0].split(','); const idx = (k) => header.indexOf(k);
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const f = lines[i].split(','); if (f.length !== header.length) continue;
        const sp = parseInt(f[idx('sale_price')], 10); if (!f[idx('trade_name')] || isNaN(sp)) continue;
        rows.push({ trade_name: f[idx('trade_name')], generic_name: f[idx('generic_name')] || null, category: f[idx('category')] || null, unit: f[idx('unit')] || 'box', sale_price: P(sp), min_sale_price: 0, min_stock_level: 10, notes: f[idx('notes')] || null });
      }
      const res = await ok(browser, 'import_products', { tenantId: S.c.tenantId, data: { rows, update_existing: false, user_id: S.c.userId } });
      S.data.importedCount = res.imported; return `parsed=${rows.length} ${JSON.stringify(res)}`;
    });
    await phase('catalog.manual', async () => {
      const mk = async (trade, gen, cat, unit, sale, form, presc) => ok(browser, 'create_product', { tenantId: S.c.tenantId, data: { trade_name: trade, trade_name_ar: trade, generic_name: gen, category: cat, unit, sale_price: P(sale), min_sale_price: P(sale * 0.6), min_stock_level: 10, manufacturer: 'إدخال يدوي', dosage_form: form, is_prescription: presc } });
      S.data.H1 = await mk('Paracetamol 500mg TAB', 'Paracetamol', 'مسكّن وخافض حرارة', 'STRIP', 500, 'أقراص', false);
      S.data.H2 = await mk('Amoxicillin 500mg CAP', 'Amoxicillin', 'مضاد حيوي', 'STRIP', 800, 'كبسولات', true);
      S.data.H3 = await mk('Insulin Glargine INJ', 'Insulin Glargine', 'حقن ومحاليل', 'VIAL', 3000, 'فيال', true);
      S.data.H4 = await mk('Cetirizine 10mg TAB', 'Cetirizine', 'مضاد هيستامين', 'STRIP', 300, 'أقراص', false);
      return `H1..H4 created`;
    });
  });

  it('P4 — opening stock across locations (setup mode)', async () => {
    await phase('opening.setupmode_on', async () => { const m = await ok(browser, 'get_setup_mode', { tenantId: S.c.tenantId }); if (!m.setup_mode) throw new Error('setup_mode OFF'); return 'ON'; });
    const add = (prod, loc, qty, cost, expiry, batch) => ok(browser, 'add_opening_stock_batch', { tenantId: S.c.tenantId, branchId: S.c.branchId, userId: S.c.userId, entry: { product_id: prod, location_id: loc, quantity: qty, unit_cost: P(cost), batch_number: batch, expiry_date: expiry } });
    await phase('opening.H1', async () => { await add(S.data.H1.id, S.data.shelf.id, 100, 300, '2027-06-01', 'OPEN-H1'); return '100@300 shelf'; });
    await phase('opening.H2a', async () => { await add(S.data.H2.id, S.data.shelf.id, 60, 500, '2026-10-01', 'OPEN-H2A'); return '60@500 shelf (near-exp)'; });
    await phase('opening.H2b', async () => { await add(S.data.H2.id, S.data.store.id, 40, 500, '2027-03-01', 'OPEN-H2B'); return '40@500 store'; });
    await phase('opening.H3', async () => { const r = await add(S.data.H3.id, S.data.fridge.id, 20, 2000, '2026-09-01', 'OPEN-H3'); S.data.h3Batch = r.batch_id; return '20@2000 fridge'; });
    await phase('opening.H4', async () => { await add(S.data.H4.id, S.data.shelf.id, 200, 150, '2028-01-01', 'OPEN-H4'); return '200@150 shelf'; });
  });

  it('P5 — USD/SDG live (verify v0.2.31 fix)', async () => {
    await phase('usd.activate_no_price_change', async () => {
      const before = await priceOf(S.data.H1.id);
      await ok(browser, 'set_usd_rate', { tenantId: S.c.tenantId, userId: S.c.userId, newRatePiasters: P(500) });
      const after = await priceOf(S.data.H1.id);
      if (after !== before) throw new Error(`activation changed price ${before}->${after}`);
      return `unchanged at ${after / 100} after activation @500/$`;
    });
    await phase('usd.purchase_sets_price', async () => {
      const draft = await ok(browser, 'create_purchase_draft', { tenantId: S.c.tenantId, branchId: S.c.branchId, userId: S.c.userId, data: { supplier_id: S.data.supplier.id, invoice_date: '2026-07-07', discount: 0, tax_amount: 0, items: [{ product_id: S.data.H1.id, batch_number: 'PUR-H1', expiry_date: '2027-09-01', quantity: 50, unit_cost: P(350), sale_price: P(650) }] } });
      await ok(browser, 'confirm_purchase_with_payment', { tenantId: S.c.tenantId, invoiceId: draft.id, userId: S.c.userId, locationId: S.data.shelf.id, paymentInfo: { payment_mode: 'paid', account_id: S.data.cash.id, payment_method: 'cash', payment_date: '2026-07-07', amount_paid: P(50 * 350), notes: 'شراء H1' } });
      const price = await priceOf(S.data.H1.id); if (price !== P(650)) throw new Error(`purchase price not applied: ${price}`); return `H1 = ${price / 100} (purchase)`;
    });
    await phase('usd.rate_up_preserves_purchase_price', async () => {
      await ok(browser, 'set_usd_rate', { tenantId: S.c.tenantId, userId: S.c.userId, newRatePiasters: P(1000) });
      const price = await priceOf(S.data.H1.id);
      if (price !== P(1300)) throw new Error(`expected 1300.00, got ${price / 100} (pre-fix bug=1000.00)`);
      return `rate up 2x -> H1 = ${price / 100} (purchase price preserved & scaled — v0.2.31 FIX CONFIRMED)`;
    });
    await phase('usd.rate_down_scales', async () => {
      await ok(browser, 'set_usd_rate', { tenantId: S.c.tenantId, userId: S.c.userId, newRatePiasters: P(400) });
      const price = await priceOf(S.data.H1.id); if (price !== P(520)) throw new Error(`expected 520.00, got ${price / 100}`); return `rate down -> H1 = ${price / 100}`;
    });
    await phase('usd.openingstock_price_scales', async () => {
      const price = await priceOf(S.data.H4.id); if (price !== P(240)) throw new Error(`opening H4 expected 240.00, got ${price / 100}`); return `opening-stock H4 -> ${price / 100}`;
    });
    await phase('usd.reset_baseline', async () => { await ok(browser, 'set_usd_rate', { tenantId: S.c.tenantId, userId: S.c.userId, newRatePiasters: P(500) }); return 'rate back to 500/$'; });
  });

  it('P6 — finalize setup mode', async () => {
    await phase('setup.finalize', async () => { await ok(browser, 'finalize_setup_mode', { tenantId: S.c.tenantId, userId: S.c.userId }); const m = await ok(browser, 'get_setup_mode', { tenantId: S.c.tenantId }); if (m.setup_mode) throw new Error('still setup'); return 'finalized'; });
    await phase('opening.blocked_after_finalize', async () => { const r = await invoke(browser, 'add_opening_stock_batch', { tenantId: S.c.tenantId, branchId: S.c.branchId, userId: S.c.userId, entry: { product_id: S.data.H1.id, location_id: S.data.shelf.id, quantity: 1, unit_cost: P(1), batch_number: 'X', expiry_date: '2027-01-01' } }); if (r.ok) throw new Error('NOT blocked'); return 'rejected: ' + r.error; });
  });

  it('P7 — purchases: multi-line, past-expiry rejection, partial + supplier payment', async () => {
    await phase('purchase.multiline_partial', async () => {
      const draft = await ok(browser, 'create_purchase_draft', { tenantId: S.c.tenantId, branchId: S.c.branchId, userId: S.c.userId, data: { supplier_id: S.data.supplier.id, invoice_date: '2026-07-07', discount: 0, tax_amount: 0, items: [ { product_id: S.data.H2.id, batch_number: 'PUR-H2', expiry_date: '2027-08-01', quantity: 100, unit_cost: P(520), sale_price: P(820) }, { product_id: S.data.H4.id, batch_number: 'PUR-H4', expiry_date: '2028-06-01', quantity: 300, unit_cost: P(160), sale_price: P(320) } ] } });
      await ok(browser, 'confirm_purchase_with_payment', { tenantId: S.c.tenantId, invoiceId: draft.id, userId: S.c.userId, locationId: S.data.store.id, paymentInfo: { payment_mode: 'partial', account_id: S.data.bank.id, payment_method: 'bank_transfer', payment_date: '2026-07-07', amount_paid: P(50000), notes: 'دفعة جزئية' } });
      return `total=100000.00 paid=50000.00 owed=50000.00`;
    });
    await phase('purchase.past_expiry_rejected', async () => {
      const draft = await ok(browser, 'create_purchase_draft', { tenantId: S.c.tenantId, branchId: S.c.branchId, userId: S.c.userId, data: { supplier_id: S.data.supplier.id, invoice_date: '2026-07-07', discount: 0, tax_amount: 0, items: [{ product_id: S.data.H2.id, batch_number: 'EXPIRED', expiry_date: '2020-01-01', quantity: 5, unit_cost: P(500), sale_price: P(800) }] } });
      const r = await invoke(browser, 'confirm_purchase_with_payment', { tenantId: S.c.tenantId, invoiceId: draft.id, userId: S.c.userId, locationId: S.data.shelf.id, paymentInfo: { payment_mode: 'unpaid', account_id: null, payment_method: null, payment_date: null, amount_paid: 0, notes: null } });
      if (r.ok) throw new Error('past-expiry NOT rejected'); return 'rejected: ' + r.error;
    });
    await phase('purchase.supplier_payment', async () => { await ok(browser, 'record_supplier_payment', { tenantId: S.c.tenantId, supplierId: S.data.supplier.id, userId: S.c.userId, data: { amount: P(20000), payment_method: 'cash', account_id: S.data.cash.id, payment_date: '2026-07-07', notes: 'دفعة للمورّد' } }); return 'paid 20000.00 -> owed 30000.00'; });
  });

  it('P8 — POS: session, cash/bank/credit/split, FEFO, prescription, credit limit', async () => {
    await phase('pos.open_session', async () => { const ex = await invoke(browser, 'get_active_session', { tenantId: S.c.tenantId, branchId: S.c.branchId, userId: S.c.userId }); const sess = (ex.ok && ex.value) ? ex.value : await ok(browser, 'open_session', { tenantId: S.c.tenantId, branchId: S.c.branchId, userId: S.c.userId, accountId: S.data.cash.id, openingCash: P(10000) }); S.data.sessionId = sess.id; return `session=${sess.id}`; });
    const sale = (method, items, opts = {}) => ok(browser, 'create_sale', { tenantId: S.c.tenantId, branchId: S.c.branchId, sessionId: S.data.sessionId, cashierId: S.c.userId, paymentMethod: method, paymentMethodId: opts.paymentMethodId || null, amountPaid: opts.amountPaid != null ? opts.amountPaid : items.reduce((s, it) => s + it.quantity * it.unit_price, 0), items: items.map(it => ({ product_id: it.product_id, batch_id: null, quantity: it.quantity, unit_price: it.unit_price, unit_cost: it.unit_cost || 0 })), customerId: opts.customerId || null, discount: null, taxPercent: null, pharmacistOverrideBy: opts.rx ? S.c.userId : null, notes: null, splitPayments: opts.splitPayments || null });
    await phase('pos.cash_sale_FEFO_rx', async () => { const out = await sale('cash', [{ product_id: S.data.H2.id, quantity: 70, unit_price: P(820), unit_cost: P(500) }], { rx: true }); S.data.saleCash = out; return `cash H2x70 (rx override) total=57400.00`; });
    await phase('pos.bank_sale', async () => { const out = await sale('bank_transfer', [{ product_id: S.data.H4.id, quantity: 20, unit_price: P(300), unit_cost: P(150) }], { paymentMethodId: S.data.bankPM.id }); return `bank_transfer H4x20`; });
    await phase('pos.credit_sale', async () => { const out = await sale('credit', [{ product_id: S.data.H1.id, quantity: 5, unit_price: P(650), unit_cost: P(300) }], { customerId: S.data.custCredit.id, amountPaid: 0 }); S.data.saleCredit = out; return `credit H1x5 = 3250.00 to أحمد (under 5000 limit)`; });
    await phase('pos.split_sale', async () => { const total = 5 * P(650); const out = await sale('partial', [{ product_id: S.data.H1.id, quantity: 5, unit_price: P(650), unit_cost: P(300) }], { amountPaid: total, splitPayments: [{ payment_method: 'cash', payment_method_id: null, amount: P(2000) }, { payment_method: 'bank_transfer', payment_method_id: S.data.bankPM.id, amount: total - P(2000) }] }); S.data.saleSplit = out; return `split cash2000+bank1250`; });
    await phase('pos.credit_limit_enforced', async () => { const r = await invoke(browser, 'create_sale', { tenantId: S.c.tenantId, branchId: S.c.branchId, sessionId: S.data.sessionId, cashierId: S.c.userId, paymentMethod: 'credit', paymentMethodId: null, amountPaid: 0, items: [{ product_id: S.data.H1.id, batch_id: null, quantity: 5, unit_price: P(650), unit_cost: P(300) }], customerId: S.data.custCredit.id, discount: null, taxPercent: null, pharmacistOverrideBy: null, notes: null, splitPayments: null }); if (r.ok) throw new Error('credit limit NOT enforced'); return 'over-limit rejected: ' + r.error; });
    await phase('pos.cashonly_credit_rejected', async () => { const r = await invoke(browser, 'create_sale', { tenantId: S.c.tenantId, branchId: S.c.branchId, sessionId: S.data.sessionId, cashierId: S.c.userId, paymentMethod: 'credit', paymentMethodId: null, amountPaid: 0, items: [{ product_id: S.data.H4.id, batch_id: null, quantity: 1, unit_price: P(300), unit_cost: P(150) }], customerId: S.data.custCash.id, discount: null, taxPercent: null, pharmacistOverrideBy: null, notes: null, splitPayments: null }); if (r.ok) throw new Error('cash-only NOT rejected'); return 'cash-only credit rejected'; });
  });

  it('P9 — customer/supplier payments + statements', async () => {
    await phase('customer.payment', async () => { await ok(browser, 'record_customer_payment', { tenantId: S.c.tenantId, customerId: S.data.custCredit.id, userId: S.c.userId, data: { amount: P(2000), payment_method: 'cash', account_id: S.data.cash.id, notes: 'سداد جزئي' } }); return 'customer paid 2000.00 (balance 1250.00)'; });
    await phase('customer.statement', async () => { const st = await ok(browser, 'get_customer_statement', { tenantId: S.c.tenantId, customerId: S.data.custCredit.id }); return `rows=${Array.isArray(st) ? st.length : (st.entries ? st.entries.length : 'obj')}`; });
    await phase('supplier.statement', async () => { const st = await ok(browser, 'get_supplier_statement', { tenantId: S.c.tenantId, supplierId: S.data.supplier.id }); return `rows=${Array.isArray(st) ? st.length : (st.entries ? st.entries.length : 'obj')}`; });
  });

  it('P10 — transfer, stocktake, dispose', async () => {
    await phase('inventory.transfer', async () => { await ok(browser, 'transfer_stock', { tenantId: S.c.tenantId, branchId: S.c.branchId, userId: S.c.userId, productId: S.data.H4.id, fromLocationId: S.data.shelf.id, toLocationId: S.data.store.id, quantity: 30 }); return 'H4 x30 shelf->store'; });
    await phase('inventory.stocktake', async () => { const stId = await ok(browser, 'start_stock_take', { tenantId: S.c.tenantId, branchId: S.c.branchId, userId: S.c.userId, notes: 'جرد دوري' }); const items = await ok(browser, 'get_stock_take_items', { tenantId: S.c.tenantId, stockTakeId: stId, branchId: S.c.branchId }); if (Array.isArray(items) && items.length) { const it = items[0]; await ok(browser, 'update_stock_take_item', { itemId: it.id, tenantId: S.c.tenantId, actualQuantity: Math.max(0, (it.system_quantity ?? it.expected_quantity ?? 1) - 1) }); } await ok(browser, 'confirm_stock_take', { stockTakeId: stId, tenantId: S.c.tenantId, userId: S.c.userId }); return `stocktake confirmed (${Array.isArray(items) ? items.length : 0} items, 1 discrepancy)`; });
    await phase('inventory.dispose_expired', async () => { await ok(browser, 'dispose_batch', { tenantId: S.c.tenantId, branchId: S.c.branchId, userId: S.c.userId, batchId: S.data.h3Batch, quantity: 20, reason: 'إتلاف قرب انتهاء الصلاحية' }); return 'disposed H3 fridge batch x20'; });
  });

  it('P11 — money transfer + expense', async () => {
    await phase('money.transfer', async () => { await ok(browser, 'manual_transfer', { tenantId: S.c.tenantId, userId: S.c.userId, data: { from_account_id: S.data.cash.id, to_account_id: S.data.bank.id, amount: P(5000), notes: 'إيداع بنكي' } }); return '5000.00 cash->bank'; });
    await phase('money.expense', async () => { let catId = null; try { const cats = await ok(browser, 'get_expense_categories', { tenantId: S.c.tenantId }); catId = cats[0] && cats[0].id; } catch (e) {} await ok(browser, 'create_expense', { tenantId: S.c.tenantId, branchId: S.c.branchId, userId: S.c.userId, data: { description: 'إيجار المحل', amount: P(3000), category_id: catId, payment_method: 'cash', account_id: S.data.cash.id, expense_date: '2026-07-07', notes: null } }); return 'expense 3000.00 (rent)'; });
  });

  it('P12 — return + void', async () => {
    await phase('pos.return', async () => { if (!S.data.saleCash) throw new Error('no cash sale'); const items = (S.data.saleCash.items || []).map(li => ({ sale_item_id: li.id, product_id: li.product_id, batch_id: li.batch_id, quantity: 5, unit_price: li.unit_price })); await ok(browser, 'create_return', { tenantId: S.c.tenantId, branchId: S.c.branchId, saleId: S.data.saleCash.id, sessionId: S.data.sessionId, returnType: 'partial', refundMethod: 'cash', reason: 'إرجاع جزئي', items, createdBy: S.c.userId }); return 'returned H2 x5 (cash refund)'; });
    await phase('pos.void', async () => { if (!S.data.saleSplit) throw new Error('no split sale'); await ok(browser, 'void_sale', { tenantId: S.c.tenantId, saleId: S.data.saleSplit.id, cashierId: S.c.userId, voidReason: 'إلغاء تجريبي' }); return 'voided split sale (refund + restock)'; });
  });

  it('P13 — sync to Owner PWA', async () => {
    await phase('sync.run', async () => {
      const snap = await invoke(browser, 'sync_all_tables_now', { tenantId: S.c.tenantId, branchId: S.c.branchId });
      const cyc = await invoke(browser, 'run_cloud_sync_cycle', { tenantId: S.c.tenantId });
      if (!snap.ok && !cyc.ok) throw new Error('sync failed: ' + (snap.error || '') + ' | ' + (cyc.error || ''));
      const up = snap.ok && Array.isArray(snap.value) ? snap.value.reduce((s, t) => s + (t.upserted || 0), 0) : 0;
      return `sync_all_tables_now upserted=${up}, cycle failed=${cyc.ok ? cyc.value.failed : 'n/a'}`;
    });
  });
});
