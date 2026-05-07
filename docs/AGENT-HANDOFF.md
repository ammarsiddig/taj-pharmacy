# TAJ Pharmacy v4 — Agent Handoff Document

> **START HERE**: Read this file first at the beginning of every session. This is the **single source of truth** for all AI agents working on this project. Do NOT create other plan files.

---

## 1. Project Overview

### Stack
- **Desktop**: Tauri 2 + Rust + React 18 + TypeScript + Tailwind CSS v4 + SQLite (rusqlite)
- **Cloud API**: Node.js/Express + PostgreSQL 16 on Hetzner VPS
- **Owner PWA**: React + Vite at `pms-cloud/web/` — deployed at `http://178.104.158.147/`
- **Admin Panel**: Same PWA, `/mgmt` route — deployed at `http://178.104.158.147/mgmt`

### Key Conventions (DO NOT Change)
| Convention | Rule |
|------------|------|
| **DB Migrations** | Additive only — `ensure_column()` for columns, `CREATE TABLE IF NOT EXISTS` for tables. In `src-tauri/src/db/migrations.rs` before final `log::info!` |
| **Money** | Stored as integer piasters (×100), displayed via `api.formatMoney()`. Format: `1,250.00 SDG`. Never hardcode "SDG" — use `t('common.currency')` |
| **i18n** | Add keys to BOTH `src/i18n/ar.json` AND `src/i18n/en.json` |
| **UI Palette** | Primary action: `bg-primary-500` (#0FA3A6 Pharmacy Teal). Navigation: `bg-[#1C5F6F]` (Core Brand Teal). Text: `text-ink-main` (#0D2023), `text-ink-muted` (#3D6567). Border: `border-ivory-border` (#D3E8E9). Use `app-card`, `app-panel` for surfaces. New `brand-*` token scale for brand elements. |
| **Architecture** | `src/api/index.ts` = sole `invoke()` caller. `src/types/index.ts` = all shared types. Register Rust commands in `lib.rs` |
| **Tenant/Branch** | Hardcoded `tenant_id = "default-tenant"`, `branch_id = "main-branch"` |
| **RTL-first** | Use `ms-*/me-*`, `ps-*/pe-*`, `rounded-s-*/rounded-e-*` (not `ml/mr/pl/pr`) |
| **Safety** | Never delete DB columns/tables. Never modify `license_guard.rs`. Never bypass `FLAG_*` checks |

---

## 2. What Is Built

### Desktop Features
| # | Feature | Status |
|---|---------|--------|
| 1 | Extended Product Fields (manufacturer, active_ingredient, dosage_form, storage_conditions, is_prescription) | ✅ |
| 2 | Receipt Printing (logo, tax, cashier, pharmacy info) | ✅ |
| 3 | VAT/Tax Report | ✅ |
| 4 | Alternate Medicine / Substitutes | ✅ |
| 5 | Quick Pay in POS | ✅ |
| 6 | Product Images | ✅ |
| 7 | FEFO Stock Policy | ⬜ Next |
| 8 | Reorder Point Alerts | ⬜ |

### Simplification (All COMPLETE)
- Removed: Assets, Accounts, Storage Locations tab, Stock Take tab
- Removed Settings tabs: PharmacyManagement, CloudSync, Roles, Audit
- Merged PaymentSettings into General; moved Units into Products page
- Embedded Customers inside Sales page, Suppliers inside Purchases page
- Removed `pharmacy_switcher.rs` Rust module
- **Final sidebar**: Dashboard, POS, Sales, Purchases, Products, Warehouse, Expenses, Reports, Settings

### Cloud (Deployed 2026-04-22, updated this session)
- ✅ PostgreSQL schema + all API routes migrated
- ✅ Table-snapshot sync endpoints (`/v1/sync/:table`, `/v1/sync/batch`)
- ✅ Rust sync commands (`sync_table_snapshot`, `sync_tables_batch`, `get_sync_status`)
- ✅ Owner PWA: Home, Activity, Stock, Sync, SalesList, Products, Balances tabs
- ✅ Admin Panel: stats bar, richer tenant rows (owner email, expiry, suspended badge), license generation UI
- ✅ AdminTenantDetail: suspend/activate, expiry date, create owner account, send announcement, dashboard snapshot
- ✅ API: GET /v1/products, GET /v1/sales, GET /v1/balances, POST /admin/tenants/:id/create-owner, PATCH /admin/tenants/:id
- ✅ Migration runner fixed (`schema_migrations` table — runs each file only once)
- ⬜ Owner PWA: branch selector on Home page (multi-branch support)

---

## 3. Cloud Deployment Details

### VPS & Credentials
| Item | Value |
|------|-------|
| VPS IP | `178.104.158.147` (Hetzner CX23, Ubuntu 24.04) |
| SSH | `ssh root@178.104.158.147` (key: `C:\Users\Ammar\.ssh\id_ed25519`) |
| Admin token | `310a64953a0f45c0a486b4007e4dcdcb1ee05b4c578ec5e15db8b6e1d0368253` |
| Tenant | `default-tenant` |
| Sync token | `1a61c64f-d8a1-48c3-97eb-b47dbe24b2c9` |
| Desktop env vars | `PMS_OWNER_SYNC_ENDPOINT=http://178.104.158.147`, `PMS_OWNER_SYNC_TOKEN=1a61c64f-...` |
| Owner login | ⚠️ No owner account yet — `owners` table is empty |

### Deploy Command
```powershell
powershell -ExecutionPolicy Bypass -File pms-cloud\deploy.ps1
```

### Cloud API Routes (all in `pms-cloud/src/routes/`)
| Route File | Endpoints |
|------------|-----------|
| `auth.js` | `POST /v1/activate`, `POST /v1/renew`, `POST /auth/login`, `GET /v1/config`, `PUT /auth/password` |
| `sync.js` | `POST /v1/sync/:table`, `POST /v1/sync/batch`, `GET /v1/sync/status`, `GET /v1/sync/changes` |
| `dashboard.js` | `GET /v1/dashboard`, `GET /v1/activity`, `GET /v1/sync-stats`, `GET /v1/branches` |
| `admin.js` | `POST /admin/tenants`, `GET /admin/tenants`, `GET /admin/tenant/:id`, `PATCH /admin/tenants/:id`, `POST/DELETE /admin/tokens`, `POST /admin/licenses`, `GET /admin/licenses`, `POST /admin/tenants/:id/announcement`, `GET /admin/stats` |
| `events.js` | `POST /v1/events` (legacy sync path, still active) |

### Docker Containers
- `pms-postgres` — PostgreSQL 16
- `pms-api` — Node.js Express (port 3000)
- `pms-caddy` — Reverse proxy + static PWA (ports 80/443)

---

## 4. Architecture

### Code Organization
```
src-tauri/src/
  commands/     # Thin Tauri command handlers (no business logic >20 lines)
  db/           # ONLY layer with raw SQL
  models/       # Domain logic (extracted from commands)

src/
  api/          # ONLY layer calling Tauri invoke()
  pages/        # Page-level orchestration
  components/   # Reusable UI pieces
  hooks/        # Data-fetching hooks
  types/        # Shared TypeScript types

pms-cloud/
  src/          # Node.js Express API
  web/          # Owner PWA + Admin Panel (React + Vite)
  migrations/   # PostgreSQL schema
```

### Cloud Sync Model
- **Table-snapshot sync** (not event-based)
- Desktop pushes changed rows WHERE `updated_at > last_synced_at`
- Cloud does bulk upsert via `INSERT ... ON CONFLICT UPDATE`
- Cloud is **read-only mirror** for owner dashboard

---

## 5. Implementation Guide

### Adding a Desktop Feature
1. **Database** → `src-tauri/src/db/migrations.rs` → `cargo check`
2. **Rust** → `src-tauri/src/commands/` → register in `lib.rs` → `cargo check`
3. **Types** → `src/types/index.ts`
4. **API** → `src/api/` → re-export from `index.ts`
5. **UI** → `src/pages/` or `src/components/`
6. **i18n** → both `ar.json` + `en.json`

### Adding a Cloud Feature
1. **API endpoint** → `pms-cloud/src/routes/`
2. **Types** → `pms-cloud/web/src/api.ts`
3. **UI page** → `pms-cloud/web/src/pages/`
4. **Deploy** → `deploy.ps1`

---

## 6. Known Tech Debt

| Issue | Impact | Notes |
|-------|--------|-------|
| `pms-testing/schema.sql` missing `product_substitutes` table | Low | No runtime impact |
| `cloud_sync_table_state` SQLite table not created | Low | Non-critical, sync works without it |
| Settings sync buttons not wired | Medium | `GeneralTab.tsx` needs `sync_table_snapshot`/`sync_tables_batch` integration |
| Sync not pushing data from desktop | **FIXED** | Added `sync_all_tables_now` Rust command + frontend button in CloudSyncTab |
| Thermal print ignores `@page` size | **FIXED** | `printThermal()` in `api/core.ts` injects `<style>` before `window.print()` |
| Domain + HTTPS | Low | Buy domain, update `Caddyfile` for auto-TLS |
| `AdminTenant` type uses `last_event_at`/`total_events` | Low | Server returns these aliases; frontend matches. Rename later for consistency |
| Orphan settings files on disk | None | `RolesTab.tsx`, `AuditTab.tsx` — not imported, harmless |
| Hardcoded `TOKEN_SECRET` in `auth.rs` | Medium | Acceptable for desktop (local token), but add TODO for per-installation secret in Phase 3 |
| `reset_admin_password` callable in production | High | Gate behind debug flag or remove before first customer ship |
| POS `create_sale` hardcodes discount=0, tax=0 | High | Phase 1.3 fixes this |
| POS bank_transfer silently falls back to cash account | High | Phase 1.3 fixes this |
| `check_permission` never called as a guard | High | Phase 1.2 adds `guard.rs` |
| Monolithic files exceed 800-line rule | Medium | Phase 3.6 splits them |
| `Purchases.tsx` still uses old `confirmPurchase` | Medium | Phase 1.5 upgrades it |
| No sale void/correction workflow | Medium | Phase 1.3 adds `void_sale` |
| Parked / multi-cart POS state is local-only | **FIXED** | Migrated to `pos_parked_carts` SQLite table. `save_pos_workspace_state`, `load_pos_workspace_state`, `clear_pos_workspace_state` commands. `workspaceState.ts` now calls SQLite via Tauri. Persists across app restarts within same session. |
| POS split payment is fixed to cash + one bank rail + optional credit remainder | Medium | Enough for day-one POS, but not full arbitrary multi-tender editing/history UX yet |
| POS split-payment change-due showed 0 | **FIXED** | `splitCashChange` derived correctly; `splitOverage` error guard replaced with change-due display; bank-only overpayment remains blocked. |

---

## 7. Strategic Direction — First Customer + Owner Cloud Dashboard + SaaS Foundation

### Guiding Principles

1. **We are continuing the current app.** No rebuild from zero.
2. **First commercial target**: one real pharmacy customer.
3. **Customer-facing offer**: Desktop PMS + Owner Cloud Dashboard.
4. **Cloud is already partially built** and should be stabilized, not restarted.
5. **"SaaS" is internal architecture direction**, not a customer-facing promise right now.
6. **First priority is production readiness and correctness**, not new feature expansion.

### Three Parallel Tracks

| Track | Goal | Scope |
|-------|------|-------|
| **A — First Customer Production Readiness** | Prepare the desktop PMS for one real pharmacy | POS safety, inventory integrity, permissions, audit, backup, production build |
| **B — Owner Cloud Dashboard** | Owner opens PWA and understands how the pharmacy is running | Stabilize sync, verify dashboard numbers, owner account, domain+HTTPS |
| **C — SaaS-Ready Foundation** | Make first installation become the foundation for future multi-customer SaaS | Tenant/branch identity, stable IDs, additive migrations, sync-ready data model |

---

### Phase 0 — First Customer Readiness Audit (before any code)

**Purpose:** Identify every gap between the current app and what a real pharmacy needs on day one.

**Tasks:**
- [ ] Walk through the POS flow end-to-end: open session → search → add to cart → pay (cash) → pay (bank/Bankak) → credit sale → receipt print → close session. Document every bug or UX issue.
- [ ] Walk through the Purchase flow: create draft → add items → confirm with payment → schedule payment → pay schedule → return to draft. Document issues.
- [ ] Walk through Warehouse: check stock by location, transfer stock, do a stock take. Document issues.
- [ ] Walk through Sales page: create invoice sale, view sale detail, print receipt. Document issues.
- [ ] Walk through Expenses: create from template, create manual, view summary. Document issues.
- [ ] Walk through Reports: dashboard, sales report, inventory, expiry, P&L, supplier aging, customer credit, balance sheet, tax. Verify numbers are plausible.
- [ ] Walk through Settings: general, users, branches, accounts, license, backup, cloud sync. Verify each saves/loads correctly.
- [ ] Verify login/logout cycle. Verify role switching (owner vs cashier) hides/shows correct pages.
- [ ] Test local backup → restore cycle. Verify data survives.
- [ ] Test cloud sync: push from desktop, verify Owner PWA shows correct numbers.
- [ ] Compile a "Day 1 Blockers" list from this audit.

**Acceptance Criteria:**
- A documented list of blockers categorized as P0 (must fix), P1 (should fix before launch), P2 (acceptable for v1).

**What NOT to do:**
- Do not fix bugs during the audit — only document them.
- Do not add new features.
- Do not refactor code.

---

### Phase 1 — Desktop Production Hardening

**Purpose:** Fix all P0 blockers. Make the desktop app safe for daily pharmacy use.

#### 1.1 — Backend Authority Model
- [ ] Create `src-tauri/src/commands/session_state.rs`: a Tauri managed `State<AuthSession>` struct holding `{ user_id, tenant_id, branch_id, role_name, permissions: Vec<String> }`.
- [ ] Populate `AuthSession` at login time, clear at logout.
- [ ] **Migration path**: mutation commands continue accepting `tenant_id`/`user_id` params for now, but add a TODO comment marking each for migration to `AuthSession`. First customer can ship with frontend-supplied params since the desktop renderer is semi-trusted.
- [ ] Plan: Phase 3 will fully migrate commands to read identity from `AuthSession` instead of IPC args.

#### 1.2 — Backend Permission Enforcement
- [x] Create `src-tauri/src/commands/guard.rs` with `pub fn require_permission(conn: &Connection, user_id: &str, feature: &str) -> Result<(), String>`. Queries `permissions` table + role defaults (reuse logic from `auth.rs::get_user_permissions`).
- [x] Add `guard::require_permission` calls to **dangerous mutation commands only** (first pass):
  - `create_sale`, `create_return` (POS) ✅
  - `confirm_purchase_with_payment`, `delete_purchase_draft`, `return_purchase_to_draft` (Purchases) ✅
  - `create_expense`, `update_expense`, `delete_expense` (Expenses) ✅
  - `transfer_stock`, `confirm_stock_take`, `confirm_supplier_return` (Warehouse) — ⬜ remaining
  - `create_user`, `update_user` (Users) — ✅ done (actor_id parameter added)
  - `update_tenant_settings`, `create_branch` (Settings) — ✅ done
  - `record_supplier_payment`, `record_customer_payment` (Finance) — ✅ done
  - `create_supplier_full`, `update_supplier_full` (Suppliers) — ✅ done
  - `create_customer`, `update_customer` (Customers) — ✅ done
- [ ] Non-dangerous read commands (get_*, search_*) can remain unguarded for now.

#### 1.3 — POS Safety
- [x] **FEFO enforcement**: `create_sale` now resolves batches via `resolve_fefo_items()`. If `batch_id` is `None`/empty, selects `status='active'`, non-expired batches ordered `expiry_date ASC NULLS LAST, created_at ASC`, splitting across batches if needed. Explicit `batch_id` from frontend is still respected as override. `SaleItemInput.batch_id` is now `Option<String>`. ✅
- [x] **Prescription gate**: `pharmacist_override_by: Option<String>` added to `create_sale`. After FEFO resolution, checks each product's `is_prescription`; if `1` and override is empty/absent, returns Arabic error naming the product. `PosProduct` + `CartItem` types include `is_prescription: bool`. `SaleCreateData` includes `pharmacistOverrideBy?`. UI: if cart has any Rx item, tapping "إتمام البيع" opens inline modal prompting pharmacist ID/name before completing sale. i18n: `pos.rxTitle/rxHint/rxPharmacistId/rxPharmacistPlaceholder/rxConfirm`. ✅
- [x] **Expired/recalled batch blocking**: In `create_sale` stock validation loop — if `batch.expiry_date < today`, reject with "الدفعة منتهية الصلاحية" error. If `batch.status = 'disposed'`, reject. ✅
- [x] **Discount + Tax in POS**: `create_sale` now accepts `discount: Option<i64>` (piasters) and `tax_percent: Option<i64>` (basis points). Computes `after_discount = subtotal - discount`, `tax_amount = after_discount * tax_percent / 10000`, `total = after_discount + tax_amount`. ✅
- [x] **Remove silent bank→cash fallback**: `create_sale` now returns explicit error if `payment_method == "bank_transfer"` with no valid `account_id`. No silent fallback. ✅
- [x] **Sale void workflow**: `void_sale(tenant_id, sale_id, cashier_id, void_reason)` implemented. Guards: today-only + open-session check. Soft-deletes sale via `deleted_at`, stores `void_reason` (new nullable column via `ensure_column`). Reverses batch quantities, inserts `void_sale` stock movements, reverses account balance + transaction, reverses customer credit balance, decrements session totals. Audit log + cloud sync. UI: Trash2 button per sale row in SessionHistoryPanel (only for open sessions). i18n: `pos.void`, `pos.voidConfirm`. ✅
- [x] **Pro POS workflow upgrades**: POS now supports parked sales + multiple live carts, split payment (cash + bank + optional credit remainder), sale notes, inline low-stock warnings, and a receipt customizer modal from the cashier screen. Backend stores split-payment rows in new `sale_payments` table and voids reverse them correctly. Receipt print/reprint now shows notes + payment breakdown and respects cashier-side print preferences. ✅
- [x] **Parked cart SQLite persistence**: Cart state migrated from `localStorage` to `pos_parked_carts` SQLite table. `save/load/clear_pos_workspace_state` commands added to `pos.rs`, registered in `lib.rs`, API functions in `api/pos.ts`, `workspaceState.ts` updated. ✅
- [x] **Warn on session close with parked carts**: `CloseSessionModal` accepts `parkedCount` prop; shows amber warning banner listing count when > 0. i18n: `pos.closeParkedWarning`. ✅
- [x] **Fix split-payment change-due display**: `splitCashChange` derived correctly; `splitOverage` error guard replaced with change-due display; bank-only overpayment remains blocked. ✅
- [x] **UI polish batch**: `common.yes`/`common.no` i18n keys added; `pos.receiptLogo` added; hardcoded "Logo" fixed; "Cart 1" → "سلة 1`; duplicate `pos` keys in `sales` section removed; `$` icon → `Banknote`; payment buttons `flex-wrap` + `min-w-[80px]`. ✅
- [x] **Dashboard UX improvements**: Replaced raw string icons (`$`, `#`, `i`, `O`, `~`) with Lucide icons; removed duplicate MiniCard row; consolidated Quick Actions into unified action bar with cash/bank balances; cleaner visual hierarchy. ✅

#### 1.4 — Inventory Safety
- [x] Verified all stock-changing operations insert `stock_movements`: `create_sale` (‘sell’) ✅, `void_sale` (‘void_sale’) ✅, `create_return` (‘customer_return’) ✅, `confirm_purchase_with_payment` (‘receive’) ✅, `return_purchase_to_draft` (‘adjust’) ✅, `cancel_purchase` (‘adjust’) ✅, `transfer_stock` (‘transfer_out’/‘transfer_in’) ✅, `confirm_stock_take` ✅, `confirm_supplier_return` ✅, `dispose_batch` (‘dispose’) ✅. No gaps. ✅
- [x] **Dispose batch command**: `dispose_batch(tenant_id, branch_id, user_id, batch_id, quantity, reason)` implemented in `warehouse.rs`. Reduces `quantity_current`, sets `status = 'disposed'` if fully disposed, inserts `dispose` stock movement, audit log. Registered in `lib.rs`. API in `warehouse.ts`. UI: "إتلاف" button per row in Warehouse Inventory tab with qty + reason modal. i18n: `warehouse.dispose.*`. ✅
- [x] **Batch recall**: `recall_batch(tenant_id, user_id, batch_number, product_id, reason)` implemented. Marks all matching active batches as `status = 'recalled'`, inserts `recall` stock movements, returns `RecalledBatch[]`. Registered in `lib.rs`. API `recallBatch()` in `api/warehouse.ts`. Type `RecalledBatch` in `types/warehouse.ts`. UI: Recall button + modal in Warehouse InventoryTab. i18n: ar + en. ✅
- [x] **Lot traceability**: `get_batch_sales(tenant_id, batch_id)` implemented in `purchases.rs`. Returns `BatchSaleRow[]` with sale_id, sale_number, sale_date, customer_id, customer_name, quantity, unit_price, subtotal. Registered in `lib.rs`. Type `BatchSaleRow` in `types/warehouse.ts`. API `getBatchSales(batchId)` in `api/warehouse.ts`. ✅

#### 1.5 — Purchase/Accounting Safety
- [x] **Upgrade list-page confirm**: `Purchases.tsx` list-page confirm modal now uses `confirmPurchaseWithPayment` with full payment mode/account/date selection. ✅
- [x] **Removed `confirm_purchase` from `lib.rs` registration**: Line commented out with deprecation note. Function body kept in `purchases.rs` for one release cycle. ✅
- [x] **Purchase Return workflow** implemented:
  - `create_purchase_return(invoice_id, user_id, data: CreatePurchaseReturnData)` in `purchases.rs`. Private `do_purchase_return` fn contains all logic.
  - Reduces `batches.quantity_current`, inserts `supplier_return` stock movements, creates `supplier_returns` + `supplier_return_items` (status='confirmed', return_number `PRET-NNNNN`).
  - Inserts negative `supplier_payments` record (amount = -total, payment_method='credit_note').
  - Reduces `supplier_invoices.amount_paid` and recalculates `payment_status`.
  - If `account_id` provided: inserts `account_transaction` (direction='in') + increases account balance by `min(refund, amount_paid)`.
  - Registered in `lib.rs`. API `createPurchaseReturn()` in `api/pos.ts`. Types `PurchaseReturnItemData` + `CreatePurchaseReturnData` in `types/pos.ts`.
  - UI: "Return Items" button on all confirmed invoices in `PurchaseDetail.tsx`. Modal shows active batches for that invoice, qty inputs, date, reason, optional refund account. i18n: ar + en. ✅
- [x] **Block editing confirmed invoices**: `update_purchase_invoice` already had `if current_status != "draft" { return Err(...) }` guard. Verified this session. ✅

#### 1.6 — Audit Log Automation
- [x] Created `src-tauri/src/commands/audit.rs` with `pub(crate) fn log_action(conn, tenant_id, user_id, action, entity_type, entity_id, changes_json)`. ✅
- [x] `audit::log_action` wired to: `pos.rs` (create_sale ✅, create_return ✅), `purchases.rs` (confirm_purchase_with_payment ✅, delete_purchase_draft ✅, return_purchase_to_draft ✅), `expenses.rs` (create ✅, update ✅, delete ✅), `warehouse.rs` (confirm_stock_take ✅, confirm_supplier_return ✅, transfer_stock ✅), `users.rs` (create_user ✅, update_user ✅ — actor logged as "system" pending Phase 3 AuthSession migration).
- [x] All audit log gaps closed: `settings.rs` (update_tenant_settings ✅, create_branch ✅), `suppliers.rs` (create ✅, update ✅, record_payment ✅), `customers.rs` (create ✅, update ✅, record_payment ✅). Verified via grep this session. ✅
- [x] `changes_json` is `None` for all Phase 1 calls — detailed diff tracking deferred to Phase 3. ✅

#### 1.7 — Backup/Restore Reliability
- [x] Audited `create_local_backup_internal` → uses `VACUUM INTO` + WAL checkpoint, logs to `backup_log`. Logic is correct.
- [x] Audited `restore_from_local` + `apply_restore_from_staged` → attaches backup DB, clears live tables, copies all shared tables in a single transaction with FK off, detaches + WAL checkpoint. Safety backup created before restore. Logic is correct.
- [x] **Last Backup indicator**: `BackupTab.tsx` now shows a green banner with date + size of the most recent completed backup, or an amber warning if none exists yet. i18n: `settings.backup.lastBackup`, `settings.backup.noBackupYet`. ✅
- [ ] Manual cycle test (user): `create_backup` → verify file in AppData → `restore_from_local` → verify counts match. Cloud backup P1 — test when cloud is configured.

#### 1.8 — Production Build Readiness
- [x] `reset_admin_password` gated at runtime: returns Arabic error in release builds via `if !cfg!(debug_assertions)`. Cannot be exploited in production. ✅
- [x] `devtools` — `tauri.conf.json` has no `devtools` key; Tauri 2 disables devtools in release by default. Confirmed safe. ✅
- [x] `TOKEN_SECRET` in `auth.rs`: TODO(Phase 3) comment added explaining OS keychain derivation plan. Hardcoded value acceptable for Phase 1 desktop (token is local-only). ✅
- [x] Onboarding flow verified: `seed.rs` creates `default-tenant` + `main-branch` + `user-admin` (password `admin123`) with `onboarding_completed = 0`. `complete_onboarding` validates all fields, hashes password with Argon2, updates tenant/branch/admin, sets `onboarding_completed = 1`. Frontend wired in `App.tsx` — checks on load, redirects to `<Onboarding>` page if not completed. Flow is correct. ✅
- [x] **Production build**: `npx tauri build` succeeded (exit 0). Installer at `src-tauri/target/release/bundle/nsis/PMS Pharmacy_0.1.0_x64-setup.exe`. Bundle target changed to `nsis` (WiX requires external download blocked by firewall; NSIS is bundled). Dead-code warning on deprecated `confirm_purchase` suppressed with `#[allow(dead_code)]`. ✅ — **User must test installer on a clean Windows machine to verify onboarding flow.**

**Acceptance Criteria (Phase 1):**
- All P0 audit items from Phase 0 are resolved.
- POS handles cash, bank transfer, and credit sales correctly with no silent fallbacks.
- Prescription products require pharmacist override.
- Expired batches cannot be sold.
- Every stock mutation has a movement record.
- Backup + restore works reliably.
- Production build runs on a clean Windows 10/11 machine.

**What NOT to do (Phase 1):**
- Do not add new feature pages (analytics, charts, forecasting).
- Do not refactor the entire command layer to use `AuthSession` yet (that's Phase 3).
- Do not implement email/SMS notifications.
- Do not change the cloud sync architecture.
- Do not split the monolithic command files yet (that's Phase 3).

---

### Phase 2 — Owner Cloud Dashboard Stabilization

**Purpose:** The pharmacy owner can open a URL on their phone and see how the business is running today.

#### 2.1 — Owner Account Setup
- [ ] Create owner account for the first customer via Admin Panel (`POST /admin/tenants/:id/create-owner`).
- [ ] Verify owner login flow (`POST /auth/login`) works and returns JWT.
- [ ] Verify Owner PWA loads after login and shows Home dashboard.

#### 2.2 — Sync Verification
- [ ] Trigger `sync_all_tables_now` from desktop Settings → Cloud Sync tab.
- [ ] Verify all 7+ tables sync: products, customers, suppliers, pos_sales, pos_sale_items, expenses, supplier_invoices.
- [ ] Verify `dashboard_summaries` is recomputed after sync.
- [ ] Add `supplier_payments` and `customer_payments` to the sync batch if not already included.
- [ ] Document any tables that should sync but don't.

#### 2.3 — Dashboard Number Verification
- [ ] Verify Owner PWA Home page shows correct: today's total/cash/bank/credit sales, today's expenses, total receivables, total payables.
- [ ] Cross-check each number against the desktop Reports page. Document discrepancies.
- [ ] Fix any broken `recomputeDashboard` SQL queries.

#### 2.4 — PWA Page Verification
- [ ] Verify each Owner PWA page renders correctly with real data: Products, SalesList, Balances, SupplierAccounts, Stock, Sync.
- [ ] Fix empty states (show "No data" message, not blank page).

#### 2.5 — Sync Health Indicators
- [ ] Add to Owner PWA Sync page: last sync timestamp, records synced count, failed reason (if any), source branch.
- [ ] Add to desktop Settings → Cloud Sync tab: a status badge (green/yellow/red) showing sync health.

#### 2.6 — Branch Selector
- [ ] Complete the `GET /v1/branches` endpoint — returns list of distinct `branch_id` values for the tenant from any snapshot table.
- [ ] Add branch dropdown in Owner PWA header. Only visible if >1 branch.
- [ ] Pass selected `branch` to all data-fetching API calls.

#### 2.7 — Customer-Ready Deployment
- [ ] Buy domain (e.g., `taj.sd` or `tajpms.com`).
- [ ] Update `Caddyfile` with domain → Caddy auto-provisions TLS.
- [ ] Verify Owner PWA loads over HTTPS on mobile browser.
- [ ] Create a simple login URL to share with owner.

**Acceptance Criteria (Phase 2):**
- Owner can log in on their phone, see today's sales/expenses/balances, browse products and sales list.
- All numbers match the desktop within the sync interval (2 minutes).
- Sync health is visible on both desktop and PWA.
- HTTPS works with a real domain.

**What NOT to do (Phase 2):**
- Do not add editing capabilities to the PWA.
- Do not implement two-way sync or conflict resolution.
- Do not add push notifications or real-time WebSocket updates.
- Do not build native mobile apps.

---

### Phase 3 — SaaS-Ready Tenant/Branch Foundation

**Purpose:** Refactor internals so the first customer's installation becomes the template for all future customers, without breaking anything.

#### 3.1 — Real Tenant Identity
- [ ] Replace `default-tenant` with a real tenant ID (UUID) generated during onboarding.
- [ ] Update `core.ts` to read `tenant_id` from the local database instead of hardcoding.
- [ ] Backward compatibility: if DB still has `default-tenant`, keep working. New installations get real UUIDs.

#### 3.2 — Real Branch Identity
- [ ] Replace `main-branch` with a real branch ID (UUID) generated during onboarding.
- [ ] Audit all Rust commands: ensure `branch_id` is used in queries where it should be.
- [ ] Backward compatibility: existing `main-branch` records continue to work.

#### 3.3 — Migrate Commands to AuthSession
- [ ] Remove `tenant_id`, `user_id`, `branch_id` from IPC params of all mutation commands.
- [ ] Commands read these from `State<AuthSession>` instead.
- [ ] Update all `src/api/*.ts` functions to stop passing these params.

#### 3.4 — Stable UUIDs for Synced Data
- [ ] Audit all ID generation: confirm every table uses `Uuid::new_v4().to_string()` (not auto-increment).
- [ ] Ensure `sequence_counters` (sale numbers, return numbers) are tenant+branch-scoped.

#### 3.5 — Sync-Ready Data Model Hygiene
- [ ] Ensure all stock changes are append-only (movements table, never silent rewrites).
- [ ] Ensure all payment changes are append-only (create reversal records, never rewrite history).
- [ ] Add `updated_at` update to all tables that sync to cloud (some may be missing it).
- [ ] Plan outbox pattern: each mutation writes to `cloud_sync_outbox` with the entity that changed.

#### 3.6 — Code Quality Debt Reduction
- [ ] Split `settings.rs` (80KB) into: `settings_general.rs`, `settings_backup.rs`, `settings_cloud.rs`, `settings_license.rs`.
- [ ] Split `pos.rs` (66KB) into: `pos_session.rs`, `pos_sale.rs`, `pos_return.rs`, `pos_invoice.rs`.
- [ ] Split `purchases.rs` (59KB) into: `purchases_invoice.rs`, `purchases_payment.rs`, `purchases_schedule.rs`.
- [ ] Split `cloud_sync.rs` (68KB) into: `cloud_sync_outbox.rs`, `cloud_sync_scheduler.rs`, `cloud_sync_snapshot.rs`.
- [ ] Split `Reports.tsx` (51KB) and `Products.tsx` (43KB) into sub-components.

#### 3.7 — Cloud Tenant Awareness
- [ ] Verify every PostgreSQL table and query is tenant-scoped.
- [ ] Verify Admin Panel can manage multiple tenants independently.

**Acceptance Criteria (Phase 3):**
- New installations get real tenant/branch UUIDs.
- Existing installations continue working (backward compat).
- No command file exceeds 800 lines.
- All mutation commands use `AuthSession` for identity.

**What NOT to do (Phase 3):**
- Do not implement multi-tenant cloud database isolation yet.
- Do not build a tenant self-registration flow.
- Do not implement two-way sync.

---

### Phase 4 — Multi-Customer Operational Readiness

**Purpose:** Support 5–20 pharmacy customers, each with their own desktop installation and owner dashboard.

#### 4.1 — License & Activation Flow
- [ ] Test the full cycle: Admin generates key → Customer enters key in onboarding → Desktop activates → Owner account created.
- [ ] Add license expiry warnings in desktop app (notification 30/7/1 days before expiry).

#### 4.2 — Customer Installation Package
- [ ] Create a reproducible installation process: download `.msi` → install → run onboarding → enter license key → configure pharmacy → start.
- [ ] Document the process for a non-technical support person.

#### 4.3 — Auto-Update Pipeline
- [ ] Configure Tauri updater (`tauri-plugin-updater`) with a release endpoint.
- [ ] Set up GitHub Releases or a custom update server.
- [ ] Test: push an update, verify desktop auto-detects and installs.

#### 4.4 — Multi-Branch Dashboard
- [ ] Owner PWA shows data from all branches with aggregated totals.
- [ ] Branch selector in PWA header filters data per branch.

#### 4.5 — Cloud Backup as a Service
- [ ] Desktop automatically uploads encrypted backups to cloud on schedule.
- [ ] Owner can see backup history in PWA. Admin can see backup status per tenant.

**Acceptance Criteria (Phase 4):**
- A new customer can be onboarded in under 30 minutes.
- Updates deploy without manual intervention.
- Owner sees all branches in one dashboard.

**What NOT to do (Phase 4):**
- Do not build customer self-service (admin manages everything).
- Do not build a billing/subscription system yet.

---

### Phase 5 — Full SaaS Evolution (Future, Unscheduled)

**Purpose:** Transform TAJ into a scalable SaaS platform with self-service, billing, and advanced features.

**Planned capabilities (not yet scheduled):**
- [ ] Self-service tenant registration + payment (Bankak B2B API integration)
- [ ] Database-per-tenant isolation in PostgreSQL
- [ ] Full two-way sync with conflict resolution (CRDT or operational transform)
- [ ] Real-time WebSocket updates to Owner PWA
- [ ] SMS/WhatsApp notifications for low stock, expiry, payment due
- [ ] Advanced analytics: sales trends, forecasting, ABC analysis, supplier scoring
- [ ] Drug interaction database integration
- [ ] Plugin/extension architecture
- [ ] API-first cloud layer (OpenAPI spec, third-party integrations)
- [ ] Multi-pharmacy management for pharmacy chains
- [ ] Insurance claim integration (Sudan-specific)

**This phase is intentionally unscheduled.** It will be planned after Phase 4 proves the business model with real paying customers.

---

## 8. NEXT — Priority Queue

> The implementing agent should work through these in order. Each item maps to a Phase above.

### ✅ Completed (session 2026-05-05) — TAJ Color System + App Rename
- **App renamed**: "PMS Pharmacy" → "TAJ Pharmacy" across all 26 files (i18n, Sidebar, TopBar, Login, Onboarding, Cargo.toml, tauri.conf.json, index.htmls, manifest.json, package.json, OwnerSettings, PWA Login)
- **New color system**: Both `src/index.css` and `pms-cloud/web/src/index.css` updated with full TAJ token system:
  - `primary-*` scale → Pharmacy Teal (`#0FA3A6`) — all buttons, CTAs, active states
  - New `brand-*` scale → Core Brand Teal (`#1C5F6F`) — sidebar, structural nav
  - Backgrounds: `ivory-app #F4FBFB`, border `#D3E8E9` (teal-tinted)
  - Text: `ink-main #0D2023`, `ink-muted #3D6567`
- **Hardcoded hex updated** (desktop): `Sidebar.tsx`, `Button.tsx`, `Expenses.tsx`, `PurchaseNew.tsx`, `Sales.tsx`, `Warehouse.tsx`
- **Hardcoded hex updated** (PWA): `OwnerApp.tsx`, `Login.tsx`, `Home.tsx`, `Balances.tsx`
- **PWA manifest**: `theme_color` updated to `#1C5F6F`
- **NOT changed**: `tauri.conf.json` `identifier: "com.pms.pharmacy"` (deferred to Phase 4 clean install — changing it moves AppData folder)

### ✅ Completed (Phase 1 — session 2026-04-30)
- **POS: Remove silent bank→cash fallback** (1.3) ✅
- **POS: Expired/disposed batch blocking** (1.3) ✅
- **POS: Discount + Tax params** (1.3) ✅ — `discount` + `tax_percent` wired Rust→TS
- **Permission guard** (1.2) ✅ — `guard.rs` wired to: POS (create_sale, create_return), Purchases (confirm_payment, delete_draft, return_to_draft), Expenses (create, update, delete), Warehouse (confirm_stock_take, confirm_supplier_return, transfer_stock)
- **Audit log automation** (1.6) ✅ — `audit.rs` created, wired to all guarded mutations + users.rs
- **Upgrade list-page confirm** (1.5) ✅ — `Purchases.tsx` now uses `confirmPurchaseWithPayment`

### ✅ Also completed (same session)
- **FEFO auto-selection** (1.3) ✅ — `resolve_fefo_items()` in `pos.rs`; `SaleItemInput.batch_id` now `Option<String>`; frontend type updated
- **Dispose batch** (1.4) ✅ — `dispose_batch` command + `warehouse.ts` API + Inventory tab UI with modal
- **Sale void** (1.3) ✅ — `void_sale` command (full reversal) + `pos.ts` API + Trash2 button in SessionHistoryPanel
- **POS pro UX pack** (1.3 follow-up) ✅ — parked sales, multi-cart tabs, split payment storage/UI, sale notes, stock alerts, and receipt customizer wired in desktop POS

### Immediate Next
1. **Manual POS regression pass** — Test: new cart → park sale → restore sale → split payment (cash+bank, cash+credit remainder) → print/reprint receipt → void same-day sale. Confirm session cash and account balances stay correct.
2. **Production build** (1.8) — Run `npx tauri build` (takes ~15 min first run). Artifacts in `src-tauri/target/release/bundle/`. Test installer on a clean Windows machine — verify onboarding flow works on fresh DB.
3. **Manual backup/restore test** (1.7) — In running app: Settings → Backup → Create → Restore → verify preview counts match live data.
4. **Phase 2** — Owner cloud dashboard stabilization (see Phase 2 items below).

### After Desktop Hardening (Phase 2)
9. **Owner account creation** (2.1)
10. **Sync verification** (2.2)
11. **Dashboard number verification** (2.3)
12. **PWA page verification** (2.4)
13. **Domain + HTTPS** (2.7)

---

## 9. Agent Rules

### At START of session:
1. Read `docs/AGENT-HANDOFF.md` (this file)
2. This file tells you what to do — don't ask the user for context
3. Update "What Is Built" section if resuming work

### At END of session:
1. Update this file — flip ⬜ to ✅ for completed work
2. Update "NEXT" section with next priority
3. Note gotchas in "Known Tech Debt"

### NEVER:
- Create scattered plan files (this is the ONLY plan file)
- Ask user for context that should be in this file
- Touch `license_guard.rs` or drop DB columns/tables
- Add `console.log` in production code
- Use `any` in TypeScript

### Code Quality:
- Max file: 800 lines. Max function: 50 lines. Max nesting: 4 levels.
- PWA has no i18n library — Arabic strings are inline (only desktop uses `react-i18next`)
- PWA theme uses same CSS variables as desktop (`var(--color-primary-600)`, etc.)

---

## Archived Session Logs

<details>
<summary>Click to expand completed session history (2026-04-22 through 2026-04-26)</summary>

### ✅ DONE this session (2026-04-24)
- **Theme change: Forest → Bokoing Blue (#003580)**
  - CSS variables: `forest-*` → `primary-*` in both `src/index.css` and `pms-cloud/web/src/index.css`
  - All Tailwind classes updated: `bg-forest-*` → `bg-primary-*`, `text-forest-*` → `text-primary-*`, etc.
  - Files updated: 60+ TSX/TS files across desktop app and PWA
  - New palette: primary-600 = #003580, primary-500 = #0057B8, primary-700 = #002A60

---

### ✅ DONE this session (latest)

#### Units tab
- `src/pages/Settings.tsx`: Added 'units' to `TabKey`, added tab button, renders `<UnitManagementTab />`
- `src/i18n/ar.json` + `en.json`: Added `unitsTab` key

#### Product name simplification
- `src/pages/Products.tsx`: Removed `trade_name_ar` + `generic_name` fields from form UI; product list shows `trade_name` + `active_ingredient` only; added inline "+ New Unit" creation below unit dropdown

#### Expense Templates (full stack)
- **DB**: `expense_templates` table in `migrations.rs` (id, tenant_id, name, name_ar, category_id, default_amount, payment_method, account_id, is_active, sort_order, deleted_at)
- **Rust**: `get_expense_templates`, `create_expense_template`, `delete_expense_template` in `expenses.rs`; registered in `lib.rs`
- **Types**: `ExpenseTemplate`, `ExpenseTemplateData` in `src/types/expenses.ts`
- **API**: `getExpenseTemplates`, `createExpenseTemplate`, `deleteExpenseTemplate` in `src/api/expenses.ts`
- **UI** (`src/pages/Expenses.tsx`): Horizontal chip strip above summary cards — click chip pre-fills expense form with template values; hover chip shows ✕ to delete; "+ New Template" inline form opens in the strip; `prefillTemplate` wired into `ExpensePanel` form defaults

#### Multi-location: purchase location picker
- `src-tauri/src/commands/purchases.rs`: `confirm_purchase` accepts optional `location_id: Option<String>`; uses provided location or falls back to first active location
- `src/api/pos.ts`: `confirmPurchase(invoiceId, userId, locationId?)` passes `locationId ?? null`
- `src/pages/PurchaseDetail.tsx`: Loads storage locations on mount; custom confirm overlay (not Modal) with location dropdown + confirm button
- `src/pages/Purchases.tsx`: Same location picker overlay on the list-page quick-confirm button
- i18n: `purchases.storageLocation` key added to both language files

#### Multi-location: stock transfer workflow
- **Rust** (`warehouse.rs`): `transfer_stock` command + `do_transfer` private fn — FEFO batch deduction at source, creates new 'TRANSFER' batch at destination, records `transfer_out` / `transfer_in` stock movements; registered in `lib.rs`
- **API** (`src/api/warehouse.ts`): `transferStock(branchId, userId, productId, fromLocationId, toLocationId, quantity)`
- **UI** (`src/pages/Warehouse.tsx`): New 'Transfer' tab with `TransferTab` component — product search with debounce, from/to location selects, quantity input, execute button; shows inline success/error message
- i18n: `warehouse.tabs.transfer` + `warehouse.transfer.*` keys added to both language files

**`cargo check` passes clean (no errors, only warnings).**

#### Multi-location: Stock by Location view (added this session)
- `src/pages/Warehouse.tsx`: Added `inventory` tab type, new "المخزون بالموقع" (Stock by Location) tab with `PackageSearch` icon, `InventoryTab` component
- **InventoryTab features**:
  - Location dropdown (loads active storage locations)
  - Search box to filter by product name or batch number
  - Shows: product name, batch number, expiry date, quantity, unit cost
  - Summary bar: total items count + total quantity
  - Uses `getLocationBatches` API to fetch batches for selected location
- i18n: `warehouse.tabs.inventory` key added to both language files

#### RTL Icon Fix (Forms)
Fixed input icon overlap issue in RTL layout. Icons positioned at `absolute right-3` were overlapping text because inputs had `pe-10` (padding-end = left side in RTL) instead of `ps-10` (padding-start = right side in RTL).

**Files changed:**
- `src/pages/Products.tsx`: Both `inp` constants changed from `pe-10 ps-3` → `ps-10 pe-3`
- `src/pages/POS.tsx`: Search input padding fixed
- `src/pages/Expenses.tsx`: Form input padding fixed

---

### ✅ DONE this session (2026-04-25, continued)

#### Bug Fixes
1. **Notification bell hidden by search** — Added `z-[60] relative` to TopBar header AND `z-[70]` to notification dropdown to ensure it appears above all content.
   - File: `src/components/layout/TopBar.tsx`

2. **Product category changed to dropdown** — Category was a text input, now shows dropdown with existing categories from `getProductCategories()`.
   - Files: `src/pages/Products.tsx` (ProductPanel component)
   - Added: `categories` state, `useEffect` to fetch categories, `<select>` dropdown instead of `<input>`
   - i18n: Added `products.selectCategory` key to both `ar.json` and `en.json`

3. **Inline category creation** — Added "+ New Category" button below category dropdown. Clicking shows inline input + save/cancel buttons. New category is added to dropdown and auto-selected.
   - Files: `src/pages/Products.tsx`
   - Added: `showNewCategory`, `newCategoryName` states, `handleCreateCategory` function
   - i18n: Added `products.newCategory` and `products.categoryName` keys

4. **PWA still showing old green colors** — FIXED. Found hardcoded green (`#1b4332`) in:
   - `pms-cloud/web/index.html` — `theme-color` meta tag
   - `pms-cloud/web/public/manifest.json` — `theme_color`
   
   **Also improved deploy script to:**
   - Clean `web/dist` folder before build (removes old cached files)
   - Clear Caddy cache after upload
   - Added cache-busting meta tags to index.html
   
   **TO APPLY:** Run deploy again:
   ```powershell
   powershell -ExecutionPolicy Bypass -File pms-cloud\deploy.ps1
   ```
   
   **After deploy:** Hard refresh browser (Ctrl+F5) or clear browser cache.

---

### ✅ DONE this session (2026-04-26)

#### Purchase Invoice Edit Support
- **Rust** (`purchases.rs`): Added `update_purchase_invoice` command — validates draft status, wraps item delete+re-insert+header update in a single transaction via private `do_update_invoice` fn.
- **Route** (`App.tsx`): Added `/purchases/:id/edit` route pointing to `PurchaseNew`.
- **UI** (`PurchaseNew.tsx`): Edit mode — detects `:id` param, loads existing invoice on mount (pre-fills supplier, date, notes, discount, items), saves via `updatePurchaseInvoice` instead of `createPurchaseDraft`, navigates back to detail.
- **UI** (`PurchaseDetail.tsx`): Added "Edit Invoice" button (Pencil icon) for draft invoices → navigates to `/purchases/:id/edit`.
- **API** (`pos.ts`): `updatePurchaseInvoice(invoiceId, data)`.
- **i18n**: `editInvoice`, `updatedSuccess` keys added.

#### Payment Schedule CRUD
- **DB**: `supplier_payment_schedules` table already existed in `migrations.rs` (id, invoice_id, due_date, amount, note, is_paid, paid_at, deleted_at).
- **Rust** (`purchases.rs`): Added `PaymentScheduleRow`, `PaymentScheduleData` structs + `get_payment_schedules`, `create_payment_schedule`, `mark_schedule_paid`, `delete_payment_schedule` commands + private `fetch_schedule` helper.
- **API** (`pos.ts`): `getPaymentSchedules`, `createPaymentSchedule`, `markSchedulePaid`, `deletePaymentSchedule`.
- **Types** (`pos.ts`): `PaymentSchedule`, `PaymentScheduleData` interfaces.
- **UI** (`PurchaseDetail.tsx`): Payment Schedules panel below items table — add form (date + amount + note), table with due date (red if overdue), amount, status badge, mark-paid button (CheckCircle), delete with confirmation modal.
- **i18n**: `scheduleTitle`, `addSchedule`, `scheduleDueDate`, `scheduleAmount`, `scheduleNote`, `scheduleStatus`, `schedulePaid`, `scheduleOverdue`, `schedulePending`, `scheduleEmpty`, `markPaid`, `deleteScheduleTitle`, `deleteScheduleMsg` keys added.

#### Overdue Schedule Indicator in Invoice List
- **Rust** (`purchases.rs`): `PurchaseInvoiceRow` now includes `has_overdue_schedule: bool` — computed via EXISTS subquery on `supplier_payment_schedules WHERE is_paid=0 AND DATE(due_date)<DATE('now')`.
- **UI** (`Purchases.tsx`): Red dot indicator next to invoice number when `has_overdue_schedule` is true.
- **Types** (`pos.ts`): `PurchaseInvoiceRow.has_overdue_schedule: boolean`.

#### Due-Tomorrow Notification
- **Rust** (`notifications.rs`): `get_system_alerts` now includes a "due_tomorrow" alert counting unpaid schedules with `DATE(due_date) = DATE('now', '+1 day')`.

**`cargo check` + `tsc --noEmit` both pass clean.**

---

### ✅ DONE this session (2026-04-26, continued — Schedule Payment Accounting)

#### Problem fixed
The previous payment schedule implementation marked schedules as paid with a bare `UPDATE` — no supplier payment record, no account debit, no account movement, no invoice `amount_paid` update. Balances were not affected. This session replaces that broken path with the correct accounting flow.

#### DB migration (additive)
- `migrations.rs`: `ensure_column("supplier_payment_schedules", "payment_id", "TEXT")` — links back to the real payment row.
- `migrations.rs`: `ensure_column("supplier_payment_schedules", "account_id", "TEXT")` — records which account was debited.

#### Rust (`purchases.rs`)
- `PaymentScheduleRow` extended: added `payment_id: Option<String>`, `account_id: Option<String>`.
- `PaymentScheduleData` unchanged (schedule creation still takes only `due_date`, `amount`, `note`).
- New `SchedulePaymentData` struct: `account_id`, `payment_method`, `payment_date`, `notes`.
- `fetch_schedule` and `get_payment_schedules` queries updated to SELECT new columns.
- `mark_schedule_paid` signature changed: now takes `user_id` + `SchedulePaymentData`.
  - Loads schedule, rejects if already paid.
  - Loads `supplier_id` from linked invoice.
  - Validates account exists and has sufficient balance.
  - Delegates to private `do_pay_schedule` inside a transaction:
    1. INSERT into `supplier_payments` (same table as normal payments).
    2. INSERT into `account_transactions` (direction=out, type=supplier_payment).
    3. UPDATE `accounts.current_balance -= amount`.
    4. UPDATE `supplier_invoices.amount_paid` + `payment_status`.
    5. UPDATE `supplier_payment_schedules` — sets `is_paid=1`, `paid_at`, `payment_id`, `account_id`.
  - Cloud sync enqueue after commit.

#### TypeScript types (`pos.ts`)
- `PaymentSchedule`: added `payment_id?: string`, `account_id?: string`.
- New `SchedulePaymentData` type: `{ account_id, payment_method, payment_date, notes? }`.

#### API (`pos.ts`)
- `markSchedulePaid(scheduleId, userId, data: SchedulePaymentData)` — passes full payment data to Rust.

#### Frontend (`PurchaseDetail.tsx`)
- Loads accounts on mount via `getAllAccounts`; pre-selects first active account.
- Removed the inline CheckCircle "mark paid" button.
- Added `openPayModal(schedule)` → sets `payingScheduleId`, `payingScheduleAmount`, resets form, opens `'paySchedule'` modal.
- `handlePaySchedule` calls `markSchedulePaid` with full payment data, reloads invoice on success.
- Pay Schedule modal: account dropdown (shows name + balance), payment method select (cash/bank/cheque), payment date picker, optional notes, Confirm button (disabled if no account selected).
- Schedule table: added "due soon" status (amber, for today/tomorrow); delete button hidden on paid rows; "Pay" button (CreditCard icon) opens pay modal.

#### i18n (ar.json + en.json)
Added keys: `scheduleDueSoon`, `scheduleMarkedPaid`, `payNow`, `payScheduleTitle`, `payScheduleMsg`, `payAccount`, `payMethod`, `payDate`, `payNotes`, `confirmPay`, `methodCash`, `methodBank`, `methodCheque`, `common.optional`.

**Acceptance test satisfied:** Creating a schedule does not touch balances. Marking it paid from the modal runs the full accounting path — supplier payment record created, account balance reduced, invoice `amount_paid` updated, schedule marked paid with `payment_id` reference. Double-payment blocked at Rust level.

**`cargo check` ✅ `tsc --noEmit` ✅**

---

---

### ✅ DONE this session — Purchase Workflow Refactor (payment at confirm-time, cancel safeguards, schedule validation)

#### Rust (`suppliers.rs`)
- Extracted `pub(crate) do_supplier_payment()` — shared helper used by `record_supplier_payment`, `confirm_purchase_with_payment`, and `do_pay_schedule`. Handles: insert `supplier_payments`, insert `account_transactions`, update `accounts.current_balance`, update `supplier_invoices.amount_paid + payment_status`.
- `record_supplier_payment`: added **overpayment guard** — if `invoice_id` is provided, blocks paying more than the invoice's remaining balance.
- Old inline payment steps in `record_supplier_payment` replaced with `do_supplier_payment` call.

#### Rust (`purchases.rs`)
- New `ConfirmPaymentData` struct: `payment_mode` ("unpaid"/"paid"/"partial"), `account_id`, `payment_method`, `payment_date`, `amount_paid`, `notes`.
- New `#[tauri::command] confirm_purchase_with_payment`: receives stock, creates batches + stock movements, updates invoice to confirmed, then optionally runs `do_supplier_payment` based on `payment_mode`. Validates: draft-only, non-empty items, account balance, partial amount bounds, overpayment prevention.
- `cancel_purchase`: now reads `payment_status` alongside `status`. Blocks cancellation with clear Arabic error if `payment_status = 'paid'` or `'partial'`. Still allows cancelling confirmed-unpaid if no stock sold.
- `create_payment_schedule`: new guards — confirmed-only (errors on draft/cancelled), remaining balance check, sum of existing unpaid schedules + new amount ≤ remaining balance.
- `mark_schedule_paid`: added remaining invoice balance check before paying. Refactored `do_pay_schedule` to use shared `do_supplier_payment` (removed duplicate SQL). Remaining balance overpayment guard added.

#### `lib.rs`
- Registered `commands::purchases::confirm_purchase_with_payment`.

#### TypeScript types (`src/types/pos.ts`)
- New `ConfirmPurchasePaymentData` type: `{ payment_mode, account_id?, payment_method?, payment_date?, amount_paid?, notes? }`.

#### API (`src/api/pos.ts`)
- New `confirmPurchaseWithPayment(invoiceId, userId, locationId, paymentInfo)` calls `confirm_purchase_with_payment`.

#### Frontend (`PurchaseDetail.tsx`)
- Confirm modal upgraded: location picker + payment mode selector (unpaid/paid/partial) → if paying, shows account dropdown, method select (cash/bank only — cheque removed), partial amount input, date picker.
- Info grid: now shows `amountPaid` + `amountRemaining` (red) for confirmed unpaid/partial invoices instead of discount.
- Header badges: status + payment status shown together.
- "Pay Invoice" button (CreditCard icon) appears for confirmed invoices with remaining balance — opens a pay modal using `recordSupplierPayment`.
- Cancel button for confirmed invoices only shown when `payment_status = 'unpaid'`.
- Cheque removed from pay-schedule method selector.

#### i18n (ar.json + en.json)
- Added: `confirmPaymentMode`, `payModeUnpaid`, `payModePaid`, `payModePartial`, `partialAmount`, `payStatusUnpaid`, `payStatusPartial`, `payStatusPaid`, `amountRemaining`, `payInvoice`, `payInvoiceTitle`, `payInvoiceMsg`, `cancelBlockedPayments`.
- Removed: `methodCheque` (not supported by DB `CHECK` constraint).

#### Known limitations / Tech debt
- `confirm_purchase` (old command) still exists — kept for backward compat but UI now uses `confirm_purchase_with_payment`. Can remove in a future cleanup.
- `Purchases.tsx` list-page confirm modal still uses old `confirmPurchase` (no payment choice). A future task should update that modal to also use `confirmPurchaseWithPayment` for consistency.
- Confirmed invoice editing (item edits on confirmed invoices) is still blocked with a single "cannot edit confirmed" error — full edit-with-safeguards is not yet implemented.

#### NEXT
- Update `Purchases.tsx` confirm modal to use `confirmPurchaseWithPayment` (copy the new modal from `PurchaseDetail.tsx`).
- Implement confirmed invoice editing safeguards (allow metadata edits; block financial edits if payments exist).
- Consider removing the old `confirm_purchase` command once the list-page modal is updated.

**`cargo check` ✅ `tsc --noEmit` ✅**

---

---

### ✅ DONE this session — Bug Fixes: Purchase Cancellation, POS Keyboard Shortcuts, POS Search Availability

#### Root causes found

**Issue 1 — Purchase cancellation "doesn't work":**
Tauri `invoke()` rejects with a plain **string** (not an `Error` object). Every catch block in `PurchaseDetail.tsx` and `Purchases.tsx` used `e instanceof Error ? e.message : t('common.error')` — so the real localized backend error (e.g. "لا يمكن إلغاء فاتورة…") was silently replaced with the generic fallback. Users saw a generic error with no explanation.

**Issue 2 — POS keyboard shortcuts:**
- No selected-row state → Delete/Backspace had no target.
- `Enter` on search was hard-coded to `searchResults[0]` with no highlight state.
- No `+`/`-` shortcuts existed.
- `Escape` cleared the entire cart (destructive) instead of clearing search or deselecting.

**Issue 3 — POS search availability:**
Search results showed raw backend `quantity_current` regardless of how much was already in the cart for that product. A user could see "Available: 11" after adding 11 units, then try to add again (blocked silently).

#### Fixes

**`src/api/core.ts`**
- Added `export function errMsg(e: unknown, fallback: string): string` — checks `typeof e === 'string'` first, then `e instanceof Error`, then fallback. Used consistently everywhere.

**`src/pages/PurchaseDetail.tsx`** + **`src/pages/Purchases.tsx`**
- All catch blocks now use `api.errMsg(e, t('common.error'))` → real backend Arabic error messages surface to the user.
- `handlePayInvoice` no longer closes the modal on error (preserves user context).

**`src/pages/POS.tsx`**
- Added `selectedCartBatch: string | null` state — row click highlights it with a blue ring.
- Added `highlightedResultIdx: number` state for keyboard navigation of search results.
- Rewrote keyboard handler with clear focus-context separation:
  - **When search input focused**: `ArrowUp`/`ArrowDown` navigate results; `Enter` adds highlighted (or first) result; `Escape` clears search + blurs.
  - **When no input focused**: `Delete`/`Backspace` removes selected cart row; `+`/`Add` increases qty; `-`/`Subtract` decreases qty (removes at 1); `Ctrl+Delete` clears entire cart; `Escape` clears search or deselects row.
  - F-keys (F12/F3/F6/F7/F8) work regardless of focus context.
  - `isInputFocused()` guard prevents hijacking normal typing in all other inputs.
- `addToCart`: removed stale `onKeyDown` Enter handler from `<input>` (now handled by global listener); highlights search result on `ArrowUp/Down`.
- `removeFromCart`: now also clears `selectedCartBatch` if the removed item was selected.
- Search results: compute `effectiveStock = max(0, backendStock − cartQtyForSameProduct)`. Shows `"Available: N (in cart: M)"` when product is partially in cart. Blocks adding when `effectiveStock === 0`. `addToCart` guards against `batch.quantity_current < 1` for new items.
- `handleSale` reset: clears `selectedCartBatch` and `highlightedResultIdx`.
- Updated keyboard hint bar: shows `Del/Backspace`, `+/-`, `Ctrl+Del` shortcuts.
- i18n: added `inCart`, `kbSelect`, `kbDelete`, `kbQty` in both `ar.json` and `en.json`.

#### Known tech debt
- The `-` keyboard shortcut uses a two-step `setCart` + `removeFromCart` pattern (due to React rules on pure updaters). Works correctly but could be simplified if cart state is refactored to `useReducer`.
- `POS.tsx` `handleSale` is referenced in the keyboard `useEffect` but excluded from its dep array via eslint-disable. Stable as long as `handleSale` state refs don't go stale before F12 — acceptable for current architecture.
- `Purchases.tsx` confirm modal still uses old `confirmPurchase` (no payment choice at confirmation time). Should be upgraded to `confirmPurchaseWithPayment` in a future task.

#### NEXT
- Implement confirmed invoice editing safeguards (allow metadata edits; block financial edits if payments exist).
- FEFO stock policy (first-expiry-first-out batch selection in POS).
- Remove old `confirm_purchase` Rust command once `Purchases.tsx` list confirm modal is upgraded.

**`tsc --noEmit` ✅ No Rust changes made.**

---

### ✅ DONE this session — Payment Method Auto-Derivation from Account Type

#### Problem
In all purchase/supplier payment modals, users could select a bank account but manually choose "cash" as the payment method (or vice versa), producing inconsistent `supplier_payments` records. There was no enforcement at either the UI or backend layer.

#### Solution

**Backend (`src-tauri/src/commands/suppliers.rs`)**
- `do_supplier_payment` now **ignores** the caller-supplied `payment_method` parameter (renamed to `_payment_method`).
- It performs a live `SELECT account_type FROM accounts WHERE id = ?` and derives:
  - `account_type = 'bank'` → `payment_method = 'bank_transfer'`
  - anything else (i.e. `'cash'`) → `payment_method = 'cash'`
- This is the single authoritative source of truth — applies to all callers: `record_supplier_payment`, `confirm_purchase_with_payment`, `do_pay_schedule`.
- `record_supplier_payment` return value now reads `payment_method` back from the DB row via JOIN instead of echoing the frontend value.

**Frontend shared helper (`src/api/core.ts`)**
- Added `export function paymentMethodFromAccountType(accountType: string): 'cash' | 'bank_transfer'`
- Mirrors backend logic exactly. Exported through `api/index.ts` barrel.

**`src/pages/PurchaseDetail.tsx`**
- All three payment modals (Confirm, Pay Invoice, Pay Schedule):
  - Account `<select>` `onChange` now calls `api.paymentMethodFromAccountType(accountTypeFor(acctId))` and stores derived value in form state.
  - The manual payment method `<select>` is replaced with a read-only `<div>` badge showing the derived label (`t('purchases.methodCash')` / `t('purchases.methodBank')`).
- Account load effect now initialises `payment_method` in all three form states from the first account's type.
- `payInvoice` modal opener also derives method from first account on open.
- Added `useMemo`-memoised `accountTypeFor(accountId)` lookup helper.

**`src/pages/SupplierDetail.tsx` — `SupplierPaymentModal`**
- Initial form state derives `payment_method` from `accounts[0].account_type` instead of hardcoding `'cash'`.
- Account `<select>` `onChange` derives and sets `payment_method` automatically.
- Manual method `<select>` replaced with read-only `<div>` showing `derivedMethodLabel`.
- `accountOptions` now include balance in label for better UX.

**i18n (`ar.json` / `en.json`)**
- `purchases.payMethod` → "Payment Method (auto)" / "طريقة الدفع (تلقائي)" — clarifies it is derived.
- `suppliers.paymentMethod` → same labelling convention.

#### Account type values (confirmed from DB schema + seed)
| DB `account_type` | Payment method stored |
|---|---|
| `'cash'` | `'cash'` |
| `'bank'` | `'bank_transfer'` |

No other values exist in the schema CHECK constraint.

#### Known tech debt
- `do_supplier_payment` signature still accepts `_payment_method: &str` for API compatibility. Could be removed and callers simplified in a future refactor.
- `ConfirmPurchasePaymentData.payment_method` is `string` — could be narrowed to `'cash' | 'bank_transfer' | undefined`.

#### NEXT
- Implement confirmed invoice editing safeguards (block financial edits if payments exist).
- FEFO stock policy (first-expiry-first-out batch selection in POS).
- Upgrade `Purchases.tsx` list-page confirm modal to use `confirmPurchaseWithPayment`.

**`cargo check` ✅ `tsc --noEmit` ✅**

---

### ✅ DONE this session — Purchase Draft Save Failure & Hidden Validation Fix

#### Problems fixed

1. **Toast hidden behind TopBar** — `Toast.tsx` used `z-50` and `fixed top-4 left-4`. TopBar has `z-[60]`, so any toast behind it was invisible. Fixed:
   - Raised to `z-[80]` (above TopBar at `z-[60]` and notifications dropdown at `z-[70]`)
   - Moved to `top-20 start-4` (clears the 64px TopBar; `start-4` is RTL-safe)
   - Changed `border-r-*` → `border-s-*` (logical RTL property matching `border-s-4`)
   - Errors auto-extend to 5 s duration; success stays 3 s

2. **Draft validation too strict** — `handleSave` in `PurchaseNew.tsx` required `batch_number` AND `expiry_date` for every row before allowing save as draft. This blocked saving incomplete work-in-progress invoices. **Design decision: drafts are intentionally partial; confirmation enforces completeness.**
   - Draft only validates: `product_id` required, `quantity > 0`, `cost_price > 0`, `sell_price > 0`
   - `batch_number` and `expiry_date` are optional on draft — confirmed by Rust `create_purchase_draft` accepting `Option<String>` for both
   - Added `invalidRows: Set<number>` state — failing rows get a red ring highlight
   - Red ring clears per-row as user edits that row (`updateItem` clears from set)
   - Error messages are row-specific: "Row 2: purchase price must be greater than 0"

3. **Generic error messages** — All three `catch` blocks in `PurchaseNew.tsx` used `e instanceof Error ? e.message : fallback`, which silently swallowed Tauri string errors. Fixed to `api.errMsg(e, fallback)`.

#### i18n added (`purchases.*` in both `ar.json` / `en.json`)
| Key | Purpose |
|---|---|
| `draftRowNoProduct` | Row {{n}}: product is required |
| `draftRowNoQty` | Row {{n}}: quantity must be > 0 |
| `draftRowNoCost` | Row {{n}}: purchase price must be > 0 |
| `draftRowNoSell` | Row {{n}}: sale price must be > 0 |
| `confirmRowNoBatch` | Row {{n}}: batch required to confirm (future use) |
| `confirmRowNoExpiry` | Row {{n}}: expiry required to confirm (future use) |

#### Draft vs Confirm validation rules (now consistent)
| Field | Draft | Confirm (enforced by Rust `confirm_purchase_with_payment`) |
|---|---|---|
| `product_id` | ✅ required | ✅ required |
| `quantity` | ✅ > 0 | ✅ > 0 |
| `unit_cost` | ✅ > 0 | ✅ > 0 |
| `sale_price` | ✅ > 0 | ✅ > 0 |
| `batch_number` | ⬜ optional | Rust inserts `NULL` OK; batch created from item data |
| `expiry_date` | ⬜ optional | Rust inserts `NULL` OK |

#### Known tech debt
- `confirmRowNoBatch` / `confirmRowNoExpiry` i18n keys added but not yet wired to any confirm-side frontend validation (confirm goes through `PurchaseDetail`, not `PurchaseNew`). Wire when needed.
- `start-4` Toast position may still be obstructed on very small windows — consider centering with `left-1/2 -translate-x-1/2` in a future pass.

**`tsc --noEmit` ✅ No Rust changes.**

---

---

### ✅ DONE this session — Purchase Invoice Lifecycle & Actions Refactor

#### Final lifecycle model
```
Draft → Confirmed → Paid / Partial / Unpaid
```

| Status | Actions available |
|--------|-------------------|
| **Draft** | Edit · Confirm/Receive Stock · **Delete Draft** |
| **Confirmed — unpaid (untouched)** | Pay · Schedule Payment · **Return to Draft** |
| **Confirmed — partial/paid** | Pay remaining (if partial) · View schedules/payments · Print |
| **Confirmed — stock sold** | Print/view only — backend blocks return-to-draft with clear error |
| **Cancelled / Deleted** | Read-only — no payment/schedule/confirm/edit actions shown |

#### Rust commands added (`src-tauri/src/commands/purchases.rs`)

**`delete_purchase_draft`**
- Guards: `license_guard`, `FLAG_PURCHASES`, status must be `'draft'`
- Action: soft-delete (`deleted_at = now()`) the invoice — it disappears from normal list queries that filter `deleted_at IS NULL`
- No stock effects (draft has none)
- Registered in `lib.rs`

**`return_purchase_to_draft`**
- Guards: `license_guard`, `FLAG_PURCHASES`, status must be `'confirmed'`
- Safety checks (all enforced atomically before transaction):
  1. `payment_status` must be `'unpaid'` — blocks if paid/partial
  2. No paid payment schedules (`supplier_payment_schedules.is_paid = 1`)
  3. No sold stock (`sale_items` referencing any batch from this invoice)
- On success (inside transaction):
  - Inserts reversal `stock_movements` (`movement_type = 'adjust'`, `reference_type = 'return_to_draft'`) for full audit trail
  - Soft-deletes the batches created at confirmation (`deleted_at = now(), quantity_current = 0, status = 'depleted'`)
  - Soft-deletes any unpaid payment schedules
  - Resets invoice: `status = 'draft'`, `confirmed_at = NULL`, `confirmed_by = NULL`, `amount_paid = 0`, `payment_status = 'unpaid'`
- Returns fresh `PurchaseInvoiceDetail` so frontend can update immediately
- Registered in `lib.rs`

#### Frontend changes

**`src/api/pos.ts`**
- Added `deletePurchaseDraft(invoiceId, userId): Promise<void>`
- Added `returnPurchaseToDraft(invoiceId, userId): Promise<PurchaseInvoiceDetail>`

**`src/pages/PurchaseDetail.tsx`**
- Draft header buttons: **Edit · Confirm · Delete Draft** (replaced "Cancel")
- Confirmed unpaid header buttons: **Pay · Return to Draft** (removed unsafe "Cancel")
- Confirmed partial/paid: **Pay** only (no return-to-draft shown)
- Payment Schedules section: guarded — only rendered when `status === 'confirmed' && payment_status !== 'paid'`
- Added `handleDeleteDraft` (navigates to `/purchases` on success)
- Added `handleReturnToDraft` (reloads invoice on success)
- Added `deleteDraft` and `returnToDraft` Modal instances
- Modal type union extended: `'deleteDraft' | 'returnToDraft'` added

**`src/pages/Purchases.tsx`** (list page)
- Replaced draft row "Cancel" (X icon, `cancel_purchase`) with "Delete Draft" (Trash icon, `deletePurchaseDraft`)
- Modal type narrowed to `'confirm' | 'deleteDraft'`
- Removed unused `X` icon import, added `Trash2`

#### i18n keys added (`purchases.*` in both `ar.json` / `en.json`)
| Key | Value (EN) |
|-----|------------|
| `deleteDraft` | Delete Draft |
| `deleteDraftTitle` | Delete Draft |
| `deleteDraftMsg` | Are you sure you want to permanently delete this draft? This cannot be undone. |
| `deleteDraftSuccess` | Draft deleted |
| `returnToDraft` | Return to Draft |
| `returnToDraftTitle` | Return to Draft |
| `returnToDraftMsg` | This will reverse the stock receipt and return the invoice to draft so it can be edited. Continue? |
| `returnToDraftSuccess` | Invoice returned to draft |
| `cannotReturnHasPayments` | Cannot return to draft: payments have been recorded. Use Purchase Return instead. |
| `cannotReturnStockSold` | Cannot return to draft: some stock has already been sold. Use Purchase Return instead. |
| `confirmedPaidNoReturn` | Invoice has payments — use Purchase Return or payment reversal workflow. |
| `deletedSuccess` | Draft invoice deleted |

#### NEXT — Purchase Return / Supplier Credit workflow (not built in this task)
For paid/partial invoices or invoices where stock has already moved, corrections must go through a **Purchase Return** workflow:
- Create a `supplier_return` record linked to original invoice
- Select returned batches / items / quantities
- Reduce `batches.quantity_current` and insert negative `stock_movements`
- Reduce supplier balance via a credit note / debit adjustment in `supplier_payments` with negative amount
- Update original invoice `amount_paid` / `payment_status` accordingly
- Tables `supplier_returns` and `supplier_return_items` already exist in DB (seeded in warehouse migration)
- Do NOT allow modifying or deleting confirmed invoices that have payments — always go through Purchase Return

#### Known tech debt
- `Purchases.tsx` list-page confirm modal still uses legacy `confirmPurchase` (not `confirmPurchaseWithPayment`) — payment is not collected at list-page confirm. Full confirm with payment is only available in `PurchaseDetail`. Upgrade list-page modal if desired.
- `cancel_purchase` Rust command is still registered and callable (kept for safety). It is no longer surfaced in the UI but could be removed in a future cleanup once Purchase Return is built.
- Deleted draft invoices are hidden from normal list (filtered by `deleted_at IS NULL`) but there is no "Trash / Deleted Invoice History" view yet — document as future feature.

**`cargo check` ✅ `tsc --noEmit` ✅**

---

</details>

---

### ✅ DONE this session — End-to-End Subscription & License Workflow

#### Cloud API (`pms-cloud/`)

**`src/routes/admin.js`**
- Added `POST /admin/tenants/:id/renew` endpoint for admin to renew tenant subscription by extending expiry date

**`src/routes/auth.js`**
- Added `GET /v1/subscription` endpoint for owners to check their subscription status (active/expiring/expired/suspended)

**`web/src/api.ts`**
- Added `SubscriptionInfo` interface
- Added `getSubscription()` API function
- Added `renewTenant(tenantId, days)` API function

#### Admin Panel (`web/src/pages/AdminPanel.tsx`)
- Complete redesign with unified "New Pharmacy" form
- Duration selector (1 month / 3 months / 6 months / 1 year)
- Optional owner account creation checkbox
- Richer tenant stats (all/active/expiring/expired)
- Search/filter functionality
- Improved status badges with colors
- License view with filter tabs (all/pending/used)

**`web/src/pages/AdminTenantDetail.tsx`**
- Added renewal UI with quick-action buttons (+month/+3months/+6months/+year)
- Subscription status card with days remaining
- Moved manual expiry editing into expandable details section

#### Owner PWA (`web/src/pages/`)

**`Home.tsx`**
- Added subscription banner showing expiring/expired/suspended status
- Banner links to settings page
- Added `getSubscription()` call alongside dashboard load

**`OwnerSettings.tsx`** (NEW)
- New settings page with account info, subscription details, support contacts
- Shows subscription status, expiry date, days remaining
- Renewal alerts with appropriate messaging
- Logout button

**`OwnerApp.tsx`**
- Added `settings` to Page type and navigation
- Optimized mobile bottom nav to 5 items: Home, Sales, Products, Activity, Settings
- Added settings icon
- Desktop sidebar still shows all items

#### Desktop App (`src/pages/settings/LicenseTab.tsx`)
- Added expiry warning banner (amber for ≤14 days, red for ≤7 days or expired)
- Shows different messages for grace period, urgent expiry, and normal expiry warning
- Added cloud renewal section with new license key input
- Calls `activateLicenseCloud` for renewal with current user's username
- Added Arabic i18n translations for renewal features

#### Fixes Applied
- **`api.ts`**: Added `active_tenants`, `expiring_soon`, `expired_tenants` to `AdminStats` interface
- **`admin.js`**: Updated `/admin/stats` endpoint to calculate and return subscription status stats

---

*Last updated: 2026-05-01*

---

### ✅ DEPLOYED — End-to-End Subscription & License Workflow

**Deployed at**: 2026-05-01 14:05 UTC to `178.104.158.147`

**What is now live**:
- **Admin Panel** (`/mgmt`): Unified "New Pharmacy" form with duration selector (1/3/6/12 months), search/filter, subscription stats, tenant renewal UI
- **Owner PWA** (`/`): Subscription banner on Home, new Settings page, optimized 5-item mobile nav
- **Cloud API**: New endpoints `POST /admin/tenants/:id/renew`, `GET /v1/subscription`

**Verify at**:
- Admin Panel: http://178.104.158.147/mgmt
- Owner PWA: http://178.104.158.147/
- API Health: http://178.104.158.147/health

---

### DONE this session - End-to-End Flow Audit (Desktop Activation, Sync, Owner/Admin PWA)

Date: 2026-05-02

#### What was investigated
- Desktop onboarding and activation: `src/pages/Onboarding.tsx`, `src-tauri/src/commands/settings.rs`, `src/pages/settings/CloudSyncTab.tsx`, `src/pages/settings/LicenseTab.tsx`
- Desktop sync: `src-tauri/src/commands/cloud_sync.rs`, `src-tauri/src/lib.rs`
- Cloud API: `pms-cloud/src/routes/auth.js`, `sync.js`, `dashboard.js`, `admin.js`
- Owner/Admin PWA: `pms-cloud/web/src/api.ts`, `Login.tsx`, `OwnerApp.tsx`, `Home.tsx`, `AdminPanel.tsx`, `AdminTenantDetail.tsx`
- Live server checked via `/health`, admin API, owner API with sync token, and direct PostgreSQL via SSH.

#### Live state found
- The tenant ID provided in the prompt, `d79a92b0-b13c-4d78-a0c0-7cd8154a52e0`, is not present on the live server and `/admin/tenant/...` returns 404.
- Current live Choice Pharmacy tenant is `230b928c-b45e-4fd1-811f-0b146483c71f`.
- Live owner account exists: `muna@taj.com` for that tenant. Password cannot be recovered from bcrypt hash; login with an incorrect password correctly returns 401 when valid JSON is sent.
- Live license key is `PMS-0IIH-06P7-025B`, status `used`, not the key string from the prompt.
- Live snapshot data for Choice Pharmacy: products=5, suppliers=1, customers=0, sales=0, sale_items=0, expenses=0, batches=0, activity=0.
- A temporary live E2E smoke test passed: admin created license -> `/v1/activate` returned sync token -> `/auth/login` returned JWT -> `/v1/dashboard` worked with JWT -> temporary tenant was deleted.

#### Real flow summary
- Admin creates a license with `POST /admin/licenses`; this creates a tenant if needed, creates an `api_tokens` UUID sync token, and creates a one-time `PMS-...` license key.
- Desktop onboarding step 2 writes local tenant/admin user and marks onboarding complete before cloud activation.
- Desktop activation step 3 calls Tauri `activate_license_cloud`, which posts `{ key, email, password, pharmacy_name }` to `/v1/activate`.
- `/v1/activate` creates/uses the owner account, marks the license key `used`, updates cloud tenant `pharmacy_name`/`expires_at`, and returns `{ sync_token, tenant_id, expires_at }`.
- Desktop saves only `cloud_sync_config.token` and `expires_at`; it does not save the returned cloud tenant ID. Local tenant ID remains `default-tenant`.
- Owner PWA login uses `/auth/login` with email/password and stores a JWT in `localStorage.pms_jwt`.
- Owner PWA pages read real PostgreSQL snapshot tables, not hardcoded data: dashboard, products, sales, balances, sync stats, supplier accounts. Activity currently stays empty because no code inserts `activity_log`.

#### Gaps / Tech Debt discovered
- Legacy `/v1/events` sync is broken after activation: desktop sends local `tenant_id=default-tenant`, but the sync token belongs to the cloud UUID tenant, so the server rejects events with 403 tenant mismatch. Logs show repeated `POST /v1/events 403`.
- Table snapshot sync works because `/v1/sync/batch` overwrites row tenant/branch from the bearer token, but it only pushes products, customers, suppliers, pos_sales, pos_sale_items, expenses, supplier_invoices. It does not push batches or stock_movements even though cloud schemas/routes support them.
- Owner Activity tab is effectively empty: table snapshot sync does not populate `activity_log`, and legacy event sync is rejected.
- Desktop activation stores no cloud tenant ID, so future event-based paths and any tenant-aware cloud operations cannot map local `default-tenant` to the cloud UUID tenant.
- Skip activation preserves local onboarding data and local app access, but cloud sync is disabled because no sync token is stored. Manual Cloud Sync settings can accept a token, but the intended license-key activation-later path is not reliable.
- `LicenseTab` cloud renewal/activation-later path is miswired: it calls `activateLicenseCloud` (`/v1/activate`) with `email: user?.username` and password `"renewal"` instead of a real owner email/password or `/v1/renew`.
- Admin has no UI to reset an existing owner password. Admin can create an owner only when none exists. `/auth/password` can update via sync token/JWT, but it is not exposed as an admin reset action.
- `api_tokens.last_used_at` is never updated by auth middleware, so token last-used visibility is not available. Admin uses `tenants.last_sync_at` as "last activity".
- Prompt data is stale: known tenant ID and license key differ from live DB on 2026-05-02.

#### NEXT
- Store the cloud `tenant_id` returned by `/v1/activate` in `cloud_sync_config` and use it for `/v1/events`, or remove/disable legacy event sync if table snapshot sync is the supported path.
- Add `batches` and `stock_movements` to `push_all_tables()` so stock expiry/lot data and stock movement visibility can sync.
- Decide how Activity should be generated: either insert `activity_log` rows during `/v1/sync/batch` from sales/products/expenses changes, or fix legacy events and map tenant IDs correctly.
- Build a real "Activate later" / renewal flow in desktop settings. Use owner email/password for first activation, and use `/v1/renew` for renewal with the stored sync token.
- Add Admin owner password reset UI/API for existing owners.
- Update stale docs/test data to use live tenant `230b928c-b45e-4fd1-811f-0b146483c71f` or clearly label old IDs as historical artifacts.

*Last updated: 2026-05-02*

---

### DONE this session - POS Runtime Hardening (Split + Workspace State)

Date: 2026-05-03

#### What changed
- Hardened POS split-payment calculations in `src/pages/POS.tsx`:
  - Added normalized split amounts (`normalizedSplitCashAmount`, `normalizedSplitBankAmount`) so non-finite/negative values cannot leak into sale payloads.
  - Updated split-payment payload creation to always use normalized piaster amounts.
  - Allowed zero-total split checkouts without forcing a positive split amount (covers 100% discount scenarios).
  - Kept existing guards for bank account selection when split-bank amount is present, overage blocking, and customer requirement for credit remainder.
- Hardened local workspace-state parsing in `src/pages/pos/workspaceState.ts`:
  - Added normalization helpers for money/text fields during localStorage hydrate.
  - Clamped all persisted money-like values to non-negative integer piasters.
  - Normalized `discountMode` and optional `parkedAt` value.
  - Added unique-ID enforcement across active + parked workspaces to prevent tab collisions from malformed localStorage state.

#### Verification
- `npx tsc --noEmit` passed (no output).
- VS Code diagnostics: no errors in:
  - `src/pages/POS.tsx`
  - `src/pages/pos/workspaceState.ts`

#### Remaining Tech Debt / NEXT
- Run manual cashier-flow regression pass for split edge cases:
  - split with cash-only, bank-only, and cash+bank
  - split with credit remainder and customer credit-limit edge
  - 100% discount with split selected (zero-total sale)
- Persist parked carts to SQLite for multi-user/device visibility and auditing (current implementation is still localStorage-scoped per session).
- Extend split payment from fixed cash+single-bank model to arbitrary multi-tender rows/history UX.

*Last updated: 2026-05-03*

---

### DONE this session - Customer-Facing Key Cleanup + Multi-Branch Sync/PWA

Date: 2026-05-02

#### What changed
- Admin UI now treats the UUID sync token as backend-only. The tenant detail page no longer shows token rows to the admin, and the new-pharmacy result only exposes/copies the `PMS-XXXX-XXXX-XXXX` license key.
- Owner PWA now loads `/v1/branches` and shows a branch selector when more than one branch exists.
- Owner PWA branch selection is wired into dashboard, products, sales, balances, supplier accounts, and activity reads.
- Desktop `sync_all_tables_now()` now syncs all active local branches when no specific branch is passed.
- Desktop auto-sync and the Cloud Sync settings button now call all-branch sync instead of current-branch-only sync.
- Desktop table snapshot sync now includes `batches` and `stock_movements`.
- Cloud `/v1/branches` now discovers branches from products, batches, sales, customers, supplier invoices, and expenses.
- Cloud `/v1/events` now trusts the bearer sync token tenant instead of the local desktop `tenant_id`, so activated desktops using local `default-tenant` no longer get tenant-mismatch 403s.
- Cloud `/v1/events` inserts `activity_log` rows for new events, so Owner Activity can populate.
- Cloud auth now updates `api_tokens.last_used_at` whenever sync-token auth succeeds.

#### Verification
- `npm run build` passed in `pms-cloud/web`.
- Root `npm run build` passed.
- `cargo check` passed in `src-tauri`.
- `node --check` passed for changed cloud JS files.
- Deployed to `178.104.158.147` using `pms-cloud/deploy.ps1`.
- Live `/health` returned OK after deploy.
- Live admin API lists Choice Pharmacy tenant `230b928c-b45e-4fd1-811f-0b146483c71f`.
- Live tenant license API shows only the PMS key `PMS-0IIH-06P7-025B`.
- Live logs show `/v1/events` returning 200 after the deploy.
- Live DB now has activity rows for Choice Pharmacy and `api_tokens.last_used_at` is populated.

#### Remaining Tech Debt / NEXT
- Existing desktop installers still need to be rebuilt/reinstalled to get all-branch table sync plus batches/stock movements.
- Branch selector currently shows branch IDs. Add a cloud branch snapshot/table if owner-facing branch names are required.
- Admin owner password reset for existing owners is still missing.
- Consider removing the old token-management backend routes or locking them behind a support-only path if admins should never manually generate/revoke sync tokens.

*Last updated: 2026-05-02*

---

### DONE this session - License Renewal Path Fix

Date: 2026-05-02

#### What changed
- Added `renew_license_cloud` Rust command (`src-tauri/src/commands/settings.rs`): reads the stored sync token from `cloud_sync_config`, POSTs to `{endpoint}/v1/renew` with `Authorization: Bearer {token}` and `{ key }`, and saves the new `expires_at` back to DB on success.
- Registered `renew_license_cloud` in `src-tauri/src/lib.rs` command list.
- Added `RenewLicenseCloudData` and `RenewLicenseCloudResult` TypeScript interfaces to `src/types/system.ts`.
- Added `renewLicenseCloud()` API function to `src/api/system.ts` (imported new types).
- Fixed `LicenseTab.handleRenew` (`src/pages/settings/LicenseTab.tsx`) to call `api.renewLicenseCloud({ key })` instead of the broken `activateLicenseCloud` with fake email/password.
- Cloud `/v1/renew` endpoint was already deployed from the previous session; no cloud deploy needed.

#### Verification
- `npm run build` passed in project root.
- `cargo check` passed in `src-tauri` (no errors).
- Live `/health` still returns OK (`178.104.158.147`).

#### Remaining Tech Debt / NEXT
- Existing desktop installers still need to be rebuilt/reinstalled to get all-branch table sync plus batches/stock movements.
- Branch selector currently shows branch IDs. Add a cloud branch snapshot/table if owner-facing branch names are required.
- Admin owner password reset for existing owners is still missing.
- Consider removing the old token-management backend routes or locking them behind a support-only path if admins should never manually generate/revoke sync tokens.

*Last updated: 2026-05-02*

---

### ✅ DONE this session — Full i18n Audit & Translation Key Fixes

Date: 2026-05-05

#### What changed

**`src/i18n/ar.json` + `src/i18n/en.json`** — Added all missing translation keys found during a systematic page-by-page audit:

| Key Group | Count | Notes |
|-----------|-------|-------|
| `sales.*` | 28 | Entire Sales invoice modal had no Arabic — labels showed as raw key paths. Keys: `subtotal`, `discount`, `vat`, `vatRate`, `totalLabel`, `balanceDueLabel`, `product`, `batch`, `qty`, `unitPrice`, `customerLabel`, `walkInNone`, `paymentMethod`, `cash`, `bankTransfer`, `fullCredit`, `partialPayment`, `account`, `amountPaidLabel`, `notes`, `searchProduct`, `addProductsHint`, `searching`, `addAtLeastOne`, `customerRequired`, `saving`, `saveInvoice`, `loading`, `printInvoice` |
| `common.add`, `common.actions` | 2 | Used in Assets, CustomersTab, SuppliersTab, UnitManagementModal |
| `pos.discount`, `pos.discountPlaceholder`, `warehouse.movements.qty`, `warehouse.stockTake.totalItems`, `common.close`, `common.done` | 6 | These were showing as raw key paths in the UI |

**`src/pages/settings/GeneralTab.tsx`** — Added العربية / English language toggle; calls `i18n.changeLanguage`, persists to `localStorage`, updates `document.documentElement.dir`.

**`src/i18n/index.ts`** — Reads saved language from `localStorage` on startup; restores RTL/LTR direction so Arabic layout persists across restarts.

#### Pages audited (all translation keys confirmed present)
POS (all sub-components), Sales, Warehouse, Products, Dashboard, Reports, SupplierDetail, CustomerDetail, Purchases, all Settings tabs.

#### Build result
`npx tauri build` ✅ — `src-tauri/target/release/bundle/nsis/TAJ Pharmacy_0.1.0_x64-setup.exe`
Old `PMS Pharmacy_0.1.0_x64-setup.exe` is a stale leftover — delete it manually.

#### Known tech debt
- `Products.tsx` form section header `"Primary Info"` is hardcoded English in JSX (not in `t()`). Low-priority cosmetic issue.

#### NEXT
- FEFO stock policy — first-expiry-first-out batch selection in POS (highest priority pending feature)
- Reorder Point Alerts — auto-alert when stock falls below minimum

*Last updated: 2026-05-05*
