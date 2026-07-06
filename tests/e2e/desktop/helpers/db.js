// Read-only DB access for reconciliation & teardown truth.
// The desktop SQLite DB is the app's source of truth; report SCREENS are just
// views over it. We reconcile the expected ledger against these queries (and
// separately confirm each report screen loads). All reads scope to the tenant.
import { DB_FILE, E2E_PREFIX } from '../../config/env.js';

const TENANT = process.env.TAJ_TENANT_ID || '15b8a3e7-6c9f-43a9-8573-99eb81a88bb1';

async function open() {
  const { DatabaseSync } = await import('node:sqlite');
  return new DatabaseSync(DB_FILE, { readOnly: true });
}

// Run a set of read queries against a single connection.
export async function withDb(fn) {
  const db = await open();
  try { return await fn(db, TENANT); }
  finally { db.close(); }
}

// --- Entity lookups (by E2E tag) -------------------------------------------
export async function findByName(table, col, name) {
  return withDb((db) =>
    db.prepare(`SELECT * FROM ${table} WHERE ${col} = ? AND tenant_id = ?`).get(name, TENANT));
}

export async function listE2E(table, col) {
  return withDb((db) =>
    db.prepare(`SELECT * FROM ${table} WHERE ${col} LIKE ? AND tenant_id = ?`)
      .all(`${E2E_PREFIX}%`, TENANT));
}

// --- Reconciliation reads ---------------------------------------------------
// Current on-hand for a product = sum of active batch quantities.
export async function productStock(productId) {
  return withDb((db) => {
    const r = db.prepare(
      `SELECT COALESCE(SUM(quantity_current),0) AS q FROM batches
       WHERE product_id = ? AND (deleted_at IS NULL) AND status != 'depleted'`).get(productId);
    return Number(r.q);
  });
}

// Per-location on-hand for a product.
export async function productStockByLocation(productId) {
  return withDb((db) =>
    db.prepare(
      `SELECT location_id, COALESCE(SUM(quantity_current),0) AS q FROM batches
       WHERE product_id = ? AND deleted_at IS NULL GROUP BY location_id`).all(productId));
}

export async function customerBalance(customerId) {
  return withDb((db) => {
    const r = db.prepare(`SELECT current_balance FROM customers WHERE id = ?`).get(customerId);
    return r ? Number(r.current_balance) : null;
  });
}

export async function accountBalance(accountId) {
  return withDb((db) => {
    const r = db.prepare(`SELECT current_balance FROM accounts WHERE id = ?`).get(accountId);
    return r ? Number(r.current_balance) : null;
  });
}

export async function accountByName(name) {
  return withDb((db) =>
    db.prepare(`SELECT * FROM accounts WHERE (name = ? OR name_ar = ?) AND tenant_id = ?`).get(name, name, TENANT));
}

export async function listAccounts() {
  return withDb((db) =>
    db.prepare(`SELECT id,name,name_ar,account_type,current_balance,is_default FROM accounts
                WHERE tenant_id = ? AND deleted_at IS NULL`).all(TENANT));
}

// Supplier debt = confirmed invoice totals - amount paid (+ opening balance).
export async function supplierBalance(supplierId) {
  return withDb((db) => {
    const inv = db.prepare(
      `SELECT COALESCE(SUM(total - amount_paid),0) AS d FROM supplier_invoices
       WHERE supplier_id = ? AND deleted_at IS NULL AND status='confirmed'`).get(supplierId);
    const s = db.prepare(`SELECT opening_balance FROM suppliers WHERE id = ?`).get(supplierId);
    return Number(inv.d) + Number(s?.opening_balance || 0);
  });
}

export async function movementsFor(referenceType, referenceId) {
  return withDb((db) =>
    db.prepare(`SELECT movement_type, quantity_change, product_id, batch_id FROM stock_movements
                WHERE reference_type = ? AND reference_id = ?`).all(referenceType, referenceId));
}

export async function movementTypesForProduct(productId) {
  return withDb((db) =>
    db.prepare(`SELECT movement_type, COUNT(*) c, COALESCE(SUM(quantity_change),0) q
                FROM stock_movements WHERE product_id = ? GROUP BY movement_type`).all(productId));
}

export async function saleByNumber(saleNumber) {
  return withDb((db) =>
    db.prepare(`SELECT * FROM sales WHERE sale_number = ? AND tenant_id = ?`).get(saleNumber, TENANT));
}

export async function sessionsInRange(fromIso, toIso) {
  return withDb((db) =>
    db.prepare(`SELECT * FROM pos_sessions WHERE tenant_id = ? AND opened_at BETWEEN ? AND ?`)
      .all(TENANT, fromIso, toIso));
}

export const tenantId = TENANT;
