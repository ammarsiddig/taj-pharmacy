import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db.js';
import bcrypt from 'bcryptjs';

const router = Router();

/**
 * POST /admin/tenants
 * Create a new tenant and generate an API token.
 * Body: { tenant_id, label? }
 */
router.post('/admin/tenants', requireAdmin, async (req, res) => {
  try {
    const { tenant_id, label } = req.body;
    if (!tenant_id) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    // Create tenant (ignore if exists)
    await query(`
      INSERT INTO tenants (id) VALUES ($1)
      ON CONFLICT (id) DO NOTHING
    `, [tenant_id]);

    // Generate API token for the tenant
    const token = uuidv4();
    await query(`
      INSERT INTO api_tokens (token, tenant_id, label)
      VALUES ($1, $2, $3)
    `, [token, tenant_id, label || `auto-${tenant_id}`]);

    // Create dashboard summary row
    await query(`
      INSERT INTO dashboard_summaries (tenant_id, branch_id)
      VALUES ($1, $2)
      ON CONFLICT (tenant_id, branch_id) DO NOTHING
    `, [tenant_id, 'main-branch']);

    res.json({
      tenant_id,
      token,
      message: 'Tenant created. Use this token as Bearer token in PMS_OWNER_SYNC_TOKEN on the desktop app.',
    });
  } catch (err) {
    console.error('[admin] Create tenant error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/tenants
 * List all tenants with stats.
 */
router.get('/admin/tenants', requireAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT t.id, t.pharmacy_name, t.first_seen_at, t.last_sync_at as last_event_at, 
             t.total_syncs as total_events, t.is_suspended, t.expires_at,
             (SELECT COUNT(*) FROM api_tokens WHERE tenant_id = t.id AND is_active = true) as active_tokens,
             (SELECT email FROM owners WHERE tenant_id = t.id LIMIT 1) as owner_email
      FROM tenants t
      ORDER BY t.first_seen_at DESC
    `);

    res.json({ tenants: result.rows });
  } catch (err) {
    console.error('[admin] List tenants error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/tokens
 * Generate additional API token for a tenant.
 * Body: { tenant_id, label? }
 */
router.post('/admin/tokens', requireAdmin, async (req, res) => {
  try {
    const { tenant_id, label } = req.body;
    if (!tenant_id) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const token = uuidv4();
    await query(`
      INSERT INTO api_tokens (token, tenant_id, label)
      VALUES ($1, $2, $3)
    `, [token, tenant_id, label || 'manual']);

    res.json({ token, tenant_id });
  } catch (err) {
    console.error('[admin] Create token error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /admin/tokens/:token
 * Revoke an API token.
 */
router.delete('/admin/tokens/:token', requireAdmin, async (req, res) => {
  try {
    await query('UPDATE api_tokens SET is_active = false WHERE token = $1', [req.params.token]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin] Revoke token error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/tenant/:id
 * Full tenant detail: snapshot, recent events, active tokens.
 */
router.get('/admin/tenant/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    const tenantResult = await query(`
      SELECT t.id, t.pharmacy_name, t.first_seen_at,
             t.last_sync_at as last_event_at, t.total_syncs as total_events,
             t.is_suspended, t.expires_at,
             (SELECT email FROM owners WHERE tenant_id = t.id LIMIT 1) as owner_email
      FROM tenants t WHERE t.id = $1
    `, [id]);

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    const tenant = tenantResult.rows[0];

    const dashboardResult = await query(`
      SELECT * FROM dashboard_summaries WHERE tenant_id = $1 LIMIT 1
    `, [id]);
    const dashboard = dashboardResult.rows[0] || null;

    const eventsResult = await query(`
      SELECT event_type, entity_type, entity_id, summary, amount, occurred_at, synced_at as received_at
      FROM activity_log WHERE tenant_id = $1
      ORDER BY synced_at DESC LIMIT 20
    `, [id]);
    const recent_events = eventsResult.rows;

    const tokensResult = await query(`
      SELECT token, label, is_active, created_at
      FROM api_tokens WHERE tenant_id = $1
      ORDER BY created_at DESC
    `, [id]);
    const tokens = tokensResult.rows;

    res.json({ tenant, dashboard, recent_events, tokens });
  } catch (err) {
    console.error('[admin] Tenant detail error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/stats
 * Global system stats.
 */
router.get('/admin/stats', requireAdmin, async (req, res) => {
  try {
    const tenantResult = await query('SELECT COUNT(*) as count FROM tenants');
    const eventResult = await query('SELECT COUNT(*) as count FROM sync_events');
    const todayResult = await query(
      "SELECT COUNT(*) as count FROM sync_events WHERE DATE(received_at) = CURRENT_DATE"
    );

    // Calculate subscription status stats
    const now = new Date().toISOString();
    const fourteenDaysLater = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const activeResult = await query(
      "SELECT COUNT(*) as count FROM tenants WHERE (expires_at IS NULL OR expires_at > $1) AND is_suspended = false",
      [now]
    );
    const expiringResult = await query(
      "SELECT COUNT(*) as count FROM tenants WHERE expires_at > $1 AND expires_at <= $2 AND is_suspended = false",
      [now, fourteenDaysLater]
    );
    const expiredResult = await query(
      "SELECT COUNT(*) as count FROM tenants WHERE expires_at <= $1 OR is_suspended = true",
      [now]
    );

    res.json({
      total_tenants: parseInt(tenantResult.rows[0].count),
      total_events: parseInt(eventResult.rows[0].count),
      today_events: parseInt(todayResult.rows[0].count),
      active_tenants: parseInt(activeResult.rows[0].count),
      expiring_soon: parseInt(expiringResult.rows[0].count),
      expired_tenants: parseInt(expiredResult.rows[0].count),
    });
  } catch (err) {
    console.error('[admin] Stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/licenses
 * Generate a new license key (creates tenant + sync token).
 * Body: { expires_in_days?, pharmacy_name? }
 */
router.post('/admin/licenses', requireAdmin, async (req, res) => {
  try {
    const {
      expires_in_days = 365,
      pharmacy_name,
      tenant_id: existingTenantId,
      plan = 'basic',
      max_users = 5,
      max_branches = 3,
    } = req.body;

    let tenantId = existingTenantId;

    if (!tenantId) {
      tenantId = uuidv4();
      await query('INSERT INTO tenants (id) VALUES ($1)', [tenantId]);
      await query(`
        INSERT INTO dashboard_summaries (tenant_id, branch_id)
        VALUES ($1, $2) ON CONFLICT (tenant_id, branch_id) DO NOTHING
      `, [tenantId, 'main-branch']);
    }

    const syncToken = uuidv4();
    await query(
      "INSERT INTO api_tokens (token, tenant_id, label) VALUES ($1, $2, 'license-auto')",
      [syncToken, tenantId]
    );

    const seg = () => Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4).padEnd(4, '0');
    const key = `PMS-${seg()}-${seg()}-${seg()}`;
    const expiresAt = new Date(Date.now() + expires_in_days * 86_400_000).toISOString();

    await query(
      'INSERT INTO license_keys (key, tenant_id, status, expires_at, plan, max_users, max_branches) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [key, tenantId, 'pending', expiresAt, plan, max_users, max_branches]
    );

    if (pharmacy_name) {
      await query('UPDATE tenants SET pharmacy_name = $1 WHERE id = $2', [pharmacy_name, tenantId]);
    }

    res.json({ key, tenant_id: tenantId, sync_token: syncToken, expires_at: expiresAt });
  } catch (err) {
    console.error('[admin] Create license error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/licenses
 * List all license keys.
 */
router.get('/admin/licenses', requireAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT lk.key, lk.tenant_id, lk.status, lk.expires_at, lk.created_at,
             t.pharmacy_name
      FROM license_keys lk
      LEFT JOIN tenants t ON t.id = lk.tenant_id
      ORDER BY lk.created_at DESC
    `);
    res.json({ keys: result.rows });
  } catch (err) {
    console.error('[admin] List licenses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/tenants/:id/licenses
 * List license keys for a specific tenant.
 */
router.get('/admin/tenants/:id/licenses', requireAdmin, async (req, res) => {
  try {
    const result = await query(
      `SELECT key, tenant_id, status, expires_at, created_at
       FROM license_keys WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json({ keys: result.rows });
  } catch (err) {
    console.error('[admin] List tenant licenses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /admin/tenants/:id
 * Update tenant: is_suspended, expires_at.
 * Body: { is_suspended?, expires_at?, pharmacy_name? }
 */
router.patch('/admin/tenants/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_suspended, expires_at, pharmacy_name } = req.body;

    const tenantResult = await query('SELECT id FROM tenants WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (is_suspended !== undefined) {
      await query('UPDATE tenants SET is_suspended = $1 WHERE id = $2', [is_suspended, id]);
    }
    if (expires_at !== undefined) {
      await query('UPDATE tenants SET expires_at = $1 WHERE id = $2', [expires_at, id]);
    }
    if (pharmacy_name !== undefined) {
      await query('UPDATE tenants SET pharmacy_name = $1 WHERE id = $2', [pharmacy_name, id]);
    }

    const updatedResult = await query(
      'SELECT id, pharmacy_name, is_suspended, expires_at FROM tenants WHERE id = $1',
      [id]
    );
    res.json({ tenant: updatedResult.rows[0] });
  } catch (err) {
    console.error('[admin] Update tenant error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/tenants/:id/announcement
 * Push an in-app announcement to a pharmacy.
 * Body: { message, type? }
 */
router.post('/admin/tenants/:id/announcement', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { message, type = 'info' } = req.body;

    if (!message) return res.status(400).json({ error: 'message is required' });
    if (!['info', 'warning', 'danger'].includes(type)) {
      return res.status(400).json({ error: 'type must be info, warning, or danger' });
    }

    const tenantResult = await query('SELECT id FROM tenants WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const annId = uuidv4();
    await query(
      'INSERT INTO announcements (id, tenant_id, message, type) VALUES ($1, $2, $3, $4)',
      [annId, id, message, type]
    );

    res.json({ ok: true, id: annId });
  } catch (err) {
    console.error('[admin] Announcement error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/tenants/:id/create-owner
 * Admin creates the first owner account for a pharmacy.
 * Body: { email, password }
 */
router.post('/admin/tenants/:id/create-owner', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'password must be at least 6 characters' });
    }

    const tenantResult = await query('SELECT id FROM tenants WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const existingOwner = await query('SELECT id FROM owners WHERE tenant_id = $1', [id]);
    if (existingOwner.rows.length > 0) {
      return res.status(409).json({ error: 'Owner account already exists for this tenant' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await query(
      'INSERT INTO owners (tenant_id, email, password_hash) VALUES ($1, $2, $3)',
      [id, email.toLowerCase().trim(), passwordHash]
    );

    res.json({ ok: true, email: email.toLowerCase().trim() });
  } catch (err) {
    console.error('[admin] Create owner error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/tenants/:id/renew
 * Admin renews a tenant subscription by extending expiry date.
 * Body: { days: number }
 */
router.post('/admin/tenants/:id/renew', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { days } = req.body;
    
    if (!days || days < 1) {
      return res.status(400).json({ error: 'days is required and must be positive' });
    }
    
    const tenantResult = await query('SELECT id, expires_at FROM tenants WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    // Calculate new expiry: from current expiry if in future, else from now
    const currentExpiry = tenantResult.rows[0].expires_at;
    const baseDate = currentExpiry && new Date(currentExpiry) > new Date() 
      ? new Date(currentExpiry) 
      : new Date();
    
    const newExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
    
    await query('UPDATE tenants SET expires_at = $1 WHERE id = $2', [newExpiry.toISOString(), id]);
    
    res.json({ 
      ok: true, 
      tenant_id: id, 
      expires_at: newExpiry.toISOString(),
      days_added: days 
    });
  } catch (err) {
    console.error('[admin] Renew error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /admin/tenants/:id
 * Permanently delete a tenant and all associated data.
 */
router.delete('/admin/tenants/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantResult = await query('SELECT id FROM tenants WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    await query('DELETE FROM owners WHERE tenant_id = $1', [id]);
    await query('DELETE FROM api_tokens WHERE tenant_id = $1', [id]);
    await query('DELETE FROM license_keys WHERE tenant_id = $1', [id]);
    await query('DELETE FROM dashboard_summaries WHERE tenant_id = $1', [id]);
    await query('DELETE FROM tenants WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin] Delete tenant error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /admin/licenses/:key
 * Delete a license key.
 */
router.delete('/admin/licenses/:key', requireAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const result = await query('DELETE FROM license_keys WHERE key = $1 RETURNING key', [key]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'License key not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin] Delete license error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
