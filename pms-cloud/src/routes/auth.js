import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, transaction } from '../db.js';
import { requireAuth, requireAuthOrJwt } from '../auth.js';

const router = Router();

const JWT_SECRET = process.env.PMS_JWT_SECRET || 'pms-jwt-dev-secret-change-in-production';
const JWT_EXPIRES = '30d';
const BCRYPT_ROUNDS = 10;

/**
 * POST /v1/activate
 * First-time license activation from desktop wizard.
 * Body: { key, email, password, pharmacy_name }
 * Returns: { sync_token, tenant_id, expires_at }
 */
router.post('/v1/activate', async (req, res) => {
  try {
    const { key, email, password, pharmacy_name } = req.body;
    if (!key || !email || !password) {
      return res.status(400).json({ error: 'key, email, and password are required' });
    }

    const licenseResult = await query(
      "SELECT * FROM license_keys WHERE key = $1 AND status = 'pending'",
      [key.trim()]
    );
    if (licenseResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or already used license key' });
    }
    const licenseKey = licenseResult.rows[0];

    const normalizedEmail = email.toLowerCase().trim();
    const existingResult = await query('SELECT id, tenant_id FROM owners WHERE email = $1', [normalizedEmail]);
    if (existingResult.rows.length > 0) {
      const existingOwner = existingResult.rows[0];
      if (existingOwner.tenant_id === licenseKey.tenant_id) {
        const retryTokenResult = await query(
          'SELECT token FROM api_tokens WHERE tenant_id = $1 AND is_active = true LIMIT 1',
          [licenseKey.tenant_id]
        );
        if (retryTokenResult.rows.length === 0) {
          return res.status(500).json({ error: 'No sync token configured for this license' });
        }
        return res.json({
          sync_token: retryTokenResult.rows[0].token,
          tenant_id: licenseKey.tenant_id,
          expires_at: licenseKey.expires_at,
          plan: licenseKey.plan || 'basic',
          max_users: licenseKey.max_users || 5,
          max_branches: licenseKey.max_branches || 3,
        });
      }
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const tokenResult = await query(
      'SELECT token FROM api_tokens WHERE tenant_id = $1 AND is_active = true LIMIT 1',
      [licenseKey.tenant_id]
    );
    if (tokenResult.rows.length === 0) {
      return res.status(500).json({ error: 'No sync token configured for this license' });
    }
    const tokenRow = tokenResult.rows[0];

    const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
    const ownerId = uuidv4();

    await transaction(async (client) => {
      await client.query(
        'INSERT INTO owners (id, tenant_id, email, password_hash) VALUES ($1, $2, $3, $4)',
        [ownerId, licenseKey.tenant_id, normalizedEmail, passwordHash]
      );

      await client.query(
        "UPDATE license_keys SET status = 'used' WHERE key = $1",
        [key.trim()]
      );

      if (pharmacy_name) {
        await client.query(
          'UPDATE tenants SET pharmacy_name = $1, expires_at = $2 WHERE id = $3',
          [pharmacy_name.trim(), licenseKey.expires_at, licenseKey.tenant_id]
        );
      } else {
        await client.query(
          'UPDATE tenants SET expires_at = $1 WHERE id = $2',
          [licenseKey.expires_at, licenseKey.tenant_id]
        );
      }
    });

    res.json({
      sync_token: tokenRow.token,
      tenant_id: licenseKey.tenant_id,
      expires_at: licenseKey.expires_at,
      plan: licenseKey.plan || 'basic',
      max_users: licenseKey.max_users || 5,
      max_branches: licenseKey.max_branches || 3,
    });
  } catch (err) {
    console.error('[auth] activate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /v1/renew
 * Renewal activation (tenant already has owner account).
 * Auth: Bearer sync_token
 * Body: { key }
 */
router.post('/v1/renew', requireAuth, async (req, res) => {
  try {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: 'key is required' });

    const licenseResult = await query(
      "SELECT * FROM license_keys WHERE key = $1 AND status = 'pending' AND tenant_id = $2",
      [key.trim(), req.tenantId]
    );
    if (licenseResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or already used renewal key' });
    }
    const licenseKey = licenseResult.rows[0];

    await transaction(async (client) => {
      await client.query(
        'UPDATE tenants SET expires_at = $1 WHERE id = $2',
        [licenseKey.expires_at, req.tenantId]
      );
      await client.query(
        "UPDATE license_keys SET status = 'used' WHERE key = $1",
        [key.trim()]
      );
    });

    res.json({ ok: true, expires_at: licenseKey.expires_at, plan: licenseKey.plan || 'basic', max_users: licenseKey.max_users || 5, max_branches: licenseKey.max_branches || 3 });
  } catch (err) {
    console.error('[auth] renew error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /auth/login
 * PWA owner login with email + password → JWT.
 * Body: { email, password }
 */
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const ownerResult = await query(
      'SELECT * FROM owners WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    if (ownerResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const owner = ownerResult.rows[0];

    const tenantResult = await query(
      'SELECT id, is_suspended, expires_at FROM tenants WHERE id = $1',
      [owner.tenant_id]
    );
    if (tenantResult.rows.length === 0) {
      return res.status(401).json({ error: 'Account not found' });
    }

    if (!bcrypt.compareSync(password, owner.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { tenant_id: owner.tenant_id, email: owner.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({ token, tenant_id: owner.tenant_id });
  } catch (err) {
    console.error('[auth] login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /v1/config
 * Desktop polls this on startup + every sync cycle.
 * Auth: Bearer sync_token
 * Returns: { status, expires_at, announcement, announcement_type }
 */
router.get('/v1/config', requireAuthOrJwt, async (req, res) => {
  try {
    const tenantResult = await query(
      'SELECT is_suspended, expires_at FROM tenants WHERE id = $1',
      [req.tenantId]
    );
    const tenant = tenantResult.rows[0];

    let status = 'active';
    if (!tenant || tenant.is_suspended) {
      status = 'suspended';
    } else if (tenant.expires_at) {
      if (new Date() > new Date(tenant.expires_at)) status = 'expired';
    }

    const annResult = await query(
      'SELECT message, type FROM announcements WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.tenantId]
    );
    const ann = annResult.rows[0];

    res.json({
      status,
      expires_at: tenant?.expires_at || null,
      announcement: ann?.message || null,
      announcement_type: ann?.type || null,
    });
  } catch (err) {
    console.error('[auth] config error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /auth/password
 * Update cloud password hash (desktop calls after owner changes password).
 * Auth: Bearer sync_token
 * Body: { new_password }
 */
router.put('/auth/password', requireAuthOrJwt, async (req, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'new_password must be at least 6 characters' });
    }

    const passwordHash = bcrypt.hashSync(new_password, BCRYPT_ROUNDS);
    const result = await query(
      'UPDATE owners SET password_hash = $1 WHERE tenant_id = $2',
      [passwordHash, req.tenantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'No owner account found for this tenant' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] password update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /v1/subscription
 * Owner checks their subscription status.
 * Auth: Bearer sync_token or JWT
 * Returns: { status, expires_at, days_remaining, pharmacy_name, is_suspended }
 */
router.get('/v1/subscription', requireAuthOrJwt, async (req, res) => {
  try {
    const tenantResult = await query(
      'SELECT pharmacy_name, expires_at, is_suspended FROM tenants WHERE id = $1',
      [req.tenantId]
    );
    
    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    const tenant = tenantResult.rows[0];
    
    let status = 'active';
    let daysRemaining = null;
    
    if (tenant.is_suspended) {
      status = 'suspended';
    } else if (tenant.expires_at) {
      const expiryDate = new Date(tenant.expires_at);
      const now = new Date();
      const diffMs = expiryDate.getTime() - now.getTime();
      daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      
      if (daysRemaining < 0) {
        status = 'expired';
      } else if (daysRemaining <= 14) {
        status = 'expiring';
      }
    }
    
    res.json({
      status,
      expires_at: tenant.expires_at,
      days_remaining: daysRemaining,
      pharmacy_name: tenant.pharmacy_name,
      is_suspended: tenant.is_suspended,
    });
  } catch (err) {
    console.error('[auth] subscription error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
