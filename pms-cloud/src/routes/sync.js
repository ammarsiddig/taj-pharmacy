/**
 * Table-Snapshot Sync API
 * Phase 5: Read-Replica Architecture
 * 
 * Endpoints for desktop to push full table snapshots (delta sync)
 * Supports: products, batches, customers, suppliers, pos_sales, expenses, stock_movements
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, transaction } from '../db.js';
import { authenticateToken } from '../auth.js';
import { syncLimiter } from '../middleware/rate-limit.js';
import versionCheck from '../middleware/version-check.js';

const router = Router();

router.use('/v1/sync', versionCheck);

/**
 * Recompute dashboard_summaries for a tenant+branch from snapshot tables.
 * Called after every sync so the owner PWA shows fresh data immediately.
 */
async function recomputeDashboard(tenantId, branchId) {
  const today = "CURRENT_DATE";
  const monthStart = "DATE_TRUNC('month', CURRENT_DATE)";
  const thirtyDays = "CURRENT_DATE + INTERVAL '30 days'";

  const [products, customers, suppliers, todaySales, monthSales, stock, expiring, receivables, payables, monthExpenses, todayExpenses] = await Promise.all([
    query('SELECT COUNT(*) FROM snapshot_products WHERE tenant_id=$1 AND branch_id=$2 AND is_active=true', [tenantId, branchId]),
    query('SELECT COUNT(*) FROM snapshot_customers WHERE tenant_id=$1 AND branch_id=$2 AND is_active=true', [tenantId, branchId]),
    query('SELECT COUNT(*) FROM snapshot_suppliers WHERE tenant_id=$1 AND branch_id=$2 AND is_active=true', [tenantId, branchId]),
    query(`SELECT COUNT(*), COALESCE(SUM(total),0) AS total,
              COALESCE(SUM(CASE WHEN payment_method='cash' THEN total ELSE 0 END),0) AS cash,
              COALESCE(SUM(CASE WHEN payment_method='bank_transfer' THEN total ELSE 0 END),0) AS bank,
              COALESCE(SUM(CASE WHEN payment_method='credit' THEN total ELSE 0 END),0) AS credit
           FROM snapshot_pos_sales
           WHERE tenant_id=$1 AND branch_id=$2 AND is_return=false AND DATE(created_at)=${today}`, [tenantId, branchId]),
    query(`SELECT COUNT(*), COALESCE(SUM(total),0) AS total
           FROM snapshot_pos_sales
           WHERE tenant_id=$1 AND branch_id=$2 AND is_return=false AND created_at>=${monthStart}`, [tenantId, branchId]),
    query(`SELECT
              SUM(CASE WHEN current_stock=0 THEN 1 ELSE 0 END) AS out_of_stock,
              SUM(CASE WHEN current_stock>0 AND current_stock<=min_stock THEN 1 ELSE 0 END) AS low_stock
           FROM snapshot_products WHERE tenant_id=$1 AND branch_id=$2 AND is_active=true`, [tenantId, branchId]),
    query(`SELECT COUNT(*) FROM snapshot_batches
           WHERE tenant_id=$1 AND branch_id=$2 AND is_active=true AND quantity>0
             AND expiry_date IS NOT NULL AND expiry_date <= ${thirtyDays} AND expiry_date >= ${today}`, [tenantId, branchId]),
    query('SELECT COALESCE(SUM(current_balance),0) FROM snapshot_customers WHERE tenant_id=$1 AND branch_id=$2', [tenantId, branchId]),
    query('SELECT COALESCE(SUM(current_balance),0) FROM snapshot_suppliers WHERE tenant_id=$1 AND branch_id=$2', [tenantId, branchId]),
    query(`SELECT COALESCE(SUM(amount),0) FROM snapshot_expenses
           WHERE tenant_id=$1 AND branch_id=$2 AND expense_date>=${monthStart}`, [tenantId, branchId]),
    query(`SELECT COALESCE(SUM(amount),0) FROM snapshot_expenses
           WHERE tenant_id=$1 AND branch_id=$2 AND expense_date=${today}`, [tenantId, branchId]),
  ]);

  await query(`
    INSERT INTO dashboard_summaries
      (tenant_id, branch_id, products_count, customers_count, suppliers_count,
       today_sales_count, today_sales_total, today_cash_sales, today_bank_sales, today_credit_sales,
       month_sales_count, month_sales_total,
       out_of_stock_count, low_stock_count, expiring_soon_count,
       total_receivables, total_payables, month_expenses_total, today_expenses_total, computed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())
    ON CONFLICT (tenant_id, branch_id)
    DO UPDATE SET
      products_count=$3, customers_count=$4, suppliers_count=$5,
      today_sales_count=$6, today_sales_total=$7, today_cash_sales=$8, today_bank_sales=$9, today_credit_sales=$10,
      month_sales_count=$11, month_sales_total=$12,
      out_of_stock_count=$13, low_stock_count=$14, expiring_soon_count=$15,
      total_receivables=$16, total_payables=$17, month_expenses_total=$18, today_expenses_total=$19,
      computed_at=NOW()
  `, [
    tenantId, branchId,
    parseInt(products.rows[0].count),
    parseInt(customers.rows[0].count),
    parseInt(suppliers.rows[0].count),
    parseInt(todaySales.rows[0].count),
    parseInt(todaySales.rows[0].total),
    parseInt(todaySales.rows[0].cash),
    parseInt(todaySales.rows[0].bank),
    parseInt(todaySales.rows[0].credit),
    parseInt(monthSales.rows[0].count),
    parseInt(monthSales.rows[0].total),
    parseInt(stock.rows[0].out_of_stock) || 0,
    parseInt(stock.rows[0].low_stock) || 0,
    parseInt(expiring.rows[0].count) || 0,
    parseInt(receivables.rows[0].coalesce) || 0,
    parseInt(payables.rows[0].coalesce) || 0,
    parseInt(monthExpenses.rows[0].coalesce) || 0,
    parseInt(todayExpenses.rows[0].coalesce) || 0,
  ]);
}

