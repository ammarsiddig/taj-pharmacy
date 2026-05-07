# QA Engineer — TAJ Pharmacy v4

> **Role**: Testing strategy, automated tests, bug verification, regression prevention, data integrity.
> **You OWN**: `pms-testing/` (database workflow tests), all test files, bug tracking in this document.
> **You TOUCH**: Test files in any layer — Rust tests in `src-tauri/`, frontend tests, API tests.
> **You NEVER**: Modify production business logic. You write tests, report bugs, and verify fixes. If a bug requires code changes, file a cross-role request.

---

## Session Protocol

1. Read this file + `_ACTIVE-LOCK.md` + last 3 entries in `_WORK-LOG.md`
2. Read `docs/AGENT-HANDOFF.md` sections 1–6 for project context
3. Do your work (write tests, run tests, verify bugs, report findings)
4. Run all existing tests before finishing to ensure no regressions
5. Update this file (flip ⬜→✅, update test coverage, add bugs found)
6. Append to `_WORK-LOG.md`
7. Update `_ACTIVE-LOCK.md` (clear session, update queue)

---

## Testing Architecture

### Current State: Mostly Manual

| Layer | Test Type | Status | Framework | Coverage |
|-------|-----------|--------|-----------|----------|
| Database | SQL workflow tests | ✅ 146 tests passing | Python + SQLite | Good — schema, CRUD, edge cases |
| Rust | Unit tests | ❌ Zero tests | `#[cfg(test)]` + rusqlite | 0% |
| Rust | Integration tests | ❌ Zero tests | Tauri test harness | 0% |
| Frontend | Component tests | ❌ Zero tests | None configured | 0% |
| Frontend | E2E tests | ❌ Zero tests | None configured | 0% |
| Cloud API | Route tests | ❌ Zero tests | None configured | 0% |
| Cloud API | Sync tests | ❌ Zero tests | None configured | 0% |

### Priority: Rust Backend Tests First

The Rust backend handles all money calculations and data integrity. A bug here corrupts data. Frontend bugs are visible; backend bugs are silent.

**Priority order:**
1. **Rust unit tests** — Money handling, FEFO resolution, session math
2. **Rust integration tests** — Full command workflows against temp SQLite DB
3. **Cloud API tests** — Sync upsert, auth, dashboard computation
4. **Frontend component tests** — Cart logic, form validation, permission gates
5. **E2E tests** — Full user workflows (last, after stability)

---

## Existing Test Suite

### Database Workflow Tests (`pms-testing/`)

**File**: `pms-testing/test_workflows.py` (1715 lines)
**Runner**: `python3 pms-testing/test_workflows.py`
**Dependencies**: Python 3 + SQLite (built-in), `rich` (optional, pretty output)

| Suite | Tests | What It Proves |
|-------|-------|----------------|
| 1. Schema Validation | 34 | All 27 tables created, FK constraints enforced, CHECK constraints reject bad data, money stored as INTEGER, FIFO index exists |
| 2. Purchase Invoice | 27 | Draft creates NO stock/batches/transactions. Confirm creates batches + movements + double-entry. Payment reduces bank balance |
| 3. POS Sessions & Sales | 15 | Session opens, duplicate blocked, FIFO splits sale across 2 batches, oversell detected, session closes with shortage tracking |
| 4. Invoice Sale + Credit | 7 | Credit sale to hospital, customer balance increases, partial payment reduces balance |
| 5. Customer Returns | 3 | Stock restored to original batch, cash register reduced, movement logged |
| 6. Supplier Returns | 4 | Batch quantity reduced, accounts_payable decreased |
| 7. Expenses | 7 | Create deducts cash, edit reverses old + applies new, delete fully restores cash |
| 8. Double-Entry Integrity | 6 | Every transaction_group has exactly 1 debit + 1 credit of equal amount. Global debits == credits |
| 9. Stock Integrity | 8 | For every batch: received - sold + returned - supplier_returned == quantity_current |
| 10. Edge Cases | 9 | Can't cancel invoice with sold batches, soft-delete filtering, tenant isolation, sequence counters |
| 11. Report Queries | 8 | Stock valuation, revenue, COGS, gross profit, payables, expiry report, low stock, movement audit |
| 12. Full Day Simulation | 18 | 10 random sales with FIFO, re-verifies double-entry + stock integrity |

