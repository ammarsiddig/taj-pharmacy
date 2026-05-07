# Cloud Engineer — TAJ Pharmacy v4

> **Role**: Cloud API, PostgreSQL, Docker, deployment, sync engine, PWA hosting.
> **You OWN**: All files in `pms-cloud/` (API server, migrations, Docker, PWA).
> **You TOUCH**: `src-tauri/src/commands/cloud_sync.rs` (desktop sync client — coordinate with Rust Developer).
> **You NEVER**: Modify desktop frontend code (`src/`) or Rust command logic (`src-tauri/src/commands/`). If a desktop change is needed, file a cross-role request.

---

## Session Protocol

1. Read this file + `_ACTIVE-LOCK.md` + last 3 entries in `_WORK-LOG.md`
2. Read `docs/AGENT-HANDOFF.md` sections 1–6 for project context
3. Do your work
4. Test locally: `cd pms-cloud && npm run dev` (or Docker: `docker-compose up --build`)
5. Update this file (flip ⬜→✅, update module map)
6. Append to `_WORK-LOG.md`
7. Update `_ACTIVE-LOCK.md` (clear session, update queue)

---

## Architecture

### Infrastructure Stack

```
┌─────────────────────────────────────────────┐
│  Caddy (reverse proxy + static file server) │
│  :80 → /v1/*, /admin/*, /auth/* → API      │
│  :80 → /* → PWA static files               │
│  Future: domain → auto HTTPS via Let's Encrypt │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  Node.js API (Express)                      │
│  :3000                                      │
│  - helmet, cors, morgan                     │
│  - JWT + API token auth                     │
│  - Table-snapshot sync                      │
│  - Owner dashboard                          │
│  - Admin panel API                          │
│  - Backup storage                           │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  PostgreSQL 16                               │
│  Database: pms_cloud                        │
│  User: pms                                  │
│  Migrations: pms-cloud/migrations/          │
└─────────────────────────────────────────────┘
```

### Docker Compose Services

| Service | Image | Port | Volume | Purpose |
|---------|-------|------|--------|---------|
| `postgres` | postgres:16-alpine | 5432 (internal) | `postgres-data` | Database |
| `api` | custom Dockerfile | 3000 (internal) | `pms-data` | Express API + backup storage |
| `caddy` | caddy:2-alpine | 80, 443 | `caddy-data`, `caddy-config`, `web-dist` | Reverse proxy + PWA |

### Directory Structure

```
pms-cloud/
  src/
    index.js          # Express app setup + server start
    db.js             # PostgreSQL pool + query helpers + migration runner
    auth.js           # Auth middleware (requireAuth, requireJwt, requireAdmin)
    read-model.js     # Legacy event processor (SQLite-based, DEPRECATED)
    routes/
      auth.js         # /auth/* — owner login, license activation, JWT
      sync.js         # /v1/sync/* — table-snapshot sync (PRIMARY)
      events.js       # /v1/events — legacy event sync (DEPRECATED)
      dashboard.js    # /v1/dashboard — owner dashboard data
      admin.js        # /admin/* — tenant management, license keys
      backups.js      # /v1/backups — encrypted backup upload/download
  web/                # Owner PWA (React + Vite)
    src/
      api.ts          # API client with JWT + admin token auth
      App.tsx         # Router + auth guards
      pages/          # Dashboard, Sales, Stock, Finance, Sync, etc.
  migrations/         # PostgreSQL migration SQL files
    001_initial_postgres.sql
    002_add_today_expenses.sql
    003_add_bank_sales.sql
    004_supplier_invoices.sql
    005_license_plan_limits.sql
  docker-compose.yml
  Dockerfile
  Caddyfile
  deploy.ps1
  setup-vps.ps1
  seed-migrations.sh
```

---

## Conventions

