# TAJ Pharmacy v4 — HANDOFF

> **Single source of truth for all work on this repository.**
> Read this entire document before making any changes.
> Update it in the same commit as any code change.

| Field | Value |
| --- | --- |
| Product name | **TAJ Pharmacy** (repo folder name is `pms-pharmacy-v4` — do not confuse) |
| Production domain | `taj.systems` (Owner PWA), `taj.systems/mgmt` (Admin PWA) |
| Current phase | **Phase 0 — Stop Silent Data Loss** |
| Last updated | 2026-05-15 |
| Curator (planning) | Claude Code (Opus) — owns sections 0–4 |
| Implementers (code) | Cascade (Windsurf), DeepSeek V4 (OpenCode), or any future agent |
| Source of truth for gaps | 2026-05-15 deep audit (48-item Master Gap List) |

---

## 0. READ-FIRST RULES

### 0.1 How to use this document

1. **Read sections 0, 1, and the active phase (2) before touching code.** Skim section 3 to find a task.
2. **Pick exactly one task from section 3 with `Status: OPEN`.** Set its status to `IN-PROGRESS` and write your agent name in `Owner`.
3. **Do only what the task spec describes.** If you find related issues, do NOT fix them in the same task. Add a one-line note in section 4 (Backlog) instead.
4. **When done, append a Worklog entry to section 5** (top of the worklog, newest first), then set the task status to `DONE`.
5. **Commit the code change AND the HANDOFF update together** in one commit. The HANDOFF is part of the change.
6. **One task at a time.** Do not start a second task until the first is DONE or BLOCKED.

### 0.2 Hard rules (non-negotiable)

- **Never commit secrets.** No JWT keys, no passwords, no API tokens, no VPS IPs. If you find one already committed, mark the task BLOCKED and write a note in section 4. Do not push a "fix" that adds the secret again under a different name.
- **Never bypass git hooks.** No `--no-verify`. If a hook fails, fix the underlying issue.
- **Never use destructive git commands without an explicit task instructing you to.** No `git push --force`, no `git reset --hard`, no `git rebase -i`, no `git filter-repo`. These are scheduled in Phase 4 with their own dedicated specs.
- **Never edit another task's spec or any Worklog entry that isn't yours.** The Worklog is append-only history. If a previous task was wrong, open a new task that supersedes it.
- **Never modify files outside the task's declared scope.** If the spec says "edit `pms-cloud/src/routes/dashboard.js` line 489", do not also reformat the file, do not also rename variables, do not also add comments elsewhere. Drift makes code review impossible.
- **Always run the acceptance test in the task spec before marking DONE.** If the test passes locally but you suspect it's a false positive, mark BLOCKED with a note. Do not mark DONE if you are not sure.
- **If the task seems wrong, impossible, or out of date — do not invent an alternative.** Set status to `BLOCKED`, write what you found in section 5 (worklog), and stop. The curator (Opus) will rewrite the task.
- **Pull `main` (or the active branch) before starting a task.** Stale starting points cause merge conflicts.

### 0.3 Status taxonomy

| Status | Meaning |
| --- | --- |
| `OPEN` | Nobody is working on it. Free to pick up. |
| `IN-PROGRESS` | An agent has claimed it. Owner field filled. Do not pick up. |
| `BLOCKED` | Cannot proceed. See the worklog entry for why. Curator must unblock. |
| `DONE` | Code merged, acceptance test passed, worklog entry written. |

### 0.4 Worklog entry format (mandatory)

Every completed or blocked task gets a worklog entry. Append at the **top** of section 5. Template:

```
### YYYY-MM-DD — <agent name> — TASK-NNN
- **Status:** DONE | BLOCKED
- **Files changed:** path/to/file.ext (lines X-Y), other/file.ext
- **Acceptance test result:** <what command was run, what output proved success>
- **Notes:** <anything the curator should know — surprises, edge cases, follow-ups>
```

### 0.5 Out of scope — never set up

These were removed in TASK-000 and must not be reintroduced:

- n8n workflows / mesh routing / OpenRouter routers
- `.ai/` folder, `MODEL_ROUTER.yaml`, `USAGE_STATE.json`, agent locks
- Multi-agent skill packs, agent role docs (`docs/agents/*`)
- `AGENTS.md`, `.cursorrules`, `.windsurfrules`, GitHub Copilot instructions
- Any "AI development infrastructure" doc that exposes how the project is built

If a task seems to require any of the above, mark it BLOCKED.

---

## 1. PROJECT CONTEXT

### 1.1 What this is

TAJ Pharmacy v4 is a SaaS pharmacy management system. Target market: independent pharmacies in an Arabic-first market (Sudan-based, currency SDG). Users are pharmacists and their employees — **non-technical**. The system is managed end-to-end by one developer. Repo folder is named `pms-pharmacy-v4` for historical reasons; the customer-facing product is "TAJ Pharmacy".

### 1.2 Three surfaces

| Surface | Tech | Role |
| --- | --- | --- |
| **Desktop** | Tauri + React (TS) frontend, Rust backend, local SQLite | Authoritative data store. Pharmacist works here all day. Must work offline. |
| **Cloud API** | Node.js + Express, PostgreSQL, single VPS | Read-mirror of desktop data (snapshot tables). Hosts billing/license control plane and serves the PWA. |
| **Owner PWA** | React, served by cloud | Pharmacy owner views their data remotely (e.g. from phone). Read-only. |
| **Admin PWA** | React, same codebase as Owner PWA, different routes | The developer manages all tenants from here. |

### 1.3 Sync model

- **One-way push:** Desktop → Cloud. Desktop is authoritative.
- **Snapshot tables on cloud:** Each desktop table has a `snapshot_*` table on the cloud. Sync upserts snapshots; cloud is a read-replica.
- **Dashboard recompute:** After each sync, a fire-and-forget recompute updates `dashboard_summaries`.
- **No pull yet:** A new desktop install cannot recover data from cloud. (This gap is fixed in Phase 3.)

### 1.4 Critical files map