**Total: 146 tests — ALL PASSING**

### Known Limitations of Current Tests

- Tests run against raw SQL, NOT against Rust commands — they validate schema, not implementation
- No test for `void_sale` workflow
- No test for `recall` batch status
- No test for multi-location stock transfers
- No test for permission enforcement
- No test for license/feature flag gating
- No test for cloud sync data integrity

---

## Test Plan: Rust Backend

### Setup Pattern

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        db::migrations::run(&conn).unwrap();
        db::seed::run(&conn, "test-tenant", "test-branch").unwrap();
        conn
    }

    // ... tests using test_db()
}
```

### Priority 1: Money & Math Tests

| # | Test | Module | Priority | Status |
|---|------|--------|----------|--------|
| 1 | `formatMoney` rounds correctly | pos.rs | P0 | ⬜ |
| 2 | Sale total = sum of item totals + tax - discount | pos.rs | P0 | ⬜ |
| 3 | Split payment: cash + bank = total | pos.rs | P0 | ⬜ |
| 4 | Void sale reverses exact amounts | pos.rs | P0 | ⬜ |
| 5 | Return amount cannot exceed original sale | pos.rs | P0 | ⬜ |
| 6 | Discount: flat vs percentage calculation | pos.rs | P1 | ⬜ |
| 7 | Session close: expected vs actual cash calculation | pos.rs | P0 | ⬜ |

### Priority 2: FEFO & Stock Tests

| # | Test | Module | Priority | Status |
|---|------|--------|----------|--------|
| 1 | FEFO selects oldest batch first | pos.rs | P0 | ⬜ |
| 2 | FEFO splits across multiple batches | pos.rs | P0 | ⬜ |
| 3 | FEFO rejects sale if total stock insufficient | pos.rs | P0 | ⬜ |
| 4 | FEFO skips expired batches | pos.rs | P1 | ⬜ |
| 5 | Void sale restores batch quantities | pos.rs | P0 | ⬜ |
| 6 | Return restores original batch quantity | pos.rs | P0 | ⬜ |
| 7 | Confirm purchase creates batches with correct quantities | purchases.rs | P0 | ⬜ |
| 8 | Cancel purchase reverses batch creation | purchases.rs | P1 | ⬜ |

### Priority 3: Double-Entry Accounting Tests

| # | Test | Module | Priority | Status |
|---|------|--------|----------|--------|
| 1 | Every sale creates balanced debit+credit | pos.rs | P0 | ⬜ |
| 2 | Void sale creates reversing entries | pos.rs | P0 | ⬜ |
| 3 | Expense create: debit expense, credit cash | expenses.rs | P1 | ⬜ |
| 4 | Purchase confirm: debit stock, credit accounts_payable | purchases.rs | P1 | ⬜ |
| 5 | Customer payment: debit cash, credit accounts_receivable | customers.rs | P1 | ⬜ |
| 6 | Global trial balance: sum of all debits = sum of all credits | integration | P1 | ⬜ |

### Priority 4: Permission & License Tests

| # | Test | Module | Priority | Status |
|---|------|--------|----------|--------|
| 1 | Unpermitted user cannot create sale | guard.rs | P1 | ⬜ |
| 2 | Expired license blocks all mutations | license_guard.rs | P1 | ⬜ |
| 3 | Feature flag blocks access to gated features | license_guard.rs | P1 | ⬜ |
| 4 | Owner role has all permissions | guard.rs | P2 | ⬜ |
| 5 | Cashier role has limited permissions | guard.rs | P2 | ⬜ |

---

## Test Plan: Cloud API

### Setup Pattern

```javascript
// pms-cloud/tests/setup.js
import { query, transaction } from '../src/db.js';

