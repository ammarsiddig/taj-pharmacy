import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query, transaction } from '../db.js';
import { requireAuth, requireAuthOrJwt, requireJwt } from '../auth.js';
import { loginLimiter, activateLimiter } from '../middleware/rate-limit.js';

const router = Router();

const JWT_SECRET = process.env.PMS_JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('PMS_JWT_SECRET environment variable is required. Refusing to start with insecure default.');
}
const JWT_EXPIRES = '1h';
const REFRESH_TOKEN_DAYS = 30;
const BCRYPT_ROUNDS = 10;

/**
 * POST /v1/activate
 * First-time license activation from desktop wizard.
 * Body: { key, email, password, pharmacy_name }
 * Returns: { sync_token, tenant_id, expires_at }
 */
router.post('/v1/activate', activateLimiter, async (req, res) => {
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
    const tenantOwnerResult = await query(
      'SELECT id, email FROM owners WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1',
      [licenseKey.tenant_id]
    );

    if (tenantOwnerResult.rows.length > 0) {
      const tenantOwner = tenantOwnerResult.rows[0];
      if (tenantOwner.email !== normalizedEmail) {
        return res.status(400).json({ error: 'This tenant already has an owner account' });
      }

      const retryTokenResult = await query(
        'SELECT token FROM api_tokens WHERE tenant_id = $1 AND is_active = true LIMIT 1',
        [licenseKey.tenant_id]
      );
      if (retryTokenResult.rows.length === 0) {
        return res.status(500).json({ error: 'No sync token configured for this license' });
      }

      await transaction(async (client) => {
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

      return res.json({
        sync_token: retryTokenResult.rows[0].token,
        tenant_id: licenseKey.tenant_id,
        expires_at: licenseKey.expires_at,
        plan: licenseKey.plan || 'basic',
        max_users: licenseKey.max_users || 5,
        max_branches: licenseKey.max_branches || 3,
      });
    }

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
router.post('/auth/login', loginLimiter, async (req, res) => {
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

    // TASK-205: check account lockout
    if (owner.locked_until && new Date(owner.locked_until) > new Date()) {
      return res.status(429).json({ error: 'Account temporarily locked. Try again later.' });
    }

    const tenantResult = await query(
      'SELECT id, is_suspended, expires_at FROM tenants WHERE id = $1',
      [owner.tenant_id]
    );
    if (tenantResult.rows.length === 0) {
      return res.status(401).json({ error: 'Account not found' });
    }
    const tenant = tenantResult.rows[0];

    if (tenant.is_suspended) {
      return res.status(403).json({ error: 'Tenant is suspended. Please contact support.' });
    }

    if (!bcrypt.compareSync(password, owner.password_hash)) {
      const attempts = (owner.failed_login_attempts || 0) + 1;
      if (attempts >= 5) {
        await query(
          "UPDATE owners SET failed_login_attempts = $1, locked_until = NOW() + INTERVAL '15 minutes' WHERE id = $2",
          [attempts, owner.id]
        );
      } else {
        await query(
          'UPDATE owners SET failed_login_attempts = $1 WHERE id = $2',
          [attempts, owner.id]
        );
      }
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Successful login: reset lockout counter
    await query('UPDATE owners SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [owner.id]);

    const token = jwt.sign(
      { tenant_id: owner.tenant_id, email: owner.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    // TASK-206: generate refresh token
    const refreshTokenRaw = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = bcrypt.hashSync(refreshTokenRaw, BCRYPT_ROUNDS);
    await query(
      "INSERT INTO refresh_tokens (tenant_id, owner_id, token_hash, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')",
      [owner.tenant_id, owner.id, refreshTokenHash]
    );

    res.json({ token, refresh_token: refreshTokenRaw, tenant_id: owner.tenant_id });
  } catch (err) {
    console.error('[auth] login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /auth/refresh
 * Issue a new access token from a valid refresh token.
 * Body: { refresh_token }
 * Returns: { token }
 */
router.post('/auth/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ error: 'refresh_token is required' });
    }

    const result = await query(
      "SELECT id, tenant_id, owner_id, token_hash, expires_at FROM refresh_tokens WHERE revoked_at IS NULL AND expires_at > NOW()"
    );
    let found = null;
    for (const row of result.rows) {
      if (bcrypt.compareSync(refresh_token, row.token_hash)) {
        found = row;
        break;
      }
    }

    if (!found) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const ownerResult = await query('SELECT email FROM owners WHERE id = $1', [found.owner_id]);
    if (ownerResult.rows.length === 0) {
      return res.status(401).json({ error: 'Owner not found' });
    }

    const token = jwt.sign(
      { tenant_id: found.tenant_id, email: ownerResult.rows[0].email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({ token });
  } catch (err) {
    console.error('[auth] refresh error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /auth/logout
 * Revoke the refresh token. Body: { refresh_token }
 */
router.post('/auth/logout', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ error: 'refresh_token is required' });
    }

    const result = await query(
      "SELECT id, token_hash FROM refresh_tokens WHERE revoked_at IS NULL AND expires_at > NOW()"
    );
    let found = null;
    for (const row of result.rows) {
      if (bcrypt.compareSync(refresh_token, row.token_hash)) {
        found = row;
        break;
      }
    }

    if (found) {
      await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [found.id]);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] logout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /auth/recover
 * Recover cloud credentials for a new device using license key + owner email + password.
 * Applies TASK-204 rate limiting (loginLimiter) and TASK-205 account lockout.
 * Body: { license_key, email, password }
 * Returns: { tenant_id, sync_token, owner_id, pharmacy_name }
 */
router.post('/auth/recover', loginLimiter, async (req, res) => {
  try {
    const { license_key, email, password } = req.body;
    if (!license_key || !email || !password) {
      return res.status(400).json({ error: 'license_key, email, and password are required' });
    }

    const key = license_key.trim();
    const normalizedEmail = email.toLowerCase().trim();

    const licenseResult = await query(
      "SELECT tenant_id, status FROM license_keys WHERE key = $1",
      [key]
    );
    if (licenseResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid recovery credentials' });
    }
    const lic = licenseResult.rows[0];
    if (lic.status === 'revoked') {
      return res.status(401).json({ error: 'Invalid recovery credentials' });
    }

    const ownerResult = await query(
      'SELECT id, password_hash, failed_login_attempts, locked_until FROM owners WHERE tenant_id = $1 AND email = $2',
      [lic.tenant_id, normalizedEmail]
    );
    if (ownerResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid recovery credentials' });
    }
    const owner = ownerResult.rows[0];

    if (owner.locked_until && new Date(owner.locked_until) > new Date()) {
      return res.status(429).json({ error: 'Account temporarily locked. Try again later.' });
    }

    if (!bcrypt.compareSync(password, owner.password_hash)) {
      const attempts = (owner.failed_login_attempts || 0) + 1;
      if (attempts >= 5) {
        await query(
          "UPDATE owners SET failed_login_attempts = $1, locked_until = NOW() + INTERVAL '15 minutes' WHERE id = $2",
          [attempts, owner.id]
        );
      } else {
        await query(
          'UPDATE owners SET failed_login_attempts = $1 WHERE id = $2',
          [attempts, owner.id]
        );
      }
      return res.status(401).json({ error: 'Invalid recovery credentials' });
    }

    await query('UPDATE owners SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [owner.id]);

    const syncToken = crypto.randomBytes(32).toString('hex');
    await query(
      "INSERT INTO api_tokens (token, tenant_id, label, is_active) VALUES ($1, $2, 'device-recovery', true)",
      [syncToken, lic.tenant_id]
    );

    const tenantResult = await query(
      'SELECT pharmacy_name FROM tenants WHERE id = $1',
      [lic.tenant_id]
    );

    res.json({
      tenant_id: lic.tenant_id,
      sync_token: syncToken,
      owner_id: owner.id,
      pharmacy_name: tenantResult.rows[0]?.pharmacy_name || '',
    });
  } catch (err) {
    console.error('[auth] recover error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /v1/tenants/me
 * Update own pharmacy name. Auth: Bearer sync_token or JWT.
 * Body: { pharmacy_name }
 */
router.patch('/v1/tenants/me', requireAuthOrJwt, async (req, res) => {
  try {
    const { pharmacy_name } = req.body;
    if (!pharmacy_name) {
      return res.status(400).json({ error: 'pharmacy_name is required' });
    }
    await query(
      'UPDATE tenants SET pharmacy_name = $1 WHERE id = $2',
      [pharmacy_name, req.tenantId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] update tenant error:', err);
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
 * Update cloud password hash (requires current password for identity proof).
 * Auth: Bearer JWT only (not sync tokens)
 * Body: { current_password, new_password }
 */
router.put('/auth/password', requireJwt, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'current_password and new_password are required' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'new_password must be at least 6 characters' });
    }

    const ownerResult = await query(
      'SELECT password_hash FROM owners WHERE tenant_id = $1',
      [req.tenantId]
    );
    if (ownerResult.rows.length === 0) {
      return res.status(404).json({ error: 'No owner account found for this tenant' });
    }
    const owner = ownerResult.rows[0];

    if (!bcrypt.compareSync(current_password, owner.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = bcrypt.hashSync(new_password, BCRYPT_ROUNDS);
    await query(
      'UPDATE owners SET password_hash = $1 WHERE tenant_id = $2',
      [passwordHash, req.tenantId]
    );

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

// GET /v1/users — owner PWA user list
router.get('/v1/users', requireAuthOrJwt, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, branch_id, role_id, username, full_name, full_name_ar,
              phone, is_active, last_login_at
       FROM snapshot_users
       WHERE tenant_id = $1
       ORDER BY full_name`,
      [req.tenantId]
    );
    res.json({ tenant_id: req.tenantId, users: result.rows });
  } catch (err) {
    console.error('[users] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /v1/branches/friendly-names — owner PWA branch list with names
router.get('/v1/branches/friendly-names', requireAuthOrJwt, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, name_ar, is_main, is_active
       FROM snapshot_branches
       WHERE tenant_id = $1
       ORDER BY is_main DESC, name`,
      [req.tenantId]
    );
    res.json({ tenant_id: req.tenantId, branches: result.rows });
  } catch (err) {
    console.error('[branches] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