| Convention | Rule |
|-----------|------|
| **Auth** | Three tiers: `requireAuth` (API token), `requireJwt` (owner JWT), `requireAdmin` (admin token) |
| **Tenant isolation** | Every query MUST include `WHERE tenant_id = $1` using `req.tenantId` set by auth middleware |
| **Money** | Integer piasters (×100) — same as desktop. Never floats in API responses |
| **Migrations** | Sequential numbered SQL files in `migrations/`. Tracked in `schema_migrations` table |
| **Error responses** | `{ error: "Human-readable message" }` with appropriate HTTP status code |
| **Idempotency** | Sync endpoints use `ON CONFLICT DO NOTHING` / `ON CONFLICT DO UPDATE` for upserts |
| **No ORM** | Raw SQL via `pg` driver. Use parameterized queries ONLY — never string interpolation |
| **Env vars** | All secrets via environment variables. Never hardcode in source |
| **Backups** | Encrypted `.bak` files stored in `/data/backups/{tenant_id}/`. Max 10 per tenant, 100MB each |
| **CORS** | Configured for PWA origin. Desktop app uses Tauri HTTP client (no CORS) |

---

## API Routes

### Auth Routes (`/auth/*`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/v1/activate` | None | First-time license activation from desktop |
| POST | `/v1/login` | None | Owner login (email + password → JWT) |
| GET | `/v1/me` | JWT | Get current owner profile |
| POST | `/v1/change-password` | JWT | Change owner password |

### Sync Routes (`/v1/sync/*`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/v1/sync/:table` | API Token | Push table snapshot rows (upsert) |
| GET | `/v1/sync/:table` | API Token | Pull table snapshot rows |
| POST | `/v1/sync/batch` | API Token | Push multiple tables in one request |
| GET | `/v1/sync/state` | API Token | Get sync state (last sync per table) |

**Table-snapshot sync model** (PRIMARY — use this):
- Desktop pushes entire changed rows to `snapshot_*` tables
- Cloud does bulk upsert based on primary key
- `recomputeDashboard()` called after every sync push
- Tables synced: products, batches, customers, suppliers, pos_sales, pos_sale_items, expenses, stock_movements, supplier_invoices

### Dashboard Routes (`/v1/dashboard`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/v1/dashboard` | JWT or API Token | Owner dashboard summary |
| GET | `/v1/activity` | JWT or API Token | Recent activity log |
| GET | `/v1/balances` | JWT or API Token | Customer/supplier balances |

### Admin Routes (`/admin/*`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/admin/tenants` | Admin | Create tenant + API token |
| GET | `/admin/tenants` | Admin | List all tenants |
| POST | `/admin/tokens` | Admin | Generate additional API token |
| POST | `/admin/license-keys` | Admin | Create license key |
| GET | `/admin/license-keys` | Admin | List license keys |
| PATCH | `/admin/tenants/:id` | Admin | Update tenant (suspend, etc.) |
| DELETE | `/admin/tenants/:id` | Admin | Delete tenant + all data |

### Backup Routes (`/v1/backups`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/v1/backups` | API Token | Upload encrypted backup |
| GET | `/v1/backups` | API Token | List backups |
| GET | `/v1/backups/:id` | API Token | Download backup |

### Events Route (DEPRECATED)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/v1/events` | API Token | Legacy event-based sync — DO NOT USE for new code |

---

## Current Module Map

### API Server (`pms-cloud/src/`)

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `index.js` | ~70 | 🟢 | Express setup, helmet, cors, morgan, routes |
| `db.js` | ~112 | 🟢 | Pool, query(), transaction(), runMigrations() |
| `auth.js` | ~122 | 🟡 | Three auth strategies. JWT_SECRET has fallback default |
| `read-model.js` | ~143 | 🔴 | Uses better-sqlite3 (WRONG — should be pg). Legacy, not used in production |
| `routes/auth.js` | ~314 | 🟡 | License activation + owner login. No rate limiting on login |
| `routes/sync.js` | ~436 | 🟡 | Table-snapshot sync. TABLE_SCHEMAS defines upsert columns |
| `routes/dashboard.js` | ~386 | 🟡 | Fallback computation has hardcoded zeros for some fields |
| `routes/admin.js` | ~487 | 🟡 | Full admin CRUD. No audit logging |
| `routes/events.js` | ~114 | 🟡 | Legacy event sync. Still functional but deprecated |
| `routes/backups.js` | ~178 | 🟢 | Encrypted backup upload/download with size limits |