const TEST_TENANT = 'test-tenant-qa';
const TEST_TOKEN = 'test-token-qa';

export async function setupTestTenant() {
  await query(`INSERT INTO tenants (id) VALUES ($1) ON CONFLICT DO NOTHING`, [TEST_TENANT]);
  await query(`INSERT INTO api_tokens (token, tenant_id, is_active) VALUES ($1, $2, true) ON CONFLICT DO NOTHING`, [TEST_TOKEN, TEST_TENANT]);
}

export async function cleanupTestTenant() {
  await query(`DELETE FROM snapshot_products WHERE tenant_id = $1`, [TEST_TENANT]);
  // ... clean all snapshot tables
}
```

### Priority 1: Sync Tests

| # | Test | Route | Priority | Status |
|---|------|-------|----------|--------|
| 1 | Push products upserts correctly | POST /v1/sync/products | P0 | ⬜ |
| 2 | Push same product twice updates (idempotent) | POST /v1/sync/products | P0 | ⬜ |
| 3 | Push with wrong token returns 403 | POST /v1/sync/products | P0 | ⬜ |
| 4 | Batch sync updates multiple tables | POST /v1/sync/batch | P1 | ⬜ |
| 5 | Sync state returns last sync per table | GET /v1/sync/state | P1 | ⬜ |
| 6 | Dashboard recomputes after sync push | POST /v1/sync/products | P1 | ⬜ |
| 7 | Tenant isolation: cannot sync to another tenant | POST /v1/sync/products | P0 | ⬜ |

### Priority 2: Auth Tests

| # | Test | Route | Priority | Status |
|---|------|-------|----------|--------|
| 1 | Activate with valid license key | POST /v1/activate | P0 | ⬜ |
| 2 | Activate with used key fails | POST /v1/activate | P0 | ⬜ |
| 3 | Login with correct credentials | POST /v1/login | P0 | ⬜ |
| 4 | Login with wrong password fails | POST /v1/login | P0 | ⬜ |
| 5 | JWT token expires correctly | GET /v1/dashboard | P1 | ⬜ |
| 6 | Admin token required for admin routes | GET /admin/tenants | P1 | ⬜ |

---

## Test Plan: Frontend

### Setup (Future — not yet configured)

Recommended stack:
- **Vitest** — unit/component tests (fast, Vite-native)
- **React Testing Library** — component interaction tests
- **Playwright** — E2E tests (cross-browser)

### Priority 1: Cart Logic Tests

| # | Test | Component | Priority | Status |
|---|------|-----------|----------|--------|
| 1 | Add product to empty cart | POS | P0 | ⬜ |
| 2 | Add same batch twice increments quantity | POS | P0 | ⬜ |
| 3 | Update quantity to 0 removes item | POS | P0 | ⬜ |
| 4 | Remove item from cart | POS | P0 | ⬜ |
| 5 | Cart total = sum of item totals | POS | P0 | ⬜ |
| 6 | Discount: flat amount reduces total | POS | P1 | ⬜ |
| 7 | Discount: percentage reduces total | POS | P1 | ⬜ |
| 8 | Split payment: cash + bank = total | POS | P1 | ⬜ |

### Priority 2: Permission Gate Tests

| # | Test | Component | Priority | Status |
|---|------|-----------|----------|--------|
| 1 | Unauthorized user sees upgrade screen | FeatureGate | P1 | ⬜ |
| 2 | Authorized user sees feature content | FeatureGate | P1 | ⬜ |
| 3 | Blocked license shows blocked screen | BlockedScreen | P1 | ⬜ |

---

## Bug Tracker

### Active Bugs

| # | Bug | Severity | Discovered | Owner | Status | Reproduction |
|---|-----|----------|------------|-------|--------|--------------|
| 1 | `batches.status` CHECK missing 'recalled' | 🔴 Critical | 2026-05-06 | Rust Dev | ⬜ | `INSERT INTO batches (..., status) VALUES (..., 'recalled')` → CHECK constraint fails |
| 2 | `stock_movements.movement_type` CHECK missing 'void_sale' and 'recall' | 🔴 Critical | 2026-05-06 | Rust Dev | ⬜ | `void_sale()` sets movement_type='void_sale' but CHECK rejects it |
| 3 | `PRAGMA foreign_keys` not enabled at runtime | 🔴 Critical | 2026-05-06 | Rust Dev | ⬜ | FK violations silently allowed — orphan rows possible |
| 4 | `create_invoice_sale` uses English errors | 🟡 Medium | 2026-05-06 | Rust Dev | ⬜ | Error messages in English while `create_sale` uses Arabic |
| 5 | POS.tsx 30+ useState race conditions | 🟡 Medium | 2026-05-06 | Frontend Dev | ⬜ | Rapid clicks can cause stale state reads |
| 6 | Cloud dashboard fallback returns zeros | 🟡 Medium | 2026-05-06 | Cloud Eng | ⬜ | low_stock, out_of_stock, expiring_soon always 0 in fallback path |
| 7 | No rate limiting on cloud login | 🔴 Critical | 2026-05-06 | Cloud Eng | ⬜ | Brute-force attack possible on /v1/login |

### Verified Fixed Bugs

| # | Bug | Fixed Date | Verified By | Notes |
|---|-----|------------|-------------|-------|
| (none yet) | | | | |

---

## Test Execution Commands

### Database Workflow Tests (Python)

```bash
cd pms-testing
python3 test_workflows.py
```

### Rust Tests (when written)

```bash
cd src-tauri
cargo test                    # All tests
cargo test --lib pos          # POS module only
cargo test -- --nocapture     # Show println! output
```

### Cloud API Tests (when written)

```bash
cd pms-cloud
npm test                      # All tests (when configured)
```

### Frontend Tests (when configured)

```bash
npm test                      # Vitest (when configured)
npx playwright test           # E2E (when configured)
```

### Build Verification

```bash
# Desktop
cd src-tauri && cargo check   # Rust compiles
cd .. && npm run build        # Frontend builds