// Table column definitions for UPSERT operations
const TABLE_SCHEMAS = {
  products: {
    columns: ['id', 'tenant_id', 'branch_id', 'name', 'name_ar', 'barcode', 'category', 'unit_measure', 'purchase_price', 'sale_price', 'tax_percent', 'min_stock', 'current_stock', 'generic_name', 'generic_name_ar', 'dosage_form', 'manufacturer', 'active_ingredient', 'storage_conditions', 'is_prescription', 'image_path', 'is_active', 'updated_at'],
    conflictColumns: ['tenant_id', 'branch_id', 'id'],
    updateColumns: ['name', 'name_ar', 'barcode', 'category', 'unit_measure', 'purchase_price', 'sale_price', 'tax_percent', 'min_stock', 'current_stock', 'generic_name', 'generic_name_ar', 'dosage_form', 'manufacturer', 'active_ingredient', 'storage_conditions', 'is_prescription', 'image_path', 'is_active', 'updated_at', 'synced_at']
  },
  batches: {
    columns: ['id', 'tenant_id', 'branch_id', 'product_id', 'batch_number', 'expiry_date', 'quantity', 'purchase_price', 'location_id', 'is_active', 'updated_at'],
    conflictColumns: ['tenant_id', 'branch_id', 'id'],
    updateColumns: ['product_id', 'batch_number', 'expiry_date', 'quantity', 'purchase_price', 'location_id', 'is_active', 'updated_at', 'synced_at']
  },
  customers: {
    columns: ['id', 'tenant_id', 'branch_id', 'name', 'name_ar', 'phone', 'credit_limit', 'current_balance', 'total_purchases', 'email', 'address', 'notes', 'is_active', 'updated_at'],
    conflictColumns: ['tenant_id', 'branch_id', 'id'],
    updateColumns: ['name', 'name_ar', 'phone', 'credit_limit', 'current_balance', 'total_purchases', 'email', 'address', 'notes', 'is_active', 'updated_at', 'synced_at']
  },
  suppliers: {
    columns: ['id', 'tenant_id', 'branch_id', 'name', 'phone', 'email', 'address', 'current_balance', 'name_ar', 'contact_person', 'notes', 'is_active', 'updated_at'],
    conflictColumns: ['tenant_id', 'branch_id', 'id'],
    updateColumns: ['name', 'phone', 'email', 'address', 'current_balance', 'name_ar', 'contact_person', 'notes', 'is_active', 'updated_at', 'synced_at']
  },
  pos_sales: {
    columns: ['id', 'tenant_id', 'branch_id', 'session_id', 'sale_number', 'customer_id', 'customer_name', 'total', 'tax_amount', 'discount', 'payment_method', 'payment_status', 'amount_paid', 'balance_due', 'cashier_name', 'notes', 'is_return', 'sale_type', 'change_amount', 'payment_method_id', 'void_reason', 'is_active', 'created_at'],
    conflictColumns: ['tenant_id', 'branch_id', 'id'],
    updateColumns: ['session_id', 'sale_number', 'customer_id', 'customer_name', 'total', 'tax_amount', 'discount', 'payment_method', 'payment_status', 'amount_paid', 'balance_due', 'cashier_name', 'notes', 'is_return', 'sale_type', 'change_amount', 'payment_method_id', 'void_reason', 'is_active', 'created_at', 'synced_at']
  },
  pos_sale_items: {
    columns: ['id', 'tenant_id', 'branch_id', 'sale_id', 'product_id', 'product_name', 'batch_id', 'batch_number', 'quantity', 'unit_price', 'subtotal', 'is_active'],
    conflictColumns: ['tenant_id', 'branch_id', 'id'],
    updateColumns: ['sale_id', 'product_id', 'product_name', 'batch_id', 'batch_number', 'quantity', 'unit_price', 'subtotal', 'is_active', 'synced_at']
  },
  expenses: {
    columns: ['id', 'tenant_id', 'branch_id', 'category', 'amount', 'description', 'expense_date', 'payment_method', 'notes', 'created_by', 'is_active', 'created_at'],
    conflictColumns: ['tenant_id', 'branch_id', 'id'],
    updateColumns: ['category', 'amount', 'description', 'expense_date', 'payment_method', 'notes', 'created_by', 'is_active', 'created_at', 'synced_at']
  },
  stock_movements: {
    columns: ['id', 'tenant_id', 'branch_id', 'product_id', 'batch_id', 'movement_type', 'quantity', 'reference_type', 'reference_id', 'notes', 'is_active', 'created_at'],
    conflictColumns: ['tenant_id', 'branch_id', 'id'],
    updateColumns: ['product_id', 'batch_id', 'movement_type', 'quantity', 'reference_type', 'reference_id', 'notes', 'is_active', 'created_at', 'synced_at']
  },
  supplier_invoices: {
    columns: ['id', 'tenant_id', 'branch_id', 'supplier_id', 'supplier_name', 'invoice_number', 'invoice_date', 'status', 'payment_status', 'total', 'amount_paid', 'balance_due', 'created_at', 'updated_at'],
    conflictColumns: ['tenant_id', 'branch_id', 'id'],
    updateColumns: ['supplier_id', 'supplier_name', 'invoice_number', 'invoice_date', 'status', 'payment_status', 'total', 'amount_paid', 'balance_due', 'created_at', 'updated_at', 'synced_at']
  },
  supplier_payments: {
    columns: ['id', 'tenant_id', 'branch_id', 'supplier_id', 'invoice_id', 'amount', 'payment_method', 'account_id', 'payment_date', 'notes', 'created_by', 'created_at'],
    conflictColumns: ['tenant_id', 'branch_id', 'id'],
    updateColumns: ['supplier_id', 'invoice_id', 'amount', 'payment_method', 'account_id', 'payment_date', 'notes', 'created_by', 'created_at', 'synced_at']
  },
  customer_payments: {
    columns: ['id', 'tenant_id', 'branch_id', 'customer_id', 'amount', 'payment_method', 'account_id', 'notes', 'created_by', 'is_active', 'created_at'],
    conflictColumns: ['tenant_id', 'branch_id', 'id'],
    updateColumns: ['customer_id', 'amount', 'payment_method', 'account_id', 'notes', 'created_by', 'is_active', 'created_at', 'synced_at']
  },
  sale_payments: {
    columns: ['id', 'tenant_id', 'branch_id', 'sale_id', 'payment_method', 'payment_method_id', 'payment_method_name', 'amount', 'is_active', 'created_at'],
    conflictColumns: ['tenant_id', 'branch_id', 'id'],
    updateColumns: ['sale_id', 'payment_method', 'payment_method_id', 'payment_method_name', 'amount', 'is_active', 'created_at', 'synced_at']
  },
  accounts: {
    columns: ['id', 'tenant_id', 'branch_id', 'name', 'name_ar', 'account_type', 'current_balance', 'is_default', 'is_active', 'bank_provider', 'internal_fee', 'external_fee', 'phone_label', 'created_at', 'updated_at'],
    conflictColumns: ['tenant_id', 'branch_id', 'id'],
    updateColumns: ['name', 'name_ar', 'account_type', 'current_balance', 'is_default', 'is_active', 'bank_provider', 'internal_fee', 'external_fee', 'phone_label', 'created_at', 'updated_at', 'synced_at']
  },
  account_transactions: {
    columns: ['id', 'tenant_id', 'branch_id', 'account_id', 'transaction_type', 'direction', 'amount', 'balance_before', 'balance_after', 'reference_type', 'reference_id', 'description', 'created_by', 'is_active', 'created_at'],
    conflictColumns: ['tenant_id', 'branch_id', 'id'],
    updateColumns: ['account_id', 'transaction_type', 'direction', 'amount', 'balance_before', 'balance_after', 'reference_type', 'reference_id', 'description', 'created_by', 'is_active', 'created_at', 'synced_at']
  },
  users: {
    columns: ['id', 'tenant_id', 'branch_id', 'role_id', 'username', 'full_name', 'full_name_ar', 'phone', 'is_active', 'last_login_at', 'created_at', 'updated_at'],
    conflictColumns: ['tenant_id', 'id'],
    updateColumns: ['branch_id', 'role_id', 'username', 'full_name', 'full_name_ar', 'phone', 'is_active', 'last_login_at', 'updated_at', 'synced_at']
  },
  branches: {
    columns: ['id', 'tenant_id', 'name', 'name_ar', 'address', 'phone', 'is_main', 'is_active', 'created_at', 'updated_at'],
    conflictColumns: ['tenant_id', 'id'],
    updateColumns: ['name', 'name_ar', 'address', 'phone', 'is_main', 'is_active', 'updated_at', 'synced_at']
  },
  supplier_returns: {
    columns: ['id', 'tenant_id', 'branch_id', 'supplier_id', 'invoice_id', 'return_number', 'return_date', 'total_amount', 'status', 'reason', 'notes', 'created_by', 'confirmed_by', 'confirmed_at', 'is_active', 'created_at', 'updated_at'],
    conflictColumns: ['tenant_id', 'id'],
    updateColumns: ['branch_id', 'supplier_id', 'invoice_id', 'return_number', 'return_date', 'total_amount', 'status', 'reason', 'notes', 'created_by', 'confirmed_by', 'confirmed_at', 'is_active', 'updated_at', 'synced_at']
  },
  supplier_return_items: {
    columns: ['id', 'tenant_id', 'supplier_return_id', 'product_id', 'batch_id', 'quantity', 'unit_cost', 'total_price', 'reason', 'is_active', 'created_at'],
    conflictColumns: ['tenant_id', 'id'],
    updateColumns: ['supplier_return_id', 'product_id', 'batch_id', 'quantity', 'unit_cost', 'total_price', 'reason', 'is_active', 'synced_at']
  },
  pos_sessions: {
    columns: ['id', 'tenant_id', 'branch_id', 'cashier_id', 'account_id', 'status', 'opening_cash', 'expected_cash', 'actual_cash', 'cash_difference', 'total_sales', 'total_returns', 'sales_count', 'opened_at', 'closed_at', 'notes', 'is_active', 'created_at', 'updated_at'],
    conflictColumns: ['tenant_id', 'id'],
    updateColumns: ['branch_id', 'cashier_id', 'account_id', 'status', 'opening_cash', 'expected_cash', 'actual_cash', 'cash_difference', 'total_sales', 'total_returns', 'sales_count', 'opened_at', 'closed_at', 'notes', 'is_active', 'updated_at', 'synced_at']
  },
  returns: {
    columns: ['id', 'tenant_id', 'branch_id', 'return_number', 'sale_id', 'session_id', 'return_type', 'status', 'subtotal', 'total', 'refund_method', 'reason', 'created_by', 'is_active', 'created_at'],
    conflictColumns: ['tenant_id', 'id'],
    updateColumns: ['branch_id', 'return_number', 'sale_id', 'session_id', 'return_type', 'status', 'subtotal', 'total', 'refund_method', 'reason', 'created_by', 'is_active', 'synced_at']
  },
  return_items: {
    columns: ['id', 'tenant_id', 'return_id', 'sale_item_id', 'product_id', 'batch_id', 'quantity', 'unit_price', 'subtotal', 'is_active', 'created_at'],
    conflictColumns: ['tenant_id', 'id'],
    updateColumns: ['return_id', 'sale_item_id', 'product_id', 'batch_id', 'quantity', 'unit_price', 'subtotal', 'is_active', 'synced_at']
  },
  supplier_invoice_items: {
    columns: ['id', 'tenant_id', 'invoice_id', 'product_id', 'batch_number', 'expiry_date', 'quantity', 'unit_cost', 'sale_price', 'subtotal', 'is_active', 'created_at', 'updated_at'],
    conflictColumns: ['tenant_id', 'id'],
    updateColumns: ['invoice_id', 'product_id', 'batch_number', 'expiry_date', 'quantity', 'unit_cost', 'sale_price', 'subtotal', 'is_active', 'updated_at', 'synced_at']
  },
  audit_log: {
    columns: ['id', 'tenant_id', 'user_id', 'action', 'entity_type', 'entity_id', 'changes_json', 'is_active', 'created_at'],
    conflictColumns: ['tenant_id', 'id'],
    updateColumns: ['user_id', 'action', 'entity_type', 'entity_id', 'changes_json', 'is_active', 'synced_at']
  }
};