| Concern | Path |
| --- | --- |
| Desktop UI pages | `src/pages/` |
| Desktop reusable components | `src/components/` |
| Desktop API layer (sole `invoke()` caller) | `src/api/index.ts` |
| Desktop shared TS types | `src/types/index.ts` |
| Desktop i18n | `src/i18n/ar.json` + `src/i18n/en.json` (must keep parity) |
| Desktop Rust commands (POS, accounts, etc.) | `src-tauri/src/commands/` |
| Desktop Rust command registration | `src-tauri/src/lib.rs` |
| Desktop SQLite migrations | `src-tauri/src/db/migrations.rs` |
| Desktop seed data | `src-tauri/src/db/seed.rs` |
| Desktop cloud-sync logic | `src-tauri/src/commands/cloud_sync_snapshot.rs` |
| Desktop license/grace logic | `src-tauri/src/license_guard.rs` (**read-only — never modify**) |
| Cloud API entry | `pms-cloud/src/index.js` |
| Cloud API routes | `pms-cloud/src/routes/` (auth, admin, sync, dashboard, backups) |
| Cloud DB migrations | `pms-cloud/migrations/*.sql` |
| Cloud test schema | `pms-testing/schema.sql` (diverges from real schema — see audit item 31) |
| PWA (owner + admin) | `pms-cloud/web/src/pages/` |
| PWA API client | `pms-cloud/web/src/api.ts` |
| Deployment scripts | `pms-cloud/deploy.ps1`, `pms-cloud/setup-vps.sh`, `pms-cloud/Caddyfile`, `pms-cloud/docker-compose.yml` |

### 1.5 Environment variables (required at runtime)

| Variable | Used in | Purpose |
| --- | --- | --- |
| `PMS_JWT_SECRET` | `pms-cloud/src/routes/auth.js`, `pms-cloud/src/auth.js` | JWT signing. **No fallback after Phase 2 — startup must fail if missing.** |
| `PGPASSWORD` | `pms-cloud/src/db.js` | PostgreSQL password. **No fallback after Phase 2.** |
| `PMS_ADMIN_TOKEN` | `pms-cloud/src/routes/admin.js` | Admin panel auth |
| `PMS_DB_HOST`, `PMS_DB_USER`, `PMS_DB_NAME` | `pms-cloud/src/db.js` | DB connection |

Desktop currently has a hardcoded HMAC secret in `src-tauri/src/commands/auth.rs:15`. Fixed in Phase 2 (`TASK-202`).

### 1.6 Build & test commands

| What | Command (run from repo root) |
| --- | --- |
| Desktop dev | `pnpm tauri dev` |
| Desktop build | `pnpm tauri build` |
| Desktop Rust check | `cd src-tauri && cargo check` |
| Cloud API dev | `cd pms-cloud && npm run dev` |
| Cloud API tests | `cd pms-cloud && npm test` |
| PWA dev | `cd pms-cloud/web && npm run dev` |
| PWA build | `cd pms-cloud/web && npm run build` |
| Deploy cloud | `cd pms-cloud && .\deploy.ps1` (Windows PowerShell) |

If any of these don't work as written, that's its own task — open a BLOCKED entry, don't guess.

### 1.7 Project conventions (READ BEFORE CODING)

These conventions are non-negotiable. Violating them creates inconsistency that compounds across the codebase.

#### Money
- **Stored as integer piasters** (×100 of the SDG amount). Never store as float.
- **Displayed via `api.formatMoney()`** which formats as `1,250.00 SDG`.
- **Never hardcode `"SDG"` in code.** Use `t('common.currency')` in desktop, the equivalent inline string in PWA.

#### Internationalization (i18n)
- **Desktop uses `react-i18next`.** Add every new key to BOTH `src/i18n/ar.json` AND `src/i18n/en.json`. Missing one breaks the app for that language.
- **PWA has NO i18n library.** Arabic strings are inline in components. This is intentional — do not introduce i18next in PWA.
- **RTL is the default.** Arabic-first layout.

#### UI styling
- **Logical Tailwind properties only.** Use `ms-*` / `me-*` / `ps-*` / `pe-*` / `rounded-s-*` / `rounded-e-*`. Never `ml-*` / `mr-*` / `pl-*` / `pr-*` / `right-*` / `left-*`. Audit item 48 catalogs the existing violations to be fixed in Phase 5.
- **Brand palette** (do not introduce new colors without curator approval):
  - Primary action: `bg-primary-500` = `#0FA3A6` (Pharmacy Teal)
  - Navigation: `bg-[#1C5F6F]` (Core Brand Teal)
  - Text: `text-ink-main` = `#0D2023`, `text-ink-muted` = `#3D6567`
  - Border: `border-ivory-border` = `#D3E8E9`
  - Surfaces: `app-card`, `app-panel` utility classes
  - Brand token scale: `brand-*`
- **PWA shares CSS variables with desktop** (`var(--color-primary-600)` etc.). Do not duplicate color definitions.

#### Architecture
- **`src/api/index.ts` is the ONLY layer that calls Tauri `invoke()`.** No page or component invokes directly.
- **`src/types/index.ts` is the ONLY place for shared TS types.** No per-page type duplication.
- **`src-tauri/src/commands/` = thin handlers.** Max 20 lines of business logic per command. Push real logic into `src-tauri/src/models/` (domain) or `src-tauri/src/db/` (data).
- **`src-tauri/src/db/` is the ONLY layer with raw SQL.** Commands and models do not embed SQL.
- **Register every new Rust command in `src-tauri/src/lib.rs`.** Tauri will not see it otherwise.

#### Database migrations
- **Additive only.** Never `DROP COLUMN`, never `DROP TABLE`, never `ALTER COLUMN` in a way that loses data.
- **Use `ensure_column()` for adding columns**, `CREATE TABLE IF NOT EXISTS` for new tables.
- **Location:** `src-tauri/src/db/migrations.rs`, before the final `log::info!` line in the migrations function.
- If a destructive change is truly needed, mark the task BLOCKED and tell the curator. Do not improvise.

#### Tenant & branch IDs
- **New installs get UUID tenant/branch IDs at onboarding.** Generated in `src-tauri/src/db/seed.rs`.
- **Legacy installs may have `default-tenant` / `main-branch`.** Backward compatibility is required.
- **Always read via `getTenantId()` / `getBranchId()` in TS, equivalent in Rust.** Never hardcode the ID literal.