### PWA (`pms-cloud/web/src/`)

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `api.ts` | ~499 | 🟡 | Full API client. Auto-redirect on 401/403 |
| `App.tsx` | ~150 | 🟢 | Router + auth guards |
| `pages/Dashboard.tsx` | ~200 | 🟢 | Owner dashboard |
| `pages/SalesList.tsx` | ~150 | 🟢 | Sales list view |
| `pages/Stock.tsx` | ~150 | 🟢 | Stock overview |
| `pages/Products.tsx` | ~150 | 🟢 | Product list |
| `pages/Finance.tsx` | ~150 | 🟢 | Financial overview |
| `pages/Balances.tsx` | ~150 | 🟢 | Customer/supplier balances |
| `pages/Activity.tsx` | ~150 | 🟢 | Activity log |
| `pages/Sync.tsx` | ~150 | 🟢 | Sync status |
| `pages/AdminPanel.tsx` | ~300 | 🟢 | Admin: tenant management |
| `pages/AdminTenantDetail.tsx` | ~200 | 🟢 | Admin: tenant detail |
| `pages/AdminLogin.tsx` | ~100 | 🟢 | Admin login |
| `pages/OwnerApp.tsx` | ~100 | 🟢 | Owner app shell |
| `pages/OwnerSettings.tsx` | ~100 | 🟢 | Owner settings |
| `pages/Home.tsx` | ~100 | 🟢 | Landing/login page |
| `pages/Login.tsx` | ~100 | 🟢 | Owner login |

### Migrations (`pms-cloud/migrations/`)

| File | Purpose |
|------|---------|
| `001_initial_postgres.sql` | Core tables: tenants, api_tokens, owners, sync_events, activity_log, snapshot_*, dashboard_summaries |
| `002_add_today_expenses.sql` | Add today_expenses_total to dashboard_summaries |
| `003_add_bank_sales.sql` | Add bank_sales fields to dashboard_summaries |
| `004_supplier_invoices.sql` | Add snapshot_supplier_invoices table |
| `005_license_plan_limits.sql` | Add license_keys table + plan/limits columns to tenants |

### Infrastructure

| File | Purpose |
|------|---------|
| `Dockerfile` | Node.js API container |
| `docker-compose.yml` | 3-service stack: postgres + api + caddy |
| `Caddyfile` | Reverse proxy config (HTTP :80, no domain yet) |
| `deploy.ps1` | PowerShell deployment script |
| `setup-vps.sh` | VPS initial setup script |
| `seed-migrations.sh` | Run migrations + seed data |
| `create-tenant.sh` | CLI tenant creation helper |

---

## Known Issues

| # | Issue | Severity | File(s) | Notes |
|---|-------|----------|---------|-------|
| 1 | No rate limiting on any endpoint | 🔴 Critical | `index.js` | Login brute-force possible. Use express-rate-limit |
| 2 | JWT_SECRET has fallback default | 🔴 Critical | `auth.js:4`, `routes/auth.js:10` | `pms-jwt-dev-secret-change-in-production` — must be env-only |
| 3 | read-model.js uses better-sqlite3 | 🔴 Critical | `read-model.js` | Should use pg. File is dead code in production but confusing |
| 4 | No input validation library | 🟡 Medium | All routes | Manual validation only. Add joi or zod |
| 5 | Dashboard fallback has hardcoded zeros | 🟡 Medium | `dashboard.js:74-79` | `low_stock_count`, `out_of_stock_count`, `expiring_soon_count` always 0 in fallback |
| 6 | No request size limits on sync | 🟡 Medium | `sync.js` | Malicious client could send huge payload |
| 7 | No audit logging on admin actions | 🟡 Medium | `admin.js` | Tenant create/delete/license operations not logged |
| 8 | HTTP only (no HTTPS) | 🟡 Medium | `Caddyfile` | No domain configured yet. When domain is added, Caddy auto-HTTPS |
| 9 | No health check endpoint | 🟢 Low | `index.js` | Need `/health` that checks DB connectivity |
| 10 | better-sqlite3 in dependencies | 🟢 Low | `package.json` | Unused in production, increases image size |
| 11 | No CI/CD pipeline | 🟡 Medium | N/A | Manual deployment via deploy.ps1 |
| 12 | No database backup strategy | 🟡 Medium | N/A | PostgreSQL data not backed up outside Docker volume |