# Cloud
cd pms-cloud && npm run dev   # API starts
```

---

## Active Tasks

| # | Task | Priority | Status | Blockers | Notes |
|---|------|----------|--------|----------|-------|
| 1 | Write Rust unit tests for FEFO resolution | P0 | ⬜ | None | Test resolve_fefo_items() with various stock scenarios |
| 2 | Write Rust unit tests for money calculations | P0 | ⬜ | None | Sale totals, void reversals, split payments |
| 3 | Write Rust integration test for create_sale | P0 | ⬜ | None | Full workflow against temp DB |
| 4 | Write Rust integration test for void_sale | P0 | ⬜ | None | Verify complete reversal |
| 5 | Write Rust integration test for create_return | P0 | ⬜ | None | Verify stock + account restoration |
| 6 | Verify CHECK constraint bugs (bugs #1, #2) | P0 | ⬜ | None | Write test that proves 'recalled' status is rejected |
| 7 | Write cloud API sync tests | P1 | ⬜ | None | Need test framework setup first |
| 8 | Write cloud API auth tests | P1 | ⬜ | None | Need test framework setup first |
| 9 | Set up Vitest for frontend | P1 | ⬜ | None | Add to package.json devDependencies |
| 10 | Write frontend cart logic tests | P1 | ⬜ | Task 9 | After Vitest is configured |
| 11 | Add test for void_sale to Python suite | P1 | ⬜ | None | Extend pms-testing |
| 12 | Add test for batch recall to Python suite | P1 | ⬜ | None | Extend pms-testing |
| 13 | Set up CI/CD test pipeline | P2 | ⬜ | External | GitHub Actions or similar |

---

## Completed Tasks

| # | Task | Date | Notes |
|---|------|------|-------|
| 1 | Database workflow test suite (146 tests) | Pre-2026 | Python + SQLite, all passing |
| 2 | Schema validation tests | Pre-2026 | 34 tests covering all tables, FKs, CHECKs |
| 3 | Full day simulation test | Pre-2026 | 10 random sales with FIFO verification |

---

## Cross-Role Requests

### To Rust Developer

| # | Request | Priority | Status | Notes |
|---|---------|----------|--------|-------|
| 1 | Fix CHECK constraints for 'recalled' and 'void_sale'/'recall' | P0 | ⬜ | Bugs #1 and #2 — data corruption risk |
| 2 | Enable PRAGMA foreign_keys = ON at connection time | P0 | ⬜ | Bug #3 — silent FK violations |
| 3 | Add `#[cfg(test)]` module to pos.rs with test_db() helper | P0 | ⬜ | Enables QA to write Rust tests |
| 4 | Standardize error language to Arabic | P1 | ⬜ | Bug #4 — create_invoice_sale uses English |