#### Code quality limits
- **Max file length: 800 lines.** Split if larger.
- **Max function length: 50 lines.** Refactor if larger.
- **Max nesting: 4 levels.** Extract helpers.
- **No `console.log` in production code.** Use `log::info!` / `log::error!` in Rust; a real logger or remove in TS.
- **No `any` in TypeScript.** If genuinely needed, write `unknown` and narrow with type guards.

#### Hard safety rules (in addition to section 0.2)
- **Never modify `license_guard.rs`.** Grace-period and expiry logic lives here. Changes risk locking out paying customers.
- **Never bypass `FLAG_*` feature-flag checks** scattered through the desktop code.
- **Never delete DB columns or tables** (see migrations rule).

#### Adding a new desktop feature — order of operations
1. **Database** — add migration in `src-tauri/src/db/migrations.rs`, run `cd src-tauri && cargo check`
2. **Rust command** — write in `src-tauri/src/commands/<name>.rs`, register in `src-tauri/src/lib.rs`, `cargo check`
3. **TS types** — add to `src/types/index.ts`
4. **API wrapper** — add in `src/api/` and re-export from `src/api/index.ts`
5. **UI** — page in `src/pages/` or component in `src/components/`
6. **i18n** — add keys to both `src/i18n/ar.json` AND `src/i18n/en.json`

#### Adding a new cloud feature — order of operations
1. **API endpoint** — add route in `pms-cloud/src/routes/`
2. **DB migration** if schema change — `pms-cloud/migrations/<NNN>_name.sql`
3. **PWA types** — `pms-cloud/web/src/api.ts`
4. **PWA page** — `pms-cloud/web/src/pages/`
5. **Deploy** — `cd pms-cloud && .\deploy.ps1` (only with curator approval — production deploys are not a routine task)

---

## 2. CURRENT PHASE

### Phase 0 — Stop Silent Data Loss

**Goal:** Fix bugs where data is being silently lost or features are silently broken, with no error visible to the pharmacist.

**Why this phase first:** Every other phase can wait. These bugs are losing customer data **today** in any pharmacy that is using the system. A pharmacy paying for the service is currently not getting some of what they're paying for, and won't know until they audit their own records.

**Done when:**
- All Phase 0 tasks (TASK-000 through TASK-007) are `DONE`
- `customer_payments`, `supplier_payments`, `sale_payments`, and `account_transactions` are verified to reach the cloud
- `GET /v1/accounts` returns rows for an authenticated tenant
- A `pg_dump` snapshot of the cloud database exists in offsite storage and is restorable
- The repo no longer tracks AI agent infrastructure files

**Estimated effort:** 3–5 days for one agent working full-time, or 1–2 weeks across multiple agents working on their own pace.

**After Phase 0:** Curator (Opus) will write Phase 1 (Lock Money Paths) into section 3.

---

## 3. ACTIVE TASKS

### TASK-000 — Remove AI agent mesh artifacts and stale planning docs

| Field | Value |
| --- | --- |
| Severity | High (visibility / professionalism) |
| Audit ref | Item 29 |
| Owner | Claude Code (Opus) |
| Status | DONE (2026-05-15) |
| Estimated effort | 45 minutes |
| Depends on | — |

**Problem.** The repository currently exposes the AI development workflow in three forms:

1. **18 AI-mesh files tracked in git** — visible to anyone browsing the repo on GitHub
2. **Stale planning/handoff files on disk** (some staged for deletion, some untracked junk) — confuse future agents who read them instead of HANDOFF.md
3. **Useful product docs mixed in with junk** — the installation guide must be preserved and properly tracked

Per the working agreement, all work is coordinated through HANDOFF.md only. The conventions that were valuable in the old `docs/AGENT-HANDOFF.md` have been extracted into section 1.7 of this document. The remaining content (3,000+ lines of archived session logs, outdated priority queues, etc.) is the "faulty history" that the project owner explicitly flagged as misleading.

#### Files to handle

**Group A — tracked AI files to remove from git tracking** (verified with `git ls-files` on 2026-05-15):

```
.ai/MEMORY.md
.ai/MODEL_ROUTER.yaml
.ai/USAGE_STATE.example.json
.ai/locks/active-locks.example.json
.ai/reports/README.md
.ai/reviews/README.md
.github/copilot-instructions.md
docs/agents/CLOUD-ENGINEER.md
docs/agents/FRONTEND-DEVELOPER.md
docs/agents/PROJECT-LEAD.md
docs/agents/QA-ENGINEER.md
docs/agents/RUST-DEVELOPER.md
docs/agents/UI-UX-DESIGNER.md
docs/agents/_ACTIVE-LOCK.md
docs/agents/_WORK-LOG.md
docs/ai-agent-mesh-operational-contract.md
docs/ai-agent-mesh-v0.md
src-tauri/cargo_err.txt
```

**Group B — on-disk files to delete (mix of tracked and untracked):**

```
docs/AGENT-HANDOFF.md                      # 3028 lines, conventions extracted into HANDOFF.md §1.7 (staged for deletion already)
docs/ai-agent-mesh-operating-model.md      # staged for deletion already
docs/DASHBOARD-REDESIGN-PLAN.md            # 244-line UI spec — tracked in git, owner decision 2026-05-15: delete (pre-audit, wrong product name)
docs/archive/                              # whole folder — duplicate AI mesh files, never tracked
docs/launch/README.md                      # broken cross-references to non-existent files
```

**Group C — files to PRESERVE and add to git tracking:**

```
docs/launch/INSTALLATION-GUIDE.md          # Real TAJ Pharmacy installation guide for pharmacists. Currently UNTRACKED — must be added.
```

#### Fix — Step 1: Remove tracked files from git index

From repo root in PowerShell. This removes Group A AND the tracked file in Group B (`docs/DASHBOARD-REDESIGN-PLAN.md`):

```powershell
git rm --cached `
  .ai/MEMORY.md `
  .ai/MODEL_ROUTER.yaml `
  .ai/USAGE_STATE.example.json `
  .ai/locks/active-locks.example.json `
  .ai/reports/README.md `
  .ai/reviews/README.md `
  .github/copilot-instructions.md `
  docs/agents/CLOUD-ENGINEER.md `
  docs/agents/FRONTEND-DEVELOPER.md `
  docs/agents/PROJECT-LEAD.md `
  docs/agents/QA-ENGINEER.md `
  docs/agents/RUST-DEVELOPER.md `
  docs/agents/UI-UX-DESIGNER.md `
  docs/agents/_ACTIVE-LOCK.md `
  docs/agents/_WORK-LOG.md `
  docs/ai-agent-mesh-operational-contract.md `
  docs/ai-agent-mesh-v0.md `
  docs/DASHBOARD-REDESIGN-PLAN.md `
  src-tauri/cargo_err.txt