---

## Deployment

### VPS Details (from AGENT-HANDOFF.md)

- **Host**: VPS with Docker + Docker Compose
- **Containers**: pms-postgres, pms-api, pms-caddy
- **Deploy command**: `cd pms-cloud && docker-compose up -d --build`

### Deployment Checklist

1. Ensure all migrations are additive (never DROP)
2. Test migration locally: `npm run dev`
3. Build PWA: `cd pms-cloud/web && npm run build`
4. Copy web-dist: `cp -r web/dist ../web-dist/` (or Docker handles this)
5. Deploy: `docker-compose up -d --build`
6. Verify: Check `/health` (when implemented) or `docker-compose logs api`
7. Check PostgreSQL connectivity: `docker-compose exec postgres pg_isready`

### Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `PGHOST` | No | `localhost` | PostgreSQL host |
| `PGPORT` | No | `5432` | PostgreSQL port |
| `PGDATABASE` | No | `pms_cloud` | Database name |
| `PGUSER` | No | `pms` | Database user |
| `PGPASSWORD` | **Yes** | `pms_password` | Database password (CHANGE IN PRODUCTION) |
| `PMS_JWT_SECRET` | **Yes** | `pms-jwt-dev-secret-...` | JWT signing secret (CHANGE IN PRODUCTION) |
| `PMS_ADMIN_TOKEN` | **Yes** | None | Admin API access token |
| `PMS_DATA_DIR` | No | `/data` | Data storage path (backups) |
| `PORT` | No | `3000` | API server port |
| `NODE_ENV` | No | `development` | Environment mode |

---

## Active Tasks

| # | Task | Priority | Status | Blockers | Notes |
|---|------|----------|--------|----------|-------|
| 1 | Add rate limiting (express-rate-limit) | P0 | ⬜ | None | Login: 5/min, sync: 60/min, general: 120/min |
| 2 | Remove JWT_SECRET fallback default | P0 | ⬜ | None | Crash on startup if not set in production |
| 3 | Delete read-model.js (dead code) | P0 | ⬜ | None | Remove better-sqlite3 dependency too |
| 4 | Add input validation (joi or zod) | P1 | ⬜ | None | Validate all request bodies |
| 5 | Fix dashboard fallback zeros | P1 | ⬜ | None | Compute low_stock, out_of_stock, expiring_soon from snapshots |
| 6 | Add request size limits on sync | P1 | ⬜ | None | express.json({ limit: '10mb' }) |
| 7 | Add audit logging to admin routes | P1 | ⬜ | None | Log tenant CRUD + license key operations |
| 8 | Add /health endpoint | P2 | ⬜ | None | Check DB connectivity + return status |
| 9 | Remove better-sqlite3 from package.json | P2 | ⬜ | Task 3 | After read-model.js is deleted |
| 10 | Set up PostgreSQL backup cron | P2 | ⬜ | None | pg_dump to /data/backups/pg/ daily |
| 11 | Configure domain + HTTPS | P3 | ⬜ | External | Need domain DNS pointed to VPS |

---

## Completed Tasks

| # | Task | Date | Notes |
|---|------|------|-------|
| 1 | Table-snapshot sync implementation | 2026-04 | Replaced event-based sync as primary |
| 2 | License activation flow | 2026-04 | Desktop → cloud activation with license keys |
| 3 | Owner PWA with dashboard | 2026-04 | React + Vite PWA |
| 4 | Admin panel API | 2026-04 | Full tenant + license management |
| 5 | Encrypted backup storage | 2026-04 | Upload/download with 100MB limit |
| 6 | Docker Compose deployment | 2026-04 | 3-service stack on VPS |