/**
 * Full-mirror reconcile: the desktop is authoritative, so any snapshot row that
 * is no longer in the pushed set must be removed — otherwise the Owner PWA keeps
 * showing rows the pharmacist already deleted. This makes the cloud an exact
 * mirror (not an append-only upsert log).
 *
 * Scope: branch-partitioned tables reconcile within (tenant_id, branch_id);
 * tenant-scoped tables within (tenant_id). Empty rows → the whole scope is
 * cleared (this is how a clean-slate wipe propagates).
 *
 * Excluded from reconcile (upsert-only):
 *  - `audit_log` (rolling 30-day window) and `account_transactions` (latest 500):
 *    the desktop deliberately pushes a partial set, so reconciling would delete
 *    history that still exists on the desktop.
 *  - `users`, `branches`, `accounts`: setup / control-plane records that must be
 *    kept even if a sync momentarily pushes an empty or branch-mismatched set.
 *    Only transactional entities (products, customers, suppliers, sales, …) are
 *    mirror-deleted; wiping a pharmacy's users/branches/accounts on a transient
 *    empty push would be catastrophic.
 */
const RECONCILE_SKIP = new Set([
  'audit_log', 'account_transactions', 'users', 'branches', 'accounts',
]);
// Snapshot tables that carry a branch_id column (reconcile per tenant+branch).
// The rest reconcile per tenant only.
const RECONCILE_BRANCH_SCOPED = new Set([
  'products', 'batches', 'customers', 'suppliers', 'pos_sales', 'pos_sale_items',
  'expenses', 'stock_movements', 'supplier_invoices', 'supplier_payments',
  'customer_payments', 'sale_payments', 'supplier_returns',
  'pos_sessions', 'returns',
]);