### To Frontend Developer

| # | Request | Priority | Status | Notes |
|---|---------|----------|--------|-------|
| 1 | Set up Vitest in package.json | P1 | ⬜ | Need test runner for frontend tests |
| 2 | Extract cart logic to testable function | P1 | ⬜ | Cart calculations should be pure functions |

### To Cloud Engineer

| # | Request | Priority | Status | Notes |
|---|---------|----------|--------|-------|
| 1 | Set up test framework for cloud API | P1 | ⬜ | Need runner + test DB setup |
| 2 | Add rate limiting to login endpoint | P0 | ⬜ | Bug #7 — brute-force risk |
| 3 | Fix dashboard fallback zeros | P1 | ⬜ | Bug #6 — incomplete data |

### To Project Lead

| # | Request | Priority | Status | Notes |
|---|---------|----------|--------|-------|
| 1 | Approve test infrastructure investment | P0 | ⬜ | Need time allocation for test writing |
| 2 | Define minimum test coverage for release | P1 | ⬜ | What % coverage is acceptable for v1.0? |

---

## Test Writing Guidelines

### For Rust Tests

1. **One test per behavior** — not one test per function
2. **Test name = expected behavior** — `test_sale_deducts_batch_quantity` not `test_create_sale_3`
3. **Arrange-Act-Assert** pattern
4. **Use test_db()** helper — fresh in-memory DB per test
5. **Test edge cases**: empty inputs, zero quantities, negative amounts, concurrent access
6. **Test error paths**: invalid IDs, insufficient stock, permission denied, expired license

### For Cloud API Tests

1. **Test HTTP status codes** — 200, 400, 401, 403, 404, 500
2. **Test response shape** — correct fields, correct types
3. **Test auth** — every route with missing/invalid/wrong-scope token
4. **Test idempotency** — same request twice = same result
5. **Test tenant isolation** — tenant A cannot see tenant B data

### For Frontend Tests

1. **Test user behavior** — not implementation details
2. **Use accessible queries** — `getByRole`, `getByText`, not `getByTestId`
3. **Test error states** — API failure, empty data, loading state
4. **Test RTL rendering** — verify logical property usage
5. **Mock API layer** — never call real Tauri invoke in tests

### Bug Report Template

```
## Bug: [Short Title]

**Severity**: 🔴 Critical / 🟡 Medium / 🟢 Low
**Discovered**: YYYY-MM-DD
**Module**: [pos.rs / POS.tsx / sync.js / etc.]
**Reproduction**:
1. Step one
2. Step two
3. Observed: [what happened]
4. Expected: [what should happen]

**Root Cause**: [if known]
**Fix Owner**: [Rust Dev / Frontend Dev / Cloud Eng]
```
