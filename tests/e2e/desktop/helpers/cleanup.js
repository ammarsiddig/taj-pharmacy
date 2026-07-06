// Deletes ONLY E2E_TEST_-tagged rows from the desktop database.
//
// This is the last line of the self-cleaning guarantee: after the write suite
// voids its sale in-app, this sweep hard-deletes the tagged product row(s) it
// created. It targets a fixed allow-list of (table, column) pairs and a strict
// `column LIKE 'E2E_TEST_%'` predicate, so it can NEVER touch a pre-existing
// record. It refuses to run while the app is open (WAL would be inconsistent).
//
// Usage:
//   node desktop/helpers/cleanup.js            # DRY RUN — lists what it would delete
//   node desktop/helpers/cleanup.js --delete   # actually deletes tagged rows
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { DB_FILE, E2E_PREFIX } from '../../config/env.js';

// Only these columns are ever swept. Every entity the harness creates is named
// with the E2E_PREFIX, so it always lands in one of these.
const TARGETS = [
  { table: 'products', column: 'trade_name' },
];

function appIsRunning() {
  try {
    const out = execSync(
      'powershell -NoProfile -Command "(Get-Process app -ErrorAction SilentlyContinue | Measure-Object).Count"',
      { encoding: 'utf8' }
    );
    return Number(out.trim()) > 0;
  } catch { return false; }
}

export async function sweep({ del = false } = {}) {
  if (appIsRunning()) {
    throw new Error('Refusing to sweep: app.exe is running. Close it first (WAL not flushed).');
  }
  // Lazy import so merely loading this module (e.g. in the runner) doesn't emit
  // the node:sqlite experimental warning — only an actual sweep pays that cost.
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(DB_FILE);
  const like = `${E2E_PREFIX}%`;
  let total = 0;
  try {
    for (const { table, column } of TARGETS) {
      let rows;
      try {
        rows = db.prepare(`SELECT rowid, ${column} AS v FROM ${table} WHERE ${column} LIKE ?`).all(like);
      } catch (e) {
        console.warn(`[cleanup] skipping ${table}.${column}: ${e.message}`);
        continue;
      }
      if (rows.length === 0) continue;
      console.log(`[cleanup] ${table}.${column}: ${rows.length} tagged row(s): ${rows.map(r => r.v).join(', ')}`);
      total += rows.length;
      if (del) {
        const info = db.prepare(`DELETE FROM ${table} WHERE ${column} LIKE ?`).run(like);
        console.log(`[cleanup]   deleted ${info.changes} row(s) from ${table}`);
      }
    }
  } finally {
    db.close();
  }
  if (total === 0) console.log('[cleanup] no E2E_TEST_ rows found — nothing to do.');
  else if (!del) console.log(`[cleanup] DRY RUN: ${total} tagged row(s) would be deleted. Re-run with --delete.`);
  return total;
}

// Comprehensive teardown for the day-in-the-life suite: deletes E2E_TEST_ entities
// AND their dependent rows. Scoped strictly to rows tied to E2E_TEST_-named
// products/customers/suppliers or E2E_TEST_-tagged notes — never touches
// pre-existing data. Runs only while the app is closed.
export async function fullSweep({ del = false } = {}) {
  if (appIsRunning()) throw new Error('Refusing to full-sweep: app.exe is running. Close it first.');
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(DB_FILE);
  const like = `${E2E_PREFIX}%`;
  const ids = (rows) => rows.map((r) => `'${r.id}'`).join(',') || "''";
  const report = {};
  try {
    const prods = db.prepare(`SELECT id FROM products WHERE trade_name LIKE ?`).all(like);
    const custs = db.prepare(`SELECT id FROM customers WHERE name LIKE ?`).all(like);
    const sups = db.prepare(`SELECT id FROM suppliers WHERE name LIKE ?`).all(like);
    const pIds = ids(prods), cIds = ids(custs), sIds = ids(sups);
    // Sales we created are tagged in notes; also any sale for an E2E customer.
    const sales = db.prepare(`SELECT id FROM sales WHERE notes LIKE ? OR customer_id IN (${cIds})`).all(like);
    const saleIds = ids(sales);
    const invs = db.prepare(`SELECT id FROM supplier_invoices WHERE supplier_id IN (${sIds})`).all();
    const invIds = ids(invs);

    // Ordered child-first deletions, each scoped to E2E rows.
    const stmts = [
      `DELETE FROM return_items WHERE return_id IN (SELECT id FROM returns WHERE sale_id IN (${saleIds}))`,
      `DELETE FROM returns WHERE sale_id IN (${saleIds})`,
      `DELETE FROM sale_payments WHERE sale_id IN (${saleIds})`,
      `DELETE FROM sale_items WHERE sale_id IN (${saleIds})`,
      `DELETE FROM sales WHERE id IN (${saleIds})`,
      `DELETE FROM stock_movements WHERE product_id IN (${pIds})`,
      `DELETE FROM batches WHERE product_id IN (${pIds})`,
      `DELETE FROM supplier_invoice_items WHERE invoice_id IN (${invIds})`,
      `DELETE FROM supplier_invoices WHERE supplier_id IN (${sIds})`,
      `DELETE FROM supplier_payments WHERE supplier_id IN (${sIds})`,
      `DELETE FROM customer_payments WHERE customer_id IN (${cIds})`,
      `DELETE FROM stock_take_items WHERE stock_take_id IN (SELECT id FROM stock_takes WHERE notes LIKE '${like}')`,
      `DELETE FROM stock_takes WHERE notes LIKE '${like}'`,
      `DELETE FROM expenses WHERE description LIKE '${like}'`,
      `DELETE FROM pos_sessions WHERE notes LIKE '${like}'`,
      `DELETE FROM products WHERE id IN (${pIds})`,
      `DELETE FROM customers WHERE id IN (${cIds})`,
      `DELETE FROM suppliers WHERE id IN (${sIds})`,
    ];
    console.log(`[fullSweep] E2E entities: products=${prods.length} customers=${custs.length} suppliers=${sups.length} sales=${sales.length} invoices=${invs.length}`);
    for (const sql of stmts) {
      if (del) {
        try { const info = db.prepare(sql).run(); if (info.changes) console.log(`[fullSweep]   -${info.changes}: ${sql.slice(0, 60)}…`); }
        catch (e) { console.warn(`[fullSweep] skip: ${e.message}`); }
      }
    }
    if (!del) console.log('[fullSweep] DRY RUN — re-run with --delete to remove the above.');
    report.products = prods.length; report.customers = custs.length; report.suppliers = sups.length;
  } finally { db.close(); }
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const full = process.argv.includes('--full');
  const del = process.argv.includes('--delete');
  if (full) await fullSweep({ del });
  else await sweep({ del });
}
