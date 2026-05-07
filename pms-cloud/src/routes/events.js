import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { query, transaction } from '../db.js';

const router = Router();

/**
 * POST /v1/events
 * Receives sync events from desktop PMS app (legacy event-based sync).
 * Note: New code should use /v1/sync/:table for table-snapshot sync.
 * 
 * Expected body:
 * {
 *   tenant_id: string,
 *   event_id: string,
 *   event_type: string,
 *   entity_type: string,
 *   entity_id: string,
 *   created_at: string,
 *   payload: object | null
 * }
 */
router.post('/v1/events', requireAuth, async (req, res) => {
  try {
    const { event_id, event_type, entity_type, entity_id, created_at, payload } = req.body;
    const tenant_id = req.tenantId;

    // Validate required fields
    if (!event_id || !event_type || !entity_type || !entity_id || !created_at) {
      return res.status(400).json({
        error: 'Missing required fields: event_id, event_type, entity_type, entity_id, created_at',
      });
    }

    // Store event in PostgreSQL
    await transaction(async (client) => {
      const eventInsert = await client.query(`
        INSERT INTO sync_events (id, tenant_id, event_id, event_type, entity_type, entity_id, payload, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id, event_id) DO NOTHING
      `, [tenant_id, event_id, event_type, entity_type, entity_id, JSON.stringify(payload || null), created_at]);

      const p = typeof payload === 'string' ? JSON.parse(payload || 'null') : payload;
      const branchId = p?.branch_id || 'main-branch';
      const summary = p?.summary || p?.reason || event_type;
      const amount = Number.isFinite(Number(p?.amount)) ? Number(p.amount) : null;

      if (eventInsert.rowCount > 0) {
        await client.query(`
          INSERT INTO activity_log (
            tenant_id, branch_id, event_type, entity_type, entity_id, summary, amount, occurred_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [tenant_id, branchId, event_type, entity_type, entity_id, summary, amount, created_at]);
      }
      
      await client.query(`
        INSERT INTO tenants (id, first_seen_at) VALUES ($1, NOW())
        ON CONFLICT (id) DO UPDATE SET last_sync_at = NOW(), total_syncs = tenants.total_syncs + 1
      `, [tenant_id]);

      // If this is an owner_dashboard snapshot, write it directly to dashboard_summaries
      if (event_type === 'snapshot' && entity_type === 'owner_dashboard' && payload) {
        await client.query(`
          INSERT INTO dashboard_summaries (
            tenant_id, branch_id, computed_at,
            today_sales_total, today_sales_count,
            month_sales_total, month_sales_count,
            products_count, customers_count, suppliers_count,
            low_stock_count, out_of_stock_count, expiring_soon_count,
            total_receivables, total_payables,
            today_expenses_total
          ) VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 0)
          ON CONFLICT (tenant_id, branch_id) DO UPDATE SET
            computed_at         = NOW(),
            today_sales_total   = EXCLUDED.today_sales_total,
            today_sales_count   = EXCLUDED.today_sales_count,
            month_sales_total   = EXCLUDED.month_sales_total,
            month_sales_count   = EXCLUDED.month_sales_count,
            products_count      = EXCLUDED.products_count,
            customers_count     = EXCLUDED.customers_count,
            suppliers_count     = EXCLUDED.suppliers_count,
            low_stock_count     = EXCLUDED.low_stock_count,
            out_of_stock_count  = EXCLUDED.out_of_stock_count,
            expiring_soon_count = EXCLUDED.expiring_soon_count,
            total_receivables   = EXCLUDED.total_receivables,
            total_payables      = EXCLUDED.total_payables
        `, [
          tenant_id,
          'main-branch',
          p.today_sales_total    ?? 0,
          p.today_sales_count    ?? 0,
          p.month_sales_total    ?? 0,
          p.month_sales_count    ?? 0,
          p.products_count       ?? 0,
          p.customers_count      ?? 0,
          p.suppliers_count      ?? 0,
          p.low_stock_count      ?? 0,
          p.out_of_stock_count   ?? 0,
          p.expiring_soon_count  ?? 0,
          p.total_customer_receivables ?? 0,
          p.total_supplier_payables    ?? 0,
        ]);
      }
    });

    res.status(200).json({ ok: true, event_id });
  } catch (err) {
    console.error('[events] Failed to process event:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