```

#### Fix — Step 2: Delete all junk from disk

```powershell
Remove-Item -Recurse -Force .ai
Remove-Item -Recurse -Force docs/agents
Remove-Item -Recurse -Force docs/archive
Remove-Item .github/copilot-instructions.md
Remove-Item docs/ai-agent-mesh-operational-contract.md
Remove-Item docs/ai-agent-mesh-v0.md
Remove-Item docs/ai-agent-mesh-operating-model.md
Remove-Item docs/AGENT-HANDOFF.md
Remove-Item docs/DASHBOARD-REDESIGN-PLAN.md
Remove-Item docs/launch/README.md
Remove-Item src-tauri/cargo_err.txt
```

#### Fix — Step 3: Add Group C to git tracking

```powershell
git add docs/launch/INSTALLATION-GUIDE.md
```

#### Fix — Step 4: Update `.gitignore`

Append the following block at the bottom of `.gitignore` (do not duplicate any entries that already exist — check first with `Get-Content .gitignore | Select-String "<entry>"`):

```
# AI development infrastructure (must not be tracked)
.ai/
.agents/
docs/agents/
docs/archive/
.cursorrules
.windsurfrules
AGENTS.md
.github/copilot-instructions.md
docs/ai-agent-mesh-*.md
docs/AGENT-HANDOFF.md

# Old launch infra (broken cross-references)
docs/launch/README.md
docs/LAUNCH-PLAN.md
docs/launch/STAGE-TEMPLATE.md

# n8n / mesh routing (never reintroduce)
n8n-workflows/
n8nac-config.json

# Local build/debug artifacts
src-tauri/cargo_err.txt
Thumbs.db
.claude/
build/
```

#### IMPORTANT — what this task does NOT do

- **Does not rewrite git history.** The deleted files remain in past commits and are visible by browsing the GitHub commits view. History rewrite is **Phase 4 TASK-400**, scheduled separately.
- **Does not delete the stale `infra/ai-agent-mesh-v0-*` branches.** Branch cleanup is **Phase 4 TASK-401**.
- **Does not touch `docs/DASHBOARD-REDESIGN-PLAN.md`.** See backlog item B5-9; decision pending curator review.

#### Acceptance test

```powershell
# 1. No AI mesh artifacts in tracked files
git ls-files | Select-String -Pattern "(\.ai/|docs/agents/|copilot-instructions|ai-agent-mesh|cargo_err)"
# Expected: zero matches

# 2. None of the deleted files exist on disk
Test-Path docs/AGENT-HANDOFF.md, docs/archive, docs/launch/README.md, .ai, docs/agents, docs/DASHBOARD-REDESIGN-PLAN.md
# Expected: all False

# 3. Installation guide is preserved AND tracked
Test-Path docs/launch/INSTALLATION-GUIDE.md
# Expected: True
git ls-files docs/launch/
# Expected: docs/launch/INSTALLATION-GUIDE.md appears in output

# 4. .gitignore contains the new ignore block
Get-Content .gitignore | Select-String -Pattern "^\.ai/$"
# Expected: 1 match

