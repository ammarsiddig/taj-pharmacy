import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { v4 as uuidv4 } from 'uuid';
import { query, transaction } from '../db.js';
import bcrypt from 'bcryptjs';
import { adminLimiter } from '../middleware/rate-limit.js';

const router = Router();

router.use(adminLimiter);

// Audit log helper
async function auditLog(actor, action, data = {}) {
  await query(
    `INSERT INTO admin_audit_log (actor, action, tenant_id, target_type, target_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [actor, action, data.tenant_id || null, data.target_type || null, data.target_id || null, JSON.stringify(data.payload || {})]
  );
}

// --- Health / Auth Check ---

router.get('/admin/me', requireAdmin, async (req, res) => {
  res.json({
    ok: true,
    admin_token_label: process.env.PMS_ADMIN_TOKEN_LABEL || 'admin',
    server_time: new Date().toISOString(),
  });
});

// --- Overview ---

router.get('/admin/overview', requireAdmin, async (req, res) => {
  try {
    const [[stats], recentRenewals, expiringSoon] = await Promise.all([
      query(`SELECT
        (SELECT COUNT(*) FROM tenants WHERE deleted_at IS NULL) AS total_tenants,
        (SELECT COUNT(*) FROM tenants WHERE deleted_at IS NULL AND is_suspended = false AND (expires_at IS NULL OR expires_at > NOW())) AS active_tenants,
        (SELECT COUNT(*) FROM tenants WHERE deleted_at IS NULL AND is_suspended = false AND expires_at > NOW() AND expires_at <= NOW() + INTERVAL '30 days') AS expiring_soon,
        (SELECT COUNT(*) FROM tenants WHERE deleted_at IS NULL AND (is_suspended = true OR (expires_at IS NOT NULL AND expires_at <= NOW()))) AS inactive_tenants,
        (SELECT COUNT(*) FROM sync_events WHERE received_at > NOW() - INTERVAL '24 hours') AS today_events
      `),
      query(`SELECT tr.*, t.pharmacy_name FROM tenant_renewals tr
       LEFT JOIN tenants t ON t.id = tr.tenant_id
       ORDER BY tr.created_at DESC LIMIT 5`),
      query(`SELECT id, pharmacy_name, expires_at,
        EXTRACT(DAY FROM expires_at - NOW())::int AS days_left
       FROM tenants WHERE deleted_at IS NULL AND is_suspended = false
       AND expires_at > NOW() AND expires_at <= NOW() + INTERVAL '30 days'
       ORDER BY expires_at ASC LIMIT 5`),
    ]);
    res.json({
      stats: stats.rows[0],
      recent_renewals: recentRenewals.rows,
      expiring_soon: expiringSoon.rows,
    });
  } catch (err) {
    console.error('[admin] Overview error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Tenants (paginated, filtered, single-query) ---

router.get('/admin/tenants', requireAdmin, async (req, res) => {
  try {
    const {
      q, status, plan,
      page = '1', limit = '50',
      sort = 'last_sync_at', order = 'desc',
    } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const allowedSorts = ['last_sync_at', 'expires_at', 'pharmacy_name'];
    const sortCol = allowedSorts.includes(sort) ? sort : 'last_sync_at';
    const sortDir = order === 'asc' ? 'ASC' : 'DESC';

    const conditions = ['t.deleted_at IS NULL'];
    const params = [];
    let p = 1;

    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(t.pharmacy_name ILIKE $${p++} OR t.id ILIKE $${p++})`);
      params.push(`%${q}%`);
    }
    if (status === 'active') {
      conditions.push(`t.is_suspended = false AND (t.expires_at IS NULL OR t.expires_at > NOW())`);
    } else if (status === 'expiring') {
      conditions.push(`t.is_suspended = false AND t.expires_at > NOW() AND t.expires_at <= NOW() + INTERVAL '30 days'`);
    } else if (status === 'expired') {
      conditions.push(`(t.is_suspended = true OR (t.expires_at IS NOT NULL AND t.expires_at <= NOW()))`);
    } else if (status === 'suspended') {
      conditions.push('t.is_suspended = true');
    } else if (status === 'no_owner') {
      conditions.push('o.email IS NULL');
    }
    if (plan) {
      params.push(plan);
      conditions.push(`t.current_plan = $${p++}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limitNum);
    const limitIdx = p++;
    params.push(offset);
    const offsetIdx = p++;

    const dataQuery = `
      SELECT t.id, t.pharmacy_name, t.first_seen_at, t.last_sync_at,
             t.total_syncs, t.is_suspended, t.expires_at, t.current_plan,
             t.suspended_at, t.suspended_reason,
             o.email AS owner_email,
             (SELECT COUNT(*) FROM api_tokens WHERE tenant_id = t.id AND is_active = true) AS active_tokens
      FROM tenants t
      LEFT JOIN owners o ON o.tenant_id = t.id
      ${where}
      ORDER BY t.${sortCol} ${sortDir} NULLS LAST
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM tenants t
      LEFT JOIN owners o ON o.tenant_id = t.id
      ${where}
    `;

    const [dataResult, countResult] = await Promise.all([
      query(dataQuery, params),
      query(countQuery, params.slice(0, -2)),
    ]);

    res.json({
      tenants: dataResult.rows,
      total: parseInt(countResult.rows[0].total),
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    console.error('[admin] List tenants error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Create tenant (backward compat) ---

router.post('/admin/tenants', requireAdmin, async (req, res) => {
  try {
    const { tenant_id, label } = req.body;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id is required' });

    await query('INSERT INTO tenants (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [tenant_id]);

    const token = uuidv4();
    await query(
      'INSERT INTO api_tokens (token, tenant_id, label) VALUES ($1, $2, $3)',
      [token, tenant_id, label || `auto-${tenant_id}`]
    );

    await query(
      'INSERT INTO dashboard_summaries (tenant_id, branch_id) VALUES ($1, $2) ON CONFLICT (tenant_id, branch_id) DO NOTHING',
      [tenant_id, 'main-branch']
    );

    const actor = process.env.PMS_ADMIN_TOKEN_LABEL || 'admin';
    await auditLog(actor, 'create_tenant', { tenant_id, target_type: 'tenant', target_id: tenant_id });
    res.json({ tenant_id, token, message: 'Tenant created.' });
  } catch (err) {
    console.error('[admin] Create tenant error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Tenant detail ---

router.get('/admin/tenant/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    const tenantResult = await query(`
      SELECT t.id, t.pharmacy_name, t.first_seen_at, t.last_sync_at,
             t.total_syncs, t.is_suspended, t.expires_at, t.current_plan,
             t.max_users, t.max_branches, t.notes, t.tags,
             t.suspended_at, t.suspended_reason, t.deleted_at,
             o.email AS owner_email
      FROM tenants t
      LEFT JOIN owners o ON o.tenant_id = t.id
      WHERE t.id = $1
    `, [id]);

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    const tenant = tenantResult.rows[0];

    const [dashboardResult, eventsResult, tokensResult, licensesResult, renewalsResult] = await Promise.all([
      query('SELECT * FROM dashboard_summaries WHERE tenant_id = $1 LIMIT 1', [id]),
      query(`SELECT event_type, entity_type, entity_id, summary, amount, occurred_at, synced_at AS received_at
       FROM activity_log WHERE tenant_id = $1 ORDER BY synced_at DESC LIMIT 20`, [id]),
      query(`SELECT token, label, is_active, created_at, last_used_at
       FROM api_tokens WHERE tenant_id = $1 ORDER BY created_at DESC`, [id]),
      query(`SELECT key, status, expires_at, created_at, plan, max_users, max_branches
       FROM license_keys WHERE tenant_id = $1 ORDER BY created_at DESC`, [id]),
      query(`SELECT * FROM tenant_renewals WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 10`, [id]),
    ]);

    res.json({
      tenant,
      dashboard: dashboardResult.rows[0] || null,
      recent_events: eventsResult.rows,
      tokens: tokensResult.rows,
      licenses: licensesResult.rows,
      renewals: renewalsResult.rows,
    });
  } catch (err) {
    console.error('[admin] Tenant detail error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Update tenant (single UPDATE, fixed B7) ---

router.patch('/admin/tenants/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_suspended, expires_at, pharmacy_name, notes, tags, current_plan, max_users, max_branches, suspended_reason } = req.body;

    const tenantResult = await query('SELECT id, is_suspended, suspended_at FROM tenants WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    const existing = tenantResult.rows[0];

    const suspendedAt = is_suspended !== undefined && is_suspended && !existing.is_suspended
      ? new Date().toISOString() : null;
    const suspendedReasonValue = suspendedAt ? (suspended_reason || null) : null;

    const updated = await query(`
      UPDATE tenants SET
        is_suspended = COALESCE($2, is_suspended),
        expires_at = COALESCE($3, expires_at),
        pharmacy_name = COALESCE($4, pharmacy_name),
        notes = COALESCE($5, notes),
        tags = COALESCE($6, tags),
        current_plan = COALESCE($7, current_plan),
        max_users = COALESCE($8, max_users),
        max_branches = COALESCE($9, max_branches),
        suspended_at = $10,
        suspended_reason = $11
      WHERE id = $1
      RETURNING id, pharmacy_name, is_suspended, expires_at, current_plan, max_users, max_branches, suspended_at, suspended_reason
    `, [id, is_suspended, expires_at, pharmacy_name, notes, tags, current_plan, max_users, max_branches, suspendedAt, suspendedReasonValue]);

    // TASK-202: revoke all sync tokens when tenant is suspended
    // JWT revocation: TASK-201 enforces is_suspended on every request, so existing JWTs become non-functional immediately.
    if (is_suspended === true) {
      await query('UPDATE api_tokens SET is_active = false WHERE tenant_id = $1', [id]);
    }

    const label = process.env.PMS_ADMIN_TOKEN_LABEL || 'admin';
    await auditLog(label, 'update_tenant', {
      tenant_id: id, target_type: 'tenant', target_id: id,
      payload: { ...req.body, suspended_at: suspendedAt },
    });

    res.json({ tenant: updated.rows[0] });
  } catch (err) {
    console.error('[admin] Update tenant error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Renew (with audit trail, fixed B3) ---

router.post('/admin/tenants/:id/renew', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { days, paid_amount_cents, paid_method, notes, license_key } = req.body;

    if (!days || days < 1) {
      return res.status(400).json({ error: 'days is required and must be positive' });
    }

    const tenantResult = await query('SELECT id, expires_at FROM tenants WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const currentExpiry = tenantResult.rows[0].expires_at;
    const baseDate = currentExpiry && new Date(currentExpiry) > new Date()
      ? new Date(currentExpiry)
      : new Date();
    const newExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

    const label = process.env.PMS_ADMIN_TOKEN_LABEL || 'admin';

    await transaction(async (client) => {
      await client.query('UPDATE tenants SET expires_at = $1 WHERE id = $2', [newExpiry.toISOString(), id]);
      await client.query(
        `INSERT INTO tenant_renewals (tenant_id, days_added, new_expires_at, paid_amount_cents, paid_method, license_key, created_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, days, newExpiry.toISOString(), paid_amount_cents || null, paid_method || null, license_key || null, label, notes || null]
      );
      await client.query(
        `INSERT INTO admin_audit_log (actor, action, tenant_id, target_type, target_id, payload)
         VALUES ($1, 'renew', $2, 'tenant', $2, $3)`,
        [label, id, JSON.stringify({ days, new_expires_at: newExpiry.toISOString(), paid_amount_cents, paid_method })]
      );
    });

    res.json({
      ok: true,
      tenant_id: id,
      expires_at: newExpiry.toISOString(),
      days_added: days,
    });
  } catch (err) {
    console.error('[admin] Renew error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Upgrade plan ---

router.post('/admin/tenants/:id/upgrade-plan', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { plan, max_users, max_branches } = req.body;
    if (!plan) return res.status(400).json({ error: 'plan is required' });

    const updated = await query(
      `UPDATE tenants SET current_plan = COALESCE($2, current_plan),
       max_users = COALESCE($3, max_users), max_branches = COALESCE($4, max_branches)
       WHERE id = $1 RETURNING id, current_plan, max_users, max_branches`,
      [id, plan, max_users, max_branches]
    );
    if (updated.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });

    const label = process.env.PMS_ADMIN_TOKEN_LABEL || 'admin';
    await auditLog(label, 'upgrade_plan', { tenant_id: id, target_type: 'tenant', target_id: id, payload: { plan, max_users, max_branches } });

    res.json({ tenant: updated.rows[0] });
  } catch (err) {
    console.error('[admin] Upgrade plan error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Delete tenant (soft-delete default; hard-purge with confirm, fixed B4) ---

router.delete('/admin/tenants/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { hard, confirm } = req.query;

    const tenantResult = await query('SELECT id, pharmacy_name FROM tenants WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    const tenant = tenantResult.rows[0];

    if (hard === 'true') {
      if (!confirm) return res.status(400).json({ error: 'confirm parameter (pharmacy name) required for hard delete' });
      if (confirm !== tenant.pharmacy_name && confirm !== tenant.id) {
        return res.status(400).json({ error: 'confirm must match pharmacy name or tenant id' });
      }

      await transaction(async (client) => {
        await client.query('DELETE FROM announcements WHERE tenant_id = $1', [id]);
        await client.query('DELETE FROM activity_log WHERE tenant_id = $1', [id]);
        await client.query('DELETE FROM sync_events WHERE tenant_id = $1', [id]);
        await client.query('DELETE FROM backups WHERE tenant_id = $1', [id]);
        await client.query('DELETE FROM tenant_renewals WHERE tenant_id = $1', [id]);
        await client.query('DELETE FROM owners WHERE tenant_id = $1', [id]);
        await client.query('DELETE FROM api_tokens WHERE tenant_id = $1', [id]);
        await client.query('DELETE FROM license_keys WHERE tenant_id = $1', [id]);
        await client.query('DELETE FROM dashboard_summaries WHERE tenant_id = $1', [id]);
        await client.query('DELETE FROM admin_audit_log WHERE tenant_id = $1', [id]);
        await client.query('DELETE FROM tenants WHERE id = $1', [id]);
      });

      const label = process.env.PMS_ADMIN_TOKEN_LABEL || 'admin';
      await auditLog(label, 'hard_delete', { tenant_id: id, target_type: 'tenant', target_id: id });
      return res.json({ ok: true, mode: 'hard' });
    }

    // Soft delete
    await query(
      `UPDATE tenants SET deleted_at = NOW(), is_suspended = true,
       suspended_at = COALESCE(suspended_at, NOW()), suspended_reason = COALESCE(suspended_reason, 'admin deletion')
       WHERE id = $1`,
      [id]
    );
    await query('UPDATE api_tokens SET is_active = false WHERE tenant_id = $1', [id]);

    const label = process.env.PMS_ADMIN_TOKEN_LABEL || 'admin';
    await auditLog(label, 'soft_delete', { tenant_id: id, target_type: 'tenant', target_id: id });
    res.json({ ok: true, mode: 'soft' });
  } catch (err) {
    console.error('[admin] Delete tenant error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Restore soft-deleted tenant ---

router.post('/admin/tenants/:id/restore', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { unsuspend } = req.body;

    const result = await query(`UPDATE tenants SET deleted_at = NULL
      ${unsuspend !== false ? ', is_suspended = false, suspended_at = NULL, suspended_reason = NULL' : ''}
      WHERE id = $1 AND deleted_at IS NOT NULL
      RETURNING id, pharmacy_name, deleted_at`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found or not soft-deleted' });
    }

    await query('UPDATE api_tokens SET is_active = true WHERE tenant_id = $1', [id]);

    const label = process.env.PMS_ADMIN_TOKEN_LABEL || 'admin';
    await auditLog(label, 'restore', { tenant_id: id, target_type: 'tenant', target_id: id });
    res.json({ ok: true, tenant: result.rows[0] });
  } catch (err) {
    console.error('[admin] Restore tenant error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Trash view ---

router.get('/admin/trash', requireAdmin, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, pharmacy_name, deleted_at, is_suspended, expires_at
       FROM tenants WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`
    );
    res.json({ tenants: result.rows });
  } catch (err) {
    console.error('[admin] Trash error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Devices endpoint ---

router.get('/admin/tenants/:id/devices', requireAdmin, async (req, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT ON (COALESCE(entity_id, 'unknown')) entity_id AS device_id,
        MAX(synced_at) AS last_seen_at
       FROM activity_log WHERE tenant_id = $1 AND entity_id IS NOT NULL
       GROUP BY entity_id ORDER BY entity_id`,
      [req.params.id]
    );

    const tokens = await query(
      `SELECT token, label, last_used_at FROM api_tokens
       WHERE tenant_id = $1 AND last_used_at IS NOT NULL ORDER BY last_used_at DESC`,
      [req.params.id]
    );

    res.json({ devices: result.rows, token_activity: tokens.rows });
  } catch (err) {
    console.error('[admin] Devices error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Refresh request (force sync) ---

router.post('/admin/tenants/:id/refresh-request', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantExists = await query('SELECT id FROM tenants WHERE id = $1', [id]);
    if (tenantExists.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    await query(
      `INSERT INTO activity_log (tenant_id, event_type, entity_type, entity_id, summary, occurred_at, synced_at)
       VALUES ($1, 'refresh_request', 'system', $2, 'Admin requested sync refresh', NOW(), NOW())`,
      [id, uuidv4()]
    );

    const label = process.env.PMS_ADMIN_TOKEN_LABEL || 'admin';
    await auditLog(label, 'refresh_request', { tenant_id: id, target_type: 'tenant', target_id: id });
    res.json({ ok: true, message: 'Refresh request sent. Desktop will sync on next poll.' });
  } catch (err) {
    console.error('[admin] Refresh request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Announcement (existing, kept) ---

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

    const label = process.env.PMS_ADMIN_TOKEN_LABEL || 'admin';
    await auditLog(label, 'announcement', { tenant_id: id, target_type: 'tenant', target_id: id, payload: { message, type } });
    res.json({ ok: true, id: annId });
  } catch (err) {
    console.error('[admin] Announcement error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Broadcast to all/filtered tenants ---

router.post('/admin/broadcast', requireAdmin, async (req, res) => {
  try {
    const { message, type = 'info', status: filterStatus } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });
    if (!['info', 'warning', 'danger'].includes(type)) {
      return res.status(400).json({ error: 'type must be info, warning, or danger' });
    }

    let tenantQuery = 'SELECT id FROM tenants WHERE deleted_at IS NULL';
    const params = [];
    if (filterStatus === 'active') {
      tenantQuery += ` AND is_suspended = false AND (expires_at IS NULL OR expires_at > NOW())`;
    } else if (filterStatus === 'expired') {
      tenantQuery += ` AND (is_suspended = true OR (expires_at IS NOT NULL AND expires_at <= NOW()))`;
    }

    const tenants = await query(tenantQuery, params);

    const annId = uuidv4();
    for (const t of tenants.rows) {
      await query(
        'INSERT INTO announcements (id, tenant_id, message, type) VALUES ($1, $2, $3, $4)',
        [uuidv4(), t.id, message, type]
      );
    }

    const label = process.env.PMS_ADMIN_TOKEN_LABEL || 'admin';
    await auditLog(label, 'broadcast', { payload: { message, type, filter_status: filterStatus, tenant_count: tenants.rows.length } });
    res.json({ ok: true, id: annId, sent_to: tenants.rows.length });
  } catch (err) {
    console.error('[admin] Broadcast error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Create owner (existing, kept) ---

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

    const label = process.env.PMS_ADMIN_TOKEN_LABEL || 'admin';
    await auditLog(label, 'create_owner', { tenant_id: id, target_type: 'owner', payload: { email: email.toLowerCase().trim() } });
    res.json({ ok: true, email: email.toLowerCase().trim() });
  } catch (err) {
    console.error('[admin] Create owner error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Reset owner password (existing, kept) ---

router.post('/admin/tenants/:id/reset-owner-password', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'password must be at least 6 characters' });
    }

    const tenantResult = await query('SELECT id FROM tenants WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const ownerResult = await query('SELECT id, email FROM owners WHERE tenant_id = $1', [id]);
    if (ownerResult.rows.length === 0) {
      return res.status(404).json({ error: 'No owner account for this tenant. Use create-owner first.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await query(
      'UPDATE owners SET password_hash = $1 WHERE tenant_id = $2',
      [passwordHash, id]
    );

    const label = process.env.PMS_ADMIN_TOKEN_LABEL || 'admin';
    await auditLog(label, 'reset_owner_password', { tenant_id: id, target_type: 'owner' });
    res.json({ ok: true, email: ownerResult.rows[0].email });
  } catch (err) {
    console.error('[admin] Reset owner password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Licenses (create - fixed B2 with create_new_tenant flag, list, get, delete) ---

router.post('/admin/licenses', requireAdmin, async (req, res) => {
  try {
    const {
      expires_in_days = 365,
      pharmacy_name,
      tenant_id: existingTenantId,
      plan = 'basic',
      max_users = 5,
      max_branches = 3,
      create_new_tenant,
    } = req.body;

    let tenantId = existingTenantId;

    if (!tenantId) {
      const hasPharmacyName = typeof pharmacy_name === 'string' && pharmacy_name.trim().length > 0;
      const shouldCreateTenant = create_new_tenant === true || (create_new_tenant === undefined && hasPharmacyName);
      if (!shouldCreateTenant) {
        return res.status(400).json({ error: 'create_new_tenant must be true when no tenant_id provided' });
      }
      tenantId = uuidv4();
      await query('INSERT INTO tenants (id) VALUES ($1)', [tenantId]);
      await query(
        'INSERT INTO dashboard_summaries (tenant_id, branch_id) VALUES ($1, $2) ON CONFLICT (tenant_id, branch_id) DO NOTHING',
        [tenantId, 'main-branch']
      );
    } else {
      const exists = await query('SELECT id FROM tenants WHERE id = $1', [tenantId]);
      if (exists.rows.length === 0) {
        return res.status(404).json({ error: 'Tenant not found' });
      }
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

    const label = process.env.PMS_ADMIN_TOKEN_LABEL || 'admin';
    await auditLog(label, 'create_license', { tenant_id: tenantId, target_type: 'license', target_id: key, payload: { plan, expires_in_days } });
    res.json({ key, tenant_id: tenantId, sync_token: syncToken, expires_at: expiresAt });
  } catch (err) {
    console.error('[admin] Create license error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/admin/licenses', requireAdmin, async (req, res) => {
  try {
    const { status: licStatus } = req.query;
    const params = [];
    let where = '';
    if (licStatus && licStatus !== 'all') {
      params.push(licStatus);
      where = ' WHERE lk.status = $1';
    }
    const result = await query(`
      SELECT lk.key, lk.tenant_id, lk.status, lk.expires_at, lk.created_at, lk.plan, lk.max_users, lk.max_branches,
             t.pharmacy_name
      FROM license_keys lk
      LEFT JOIN tenants t ON t.id = lk.tenant_id
      ${where}
      ORDER BY lk.created_at DESC
    `, params);
    res.json({ keys: result.rows });
  } catch (err) {
    console.error('[admin] List licenses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/admin/tenants/:id/licenses', requireAdmin, async (req, res) => {
  try {
    const result = await query(
      `SELECT key, tenant_id, status, expires_at, created_at, plan, max_users, max_branches
       FROM license_keys WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json({ keys: result.rows });
  } catch (err) {
    console.error('[admin] List tenant licenses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/admin/licenses/:key', requireAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const result = await query('DELETE FROM license_keys WHERE key = $1 RETURNING key', [key]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'License key not found' });
    }
    const label = process.env.PMS_ADMIN_TOKEN_LABEL || 'admin';
    await auditLog(label, 'delete_license', { target_type: 'license', target_id: key });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin] Delete license error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Tokens ---

router.post('/admin/tokens', requireAdmin, async (req, res) => {
  try {
    const { tenant_id, label: tokenLabel } = req.body;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id is required' });

    const token = uuidv4();
    await query(
      'INSERT INTO api_tokens (token, tenant_id, label) VALUES ($1, $2, $3)',
      [token, tenant_id, tokenLabel || 'manual']
    );

    const actor = process.env.PMS_ADMIN_TOKEN_LABEL || 'admin';
    await auditLog(actor, 'create_token', { tenant_id, target_type: 'api_token' });
    res.json({ token, tenant_id });
  } catch (err) {
    console.error('[admin] Create token error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/admin/tokens/:token', requireAdmin, async (req, res) => {
  try {
    const result = await query('UPDATE api_tokens SET is_active = false WHERE token = $1 RETURNING tenant_id', [req.params.token]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Token not found' });
    }
    const actor = process.env.PMS_ADMIN_TOKEN_LABEL || 'admin';
    await auditLog(actor, 'revoke_token', { tenant_id: result.rows[0].tenant_id, target_type: 'api_token', target_id: req.params.token });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin] Revoke token error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Admin audit log view ---

router.get('/admin/audit', requireAdmin, async (req, res) => {
  try {
    const { tenant_id, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const params = [];
    let where = '';
    if (tenant_id) {
      params.push(tenant_id);
      where = 'WHERE tenant_id = $1';
    }

    const [dataResult, countResult] = await Promise.all([
      query(`SELECT * FROM admin_audit_log ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limitNum, offset]),
      query(`SELECT COUNT(*) AS total FROM admin_audit_log ${where}`, params),
    ]);

    res.json({
      entries: dataResult.rows,
      total: parseInt(countResult.rows[0].total),
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    console.error('[admin] Audit log error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- CSV Export ---

router.get('/admin/export.csv', requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = 'WHERE deleted_at IS NULL';
    if (status === 'active') {
      where += ` AND is_suspended = false AND (expires_at IS NULL OR expires_at > NOW())`;
    } else if (status === 'expiring') {
      where += ` AND is_suspended = false AND expires_at > NOW() AND expires_at <= NOW() + INTERVAL '30 days'`;
    } else if (status === 'expired') {
      where += ` AND (is_suspended = true OR (expires_at IS NOT NULL AND expires_at <= NOW()))`;
    }

    const result = await query(
      `SELECT id, pharmacy_name, current_plan, expires_at, is_suspended, last_sync_at, total_syncs,
        (SELECT email FROM owners WHERE tenant_id = t.id LIMIT 1) AS owner_email
       FROM tenants t ${where} ORDER BY pharmacy_name ASC`,
      params
    );

    const bom = '\uFEFF';
    const headers = ['ID', 'Pharmacy Name', 'Plan', 'Expires At', 'Suspended', 'Last Sync', 'Total Syncs', 'Owner Email'];
    const csvRows = [headers.join(',')];
    for (const row of result.rows) {
      csvRows.push([
        row.id,
        `"${(row.pharmacy_name || '').replace(/"/g, '""')}"`,
        row.current_plan,
        row.expires_at || '',
        row.is_suspended ? 'Yes' : 'No',
        row.last_sync_at || '',
        row.total_syncs,
        `"${(row.owner_email || '').replace(/"/g, '""')}"`,
      ].join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tenants.csv"');
    res.send(bom + csvRows.join('\n'));
  } catch (err) {
    console.error('[admin] Export CSV error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Backups (fixed B5: t.label → t.pharmacy_name) ---

router.get('/admin/backups', requireAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        t.id AS tenant_id,
        t.pharmacy_name,
        COUNT(b.id) AS backup_count,
        MAX(b.created_at) AS last_backup_at,
        MAX(b.file_size) AS last_backup_size
      FROM tenants t
      LEFT JOIN backups b ON b.tenant_id = t.id
      GROUP BY t.id, t.pharmacy_name
      ORDER BY t.pharmacy_name ASC
    `);

    res.json({
      tenants: result.rows.map(row => ({
        tenant_id: row.tenant_id,
        pharmacy_name: row.pharmacy_name,
        backup_count: parseInt(row.backup_count),
        last_backup_at: row.last_backup_at,
        last_backup_size: parseInt(row.last_backup_size) || 0,
      })),
    });
  } catch (err) {
    console.error('[admin/backups] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Stats (kept for compatibility) ---

router.get('/admin/stats', requireAdmin, async (req, res) => {
  try {
    const result = await query(`SELECT
      (SELECT COUNT(*) FROM tenants WHERE deleted_at IS NULL) AS total_tenants,
      (SELECT COUNT(*) FROM sync_events) AS total_events,
      (SELECT COUNT(*) FROM sync_events WHERE received_at > NOW() - INTERVAL '24 hours') AS today_events,
      (SELECT COUNT(*) FROM tenants WHERE deleted_at IS NULL AND is_suspended = false AND (expires_at IS NULL OR expires_at > NOW())) AS active_tenants,
      (SELECT COUNT(*) FROM tenants WHERE deleted_at IS NULL AND is_suspended = false AND expires_at > NOW() AND expires_at <= NOW() + INTERVAL '30 days') AS expiring_soon,
      (SELECT COUNT(*) FROM tenants WHERE deleted_at IS NULL AND (is_suspended = true OR (expires_at IS NOT NULL AND expires_at <= NOW()))) AS expired_tenants
    `);
    const s = result.rows[0];
    res.json({
      total_tenants: parseInt(s.total_tenants),
      total_events: parseInt(s.total_events),
      today_events: parseInt(s.today_events),
      active_tenants: parseInt(s.active_tenants),
      expiring_soon: parseInt(s.expiring_soon),
      expired_tenants: parseInt(s.expired_tenants),
    });
  } catch (err) {
    console.error('[admin] Stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Renewals (licenses expiring within N days) ---

router.get('/admin/renewals', requireAdmin, async (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30));
    const result = await query(
      `SELECT t.id, t.pharmacy_name, t.expires_at, t.current_plan,
              EXTRACT(DAY FROM (t.expires_at - NOW()))::int AS days_remaining
       FROM tenants t
       WHERE t.deleted_at IS NULL
         AND t.is_suspended = false
         AND t.expires_at IS NOT NULL
         AND t.expires_at > NOW()
         AND t.expires_at < NOW() + ($1::int || ' days')::INTERVAL
       ORDER BY t.expires_at ASC`,
      [days]
    );
    res.json({ tenants: result.rows, days });
  } catch (err) {
    console.error('[admin] Renewals error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

