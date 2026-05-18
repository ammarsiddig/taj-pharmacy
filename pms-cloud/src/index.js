import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { runMigrations, healthCheck } from './db.js';
import eventsRouter from './routes/events.js';
import dashboardRouter from './routes/dashboard.js';
import adminRouter from './routes/admin.js';
import backupsRouter from './routes/backups.js';
import authRouter from './routes/auth.js';
import syncRouter from './routes/sync.js';
import downloadRouter from './routes/download.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Security & parsing
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('short'));

// Health check (no auth)
app.get('/health', async (req, res) => {
  const dbHealth = await healthCheck();
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    database: dbHealth
  });
});

// API routes
app.use(authRouter);
app.use(eventsRouter);
app.use(syncRouter);  // New table-snapshot sync
app.use(dashboardRouter);
app.use(adminRouter);
app.use(backupsRouter);
app.use(downloadRouter);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize
async function main() {
  try {
    await runMigrations();
    console.log('[server] Database ready');
  } catch (e) {
    console.error('[server] Database initialization failed:', e.message);
    process.exit(1);
  }
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] PMS Cloud API running on port ${PORT}`);
    console.log(`[server] Health check: http://localhost:${PORT}/health`);
    console.log(`[server] Mode: ${process.env.PMS_USE_SQLITE === 'true' ? 'SQLite (legacy)' : 'PostgreSQL'}`);
  });
}

main();
