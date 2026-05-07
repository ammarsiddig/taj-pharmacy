# Rust Developer — TAJ Pharmacy v4

> **Role**: Backend logic, database, Tauri commands, sync engine.
> **You OWN**: All files in `src-tauri/src/` (commands/, db/, models/).
> **You TOUCH**: `src/types/` (TypeScript type definitions that mirror Rust structs).
> **You NEVER**: Modify frontend UI code (`src/pages/`, `src/components/`) or cloud code (`pms-cloud/`).

---

## Session Protocol

1. Read this file + `_ACTIVE-LOCK.md` + last 3 entries in `_WORK-LOG.md`
2. Read `docs/AGENT-HANDOFF.md` sections 1–6 for project context
3. Do your work
4. Run `cargo check` after every change. Run `cargo test` before finishing.
5. Update this file (flip ⬜→✅, update module map)
6. Append to `_WORK-LOG.md`
7. Update `_ACTIVE-LOCK.md` (clear session, update queue)

---

## Architecture

### Layered Design (STRICT)

```
src-tauri/src/
  commands/     # Thin Tauri command handlers — validate input, delegate to helpers, return result
  db/           # ONLY layer with raw SQL — migrations.rs, seed.rs, mod.rs
  models/       # Domain logic extracted from commands (future, currently minimal)
```

### Command Pattern

Every mutation command follows this pattern:

```rust
#[tauri::command]
pub fn create_thing(db: State<Database>, tenant_id: String, ...) -> Result<ThingOut, AppError> {
    let conn = db.conn.lock().map_err(AppError::LockFailed)?;
    
    // 1. License check
    license_guard::require_active(&conn, &tenant_id)?;
    license_guard::require_feature(&conn, &tenant_id, FLAG_XXX)?;
    
    // 2. Permission check
    guard::require_permission(&conn, &user_id, "feature_name")?;
    
    // 3. Validate input
    if items.is_empty() { return Err(AppError::ValidationFailed("message")); }
    
    // 4. Transaction
    conn.execute("BEGIN", [])?;
    let result = (|| -> Result<String, AppError> {
        // ... all DB operations ...
        Ok(id)
    })();
    match result {
        Ok(id) => {
            conn.execute("COMMIT", [])?;
            // 5. Audit log (outside transaction, warn on failure)
            audit::log_action(&conn, &tenant_id, &user_id, "create", "thing", &id, None)?;
            // 6. Cloud sync enqueue (outside transaction, warn on failure)
            cloud_sync::enqueue_owner_refresh_request(&conn, &tenant_id, "thing_created")?;
            build_thing_out(&conn, &tenant_id, &id)
        }
        Err(e) => { let _ = conn.execute("ROLLBACK", []); Err(e) }
    }
}
```

### Registration

Every new command must be registered in TWO places:
1. `src-tauri/src/commands/mod.rs` — `pub mod module_name;`
2. `src-tauri/src/lib.rs` — `commands::module::command_name,` in the `generate_handler![]` macro

---

## Conventions

| Convention | Rule |
|-----------|------|
| **Money** | Integer piasters (×100). Never use floats. Display via `api.formatMoney()`. |
| **IDs** | `Uuid::new_v4().to_string()` — never auto-increment |
| **Migrations** | Additive only via `ensure_column()`. Never DROP columns/tables. New tables use `CREATE TABLE IF NOT EXISTS`. |
| **Error messages** | Arabic (matching existing pattern). Exception: `create_invoice_sale` still uses English — needs migration. |
| **Soft deletes** | `deleted_at TEXT` column + `WHERE deleted_at IS NULL` in all queries |
| **Timestamps** | `strftime('%Y-%m-%dT%H:%M:%fZ','now')` — ISO 8601 UTC |
| **Permission checks** | `guard::require_permission()` before every mutation |
| **License checks** | `license_guard::require_active()` + `require_feature()` at command entry |
| **Audit logging** | `audit::log_action()` after every mutation COMMIT |
| **Cloud sync** | `cloud_sync::enqueue_owner_refresh_request()` after every mutation COMMIT |
| **Transactions** | All multi-step mutations use `BEGIN`/`COMMIT`/`ROLLBACK` |
| **Max file** | 400 lines (target). 800 lines (hard limit). |
| **Max function** | 50 lines |
| **Max nesting** | 4 levels |

---

## Current Module Map

| File | Lines | Status | Next Action |
|------|-------|--------|-------------|
| `commands/pos.rs` | 2001 | 🔴 Over limit | Split into 5 sub-modules |
| `commands/settings.rs` | ~80KB | 🔴 Over limit | Split into 4 sub-modules |
| `commands/cloud_sync.rs` | ~68KB | 🔴 Over limit | Split into 3 sub-modules |
| `commands/purchases.rs` | ~59KB | 🔴 Over limit | Split into 4 sub-modules |
| `commands/warehouse.rs` | ~40KB | 🟡 Near limit | Monitor, may need split |
| `commands/products.rs` | ~30KB | ✅ OK | — |
| `commands/suppliers.rs` | ~25KB | ✅ OK | — |
| `commands/customers.rs` | ~20KB | ✅ OK | — |
| `commands/expenses.rs` | ~20KB | ✅ OK | — |
| `commands/accounts.rs` | ~15KB | ✅ OK | — |
| `commands/reports.rs` | ~30KB | ✅ OK | — |
| `commands/auth.rs` | ~15KB | ✅ OK | — |
| `commands/guard.rs` | 72 | ✅ OK | — |
| `commands/audit.rs` | ~30 | ✅ OK | — |
| `commands/license_guard.rs` | ~100 | ✅ OK | Do NOT modify (project rule) |
| `commands/notifications.rs` | ~15KB | ✅ OK | — |
| `commands/updater.rs` | ~5KB | ✅ OK | — |
| `commands/assets.rs` | ~20KB | 🟡 Unused | Assets feature removed — consider deleting |
| `db/migrations.rs` | 1150 | 🟡 Large | Expected for schema file |
| `db/seed.rs` | ~200 | ✅ OK | — |
| `db/mod.rs` | ~50 | ✅ OK | Needs PRAGMA foreign_keys = ON |
| `lib.rs` | 247 | ✅ OK | — |

