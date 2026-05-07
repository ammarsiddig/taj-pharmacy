# Active Lock — TAJ Pharmacy v4

> **Purpose**: Prevents two agents from working on the same files simultaneously.
> Every agent MUST update this file at session start and session end.

---

## Current Session

| Field | Value |
|-------|-------|
| **Agent Role** | _None_ |
| **Model / IDE** | _None_ |
| **Started** | _None_ |
| **Working On** | _None_ |
| **Files Being Modified** | _None_ |

---

## Task Queue

| # | Role | Task | Priority | Blocked By | Status |
|---|------|------|----------|-----------|--------|
| 1 | Rust Developer | Create `errors.rs` with typed AppError enum | 🔴 Critical | None | ⬜ |
| 2 | Rust Developer | Fix CHECK constraints: add 'recalled' to batches.status, 'void_sale'/'recall' to stock_movements.movement_type | 🔴 Critical | None | ⬜ |
| 3 | Rust Developer | Enable PRAGMA foreign_keys = ON in db/mod.rs | 🟡 Medium | None | ⬜ |
| 4 | Rust Developer | Split pos.rs (2001 lines) into 5 sub-modules | 🔴 High | #1 (typed errors first) | ⬜ |
| 5 | Rust Developer | Split settings.rs (80KB) into 4 sub-modules | 🟡 Medium | #4 (pos.rs first) | ⬜ |
| 6 | Rust Developer | Split cloud_sync.rs (68KB) into 3 sub-modules | 🟡 Medium | #5 | ⬜ |
| 7 | Rust Developer | Split purchases.rs (59KB) into 4 sub-modules | 🟡 Medium | #6 | ⬜ |
| 8 | Rust Developer | Unify create_invoice_sale error messages to Arabic | 🟡 Medium | #4 (after pos_invoice.rs split) | ⬜ |
| 9 | Frontend Dev | Refactor POS.tsx (1209 lines) to useReducer | 🟡 Medium | None | ⬜ |
| 10 | Frontend Dev | Split POS.tsx into sub-components | 🟡 Medium | #9 (reducer first) | ⬜ |
| 11 | Frontend Dev | Split Reports.tsx (51KB) into sub-components | 🟡 Medium | #10 | ⬜ |
| 12 | Frontend Dev | Split Products.tsx (43KB) into sub-components | 🟡 Medium | #11 | ⬜ |
| 13 | Frontend Dev | Delete orphan files: Assets.tsx, PharmacySwitcher.tsx, unused settings tabs | 🟢 Low | None | ⬜ |
| 14 | UI/UX Designer | Replace remaining hardcoded hex values in 4 files | 🟡 Medium | None | ⬜ |
| 15 | UI/UX Designer | Create StyleGuide.tsx dev-only page | 🟡 Medium | None | ⬜ |
| 16 | UI/UX Designer | Audit POS accessibility (ARIA, focus trap, contrast) | 🟡 Medium | #10 (after POS refactor) | ⬜ |
| 17 | Cloud Engineer | Add zod input validation to all API routes | 🟡 Medium | None | ⬜ |
| 18 | Cloud Engineer | Add express-rate-limit to sync/auth endpoints | 🟡 Medium | None | ⬜ |
| 19 | Cloud Engineer | Move secrets from AGENT-HANDOFF.md to .env | 🔴 High | None | ⬜ |
| 20 | QA Engineer | Write Rust unit tests for resolve_fefo_items | 🔴 Critical | #4 (after pos.rs split) | ⬜ |
| 21 | QA Engineer | Write Rust unit tests for create_sale + void_sale | 🔴 Critical | #4 | ⬜ |
| 22 | QA Engineer | Write integration tests for full sale lifecycle | 🔴 Critical | #4 | ⬜ |
| 23 | QA Engineer | Write cloud API tests with supertest | 🟡 Medium | #17 (after zod validation) | ⬜ |
| 24 | Project Lead | Set up GitHub Actions CI/CD pipeline | 🔴 High | #1, #20 (need tests first) | ⬜ |

---

## Lock Rules

1. **Only ONE agent active at a time** unless working on completely independent files (e.g., UI/UX Designer on CSS while Rust Developer on backend).
2. **Before starting**: Update "Current Session" with your role, model, and task. Check the queue for blockers.
3. **During work**: If you discover you need to modify files another agent owns, STOP. Add a "Blocked By" entry to the queue and note it in your role file.
4. **After finishing**: Clear "Current Session", update queue (flip ⬜→✅), append to `_WORK-LOG.md`, update your role file.
5. **If interrupted**: If your session ends unexpectedly, the "Current Session" will show stale data. The next agent should check the timestamp — if older than 2 hours, assume the session ended and clear it.

---

## Cross-Role Request Protocol

When an agent needs a change in another agent's territory:

1. Add a task to the queue with the appropriate role and a "Blocked By" noting who requested it
2. Add a note in YOUR role file under "Pending Cross-Role Requests"
3. The requested agent picks it up in their next session

Example: If Rust Developer needs a new TypeScript type added:
- Add to queue: `| # | Frontend Dev | Add SalePaymentInput type to types/pos.ts | Medium | Requested by Rust Dev (Session 043) | ⬜ |`
- Note in `RUST-DEVELOPER.md`: "Requested Frontend Dev to add SalePaymentInput type"