# 5. Repository status is clean of new junk
git status --short
# Expected: shows the staged deletions and the new docs/launch/INSTALLATION-GUIDE.md addition, nothing else surprising
```

**Worklog requirement.** Record:
- Exact files removed (Groups A and B)
- Confirmation that `docs/launch/INSTALLATION-GUIDE.md` is now tracked
- Confirmation that all 5 acceptance steps pass
- Any unexpected files encountered during cleanup

---

### TASK-001 — Fix `/v1/accounts` tenant_id typo

| Field | Value |
| --- | --- |
| Severity | Critical |
| Audit ref | Item 10 |
| Owner | (unassigned) |
| Status | OPEN |
| Estimated effort | 5 minutes |
| Depends on | — |

**Problem.** The `GET /v1/accounts` endpoint uses `req.tenant_id` (snake_case) instead of `req.tenantId` (camelCase, the convention used by the auth middleware). The variable `req.tenant_id` is always undefined, so the SQL query returns zero rows for every authenticated tenant. Owner PWA users see an empty Accounts page and assume the data is not yet synced — but it is, the query just can't find it.

**File.** `pms-cloud/src/routes/dashboard.js` around line 489.

**Current code (approximate — verify before editing):**

```js
const tenantId = req.tenant_id;  // BUG: should be req.tenantId
const result = await pool.query(
  'SELECT ... FROM snapshot_accounts WHERE tenant_id = $1 ...',
  [tenantId]
);
```

**Fix.** Change `req.tenant_id` to `req.tenantId` on the one line. Do not touch anything else in the file.

**Search for similar typos.** Grep the entire `pms-cloud/src/routes/` folder for `req.tenant_id` (underscore). If any other route uses the snake_case version, those are also bugs. Fix all of them in this same task and list each one in the worklog. Do **not** change the auth middleware itself — `req.tenantId` (camelCase) is the established convention.

```powershell
# Find all occurrences
Select-String -Path pms-cloud/src/routes/*.js -Pattern "req\.tenant_id"
```

**Acceptance test.**

```powershell
# After fix, start cloud API and call the endpoint as an authenticated tenant
# (requires a real sync token — get one from the admin panel or from a tenant's tokens table)
$token = "<tenant-sync-token>"
curl -H "Authorization: Bearer $token" http://localhost:3000/v1/accounts

# Expected: returns a JSON array of accounts (may be empty if no accounts synced yet, 
# but should NOT be a {} or a server error). Status code 200.
```

**Verification.** Open the Owner PWA logged in as the same tenant, navigate to the Accounts page, and confirm the synced accounts now appear.

---

### TASK-002 — Fix sync queries that reference non-existent `deleted_at` column

| Field | Value |
| --- | --- |
| Severity | Critical |
| Audit ref | Item 12 |
| Owner | (unassigned) |
| Status | OPEN |
| Estimated effort | 30 minutes |
| Depends on | — |

**Problem.** Three sync queries filter on `cp.deleted_at IS NULL` / equivalent, but the tables `customer_payments`, `supplier_payments`, and `sale_payments` do not have a `deleted_at` column in the desktop SQLite schema. The queries fail at runtime, so these three tables **never sync to the cloud.** The pharmacy owner sees an empty payment history on the PWA but has no error message.

**File.** `src-tauri/src/commands/cloud_sync_snapshot.rs` — the three queries are around lines 426, 435, and 443. Verify line numbers before editing (file may have changed).

**Fix — two valid options. Pick the simpler one (option A) unless soft-delete of these tables is a near-term requirement.**

**Option A — recommended: remove the `deleted_at IS NULL` filter from the three queries.**
- Pro: minimal change, immediate fix, no schema migration.
- Con: if soft-delete is later added to these tables, the filter has to be added back.
- Steps: in each of the three queries, delete the `AND <alias>.deleted_at IS NULL` clause. Confirm the query is otherwise valid SQLite.

**Option B — add `deleted_at` columns via a new migration.**
- Pro: consistent with other tables that already have `deleted_at`.
- Con: requires a migration file in `src-tauri/src/migrations.rs`, requires sync upserts to also set `deleted_at`, increases scope.
- Steps: add a new migration that runs `ALTER TABLE customer_payments ADD COLUMN deleted_at TEXT;` (and same for the other two tables). Do not modify existing migrations.

**Acceptance test.**

```powershell
# 1. Open desktop app, create a customer payment, supplier payment, and sale payment
# 2. Trigger a sync (Settings → Cloud Sync → Sync Now)
# 3. On the cloud side:
psql -U pms -d pms -c "SELECT COUNT(*) FROM snapshot_customer_payments WHERE tenant_id = '<your-tenant-id>';"
psql -U pms -d pms -c "SELECT COUNT(*) FROM snapshot_supplier_payments WHERE tenant_id = '<your-tenant-id>';"
psql -U pms -d pms -c "SELECT COUNT(*) FROM snapshot_sale_payments WHERE tenant_id = '<your-tenant-id>';"
# Expected: count > 0 for each, matching the desktop counts.
```

**Note.** TASK-003 also touches `cloud_sync_snapshot.rs` for `customer_payments`. Do TASK-002 first, then TASK-003 will be easier because the query is already loading without filter errors.

---

### TASK-003 — Fix `customer_payments` sync joining on non-existent `sale_id`

| Field | Value |
| --- | --- |
| Severity | Critical |
| Audit ref | Item 13 |
| Owner | (unassigned) |
| Status | OPEN |
| Estimated effort | 30 minutes |
| Depends on | TASK-002 (same file, do in order) |

**Problem.** The `customer_payments` sync query at `src-tauri/src/commands/cloud_sync_snapshot.rs` around line 428–436 joins on `cp.sale_id`. The desktop `customer_payments` table does not have a `sale_id` column. The query fails at runtime — even after TASK-002 removes the `deleted_at` filter, this join will still fail.

**Investigation step (do this first).**

```powershell
# Confirm what columns customer_payments actually has on desktop
# Run from the app, or open the SQLite file with a viewer:
# Expected columns include: id, customer_id, amount, payment_method, account_id, created_at, ... 
# but probably NOT sale_id.
```

Also check `migrations.rs` for the `CREATE TABLE customer_payments` statement to confirm the schema.

**Fix.** Two valid paths depending on what the intent was:

**Option A — the join is a leftover and should be removed.** If `customer_payments` is meant to be a stand-alone payment record (not tied to a specific sale), remove the `JOIN ... ON cp.sale_id` and select only columns that exist on `customer_payments` itself. This is most likely correct based on the table's purpose (recording any customer payment, including against opening balance).

**Option B — `sale_id` was intended to exist.** If product design requires linking each customer payment to a specific sale, add `sale_id` as a nullable column via a new migration and update payment-creation flows to set it. **This is out of scope for Phase 0.** If you believe Option B is correct, mark this task BLOCKED and add a note — the curator will reschedule it for Phase 1.

**Acceptance test.** Same as TASK-002 — verify `snapshot_customer_payments` receives rows after the next sync.

---

### TASK-004 — Fix `account_transactions` sync UPSERT column mismatch

| Field | Value |
| --- | --- |
| Severity | Critical |
| Audit ref | Item 32 |
| Owner | (unassigned) |
| Status | OPEN |
| Estimated effort | 20 minutes |
| Depends on | — |

**Problem.** The `account_transactions` sync on the cloud side declares `branch_id` in the `ON CONFLICT` clause but not in the `INSERT INTO ... (columns)` list. The UPSERT fails because the conflict resolution refers to a column that wasn't being inserted.

**File.** `pms-cloud/src/routes/sync.js` around line 158. Verify before editing.

**Fix.** Either add `branch_id` to the INSERT column list (and ensure the desktop payload includes it), or remove `branch_id` from the `ON CONFLICT` clause (if branch is not part of the account_transactions identity). Check what the desktop payload actually sends — read `src-tauri/src/commands/cloud_sync_snapshot.rs` for the `account_transactions` table to see which columns are pushed. Match the cloud UPSERT to the payload.

**Acceptance test.**

```powershell
# 1. Open desktop, record an account transaction (deposit/correction/transfer)
# 2. Sync
# 3. On cloud:
psql -U pms -d pms -c "SELECT COUNT(*) FROM snapshot_account_transactions WHERE tenant_id = '<your-tenant-id>';"
# Expected: count matches desktop count
```

---

### TASK-005 — Fix sync delete placeholder off-by-one

| Field | Value |
| --- | --- |
| Severity | Critical |
| Audit ref | Item 11 |
| Owner | (unassigned) |
| Status | OPEN |
| Estimated effort | 20 minutes |
| Depends on | — |

**Problem.** In `pms-cloud/src/routes/sync.js` around lines 226 and 343, the deleted-IDs `DELETE` query uses parameter placeholders starting at `$4`, but the first deleted-ID in the parameter array is at `$3`. The off-by-one causes the DELETE to either error or silently fail. Soft-deletes from the desktop are not reflected on the cloud — deleted records reappear on the dashboard.

**File.** `pms-cloud/src/routes/sync.js` lines 226, 343.

**Fix.** Read both query blocks carefully. Count the parameters being passed in the `pool.query(sql, [params])` call and confirm the placeholders in the SQL string match. Adjust the placeholder numbering or the parameter array so the deleted-IDs line up correctly. Both occurrences likely have the same bug — fix both.

**Acceptance test.**

```powershell
# 1. On desktop, create a product, sync, confirm it appears on cloud
psql -U pms -d pms -c "SELECT id, is_active FROM snapshot_products WHERE tenant_id = '<id>' AND id = '<product-id>';"
# 2. On desktop, soft-delete the same product (deactivate it), sync
# 3. On cloud, confirm is_active is now false:
psql -U pms -d pms -c "SELECT id, is_active FROM snapshot_products WHERE tenant_id = '<id>' AND id = '<product-id>';"
# Expected: is_active = false
```

---

### TASK-006 — Add daily PostgreSQL backup with offsite copy

| Field | Value |
| --- | --- |
| Severity | Critical |
| Audit ref | Item 15 |
| Owner | (unassigned) |
| Status | OPEN |
| Estimated effort | 2–3 hours |
| Depends on | — |

**Problem.** No PostgreSQL backup exists. No `pg_dump`, no cron, no offsite copy. A single disk failure on the VPS destroys every tenant's cloud data and every backup file (because tenant-uploaded backups live on the same disk in `/data/backups/`). For a SaaS, this is unrecoverable for both you and your customers.

**Fix (proposed — agent may adjust based on what's installed on the VPS, but the end state must be: daily pg_dump, retained for 14 days locally, copied to offsite storage).**

**Step 1 — write a backup script on the VPS at `/opt/pms/backup-postgres.sh`:**

```bash
#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR=/var/backups/pms-postgres
RETAIN_DAYS=14

mkdir -p "$BACKUP_DIR"

# Dump (use pg_dump from inside the postgres container if running in docker)
docker exec pms-postgres pg_dump -U pms -Fc pms \
  > "$BACKUP_DIR/pms-$TIMESTAMP.dump"

# Also dump tenant-uploaded backup files
tar czf "$BACKUP_DIR/pms-files-$TIMESTAMP.tar.gz" -C /data backups

# Prune old local backups
find "$BACKUP_DIR" -name "pms-*" -mtime +$RETAIN_DAYS -delete

# Offsite copy via rclone (configure once with `rclone config` — backend choice 
# left to the implementer; B2, R2, or any S3-compatible bucket works)
rclone copy "$BACKUP_DIR" remote:pms-postgres-backups/ --include "pms-*$TIMESTAMP*"
```

**Step 2 — install rclone on the VPS** and configure a remote pointing at a free-tier B2 (10GB free) or Cloudflare R2 bucket. Store the rclone config in `/root/.config/rclone/rclone.conf` (root-only readable). Do **not** check rclone config into git.

**Step 3 — add a cron entry** (`crontab -e` as root):

```cron
0 3 * * * /opt/pms/backup-postgres.sh >> /var/log/pms-backup.log 2>&1
```

**Step 4 — write a one-page restore runbook** at `pms-cloud/docs/RESTORE.md` (the only doc file we add in Phase 0):

```markdown
# Cloud Database Restore Runbook

## Restore most recent backup
1. SSH to the VPS as root
2. Stop the API: `docker compose stop pms-api`
3. Find newest dump: `ls -lt /var/backups/pms-postgres/pms-*.dump | head -1`
4. Restore: `cat <dump> | docker exec -i pms-postgres pg_restore -U pms -d pms --clean --if-exists`
5. Restore tenant backup files: `tar xzf <tar.gz> -C /data`
6. Restart API: `docker compose start pms-api`
7. Verify: `curl https://<your-domain>/health`

## Restore from offsite
1. `rclone copy remote:pms-postgres-backups/<filename> /tmp/`
2. Follow steps above with `/tmp/<filename>`
```

**Acceptance test.**

```bash
# 1. Run the backup script manually
sudo /opt/pms/backup-postgres.sh

# 2. Confirm local file exists
ls -lh /var/backups/pms-postgres/pms-*.dump | tail -1

# 3. Confirm offsite copy
rclone ls remote:pms-postgres-backups/ | tail -3

# 4. Confirm cron is scheduled
crontab -l | grep backup-postgres

# 5. Verify restore works against a throwaway local Postgres (do NOT restore over production)
docker run --rm -v /var/backups/pms-postgres:/dumps -e POSTGRES_PASSWORD=test postgres:15 bash -c \
  "pg_restore --list /dumps/pms-*.dump | head"
# Expected: lists tables and objects without error
```

**Worklog requirement.** Record the rclone backend chosen, retention chosen, and confirm the test restore succeeded against a throwaway database.

---

### TASK-007 — Decide Tauri auto-update path (disable or finish)

| Field | Value |
| --- | --- |
| Severity | High (footgun) |
| Audit ref | Item 8d |
| Owner | (unassigned) |
| Status | OPEN |
| Estimated effort | 1 hour (disable) OR 4–6 hours (finish) |
| Depends on | — |

**Problem.** The Tauri auto-updater is configured with a public key and endpoint, but no release has been published — the updater config or signature still contains the placeholder `INSERT_SIGNATURE_HERE`. In its current state, the updater will either silently fail or (worse) trigger an unverifiable update attempt that could brick the desktop app.

**Investigation step.** Read `src-tauri/tauri.conf.json` and find the `updater` section. Determine current state: is the updater `active: true`? Is there a real `pubkey`? Does the `endpoints` URL exist and serve a valid `latest.json`?

**Two valid resolutions — pick one and document the choice in the worklog.**

**Option A — DISABLE the updater for now (recommended for Phase 0).**

In `src-tauri/tauri.conf.json`, set:
```json
"updater": {
  "active": false
}
```

This removes the footgun immediately. Auto-update can be properly set up in Phase 6. Document in the worklog that this was disabled and link to TASK-600 (placeholder) for future re-enablement.

**Option B — FINISH the updater setup.**

This requires:
1. Generating a real signing keypair (`tauri signer generate`)
2. Storing the private key as a GitHub Actions secret (not in repo!)
3. Setting up a release workflow that builds for Windows, signs the bundle, and publishes `latest.json` to the GitHub releases endpoint
4. Verifying with a test release that desktop installs auto-update without prompting for credentials

This is a multi-hour task. **Do not attempt unless the agent has full Tauri release experience** — half-done updater is worse than no updater.

**Acceptance test (for Option A).**

```powershell
# Build the desktop app and confirm no updater errors at startup
pnpm tauri dev
# Open the app, check the Tauri log output — no "updater" errors should appear.
```

**Acceptance test (for Option B).** Push a tagged release, wait for GitHub Actions to build and sign, install the previous version on a test Windows machine, confirm it auto-updates to the new version without errors.

---

## 4. BACKLOG

> One-liners only. Curator will expand each into Phase N tasks when the time comes.

### Phase 1 — Lock Money Paths (planned next after Phase 0)

- **B1-1** Audit Item 6 — `credit_limit = 0` semantics: change to mean "no credit allowed" (currently means "unlimited"). `src-tauri/src/commands/pos_sale_create.rs:244`
- **B1-2** Audit Item 5 — Invoice sales bypass expiry / batch-status / permission checks. `src-tauri/src/commands/pos_invoice.rs:72-109`
- **B1-3** Audit Item 7 — Invoice cash sales over-credit account by change amount. `pos_invoice.rs:200-221`
- **B1-4** Audit Item 8 — Account balance can go negative on returns/voids. `pos_returns.rs:180`, `pos_void.rs:140`
- **B1-5** Audit Item 18 — Expense creation/update does not check account balance. `expenses.rs:297-306`, `:435-453`
- **B1-6** Audit Item 19 — Discounts can push sale below cost price. Add cost-price floor in POS + Sales.
- **B1-7** Audit Item 9 — Wrap warehouse multi-write ops in transactions. `warehouse.rs:492-580`, `warehouse_stocktake.rs:85-155`, `warehouse_batch.rs:83-168`
- **B1-8** Audit Item 24 — Stock transfers create batches with `unit_cost=0` corrupting valuation. `warehouse_transfer.rs:113-118`

### Phase 2 — SaaS Control Plane

- **B2-1** Items 1, 2, 3 — Remove all hardcoded secret fallbacks; force startup failure if env missing. Rotate all production secrets.
- **B2-2** Item 4 — Enforce tenant suspension on cloud sync and PWA login (currently only enforced on desktop config poll).
- **B2-3** Item 26 — Revoke JWT and sync tokens on tenant suspension/deletion.
- **B2-4** Item 28 — `PUT /auth/password` must require identity proof, not accept sync tokens.
- **B2-5** Item 17 — Add `express-rate-limit` to `/auth/login`, `/v1/activate`, `/v1/sync/*`.
- **B2-6** Item 21 — Account lockout after N failed login attempts (desktop and PWA).
- **B2-7** Item 22 — JWT/token TTL shorter than 30 days, with refresh.

### Phase 3 — Laptop Migration (product deal-breaker)

- **B3-1** Add "Restore Existing Pharmacy" branch in Onboarding step 0.
- **B3-2** Make cloud backup credentials recoverable via license key + owner email + password.
- **B3-3** Build `pull_all_tables` (inverse of push) for one-time restore-from-cloud.
- **B3-4** Bind license key to current device on first activation, allow re-bind from owner credentials.
- **B3-5** Show "last cloud backup: X hours ago" prominently on Dashboard.
- **B3-6** Item 16 in the audit.

### Phase 4 — GitHub Hygiene & History Rewrite

- **B4-1** Run `git filter-repo` to remove all AI mesh files from history (across all branches).
- **B4-2** Rotate any secrets that ever lived in git history (JWT, DB password, HMAC secret, admin token).
- **B4-3** Rename default branch from `infra/ai-agent-mesh-v0` to `main`.
- **B4-4** Delete 8 stale `infra/ai-agent-mesh-*` branches and `backup/before-secret-scrub` branch.
- **B4-5** Move VPS IP `178.104.158.147` from `deploy.ps1:4` to env var.

### Phase 5 — Pharmacist UX Polish

- **B5-1** Item 30 — Wrap 30+ raw catch blocks in friendly Arabic messages.
- **B5-2** Item 37 — Owner backup download icon is decorative; wire up actual download.
- **B5-3** Item 39 — Owner can change password, edit pharmacy info, manage users from PWA.
- **B5-4** Item 35 — Confirmation dialogs on cart clear, workspace delete, payment method delete, backup delete, batch recall.
- **B5-5** Item 41 — Add stock from Products page (or document why purchase invoice is required).
- **B5-6** Item 40 — English language pass on Onboarding, currency/timezone dropdowns, App loading screen.
- **B5-7** Item 48 — Fix `right-7` / `right-0` RTL bugs (use `end-*` logical properties).
- **B5-8** "Getting Started" checklist on Dashboard for new tenants.

### Phase 6 — Ops & Admin Completeness

- **B6-1** Item 38 — Finish 4 "Coming Soon" admin pages (Licenses, Renewals, Trash, Audit log).
- **B6-2** Item 36 — Make 6 owner PWA pages mobile-accessible.
- **B6-3** Item 42 — Confirm SSL renewal cron is active; add monitoring.
- **B6-4** Item 43 — API version check between desktop and cloud; reject mismatched clients.
- **B6-5** Uptime monitoring (UptimeRobot or BetterStack free tier) with email alert on `/health` failure.
- **B6-6** Replace 15-step scp deployment with single rsync or `git pull` + `docker compose up -d`.
- **B6-7** Re-enable Tauri auto-update properly (if TASK-007 chose Option A).

### Phase 7 — Schema Drift & Data Completeness

- **B7-1** Item 31 — Reconcile `pms-testing/schema.sql` with actual `migrations.rs`. Tests must run against the real schema.
- **B7-2** Item 14 — Fix `admin_audit_log.tenant_id` (UUID) vs `tenants.id` (TEXT) type mismatch.
- **B7-3** Item 44 — Add indexes on `sales.customer_id`, `expenses.account_id`, `customer_payments.tenant_id`, `account_transactions.tenant_id`.
- **B7-4** Audit-9d — Push currently-dropped fields to cloud snapshots: product `generic_name`, `dosage_form`, `strength`, `manufacturer`, `image_path`; customer `email`, `address`, `tax_number`; sale `void_reason`, `change_amount`; expense `payment_method`, `reference_number`.
- **B7-5** Sync the tables that have no cloud presence: `supplier_returns`, `returns`, `supplier_invoice_items`, `pos_sessions`, desktop `audit_log`, `users`, `branches`.

### Lower priority (no phase assigned)

- Pagination on list queries (Item 45)
- Date range validation (Item 46)
- In-app help / tooltips (Item 47)
- Permission checks on products, accounts, settings, branches (Item 33)
- Print session summary at close (audit 7g)
- Dashboard redesign — owner decided 2026-05-15 to delete the pre-audit plan (`docs/DASHBOARD-REDESIGN-PLAN.md`) rather than preserve it. If a dashboard redesign is wanted later, curator writes a fresh Phase 5 TASK-5XX from scratch.

---

## 5. WORKLOG

> Append-only. Newest entries at the top. Never edit prior entries.

<!--
TEMPLATE — copy this block when adding a new entry:

### YYYY-MM-DD — <agent name> — TASK-NNN
- **Status:** DONE | BLOCKED
- **Files changed:** path/to/file.ext (lines X-Y), other/file.ext
- **Acceptance test result:** <exact command run, key output line(s) proving success>
- **Notes:** <surprises, follow-ups, edge cases — anything the curator should see>
-->

### 2026-05-15 — Claude Code (Opus) — TASK-000
- **Status:** DONE
- **Files changed:**
  - **Removed from git tracking (19 files):** `.ai/MEMORY.md`, `.ai/MODEL_ROUTER.yaml`, `.ai/USAGE_STATE.example.json`, `.ai/locks/active-locks.example.json`, `.ai/reports/README.md`, `.ai/reviews/README.md`, `.github/copilot-instructions.md`, all 8 files in `docs/agents/`, `docs/ai-agent-mesh-operational-contract.md`, `docs/ai-agent-mesh-v0.md`, `docs/DASHBOARD-REDESIGN-PLAN.md`, `src-tauri/cargo_err.txt`
  - **Deleted from disk:** all the above PLUS `docs/AGENT-HANDOFF.md` (3028 lines, conventions already preserved in HANDOFF §1.7), `docs/ai-agent-mesh-operating-model.md`, `docs/archive/` folder, `docs/launch/README.md`
  - **Added to git tracking:** `docs/launch/INSTALLATION-GUIDE.md` (real product install guide for pharmacists — was previously untracked)
  - **`.gitignore` updated:** appended `.ai/`, `docs/agents/`, `docs/archive/`, `docs/ai-agent-mesh-*.md`, `.github/copilot-instructions.md`, broken launch docs (README.md / LAUNCH-PLAN.md / STAGE-TEMPLATE.md), `src-tauri/cargo_err.txt`, `Thumbs.db`, `.claude/`, `build/`
- **Acceptance test result:** All 5 acceptance tests PASS.
  - TEST 1 (no AI artifacts in `git ls-files`): zero matches — PASS
  - TEST 2 (deleted files no longer on disk): all 7 sampled paths confirmed gone — PASS
  - TEST 3 (`docs/launch/INSTALLATION-GUIDE.md` exists and tracked): PASS
  - TEST 4 (`.ai/` in `.gitignore`): PASS
  - TEST 5 (`git status --short`): shows the staged removals, new HANDOFF.md, and `docs/launch/INSTALLATION-GUIDE.md` addition. No surprises.
- **Notes:**
  - `/docs/` now contains exactly one file: `docs/launch/INSTALLATION-GUIDE.md`.
  - Not committed yet — curator's policy is to let the owner decide when to commit. The worktree has many other unrelated pending changes from earlier work on this branch that should be reviewed before any commit.
  - History rewrite (Phase 4 TASK-400) and stale branch deletion (TASK-401) remain. The cleaned files are still visible in past commits on `infra/ai-agent-mesh-v0`.
  - Did NOT touch the n8n-workflows folder under `pms-cloud/scripts/` (not part of TASK-000 scope) — verify in Phase 4 audit if any n8n artifacts remain elsewhere.

### 2026-05-15 — Claude Code (Opus) — Curator revision #1
- **Status:** DONE
- **Files changed:** HANDOFF.md (corrections + new section 1.7 + TASK-000 expanded + B5-9 backlog)
- **Acceptance test result:** N/A — curation pass, no acceptance test applicable
- **Notes:** Owner flagged that the old `docs/AGENT-HANDOFF.md` and other `/docs` files have faulty content. Audited the full `/docs` tree and found three classes of files: (1) 18 tracked AI mesh files to delete, (2) on-disk stale planning docs to delete, (3) one real product doc `docs/launch/INSTALLATION-GUIDE.md` that was untracked and must be preserved. Corrections made to this HANDOFF: (a) product name was wrong — corrected from "PMS Pharmacy" to "TAJ Pharmacy" throughout, (b) `migrations.rs` path was missing `db/` subdirectory — corrected to `src-tauri/src/db/migrations.rs`, (c) section 1.7 Project Conventions added with money/i18n/palette/architecture/migration/tenant-ID/code-quality/safety rules extracted from the old AGENT-HANDOFF lines 1-30, 310-355, and 1071-1095. TASK-000 expanded to handle on-disk junk and to add `docs/launch/INSTALLATION-GUIDE.md` to git tracking. `docs/DASHBOARD-REDESIGN-PLAN.md` parked in backlog as B5-9 pending owner decision.

### 2026-05-15 — Claude Code (Opus) — Curator setup
- **Status:** DONE
- **Files changed:** HANDOFF.md (new file, repo root)
- **Acceptance test result:** N/A — this is the initial curation. Sections 0–4 populated with Phase 0 (TASK-000 through TASK-007) and full backlog for Phases 1–7.
- **Notes:** First Phase 0 task to pick up is TASK-000 (AI mesh cleanup). TASK-001 through TASK-005 are pure code fixes with line numbers. TASK-006 (Postgres backup) requires VPS access. TASK-007 (Tauri updater) is a decision-then-fix task — recommend Option A (disable) to keep Phase 0 moving.
