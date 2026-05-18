import jwt from 'jsonwebtoken';
import { query } from './db.js';

const JWT_SECRET = process.env.PMS_JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('PMS_JWT_SECRET environment variable is required. Refusing to start with insecure default.');
}

/**
 * Async middleware: validate Bearer token from api_tokens table.
 * Sets req.tenantId on success.
 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = header.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Empty bearer token' });
  }

  try {
    const result = await query(
      'SELECT tenant_id FROM api_tokens WHERE token = $1 AND is_active = true',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Invalid or revoked token' });
    }

    req.tenantId = result.rows[0].tenant_id;

    // TASK-201: check suspension before allowing sync requests
    if (req.path && req.path.startsWith('/v1/sync')) {
      const tenantResult = await query(
        'SELECT is_suspended FROM tenants WHERE id = $1',
        [req.tenantId]
      );
      if (tenantResult.rows.length > 0 && tenantResult.rows[0].is_suspended) {
        return res.status(403).json({ error: 'Tenant is suspended. Please contact support.' });
      }
    }

    query('UPDATE api_tokens SET last_used_at = NOW() WHERE token = $1', [token]).catch(() => {});
    next();
  } catch (error) {
    console.error('[auth] Database error:', error.message);
    return res.status(500).json({ error: 'Authentication check failed' });
  }
}

/**
 * Alias for requireAuth - used by sync routes
 */
export const authenticateToken = requireAuth;

/**
 * Middleware for admin endpoints (uses PMS_ADMIN_TOKEN env var).
 */
export function requireAdmin(req, res, next) {
  const adminToken = process.env.PMS_ADMIN_TOKEN;
  if (!adminToken) {
    return res.status(503).json({ error: 'Admin access not configured' });
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const token = header.slice(7).trim();
  if (token !== adminToken) {
    return res.status(403).json({ error: 'Invalid admin token' });
  }

  next();
}

/**
 * Middleware: validate JWT (for PWA owner login).
 * Sets req.tenantId on success.
 */
export function requireJwt(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = header.slice(7).trim();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.tenantId = payload.tenant_id;
    req.ownerEmail = payload.email;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Async middleware: accept either sync_token (api_tokens) OR JWT.
 * Allows same /v1/* routes to serve both desktop and PWA.
 */
export async function requireAuthOrJwt(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = header.slice(7).trim();

  try {
    // Try sync token first
    const result = await query(
      'SELECT tenant_id FROM api_tokens WHERE token = $1 AND is_active = true',
      [token]
    );
    
    if (result.rows.length > 0) {
      req.tenantId = result.rows[0].tenant_id;
      query('UPDATE api_tokens SET last_used_at = NOW() WHERE token = $1', [token]).catch(() => {});
      return next();
    }

    // Try JWT
    const payload = jwt.verify(token, JWT_SECRET);
    req.tenantId = payload.tenant_id;
    req.ownerEmail = payload.email;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or revoked token' });
  }
}
