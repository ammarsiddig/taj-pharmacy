import { Router } from 'express';
import { requireAuthOrJwt } from '../auth.js';
import { query } from '../db.js';

const router = Router();

/**
 * GET /v1/dashboard
 * Returns the latest owner dashboard snapshot for the authenticated tenant.
 */
router.get('/v1/dashboard', requireAuthOrJwt, async (req, res) => {
  try {
    const branch = req.query.branch || 'main-branch';
    // Get tenant info
    const tenantResult = await query(
      'SELECT first_seen_at, last_sync_at, total_syncs, pharmacy_name FROM tenants WHERE id = $1',
      [req.tenantId]
    );
    const tenant = tenantResult.rows[0];

    // Compute dashboard from snapshot tables (or use pre-computed summary)
    const summaryResult = await query(`
      SELECT * FROM dashboard_summaries 
      WHERE tenant_id = $1 AND branch_id = $2
    `, [req.tenantId, branch]);

    // If no pre-computed summary, compute on-the-fly from snapshots
    let dashboard;
    if (summaryResult.rows.length > 0) {
      const s = summaryResult.rows[0];
      dashboard = {
        pharmacy_name: tenant?.pharmacy_name || '',
        products_count: s.products_count,
        customers_count: s.customers_count,
        suppliers_count: s.suppliers_count,
        today_sales_count: s.today_sales_count,
        today_sales_total: s.today_sales_total,
        today_cash_sales: s.today_cash_sales,
        today_bank_sales: s.today_bank_sales,
        today_credit_sales: s.today_credit_sales,
        today_expenses_total: s.today_expenses_total,
        month_sales_count: s.month_sales_count,
        month_sales_total: s.month_sales_total,
        low_stock_count: s.low_stock_count,
        out_of_stock_count: s.out_of_stock_count,
        expiring_soon_count: s.expiring_soon_count,
        total_receivables: s.total_receivables,
        total_payables: s.total_payables,
        month_expenses_total: s.month_expenses_total,
        computed_at: s.computed_at,
      };
    } else {
      // Compute from snapshot tables
      const [products, customers, suppliers, todaySales, monthSales, receivables, payables] = await Promise.all([
        query('SELECT COUNT(*) FROM snapshot_products WHERE tenant_id = $1 AND branch_id = $2 AND is_active = true', [req.tenantId, branch]),
        query('SELECT COUNT(*) FROM snapshot_customers WHERE tenant_id = $1 AND branch_id = $2 AND is_active = true', [req.tenantId, branch]),
        query('SELECT COUNT(*) FROM snapshot_suppliers WHERE tenant_id = $1 AND branch_id = $2 AND is_active = true', [req.tenantId, branch]),
        query(`SELECT COUNT(*), COALESCE(SUM(total), 0) FROM snapshot_pos_sales 
               WHERE tenant_id = $1 AND branch_id = $2 AND is_return = false AND DATE(created_at) = CURRENT_DATE`, [req.tenantId, branch]),
        query(`SELECT COUNT(*), COALESCE(SUM(total), 0) FROM snapshot_pos_sales 
               WHERE tenant_id = $1 AND branch_id = $2 AND is_return = false 
               AND created_at >= DATE_TRUNC('month', CURRENT_DATE)`, [req.tenantId, branch]),
        query('SELECT COALESCE(SUM(current_balance), 0) FROM snapshot_customers WHERE tenant_id = $1 AND branch_id = $2', [req.tenantId, branch]),
        query('SELECT COALESCE(SUM(current_balance), 0) FROM snapshot_suppliers WHERE tenant_id = $1 AND branch_id = $2', [req.tenantId, branch]),
      ]);

      dashboard = {
        pharmacy_name: tenant?.pharmacy_name || '',
        products_count: parseInt(products.rows[0].count),
        customers_count: parseInt(customers.rows[0].count),
        suppliers_count: parseInt(suppliers.rows[0].count),
        today_sales_count: parseInt(todaySales.rows[0].count),
        today_sales_total: parseInt(todaySales.rows[0].coalesce),
        today_cash_sales: 0, // Would need payment method breakdown
        today_credit_sales: 0,
        month_sales_count: parseInt(monthSales.rows[0].count),
        month_sales_total: parseInt(monthSales.rows[0].coalesce),
        low_stock_count: 0, // Requires min_stock comparison
        out_of_stock_count: 0,
        expiring_soon_count: 0,
        total_receivables: parseInt(receivables.rows[0].coalesce) || 0,
        total_payables: parseInt(payables.rows[0].coalesce) || 0,
        month_expenses_total: 0,
        computed_at: new Date().toISOString(),
      };
    }

    res.json({
      tenant_id: req.tenantId,
      sync: {
        first_seen_at: tenant?.first_seen_at || null,
        last_sync_at: tenant?.last_sync_at || null,
        total_syncs: parseInt(tenant?.total_syncs) || 0,
      },
      dashboard,
    });
  } catch (err) {
    console.error('[dashboard] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /v1/activity
 * Returns recent activity for the authenticated tenant.
 * Query params: limit (default 50, max 200), branch
 */
router.get('/v1/activity', requireAuthOrJwt, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const branch = req.query.branch || 'main-branch';

    const result = await query(`
      SELECT event_type, entity_type, entity_id, summary, amount, occurred_at, synced_at as received_at
      FROM activity_log
      WHERE tenant_id = $1 AND branch_id = $2
      ORDER BY synced_at DESC
      LIMIT $3
    `, [req.tenantId, branch, limit]);

    res.json({ tenant_id: req.tenantId, branch, activity: result.rows });
  } catch (err) {
    console.error('[activity] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /v1/sync-stats
 * Returns sync statistics and health indicators for the authenticated tenant.
 * Query: ?branch=
 */
router.get('/v1/sync-stats', requireAuthOrJwt, async (req, res) => {
  try {
    const branch = req.query.branch || 'main-branch';

    const tenantResult = await query(
      'SELECT first_seen_at, last_sync_at, total_syncs FROM tenants WHERE id = $1',
      [req.tenantId]
    );
    const tenant = tenantResult.rows[0];

    const syncStateResult = await query(`
      SELECT table_name, row_count, last_sync_at
      FROM sync_state
      WHERE tenant_id = $1
      ORDER BY table_name
    `, [req.tenantId]);

    const totalRows = syncStateResult.rows.reduce((sum, r) => sum + parseInt(r.row_count || 0), 0);

    const todayEventsResult = await query(`
      SELECT COUNT(*) as count FROM sync_events
      WHERE tenant_id = $1 AND DATE(received_at) = CURRENT_DATE
    `, [req.tenantId]);

    // Health: green (<1h), yellow (1-24h), red (>24h or never)
    const lastSync = tenant?.last_sync_at ? new Date(tenant.last_sync_at).getTime() : 0;
    const now = Date.now();
    const minutesSinceSync = lastSync ? Math.floor((now - lastSync) / 60000) : -1;

    let health = 'red';
    if (lastSync && minutesSinceSync < 60) health = 'green';
    else if (lastSync && minutesSinceSync < 1440) health = 'yellow';

    res.json({
      tenant_id: req.tenantId,
      branch,
      first_seen_at: tenant?.first_seen_at || null,
      last_sync_at: tenant?.last_sync_at || null,
      minutes_since_sync: minutesSinceSync,
      health,
      total_syncs: tenant?.total_syncs || 0,
      total_rows: totalRows,
      today_events: parseInt(todayEventsResult.rows[0]?.count || 0),
      tables: syncStateResult.rows,
    });
  } catch (err) {
    console.error('[sync-stats] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /v1/branches
 * Returns list of branches for the authenticated tenant.
 */
router.get('/v1/branches', requireAuthOrJwt, async (req, res) => {
  try {
    // Get distinct branch_ids from snapshot tables
    const result = await query(`
      SELECT DISTINCT branch_id FROM (
        SELECT branch_id FROM snapshot_products WHERE tenant_id = $1
        UNION
        SELECT branch_id FROM snapshot_batches WHERE tenant_id = $1
        UNION
        SELECT branch_id FROM snapshot_pos_sales WHERE tenant_id = $1
        UNION  
        SELECT branch_id FROM snapshot_customers WHERE tenant_id = $1
        UNION
        SELECT branch_id FROM snapshot_supplier_invoices WHERE tenant_id = $1
        UNION
        SELECT branch_id FROM snapshot_expenses WHERE tenant_id = $1
      ) branches
      ORDER BY branch_id
    `, [req.tenantId]);

    // Fetch friendly names from tenants.branch_names
    const namesResult = await query(
      'SELECT branch_names FROM tenants WHERE id = $1',
      [req.tenantId]
    );
    const branchNames = (namesResult.rows[0] && namesResult.rows[0].branch_names) || {};

    res.json({ 
      tenant_id: req.tenantId, 
      branches: result.rows.map(r => ({
        id: r.branch_id,
        name: branchNames[r.branch_id] || null,
      }))
    });
  } catch (err) {
    console.error('[branches] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /v1/branches/:branchId/name
 * Set a friendly name for a branch.
 */
router.put('/v1/branches/:branchId/name', requireAuthOrJwt, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const branchId = req.params.branchId;
    const newName = name.trim();

    // Update branch_names JSONB: set key = value
    await query(
      `UPDATE tenants 
       SET branch_names = jsonb_set(COALESCE(branch_names, '{}'), $1::text[], to_jsonb($2::text))
       WHERE id = $3`,
      [`{${branchId}}`, newName, req.tenantId]
    );

    res.json({ branch_id: branchId, name: newName });
  } catch (err) {
    console.error('[branches/name] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /v1/products
 * Owner read-only product list from snapshot tables.
 * Query: ?search=&page=1&limit=50&branch=
 */
router.get('/v1/products', requireAuthOrJwt, async (req, res) => {
  try {
    const { search = '', page = 1, limit = 50, branch } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;
    const branchFilter = branch || '%';

    const params = [req.tenantId, branchFilter];
    let searchClause = '';
    if (search) {
      params.push(`%${search}%`);
      searchClause = `AND (p.name ILIKE $${params.length} OR p.name_ar ILIKE $${params.length} OR p.barcode ILIKE $${params.length})`;
    }

    const productsResult = await query(`
      SELECT
        p.id, p.name, p.name_ar, p.barcode, p.category,
        p.sale_price, p.min_stock, p.current_stock,
        MIN(b.expiry_date) FILTER (WHERE b.quantity > 0 AND b.is_active) AS nearest_expiry,
        COALESCE(SUM(b.quantity) FILTER (WHERE b.is_active), 0) AS total_stock
      FROM snapshot_products p
      LEFT JOIN snapshot_batches b
        ON b.tenant_id = p.tenant_id AND b.branch_id = p.branch_id AND b.product_id = p.id
      WHERE p.tenant_id = $1 AND (p.branch_id LIKE $2) AND p.is_active = true
      ${searchClause}
      GROUP BY p.id, p.tenant_id, p.branch_id
      ORDER BY p.name ASC
      LIMIT ${limitNum} OFFSET ${offset}
    `, params);

    const countResult = await query(`
      SELECT COUNT(DISTINCT p.id) AS total
      FROM snapshot_products p
      WHERE p.tenant_id = $1 AND (p.branch_id LIKE $2) AND p.is_active = true
      ${searchClause}
    `, params);

    res.json({
      products: productsResult.rows,
      total: parseInt(countResult.rows[0].total),
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    console.error('[products] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /v1/sales
 * Owner read-only sales list from snapshot tables.
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&limit=50&branch=
 */
router.get('/v1/sales', requireAuthOrJwt, async (req, res) => {
  try {
    const { page = 1, limit = 50, branch } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;
    const branchFilter = branch || '%';

    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const from = req.query.from || defaultFrom;
    const to = req.query.to || now.toISOString().slice(0, 10);

    const salesResult = await query(`
      SELECT
        s.id, s.sale_number, s.customer_name, s.total, s.tax_amount,
        s.payment_method, s.payment_status, s.amount_paid, s.balance_due,
        s.cashier_name, s.is_return, s.created_at,
        COUNT(si.id)::int AS items_count
      FROM snapshot_pos_sales s
      LEFT JOIN snapshot_pos_sale_items si
        ON si.tenant_id = s.tenant_id AND si.branch_id = s.branch_id AND si.sale_id = s.id
      WHERE s.tenant_id = $1 AND (s.branch_id LIKE $2)
        AND s.created_at >= $3::date AND s.created_at < ($4::date + INTERVAL '1 day')
      GROUP BY s.id, s.tenant_id, s.branch_id
      ORDER BY s.created_at DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `, [req.tenantId, branchFilter, from, to]);

    const countResult = await query(`
      SELECT COUNT(*) AS total, COALESCE(SUM(total), 0) AS grand_total
      FROM snapshot_pos_sales
      WHERE tenant_id = $1 AND (branch_id LIKE $2)
        AND created_at >= $3::date AND created_at < ($4::date + INTERVAL '1 day')
    `, [req.tenantId, branchFilter, from, to]);

    res.json({
      sales: salesResult.rows,
      total: parseInt(countResult.rows[0].total),
      grand_total: parseInt(countResult.rows[0].grand_total),
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    console.error('[sales] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /v1/balances
 * Owner read-only customer receivables + supplier payables lists.
 * Query: ?branch=
 */
router.get('/v1/balances', requireAuthOrJwt, async (req, res) => {
  try {
    const branchFilter = req.query.branch || '%';

    const customersResult = await query(`
      SELECT id, name, name_ar, phone, current_balance, total_purchases
      FROM snapshot_customers
      WHERE tenant_id = $1 AND (branch_id LIKE $2) AND is_active = true AND current_balance > 0
      ORDER BY current_balance DESC
      LIMIT 100
    `, [req.tenantId, branchFilter]);

    const suppliersResult = await query(`
      SELECT id, name, phone, current_balance
      FROM snapshot_suppliers
      WHERE tenant_id = $1 AND (branch_id LIKE $2) AND is_active = true AND current_balance > 0
      ORDER BY current_balance DESC
      LIMIT 100
    `, [req.tenantId, branchFilter]);

    res.json({
      customers: customersResult.rows,
      suppliers: suppliersResult.rows,
    });
  } catch (err) {
    console.error('[balances] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /v1/supplier-accounts
 * Shows supplier invoices with outstanding balances for the Owner PWA
 */
router.get('/v1/supplier-accounts', requireAuthOrJwt, async (req, res) => {
  try {
    const branchFilter = req.query.branch || '%';

    // Summary per supplier
    const summaryResult = await query(`
      SELECT supplier_id, supplier_name,
             COUNT(*)::int AS invoice_count,
             COALESCE(SUM(total), 0)::bigint AS total_amount,
             COALESCE(SUM(amount_paid), 0)::bigint AS total_paid,
             COALESCE(SUM(balance_due), 0)::bigint AS total_due
      FROM snapshot_supplier_invoices
      WHERE tenant_id = $1 AND (branch_id LIKE $2) AND is_active = true
      GROUP BY supplier_id, supplier_name
      ORDER BY total_due DESC
    `, [req.tenantId, branchFilter]);

    // Individual invoices
    const invoicesResult = await query(`
      SELECT id, supplier_id, supplier_name, invoice_number, invoice_date,
             status, payment_status, total, amount_paid, balance_due, created_at
      FROM snapshot_supplier_invoices
      WHERE tenant_id = $1 AND (branch_id LIKE $2) AND is_active = true
      ORDER BY invoice_date DESC
      LIMIT 200
    `, [req.tenantId, branchFilter]);

    res.json({
      suppliers: summaryResult.rows,
      invoices: invoicesResult.rows,
    });
  } catch (err) {
    console.error('[supplier-accounts] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /v1/dashboard/trend
 * Returns last 7 days of daily sales totals broken down by payment method.
 * Query: ?branch=
 */
router.get('/v1/dashboard/trend', requireAuthOrJwt, async (req, res) => {
  try {
    const branch = req.query.branch || null;

    const result = await query(`
      SELECT d::date as date,
             COALESCE(SUM(s.total) FILTER (WHERE s.payment_method = 'cash'), 0)::bigint as cash,
             COALESCE(SUM(s.total) FILTER (WHERE s.payment_method = 'bank'), 0)::bigint as bank,
             COALESCE(SUM(s.total) FILTER (WHERE s.payment_method = 'credit'), 0)::bigint as credit,
             COALESCE(SUM(s.total), 0)::bigint as total
      FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day') d
      LEFT JOIN snapshot_pos_sales s
        ON s.tenant_id = $1
        AND (s.branch_id = $2 OR $2 IS NULL)
        AND DATE(s.created_at) = d::date
        AND s.is_return = false
      GROUP BY d::date
      ORDER BY d::date
    `, [req.tenantId, branch]);

    res.json({
      tenant_id: req.tenantId,
      days: result.rows.map(r => ({
        date: r.date.toISOString().slice(0, 10),
        total: parseInt(r.total),
        cash: parseInt(r.cash),
        bank: parseInt(r.bank),
        credit: parseInt(r.credit),
      })),
    });
  } catch (err) {
    console.error('[dashboard/trend] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /v1/accounts
 * Returns synced accounts for the owner PWA.
 */
router.get('/v1/accounts', requireAuthOrJwt, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    let branch = req.query.branch || req.headers['x-branch-id'] || null;

    let branchParam = '';
    const params = [tenantId];
    if (branch) {
      params.push(branch);
      branchParam = ` AND branch_id = $${params.length}`;
    }

    const result = await query(`
      SELECT id, name, name_ar, account_type, current_balance, is_default, is_active,
             bank_provider, internal_fee, external_fee, phone_label, created_at, updated_at
      FROM snapshot_accounts
      WHERE tenant_id = $1${branchParam}
      ORDER BY is_default DESC, account_type ASC, name ASC
    `, params);

    res.json({ accounts: result.rows });
  } catch (err) {
    console.error('[dashboard/accounts] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
