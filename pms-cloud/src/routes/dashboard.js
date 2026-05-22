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
 * Returns 7-day sales trend for the authenticated tenant.
 */
router.get('/v1/dashboard/trend', requireAuthOrJwt, async (req, res) => {
  try {
    const branch = req.query.branch || 'main-branch';
    const result = await query(`
      SELECT
        DATE(created_at) AS day,
        COALESCE(SUM(total), 0) AS total,
        COUNT(*) AS count
      FROM snapshot_pos_sales
      WHERE tenant_id = $1
        AND branch_id = $2
        AND is_return = false
        AND created_at >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `, [req.tenantId, branch]);

    // Fill in missing days with 0
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const found = result.rows.find(r => r.day.toISOString().slice(0, 10) === dateStr);
      days.push({ date: dateStr, total: found ? Number(found.total) : 0, count: found ? Number(found.count) : 0 });
    }

    res.json({ days });
  } catch (err) {
    console.error('[dashboard] Trend error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Returns real business activity for the authenticated tenant.
 * Built from snapshot tables — not internal sync events.
 * Query params: limit, branch, type (sale|purchase|expense|return|product|payment)
 */
router.get('/v1/activity', requireAuthOrJwt, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const branch = req.query.branch || '%';
    const type = req.query.type || 'all';

    const events = [];

    // Sales (is_active = integer)
    if (type === 'all' || type === 'sale') {
      const r = await query(`
        SELECT 'sale' AS event_type, sale_number AS ref,
          cashier_name AS actor, total AS amount,
          payment_method, payment_status AS status,
          created_at AS occurred_at
        FROM snapshot_pos_sales
        WHERE tenant_id = $1 AND (branch_id LIKE $2)
          AND COALESCE(is_active, 1) != 0
        ORDER BY created_at DESC LIMIT $3
      `, [req.tenantId, branch, limit]);
      events.push(...r.rows);
    }

    // Purchases — is_active = boolean
    if (type === 'all' || type === 'purchase') {
      const r = await query(`
        SELECT 'purchase' AS event_type, invoice_number AS ref,
          supplier_name AS actor, total AS amount,
          payment_status AS status,
          created_at AS occurred_at
        FROM snapshot_supplier_invoices
        WHERE tenant_id = $1 AND (branch_id LIKE $2)
          AND COALESCE(is_active, true) = true
        ORDER BY created_at DESC LIMIT $3
      `, [req.tenantId, branch, limit]);
      events.push(...r.rows);
    }

    // Expenses — is_active = integer
    if (type === 'all' || type === 'expense') {
      const r = await query(`
        SELECT 'expense' AS event_type, category AS ref,
          created_by AS actor, amount,
          payment_method AS status,
          created_at AS occurred_at
        FROM snapshot_expenses
        WHERE tenant_id = $1 AND (branch_id LIKE $2)
          AND COALESCE(is_active, 1) != 0
        ORDER BY created_at DESC LIMIT $3
      `, [req.tenantId, branch, limit]);
      events.push(...r.rows);
    }

    // Returns — is_active = boolean
    if (type === 'all' || type === 'return') {
      const r = await query(`
        SELECT 'return' AS event_type, id AS ref,
          '' AS actor, COALESCE(total_amount, 0) AS amount,
          COALESCE(status, '') AS status,
          created_at AS occurred_at
        FROM snapshot_returns
        WHERE tenant_id = $1 AND (branch_id LIKE $2)
          AND COALESCE(is_active, true) = true
        ORDER BY created_at DESC LIMIT $3
      `, [req.tenantId, branch, limit]);
      events.push(...r.rows);
    }

    // Products — is_active = boolean
    if (type === 'all' || type === 'product') {
      const r = await query(`
        SELECT 'product' AS event_type, name_ar AS ref,
          '' AS actor, sale_price AS amount,
          COALESCE(category, '') AS status,
          updated_at AS occurred_at
        FROM snapshot_products
        WHERE tenant_id = $1 AND (branch_id LIKE $2)
          AND COALESCE(is_active, true) = true
        ORDER BY updated_at DESC LIMIT $3
      `, [req.tenantId, branch, limit]);
      events.push(...r.rows);
    }

    // Customer payments — is_active = integer
    if (type === 'all' || type === 'payment') {
      const r = await query(`
        SELECT 'payment' AS event_type, id AS ref,
          created_by AS actor, amount,
          COALESCE(payment_method, '') AS status,
          created_at AS occurred_at
        FROM snapshot_customer_payments
        WHERE tenant_id = $1 AND (branch_id LIKE $2)
          AND COALESCE(is_active, 1) != 0
        ORDER BY created_at DESC LIMIT $3
      `, [req.tenantId, branch, limit]);
      events.push(...r.rows);
    }

    // Sort all events by occurred_at descending and slice to limit
    events.sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
    const sliced = events.slice(0, limit);

    res.json({ tenant_id: req.tenantId, branch, activity: sliced });
  } catch (err) {
    console.error('[activity] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /v1/sync-stats
 * Returns sync statistics for the authenticated tenant.
 */
router.get('/v1/sync-stats', requireAuthOrJwt, async (req, res) => {
  try {
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

    const todayEventsResult = await query(`
      SELECT COUNT(*) as count FROM sync_events
      WHERE tenant_id = $1 AND DATE(received_at) = CURRENT_DATE
    `, [req.tenantId]);

    const lastSyncAt = tenant?.last_sync_at || null;
    const minutesSinceSync = lastSyncAt
      ? Math.floor((Date.now() - new Date(lastSyncAt).getTime()) / 60000)
      : -1;
    const health = !lastSyncAt ? 'red'
      : minutesSinceSync < 1440 ? 'green'
      : minutesSinceSync < 10080 ? 'yellow'
      : 'red';
    const totalRows = syncStateResult.rows.reduce((s, r) => s + (r.row_count || 0), 0);
    const branch = req.query.branch || null;

    res.json({
      tenant_id: req.tenantId,
      branch,
      first_seen_at: tenant?.first_seen_at || null,
      last_sync_at: lastSyncAt,
      total_syncs: tenant?.total_syncs || 0,
      total_rows: totalRows,
      today_events: parseInt(todayEventsResult.rows[0]?.count || 0),
      health,
      minutes_since_sync: minutesSinceSync,
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

    res.json({ 
      tenant_id: req.tenantId, 
      branches: result.rows.map(r => r.branch_id) 
    });
  } catch (err) {
    console.error('[branches] Error:', err);
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
 * GET /v1/accounts
 * Owner read-only cash/bank accounts list from snapshot.
 */
router.get('/v1/accounts', requireAuthOrJwt, async (req, res) => {
  try {
    const branch = req.query.branch || '%';
    const result = await query(`
      SELECT
        id, name, name_ar, account_type,
        current_balance, is_default, is_active,
        bank_provider, phone_label
      FROM snapshot_accounts
      WHERE tenant_id = $1
        AND (branch_id LIKE $2)
        AND (is_active IS NULL OR is_active != 0)
      ORDER BY is_default DESC, name ASC
    `, [req.tenantId, branch]);

    res.json({ accounts: result.rows });
  } catch (err) {
    console.error('[accounts] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