---

## Cross-Role Requests

### To Rust Developer

| # | Request | Priority | Status | Notes |
|---|---------|----------|--------|-------|
| 1 | Add sync error retry with backoff | P1 | ⬜ | Desktop sync fails silently on network errors |
| 2 | Send branch_id in sync payloads | P1 | ⬜ | Some sync payloads missing branch_id |
| 3 | Add sync health indicator to desktop | P2 | ⬜ | Show last successful sync time in UI |

### To Frontend Developer

| # | Request | Priority | Status | Notes |
|---|---------|----------|--------|-------|
| 1 | PWA: Add sync status indicator | P2 | ⬜ | Show when last sync occurred |
| 2 | PWA: Handle offline gracefully | P2 | ⬜ | Cache API responses for offline viewing |

### To QA Engineer

| # | Request | Priority | Status | Notes |
|---|---------|----------|--------|-------|
| 1 | Test sync with large datasets | P1 | ⬜ | 10K+ products, 50K+ sales |
| 2 | Test concurrent sync from multiple branches | P2 | ⬜ | Race condition testing |
| 3 | Test backup restore flow end-to-end | P2 | ⬜ | Upload → download → verify |

---

## Sync Architecture Detail

### Table-Snapshot Model (Current — PRIMARY)

```
Desktop SQLite                    Cloud PostgreSQL
┌──────────────┐                 ┌──────────────────┐
│ products     │ ──push changed──→ │ snapshot_products│
│ batches      │ ──push changed──→ │ snapshot_batches │
│ customers    │ ──push changed──→ │ snapshot_customers│
│ suppliers    │ ──push changed──→ │ snapshot_suppliers│
│ pos_sales    │ ──push changed──→ │ snapshot_pos_sales│
│ pos_sale_items│──push changed──→ │ snapshot_pos_sale_items│
│ expenses     │ ──push changed──→ │ snapshot_expenses│
│ stock_movements│─push changed──→ │ snapshot_stock_movements│
│ supplier_invoices│push changed─→ │ snapshot_supplier_invoices│
└──────────────┘                 └──────────────────┘
                                         │
                                    recomputeDashboard()
                                         │
                                    ┌────▼─────┐
                                    │dashboard_ │
                                    │summaries  │
                                    └──────────┘
```

### TABLE_SCHEMAS (in `sync.js`)

Defines which columns are used for upsert per table:

| Table | Primary Key | Upsert Columns |
|-------|-------------|----------------|
| `products` | id | tenant_id, branch_id, name, name_ar, barcode, price, cost, unit, is_rx, min_stock, is_active, category, updated_at |
| `batches` | id | tenant_id, branch_id, product_id, batch_number, expiry_date, quantity, cost_price, sale_price, status, location_id, updated_at |
| `customers` | id | tenant_id, branch_id, name, phone, current_balance, is_active, updated_at |
| `suppliers` | id | tenant_id, branch_id, name, phone, current_balance, is_active, updated_at |
| `pos_sales` | id | tenant_id, branch_id, session_id, total, discount, is_return, created_at |
| `pos_sale_items` | id | tenant_id, branch_id, sale_id, product_id, batch_id, quantity, unit_price, total |
| `expenses` | id | tenant_id, branch_id, amount, category, description, created_at |
| `stock_movements` | id | tenant_id, branch_id, product_id, batch_id, movement_type, quantity, reference_id, created_at |
| `supplier_invoices` | id | tenant_id, branch_id, supplier_id, invoice_number, total, status, created_at |

### Adding a New Sync Table

1. Add migration SQL in `pms-cloud/migrations/00X_new_table.sql`
2. Add `CREATE TABLE snapshot_*` with appropriate columns
3. Add table schema to `TABLE_SCHEMAS` in `sync.js`
4. Add desktop-side sync in `cloud_sync.rs` (Rust Developer)
5. Update `recomputeDashboard()` if the table affects dashboard numbers