---

## Known Issues in Your Territory

| # | Issue | Severity | File | Details |
|---|-------|----------|------|---------|
| 1 | No typed error enum | 🔴 Critical | All commands | Every function returns `Result<T, String>` |
| 2 | batches.status CHECK missing 'recalled' | 🔴 Critical | migrations.rs:279 | `recall_batch()` sets status='recalled' but CHECK doesn't allow it |
| 3 | stock_movements.movement_type CHECK missing 'void_sale', 'recall' | 🔴 Critical | migrations.rs:302 | Code inserts these types but CHECK rejects them |
| 4 | PRAGMA foreign_keys not enabled | 🟡 Medium | db/mod.rs | SQLite defaults FK checks OFF |
| 5 | create_invoice_sale uses English errors | 🟡 Medium | pos.rs:1788-1808 | Inconsistent with Arabic pattern elsewhere |
| 6 | check_permission registered but never called as guard | 🔴 High | lib.rs:60 | Permission system exists but isn't enforced |
| 7 | Hardcoded TOKEN_SECRET in auth.rs | 🟡 Medium | auth.rs | Acceptable for desktop Phase 1, needs Phase 3 fix |
| 8 | _payment_method param ignored in do_supplier_payment | 🟢 Low | suppliers.rs | Dead parameter, noted for cleanup |
| 9 | Deprecated confirm_purchase still in code | 🟢 Low | purchases.rs | Body kept for one release cycle, can remove |
| 10 | cloud_sync_config has hardcoded VPS IP | 🟢 Low | migrations.rs:1020 | Default value in INSERT |

---

## Planned File Splits

### pos.rs → 5 files

| New File | Contents | Est. Lines |
|----------|----------|-----------|
| `pos_session.rs` | `get_active_session`, `open_session`, `close_session`, `get_session_history`, `get_accounts` | ~280 |
| `pos_sale.rs` | `create_sale`, `void_sale`, `resolve_fefo_items`, `next_sequence`, helper structs | ~420 |
| `pos_return.rs` | `create_return`, `get_session_returns` | ~180 |
| `pos_invoice.rs` | `get_invoice_sales`, `create_invoice_sale`, `InvoiceSaleRow` | ~200 |
| `pos_workspace.rs` | `save/load/clear_pos_workspace_state` | ~90 |

Shared types (`PosSession`, `PosProduct`, `SaleOut`, etc.) go into a `pos_types.rs` or stay in the largest file.

### settings.rs → 4 files

| New File | Contents |
|----------|----------|
| `settings_general.rs` | Tenant settings CRUD, onboarding |
| `settings_backup.rs` | Backup/restore logic |
| `settings_cloud.rs` | Cloud config, sync settings |
| `settings_license.rs` | License activation, validation |

### cloud_sync.rs → 3 files

| New File | Contents |
|----------|----------|
| `cloud_sync_outbox.rs` | Outbox enqueue, event types |
| `cloud_sync_scheduler.rs` | Background scheduler, retry logic |
| `cloud_sync_snapshot.rs` | Table-snapshot push, batch sync |

### purchases.rs → 4 files

| New File | Contents |
|----------|----------|
| `purchases_invoice.rs` | CRUD for purchase invoices |
| `purchases_payment.rs` | `confirm_purchase_with_payment`, `do_supplier_payment` |
| `purchases_schedule.rs` | Payment schedule CRUD, `mark_schedule_paid` |
| `purchases_return.rs` | `create_purchase_return` |

---

## Active Tasks

| # | Task | Priority | Status | Blocked By |
|---|------|----------|--------|-----------|
| 1 | Create `errors.rs` with typed AppError enum | 🔴 Critical | ⬜ | None |
| 2 | Fix CHECK constraints in migrations.rs | 🔴 Critical | ⬜ | None |
| 3 | Enable PRAGMA foreign_keys = ON | 🟡 Medium | ⬜ | None |
| 4 | Split pos.rs into 5 sub-modules | 🔴 High | ⬜ | #1 (typed errors first) |
| 5 | Split settings.rs into 4 sub-modules | 🟡 Medium | ⬜ | #4 |
| 6 | Split cloud_sync.rs into 3 sub-modules | 🟡 Medium | ⬜ | #5 |
| 7 | Split purchases.rs into 4 sub-modules | 🟡 Medium | ⬜ | #6 |
| 8 | Migrate all commands from String to AppError | 🔴 High | ⬜ | #1 |
| 9 | Unify create_invoice_sale errors to Arabic | 🟡 Medium | ⬜ | #4 (after pos_invoice.rs) |
| 10 | Wire check_permission as actual guard | 🔴 High | ⬜ | #1 |
| 11 | Consider deleting assets.rs (unused) | 🟢 Low | ⬜ | None |

## Completed (last 5)

- ✅ FEFO auto-selection in create_sale (Session pre-001)
- ✅ Prescription gate for Rx products (Session pre-001)
- ✅ Void sale with full reversal (Session pre-001)
- ✅ Split payment support with sale_payments table (Session pre-001)
- ✅ Parked cart SQLite persistence (Session pre-001)

---

## Pending Cross-Role Requests

| Request | For Whom | Status |
|---------|----------|--------|
| None currently | — | — |