async function reconcileTable(client, tableName, snapshotTable, tenantId, branchId, rows) {
  if (RECONCILE_SKIP.has(tableName)) return 0;
  const ids = rows.map((r) => r && r.id).filter((v) => v != null);
  const branchScoped = RECONCILE_BRANCH_SCOPED.has(tableName);
  const scope = branchScoped ? 'tenant_id = $1 AND branch_id = $2' : 'tenant_id = $1';
  let sql, args;
  if (ids.length > 0) {
    const idParam = branchScoped ? '$3' : '$2';
    sql = `DELETE FROM ${snapshotTable} WHERE ${scope} AND id::text <> ALL(${idParam}::text[])`;
    args = branchScoped ? [tenantId, branchId, ids] : [tenantId, ids];
  } else {
    sql = `DELETE FROM ${snapshotTable} WHERE ${scope}`;
    args = branchScoped ? [tenantId, branchId] : [tenantId];
  }
  const res = await client.query(sql, args);
  return res.rowCount;
}

/**
 * POST /v1/sync/batch
 * Multi-table sync in a single transaction
 * Body: { 
 *   products?: { rows: [], deletedIds: [] },
 *   customers?: { rows: [], deletedIds: [] },
 *   ...
 * }
 */
router.post('/v1/sync/batch', authenticateToken, syncLimiter, async (req, res) => {
  const tables = req.body;
  const { tenantId, branchId = 'main-branch' } = req;

  const results = {};
  let totalUpserted = 0;
  let totalDeleted = 0;

  try {
    await transaction(async (client) => {
      for (const [tableName, tableData] of Object.entries(tables)) {
        if (!TABLE_SCHEMAS[tableName]) continue;

        const { rows = [], deletedIds = [] } = tableData;
        const schema = TABLE_SCHEMAS[tableName];
        const snapshotTable = `snapshot_${tableName}`;

        // Upsert
        if (rows.length > 0) {
          const placeholders = [];
          const values = [];
          let paramIndex = 1;

          for (const row of rows) {
            const rowValues = [];
            for (const col of schema.columns) {
              let val = row[col];
              if (col === 'tenant_id') val = tenantId;
              if (col === 'branch_id') val = branchId;
              rowValues.push(val);
            }
            const chunk = rowValues.map(() => `$${paramIndex++}`).join(',');
            placeholders.push(`(${chunk}, NOW())`);
            values.push(...rowValues);
          }

          const columnsStr = [...schema.columns, 'synced_at'].join(',');
          const conflictKeys = schema.conflictColumns.join(',');
          const updates = schema.updateColumns.map(col => `${col} = EXCLUDED.${col}`).join(',');

          const sql = `
            INSERT INTO ${snapshotTable} (${columnsStr})
            VALUES ${placeholders.join(',')}
            ON CONFLICT (${conflictKeys})
            DO UPDATE SET ${updates}
          `;

          await client.query(sql, values);
          totalUpserted += rows.length;
        }

        // Delete
        if (deletedIds.length > 0) {
          const deletePlaceholders = deletedIds.map((_, i) => `$${i + 3}`).join(',');
          const deleteSql = `
            UPDATE ${snapshotTable}
            SET is_active = false, synced_at = NOW()
            WHERE tenant_id = $1 AND branch_id = $2 AND id IN (${deletePlaceholders})
          `;
          await client.query(deleteSql, [tenantId, branchId, ...deletedIds]);
          totalDeleted += deletedIds.length;
        }

        // Full-mirror reconcile: drop rows no longer present on the desktop
        const reconciled = await reconcileTable(client, tableName, snapshotTable, tenantId, branchId, rows);
        totalDeleted += reconciled;

        // Update sync state
        await client.query(`
          INSERT INTO sync_state (tenant_id, table_name, last_sync_at, row_count)
          VALUES ($1, $2, NOW(), $3)
          ON CONFLICT (tenant_id, table_name)
          DO UPDATE SET last_sync_at = NOW(), row_count = $3
        `, [tenantId, tableName, rows.length]);

        results[tableName] = {
          upserted: rows.length,
          deleted: deletedIds.length + reconciled
        };
      }

      // Update tenant
      await client.query(`
        UPDATE tenants 
        SET last_sync_at = NOW(), total_syncs = total_syncs + 1
        WHERE id = $1
      `, [tenantId]);
    });

    // Recompute dashboard so PWA shows fresh data immediately
    recomputeDashboard(tenantId, branchId).catch(err => {
      console.error('[sync] dashboard recompute error:', err.message);
      query(
        `INSERT INTO activity_log (id, tenant_id, branch_id, event_type, entity_type, entity_id, summary, occurred_at, synced_at)
         VALUES ($1, $2, $3, 'dashboard_recompute_failed', 'system', $4, $5, NOW(), NOW())`,
        [uuidv4(), tenantId, branchId, branchId, `dashboard_recompute_failed: ${err.message}`]
      ).catch(() => {});
    });

    res.json({
      success: true,
      results,
      totalUpserted,
      totalDeleted,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[sync] Batch sync error:', error.message);
    res.status(500).json({ error: 'Batch sync failed', details: error.message });
  }
});

/**
 * POST /v1/sync/:table
 * Push table snapshot (delta sync)
 * Body: { rows: [...], deletedIds: [...], syncToken: string }
 */
router.post('/v1/sync/:table', authenticateToken, syncLimiter, async (req, res) => {
  const { table } = req.params;
  const { rows = [], deletedIds = [] } = req.body;
  const { tenantId, branchId = 'main-branch' } = req;

  if (!TABLE_SCHEMAS[table]) {
    return res.status(400).json({ error: `Unknown table: ${table}` });
  }

  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: 'rows must be an array' });
  }

  const schema = TABLE_SCHEMAS[table];
  const snapshotTable = `snapshot_${table}`;

  try {
    const result = await transaction(async (client) => {
      let upserted = 0;
      let deleted = 0;

      // Upsert rows
      if (rows.length > 0) {
        const placeholders = [];
        const values = [];
        let paramIndex = 1;

        for (const row of rows) {
          const rowValues = [];
          for (const col of schema.columns) {
            let val = row[col];
            
            // Add tenant_id, branch_id if not in row
            if (col === 'tenant_id') val = tenantId;
            if (col === 'branch_id') val = branchId;
            
            rowValues.push(val);
          }
          
          // Add synced_at timestamp
          const chunk = rowValues.map(() => `$${paramIndex++}`).join(',');
          placeholders.push(`(${chunk}, NOW())`);
          values.push(...rowValues);
        }

        const columnsStr = [...schema.columns, 'synced_at'].join(',');
        const conflictKeys = schema.conflictColumns.join(',');
        const updates = schema.updateColumns.map(col => `${col} = EXCLUDED.${col}`).join(',');

        const sql = `
          INSERT INTO ${snapshotTable} (${columnsStr})
          VALUES ${placeholders.join(',')}
          ON CONFLICT (${conflictKeys})
          DO UPDATE SET ${updates}
          RETURNING id
        `;

        const upsertResult = await client.query(sql, values);
        upserted = upsertResult.rowCount;
      }

      // Soft-delete rows (mark as inactive)
      if (deletedIds.length > 0) {
        const deletePlaceholders = deletedIds.map((_, i) => `$${i + 3}`).join(',');
        const deleteSql = `
          UPDATE ${snapshotTable}
          SET is_active = false, synced_at = NOW()
          WHERE tenant_id = $1 AND branch_id = $2 AND id IN (${deletePlaceholders})
        `;
        const deleteResult = await client.query(deleteSql, [tenantId, branchId, ...deletedIds]);
        deleted = deleteResult.rowCount;
      }

      // Full-mirror reconcile: drop rows no longer present on the desktop
      deleted += await reconcileTable(client, table, snapshotTable, tenantId, branchId, rows);

      // Update sync state
      await client.query(`
        INSERT INTO sync_state (tenant_id, table_name, last_sync_at, row_count)
        VALUES ($1, $2, NOW(), $3)
        ON CONFLICT (tenant_id, table_name)
        DO UPDATE SET last_sync_at = NOW(), row_count = $3
      `, [tenantId, table, upserted]);

      // Update tenant last_sync_at
      await client.query(`
        UPDATE tenants 
        SET last_sync_at = NOW(), total_syncs = total_syncs + 1
        WHERE id = $1
      `, [tenantId]);

      return { upserted, deleted };
    });

    // Recompute dashboard so PWA shows fresh data immediately
    recomputeDashboard(tenantId, branchId).catch(err => {
      console.error('[sync] dashboard recompute error:', err.message);
      query(
        `INSERT INTO activity_log (id, tenant_id, branch_id, event_type, entity_type, entity_id, summary, occurred_at, synced_at)
         VALUES ($1, $2, $3, 'dashboard_recompute_failed', 'system', $4, $5, NOW(), NOW())`,
        [uuidv4(), tenantId, branchId, branchId, `dashboard_recompute_failed: ${err.message}`]
      ).catch(() => {});
    });

    res.json({
      success: true,
      table,
      upserted: result.upserted,
      deleted: result.deleted,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`[sync] Error syncing ${table}:`, error.message);
    res.status(500).json({ error: 'Sync failed', details: error.message });
  }
});


