import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { query } from '../db.js';

const router = Router();
const DATA_DIR = process.env.PMS_DATA_DIR || '/data';
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

// Ensure backups directory exists
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

/**
 * POST /v1/backups
 * Upload an encrypted backup file.
 * Content-Type: application/octet-stream
 * Max size: 100MB
 */
router.post('/v1/backups', requireAuth, (req, res) => {
  const tenantId = req.tenantId;
  const backupId = uuidv4();
  const tenantDir = path.join(BACKUPS_DIR, tenantId);

  if (!fs.existsSync(tenantDir)) {
    fs.mkdirSync(tenantDir, { recursive: true });
  }

  const filePath = path.join(tenantDir, `${backupId}.bak`);
  const chunks = [];
  let totalSize = 0;
  const MAX_SIZE = 100 * 1024 * 1024; // 100MB

  req.on('data', (chunk) => {
    totalSize += chunk.length;
    if (totalSize > MAX_SIZE) {
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', async () => {
    try {
      if (totalSize > MAX_SIZE) {
        return res.status(413).json({ error: 'Backup too large (max 100MB)' });
      }

      if (totalSize === 0) {
        return res.status(400).json({ error: 'Empty backup file' });
      }

      const buffer = Buffer.concat(chunks);
      fs.writeFileSync(filePath, buffer);

      // Store metadata in PostgreSQL
      await query(`
        INSERT INTO backups (id, tenant_id, file_size, file_path, created_at)
        VALUES ($1, $2, $3, $4, NOW())
      `, [backupId, tenantId, totalSize, filePath]);

      // Keep only last 10 backups per tenant
      const oldResult = await query(`
        SELECT id, file_path FROM backups
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        OFFSET 10
      `, [tenantId]);

      for (const row of oldResult.rows) {
        try { fs.unlinkSync(row.file_path); } catch {}
        await query('DELETE FROM backups WHERE id = $1', [row.id]);
      }

      console.log(`[backups] Stored backup ${backupId} for tenant ${tenantId} (${(totalSize / 1024).toFixed(1)} KB)`);

      res.json({
        id: backupId,
        tenant_id: tenantId,
        file_size: totalSize,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[backups] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  req.on('error', (err) => {
    console.error('[backups] Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  });
});

/**
 * GET /v1/backups
 * List backups for the authenticated tenant.
 */
router.get('/v1/backups', requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT id, file_size, created_at
      FROM backups
      WHERE tenant_id = $1
      ORDER BY created_at DESC
    `, [req.tenantId]);

    res.json({ tenant_id: req.tenantId, backups: result.rows });
  } catch (err) {
    console.error('[backups] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /v1/backups/:id
 * Download a specific backup file.
 */
router.get('/v1/backups/:id', requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT id, tenant_id, file_path, file_size
      FROM backups
      WHERE id = $1 AND tenant_id = $2
    `, [req.params.id, req.tenantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Backup not found' });
    }
    const row = result.rows[0];

    if (!fs.existsSync(row.file_path)) {
      return res.status(404).json({ error: 'Backup file missing from disk' });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', row.file_size);
    res.setHeader('Content-Disposition', `attachment; filename="${row.id}.bak"`);

    const stream = fs.createReadStream(row.file_path);
    stream.pipe(res);
  } catch (err) {
    console.error('[backups] Download error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /v1/backups/:id
 * Delete a specific backup.
 */
router.delete('/v1/backups/:id', requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT id, file_path FROM backups
      WHERE id = $1 AND tenant_id = $2
    `, [req.params.id, req.tenantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Backup not found' });
    }
    const row = result.rows[0];

    try { fs.unlinkSync(row.file_path); } catch {}
    await query('DELETE FROM backups WHERE id = $1', [row.id]);

    res.json({ ok: true });
  } catch (err) {
    console.error('[backups] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
