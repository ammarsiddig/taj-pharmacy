import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

// Database connection config
if (!process.env.PGPASSWORD) {
  throw new Error('PGPASSWORD environment variable is required. Refusing to start with insecure default.');
}
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  database: process.env.PGDATABASE || 'pms_cloud',
  user: process.env.PGUSER || 'pms',
  password: process.env.PGPASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Helper to run queries
export async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result;
  } finally {
    client.release();
  }
}

// Transaction helper
export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Run migrations from SQL files — each file runs only once
export async function runMigrations() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir = path.join(__dirname, '..', 'migrations');

  // Ensure tracking table exists
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const already = await query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
    if (already.rows.length > 0) {
      console.log(`[db] Migration already applied, skipping: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      await query(sql);
      await query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      console.log(`[db] Migration applied: ${file}`);
    } catch (e) {
      console.error(`[db] Migration failed: ${file}`, e.message);
      throw e;
    }
  }

  console.log('[db] All migrations completed');
}

// Health check
export async function healthCheck() {
  try {
    const result = await query('SELECT NOW() as now');
    return { healthy: true, timestamp: result.rows[0].now };
  } catch (e) {
    return { healthy: false, error: e.message };
  }
}

// Legacy: Keep SQLite for migration period if PMS_USE_SQLITE=true
let sqliteDb = null;
if (process.env.PMS_USE_SQLITE === 'true') {
  const { default: Database } = await import('better-sqlite3');
  const DATA_DIR = process.env.PMS_DATA_DIR || '/data';
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const dbPath = path.join(DATA_DIR, 'pms-cloud.db');
  sqliteDb = new Database(dbPath);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
  console.log('[db] SQLite fallback enabled for migration');
}

export { pool, sqliteDb };
export default pool;