/**
 * GET /v1/sync/status
 * Get sync status for all tables
 */
router.get('/v1/sync/status', authenticateToken, async (req, res) => {
  const { tenantId } = req;

  try {
    const [tenantResult, stateResult] = await Promise.all([
      query('SELECT last_sync_at, total_syncs FROM tenants WHERE id = $1', [tenantId]),
      query('SELECT table_name, last_sync_at, row_count FROM sync_state WHERE tenant_id = $1', [tenantId])
    ]);

    const tenant = tenantResult.rows[0];
    const states = stateResult.rows;

    res.json({
      tenantId,
      lastSyncAt: tenant?.last_sync_at,
      totalSyncs: tenant?.total_syncs || 0,
      tables: states.reduce((acc, s) => {
        acc[s.table_name] = {
          lastSyncAt: s.last_sync_at,
          rowCount: s.row_count
        };
        return acc;
      }, {})
    });

  } catch (error) {
    console.error('[sync] Status error:', error.message);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

/**
 * GET /v1/sync/changes
 * Get changed rows since last sync (for delta sync)
 * Query: ?table=products&since=2024-01-01T00:00:00Z
 */
router.get('/v1/sync/changes', authenticateToken, async (req, res) => {
  const { table, since } = req.query;
  const { tenantId, branchId = 'main-branch' } = req;

  if (!table || !TABLE_SCHEMAS[table]) {
    return res.status(400).json({ error: 'Valid table parameter required' });
  }

  if (!since) {
    return res.status(400).json({ error: 'since parameter required (ISO timestamp)' });
  }

  try {
    const snapshotTable = `snapshot_${table}`;
    const result = await query(`
      SELECT * FROM ${snapshotTable}
      WHERE tenant_id = $1 AND branch_id = $2 AND synced_at > $3
      ORDER BY synced_at DESC
      LIMIT 1000
    `, [tenantId, branchId, since]);

    res.json({
      table,
      since,
      count: result.rows.length,
      rows: result.rows
    });

  } catch (error) {
    console.error('[sync] Changes error:', error.message);
    res.status(500).json({ error: 'Failed to get changes' });
  }
});

/**
 * GET /v1/sync/dump
 * Full snapshot dump for onboarding restore (TASK-302).
 * Returns every row from each snapshot table for this tenant.
 * Auth: same sync_token used for regular sync.
 */
router.get('/v1/sync/dump', authenticateToken, async (req, res) => {
  const { tenantId } = req;
  const RESTORE_TABLES = [
    'products', 'customers', 'suppliers', 'pos_sales', 'pos_sale_items',
    'expenses', 'accounts', 'account_transactions', 'batches',
    'supplier_invoices', 'stock_movements', 'customer_payments',
    'supplier_payments', 'sale_payments',
  ];
  try {
    const tables = {};
    for (const t of RESTORE_TABLES) {
      const result = await query(
        `SELECT * FROM snapshot_${t} WHERE tenant_id = $1`,
        [tenantId]
      );
      tables[t] = result.rows;
    }
    res.json({
      ok: true,
      tables,
      tenant_id: tenantId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[sync] Dump error:', err.message);
    res.status(500).json({ error: 'Failed to dump tables' });
  }
});

export default router;
