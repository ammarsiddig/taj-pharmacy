// Writable test-fixture helpers. Used ONLY to set up negative-path preconditions
// the app itself refuses to create — chiefly EXPIRED batches (a real purchase
// rejects past expiry, so we can't get an expired batch through the app). Every
// row is E2E_TEST_-tagged and removed by the snapshot restore at teardown.
//
// A single short INSERT between app operations is safe under SQLite WAL (writers
// serialize); we keep these to a minimum.
import { DB_FILE, E2E_PREFIX } from '../../config/env.js';

const TENANT = process.env.TAJ_TENANT_ID || '15b8a3e7-6c9f-43a9-8573-99eb81a88bb1';
const BRANCH = process.env.TAJ_BRANCH_ID || '2fc6b2b3-d6c2-41d0-ab94-96977c543b10';

async function open() {
  const { DatabaseSync } = await import('node:sqlite');
  return new DatabaseSync(DB_FILE);
}

// Insert a batch directly with an arbitrary expiry (incl. past). Returns id.
export async function insertBatch({ productId, locationId, expiryDate, quantity, unitCost = 6000, batchNumber, status = 'active' }) {
  const db = await open();
  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO batches (id, tenant_id, product_id, supplier_invoice_id, location_id, batch_number,
         expiry_date, quantity_received, quantity_current, unit_cost, status, created_at, updated_at, branch_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(id, TENANT, productId, null, locationId, batchNumber || `${E2E_PREFIX}FIX_${Date.now()}`,
      expiryDate, quantity, quantity, unitCost, status, now, now, BRANCH);
    return id;
  } finally { db.close(); }
}

export async function batchQty(batchId) {
  const db = await open();
  try {
    const r = db.prepare('SELECT quantity_current, status FROM batches WHERE id = ?').get(batchId);
    return r ? { qty: Number(r.quantity_current), status: r.status } : null;
  } finally { db.close(); }
}
