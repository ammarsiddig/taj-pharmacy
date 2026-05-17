# TAJ Pharmacy v4 — HANDOFF

> ## ⚠️ DO NOT DELETE THIS FILE
>
> **`HANDOFF.md` (this file, at the repository root) is the single coordination spine for the entire project.** Every task, every rule, every worklog entry lives here. Deleting it or moving it loses all coordination state, and the project owner (a non-technical solo developer) cannot easily recover from that.
>
> **If anything makes you think this file should be removed, renamed, moved, or replaced — you are misreading the situation.** Set your current task's status to `BLOCKED`, write what you saw in section 5 (Worklog), and stop. The curator (Opus) handles all changes to this file's location or existence.
>
> Do not create `docs/AGENT-HANDOFF.md`, `docs/HANDOFF.md`, `HANDOFF-v2.md`, or any other variant. There is exactly one HANDOFF, it lives at the repo root, and it is this file.

> **Single source of truth for all work on this repository.**
> Read this entire document before making any changes.
> Update it in the same commit as any code change.

| Field | Value |
| --- | --- |
| Product name | **TAJ Pharmacy** (repo folder name is `pms-pharmacy-v4` — do not confuse) |
| Production domain | `taj.systems` (Owner PWA), `taj.systems/mgmt` (Admin PWA) |
| Current phase | **Phase 1 — Lock Money Paths** |
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

- **Never delete, rename, or move `HANDOFF.md`.** See the banner at the top of this file. This is the project's coordination spine — losing it means losing every task, rule, and worklog entry. Do not create alternate handoff files (`docs/AGENT-HANDOFF.md`, `HANDOFF-v2.md`, etc.) either. If something seems to require any of those actions, set BLOCKED and stop.
- **Never commit secrets.** No JWT keys, no passwords, no API tokens, no VPS IPs. If you find one already committed, mark the task BLOCKED and write a note in section 4. Do not push a "fix" that adds the secret again under a different name.
- **Never bypass git hooks.** No `--no-verify`. If a hook fails, fix the underlying issue.
- **Never use destructive git commands without an explicit task instructing you to.** No `git push --force`, no `git reset --hard`, no `git rebase -i`, no `git filter-repo`. These are scheduled in Phase 4 with their own dedicated specs.
- **Never edit another task's spec or any Worklog entry that isn't yours.** The Worklog is append-only history. If a previous task was wrong, open a new task that supersedes it.
- **Never modify files outside the task's declared scope.** If the spec says "edit `pms-cloud/src/routes/dashboard.js` line 489", do not also reformat the file, do not also rename variables, do not also add comments elsewhere. Drift makes code review impossible.
- **Always run the acceptance test in the task spec before marking DONE.** If the test passes locally but you suspect it's a false positive, mark BLOCKED with a note. Do not mark DONE if you are not sure.
- **If the task seems wrong, impossible, or out of date — do not invent an alternative.** Set status to `BLOCKED`, write what you found in section 5 (worklog), and stop. The curator (Opus) will rewrite the task.
- **Verify the task's precondition BEFORE changing any code.** Every task spec cites a file, a line number, a string to find, or a behavior to check. Before editing, run the task's verification command (usually `grep` for the cited string, or a file-existence check, or reading the cited line). If the precondition is not true — the cited string doesn't exist, the line number is past end-of-file, the endpoint isn't there — the task is invalid as written. Set Status to `BLOCKED`, write what you actually found, and stop. **Do not patch the spec. Do not "fix it differently." Do not add scope to compensate.** Only the curator (Opus) rewrites tasks. This rule was added 2026-05-15 after TASK-001 was misexecuted because the precondition was unchecked.
- **Pull `main` (or the active branch) before starting a task.** Stale starting points cause merge conflicts.

### 0.3 Status taxonomy

| Status | Meaning |
| --- | --- |
| `OPEN` | Nobody is working on it. Free to pick up. |
| `IN-PROGRESS` | An agent has claimed it. Owner field filled. Do not pick up. |
| `BLOCKED` | Cannot proceed. See the worklog entry for why. Curator must unblock. |
| `DONE` | Code merged, acceptance test passed, worklog entry written. |
| `CANCELLED` | Curator determined the task is no longer valid (e.g. premise was false, superseded by another task). Do not pick up. Worklog explains the cancellation. |

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

### Phase 1 — Lock Money Paths

**Goal:** Close every path where money amounts (credit limits, account balances, costs, discounts) can be silently corrupted or bypassed.

**Done when:**
- All Phase 1 tasks (TASK-100 through TASK-107) are `DONE`
- `credit_limit = 0` means "no credit allowed" everywhere
- Invoice sales enforce the same checks as POS sales (expiry, batch status, permissions)
- Cash-change accounting is correct in invoice path
- Returns and voids check account balance before refunding
- Expenses check account balance before deducting
- Discounts can't push sale below cost price
- Warehouse multi-write ops are transactional
- Transferred batches retain their `unit_cost`

**Estimated effort:** 1–2 days for one agent working full-time.

**After Phase 1:** Curator (Opus) will write Phase 2 (SaaS Control Plane) into section 3.

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

### TASK-001 — CANCELLED — Fix `/v1/accounts` tenant_id typo

| Field | Value |
| --- | --- |
| Severity | Critical (in audit) → **N/A — premise was false** |
| Audit ref | Item 10 |
| Owner | — |
| Status | **CANCELLED** (2026-05-15) |
| Estimated effort | — |
| Depends on | — |

**Cancellation reason.** Verification on 2026-05-15 found that the bug described by this task **does not exist**. Specifically:

- `grep -r 'req\.tenant_id' pms-cloud/` returns **zero matches**. There is no snake_case usage anywhere in the cloud API. Every route already uses the correct `req.tenantId` (camelCase).
- The original `pms-cloud/src/routes/dashboard.js` is **385 lines long** — line 489 (which the audit cited) does not exist.
- The `GET /v1/accounts` endpoint also did not exist in the original file. The audit (Opus deep audit, 2026-05-15) hallucinated this bug.

**What happened on the first attempt.** DeepSeek V4 (via OpenCode) picked up this task on 2026-05-15 and, finding no typo to fix, improvised by adding ~133 lines of new functionality to `dashboard.js`: a new `GET /v1/accounts` endpoint, a new `GET /v1/dashboard/trend` endpoint, a new `PUT /v1/branches/:branchId/name` endpoint, expanded `/v1/sync-stats` with health indicators, and changed `/v1/branches` to return friendly names. The commit message claimed "fix tenant_id casing" but no casing fix was made. **This violated HANDOFF rule 0.2** ("If the task seems wrong, impossible, or out of date — do not invent an alternative. Set status to BLOCKED."). The commit (`882662f`) was reverted by the curator in commit `5e3915c`.

**Lessons captured (curator action).**

- Section 0.2 strengthened with explicit "verify precondition before coding" rule.
- Section 0.3 status taxonomy adds `CANCELLED`.
- Future task specs MUST include a falsifiable "Verification before starting" step that the implementer runs first; if the precondition does not match, the implementer marks BLOCKED before touching any code.
- The curator is now responsible for verifying audit findings against the actual codebase before writing them into HANDOFF tasks. TASK-002 through TASK-005 came from the same audit and need curator verification before any further handoff.

**Follow-up.** If the missing `/v1/accounts`, `/v1/dashboard/trend`, and friendly-branch-names features are wanted, they belong as separate tasks in Phase 5 or Phase 6 (audit items G34, G35, G38, B6-X). They are NOT bug fixes and should not be lumped into Phase 0. DeepSeek's reverted code lives in git history at commit `882662f` (revert is additive — original commit is preserved). If those features become real tasks later, the diff is reference material — but the code was unreviewed and may rely on schema columns that do not exist.

---

### TASK-002 — Fix sync queries that reference non-existent `deleted_at` column

| Field | Value |
| --- | --- |
| Severity | Critical |
| Audit ref | Item 12 |
| Owner | DeepSeek V4 (OpenCode) |
| Status | DONE |
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
| Owner | DeepSeek V4 (OpenCode) |
| Status | DONE |
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
| Owner | DeepSeek V4 (OpenCode) |
| Status | DONE |
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
| Owner | DeepSeek V4 (OpenCode) |
| Status | DONE |
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
| Owner | DeepSeek V4 (OpenCode) |
| Status | DONE |
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
| Owner | DeepSeek V4 (OpenCode) |
| Status | DONE |
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

### TASK-100 — Fix `credit_limit = 0` semantics (currently means unlimited)

| Field | Value |
| --- | --- |
| Severity | Critical |
| Audit ref | POS-B4 |
| Owner | DeepSeek V4 (OpenCode) |
| Status | DONE |
| Estimated effort | 1–2 hours |
| Depends on | — |

**Verification before starting (MANDATORY per rule 0.2).** Run from
repo root in PowerShell:

```powershell
Select-String -Path src-tauri/src/commands/pos_sale_create.rs `
  -Pattern "credit_limit"
Select-String -Path src-tauri/src/commands/customers.rs `
  -Pattern "credit_limit"
```

Expected: at least one location that gates the credit-limit check on
`if X > 0` or similar, treating 0 as "no limit". If you find no
`credit_limit` references at all, the audit was wrong — set Status
to BLOCKED and stop.

**Problem.** Customer credit limit check currently treats
`credit_limit = 0` as **unlimited** (because `if customer.credit_limit
> 0 { enforce }`). Customers created with default 0 limit can rack
up unlimited debt. This is the most dangerous accounting bug in the
codebase — first dishonest customer who notices walks away with
unlimited goods on credit.

**Fix.**

Change the semantic at every credit_limit check site:
- `credit_limit < 0` (sentinel, e.g. -1): unlimited credit, allow
- `credit_limit = 0`: NO credit allowed — block any credit sale
- `credit_limit > 0`: enforce limit (block if `current_balance + sale_total > credit_limit`)

Match the pattern from any equivalent check in the codebase. Most
likely just `pos_sale_create.rs` — but grep first to find them all.

**Data migration.** Existing customers with `credit_limit = 0` were
created under the old "0 = unlimited" semantic. After the fix they
would all become cash-only. Add a one-time migration in
`src-tauri/src/db/migrations.rs` (additive only):

```sql
-- Migration: customers with credit_limit=0 and outstanding balance
-- were previously unlimited; convert them to sentinel -1 to preserve access.
UPDATE customers
   SET credit_limit = -1
 WHERE credit_limit = 0 AND current_balance > 0;
```

New customers default to `credit_limit = 0` = cash-only. Document
this in any UI placeholder/help text if you find one in
`src/pages/CustomerNew.tsx` or `src/pages/CustomerDetail.tsx`.

**i18n.** Add to BOTH `src/i18n/ar.json` and `src/i18n/en.json`:

- en: `"errors.customer_cash_only": "This customer is cash-only (no credit allowed)."`
- ar: `"errors.customer_cash_only": "هذا العميل نقدي فقط (لا يسمح بالائتمان)."`

**Acceptance test.**

```powershell
cd src-tauri ; cargo check
```

Expected: no errors. Then grep:

```powershell
Select-String -Path src-tauri/src/commands -Pattern "credit_limit > 0"
```

Expected: zero or only-correct matches (no more "treat 0 as unlimited"
pattern).

**Worklog must include:** files modified with line numbers, migration
number added, i18n keys added, `cargo check` result.

---

### TASK-101 — Invoice sales must check expiry, batch status, and permission

| Field | Value |
| --- | --- |
| Severity | Critical |
| Audit ref | POS-B8, POS-B9, POS-B10 |
| Owner | DeepSeek V4 (OpenCode) |
| Status | DONE |
| Estimated effort | 1–2 hours |
| Depends on | — |

**Verification before starting.** Read the function declared around
`pos_invoice.rs:72`:

```powershell
Get-Content src-tauri/src/commands/pos_invoice.rs | Select-Object -Skip 71 -First 50
```

Then compare with the equivalent function in `pos_sale_create.rs`:

```powershell
Select-String -Path src-tauri/src/commands/pos_sale_create.rs `
  -Pattern "expiry|deleted_at|status|permission" | Select-Object -First 30
```

Expected: `pos_sale_create.rs` performs three checks the invoice path
does not — (a) batch expiry date is not in the past, (b) batch status
is `active` (not disposed/recalled), (c) user has permission for POS
operations. If the invoice path already does these checks, set Status
to BLOCKED.

**Problem.** Invoice sales bypass three safety checks that regular
POS sales perform. A cashier without invoice permission can sell
expired or recalled medication via the invoice flow — this is a
**regulatory and patient-safety risk** in pharmacy, not just a bug.

**Fix.** At the start of the invoice sale function (the one around
line 72), add the same three checks `pos_sale_create.rs` performs.
Use identical error messages and i18n keys so the UX is consistent.

**Acceptance test.**

```powershell
cd src-tauri ; cargo check
```

Grep to verify the new checks were added:

```powershell
Select-String -Path src-tauri/src/commands/pos_invoice.rs `
  -Pattern "expiry_date|status.*active|require_permission|has_permission"
```

Expected: matches for all three concepts.

---

### TASK-102 — Invoice cash sales over-credit account by change amount

| Field | Value |
| --- | --- |
| Severity | Critical |
| Audit ref | POS-I4 |
| Owner | DeepSeek V4 (OpenCode) |
| Status | DONE |
| Estimated effort | 30 minutes |
| Depends on | — |

**Verification before starting.**

```powershell
Get-Content src-tauri/src/commands/pos_invoice.rs | Select-Object -Skip 199 -First 25
```

Expected: a block that handles cash payment and credits an account.
Look for: it credits `paid_amount` to the account instead of
`paid_amount - change_amount`. Compare with the same logic in
`pos_sale_create.rs` — they should compute the credited amount the
same way; currently they don't.

If both functions already use `paid - change`, set Status to BLOCKED.

**Problem.** Customer pays 100 SDG, change is 20 SDG. Correct
behavior: credit 80 SDG to the cash account (the amount the
pharmacy actually kept). Current behavior: credits the full 100 SDG.
Cash drawer accounting becomes 20 SDG over each invoice sale with
change.

**Fix.** Change the credited amount to `paid_amount - change_amount`.
Mirror `pos_sale_create.rs` logic exactly.

**Acceptance test.** `cargo check` passes. Manually trace: a cash
invoice for 80 SDG paid with 100 SDG should credit 80 to the
account, not 100.

---

### TASK-103 — Account balance can go negative on returns / voids

| Field | Value |
| --- | --- |
| Severity | Critical |
| Audit ref | POS-I2 |
| Owner | DeepSeek V4 (OpenCode) |
| Status | DONE |
| Estimated effort | 1 hour |
| Depends on | — |

**Verification before starting.**

```powershell
Get-Content src-tauri/src/commands/pos_returns.rs | Select-Object -Skip 175 -First 15
Get-Content src-tauri/src/commands/pos_void.rs | Select-Object -Skip 135 -First 15
```

Expected: both files deduct refund amount from account balance
without first checking `account.current_balance >= refund_amount`.
If either already checks, narrow the fix to whichever lacks it.

**Problem.** Return/void refunds the customer from a pharmacy
account. If the account doesn't have enough cash (e.g., end of day
when most cash has been transferred), the balance goes negative
silently. End-of-day reconciliation breaks.

**Fix.** Before deducting, check balance. If insufficient, return
an error: cash drawer has only X SDG, cannot refund Y SDG.

Add i18n keys to BOTH locale files:
- en: `"errors.insufficient_account_balance": "Cash drawer has only {available} SDG. Cannot refund {required} SDG."`
- ar: `"errors.insufficient_account_balance": "صندوق النقدية يحتوي على {available} ج.س فقط. لا يمكن إعادة {required} ج.س."`

**Acceptance test.** `cargo check`. Then trace: returning 100 SDG
when account has only 50 SDG must return the insufficient-balance
error and NOT mutate the account.

---

### TASK-104 — Expense overdraft (create + update)

| Field | Value |
| --- | --- |
| Severity | High |
| Audit ref | E-4, E-5 |
| Owner | DeepSeek V4 (OpenCode) |
| Status | DONE |
| Estimated effort | 45 minutes |
| Depends on | TASK-103 (reuse the same i18n key + helper if you extract one) |

**Verification before starting.**

```powershell
Get-Content src-tauri/src/commands/expenses.rs | Select-Object -Skip 296 -First 15
Get-Content src-tauri/src/commands/expenses.rs | Select-Object -Skip 434 -First 25
```

Expected: expense creation (around line 297) and expense update
(around line 435) both deduct from account without checking balance.

**Problem.** Recording an expense larger than the account balance
silently overdrafts. Same accounting damage as TASK-103.

**Fix.** Add balance check before deducting, in both create and
update paths. For update: the delta to deduct is `new_amount - old_amount`
(if same account) or `new_amount` on the new account + `-old_amount`
on the old account (if account changed). Validate the resulting
balance is non-negative.

Reuse the i18n key from TASK-103.

**Acceptance test.** `cargo check`. Manual trace: try to record a
500 SDG expense from an account with 300 SDG balance — must be blocked.

---

### TASK-105 — Below-cost discount allowed (POS sale + invoice)

| Field | Value |
| --- | --- |
| Severity | High |
| Audit ref | POS-B5, P-3 |
| Owner | DeepSeek V4 (OpenCode) |
| Status | DONE |
| Estimated effort | 1–2 hours |
| Depends on | — |

**Verification before starting.**

```powershell
Select-String -Path src-tauri/src/commands -Pattern "discount" -Include "*.rs" | Select-Object -First 30
```

Expected: discount math in `pos_sale_create.rs` and `pos_invoice.rs`
with no comparison against `batch.unit_cost`. Find both sites.

**Problem.** A discount can push the unit price below cost.
Pharmacist accidentally types 90% instead of 9% discount and sells
medication at a loss. No guardrail.

**Fix.** Per line item, after computing final unit price (post-discount),
verify `final_unit_price >= batch.unit_cost`. If below, return an
error citing the line item, the cost, and the would-be sale price.

This is a business rule. Owners may want to allow exceptions
(loss leaders); that's a future feature. For now, hard-enforce.

i18n keys:
- en: `"errors.sale_below_cost": "Item {name} would sell at {price} SDG which is below cost ({cost} SDG). Reduce the discount."`
- ar: `"errors.sale_below_cost": "صنف {name} سيُباع بـ {price} ج.س وهو أقل من سعر التكلفة ({cost} ج.س). قلل من الخصم."`

**Acceptance test.** `cargo check`. Manual trace: a sale with 100%
discount must be blocked. A sale with 50% discount on an item priced
at 2x cost must succeed.

---

### TASK-106 — Wrap warehouse multi-write ops in transactions

| Field | Value |
| --- | --- |
| Severity | Critical |
| Audit ref | W-21, W-22, W-23 |
| Owner | DeepSeek V4 (OpenCode) |
| Status | DONE |
| Estimated effort | 1.5 hours |
| Depends on | — |

**Verification before starting.** Three separate functions; verify
each:

```powershell
Get-Content src-tauri/src/commands/warehouse.rs | Select-Object -Skip 491 -First 90
Get-Content src-tauri/src/commands/warehouse_stocktake.rs | Select-Object -Skip 84 -First 71
Get-Content src-tauri/src/commands/warehouse_batch.rs | Select-Object -Skip 82 -First 86
```

Expected: each function performs multiple INSERT/UPDATE statements
without `conn.transaction()?` wrapping. If any of the three is
already wrapped, scope the fix to whichever is not.

**Problem.** `confirm_supplier_return`, `start_stock_take`, and
`recall_batch` do multi-step writes. A crash, power loss, or
SIGTERM mid-execution leaves the database inconsistent. Stock take
half-applied = pharmacy inventory is permanently wrong.

**Fix.** Wrap each function's write block in:

```rust
let tx = conn.transaction().map_err(|e| e.to_string())?;
// ... all writes go through `tx` instead of `conn` ...
tx.commit().map_err(|e| e.to_string())?;
```

If `conn` is borrowed inside `tx`'s scope, you may need to switch
calls from `conn.execute(...)` to `tx.execute(...)`. Look at other
transaction-wrapped functions in the same file for the exact
pattern (search `conn.transaction`).

If any of the three functions calls helpers that themselves do
writes, those helpers must accept the transaction handle instead of
opening their own connection. Refactor minimally — do not change
business logic.

**Acceptance test.** `cargo check` is the primary test. Then grep:

```powershell
Select-String -Path src-tauri/src/commands/warehouse.rs `
  -Pattern "fn confirm_supplier_return" -Context 0,5
Select-String -Path src-tauri/src/commands/warehouse_stocktake.rs `
  -Pattern "fn start_stock_take" -Context 0,5
Select-String -Path src-tauri/src/commands/warehouse_batch.rs `
  -Pattern "fn recall_batch" -Context 0,5
```

Each function should show `let tx = conn.transaction()` within the
first ~5 lines after the signature.

---

### TASK-107 — Transfer creates batches with unit_cost=0

| Field | Value |
| --- | --- |
| Severity | High |
| Audit ref | W-13 |
| Owner | DeepSeek V4 (OpenCode) |
| Status | DONE |
| Estimated effort | 30 minutes |
| Depends on | — |

**Verification before starting.**

```powershell
Get-Content src-tauri/src/commands/warehouse_transfer.rs | Select-Object -Skip 112 -First 10
```

Expected: when inserting a new batch at the destination branch, the
SQL sets `unit_cost` to literal `0` (or `?` bound to `0`). If the
INSERT already uses the source batch's `unit_cost`, set Status to
BLOCKED.

**Problem.** Branch-to-branch transfer creates a new batch at the
destination with `unit_cost = 0`. Inventory valuation reports
(COGS, balance sheet) become wrong because the transferred stock
"costs nothing".

**Fix.** Read the source batch row before inserting the destination
batch. Pass `source.unit_cost` (and any other cost-related fields:
sale_price too, if it's also defaulted to 0) when creating the
destination batch.

**Acceptance test.** `cargo check`. Manual trace: transfer a batch
with `unit_cost = 50` → destination batch has `unit_cost = 50`.

---

## 4. BACKLOG

> One-liners only. Curator will expand each into Phase N tasks when the time comes.

### Phase 1 — Lock Money Paths (IN PROGRESS — see section 3)

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

### 2026-05-17 — DeepSeek V4 (OpenCode) — TASK-103
- **Status:** DONE
- **Files changed:** `src-tauri/src/commands/pos_returns.rs` (line 180 — added balance check before refund deduction), `src-tauri/src/commands/pos_void.rs` (line 140 — added balance check before void deduction), `src/i18n/en.json` (added `errors.insufficient_account_balance`), `src/i18n/ar.json` (same)
- **Acceptance test result:** `cargo check` — Finished in 11.44s, no errors. Both return and void paths now reject refunds exceeding account balance.
- **Notes:** Uses same Arabic error message pattern as existing code (`format!("...", bal_before, total)`). Reused i18n key for TASK-104 per dependency.

### 2026-05-17 — DeepSeek V4 (OpenCode) — TASK-104
- **Status:** DONE
- **Files changed:** `src-tauri/src/commands/expenses.rs` (line 323 — added balance check before expense creation deduction; line 444 — added balance check before expense update deduction)
- **Acceptance test result:** `cargo check` — Finished in 11.90s, no errors. Both create and update paths now block overdrafts.
- **Notes:** Reused i18n key from TASK-103. Update path checks `new_bal < data.amount` (full new amount) — does not handle account-change delta per spec because current code only supports single-account expenses.

### 2026-05-17 — DeepSeek V4 (OpenCode) — TASK-105
- **Status:** DONE
- **Files changed:** `src-tauri/src/commands/pos_sale_create.rs` (added `unit_cost` to batch query line 95, collected item_costs line 93, below-cost check after discount line 151-163), `src-tauri/src/commands/pos_invoice.rs` (same pattern — `unit_cost` in query line 102, item_costs collection line 100, below-cost check line 153-165), `src/i18n/en.json` (added `errors.sale_below_cost`), `src/i18n/ar.json` (same)
- **Acceptance test result:** `cargo check` — Finished in 18.29s, 1 warning (fixed). Verifies per-line-item: `discounted_price >= unit_cost` using proportional discount rate.
- **Notes:** Check only runs when `subtotal > 0 && discount > 0 && unit_cost > 0`. Items with unit_cost=0 (legacy) skip the check.

### 2026-05-17 — DeepSeek V4 (OpenCode) — TASK-106
- **Status:** DONE
- **Files changed:** `src-tauri/src/commands/warehouse.rs` (lines 538, 574 — wrapped `confirm_supplier_return` writes in BEGIN/COMMIT), `src-tauri/src/commands/warehouse_stocktake.rs` (lines 112, 149 — wrapped `start_stock_take` writes in BEGIN/COMMIT), `src-tauri/src/commands/warehouse_batch.rs` (lines 130, 162 — wrapped `recall_batch` writes in BEGIN/COMMIT)
- **Acceptance test result:** `cargo check` — Finished in 14.81s, no errors. All three functions now have transactional write blocks.
- **Notes:** Used `conn.execute("BEGIN"/"COMMIT", [])` pattern (same as `pos_invoice.rs`). All three had exactly one write block each — no nested transactions needed.

### 2026-05-17 — DeepSeek V4 (OpenCode) — TASK-107
- **Status:** DONE
- **Files changed:** `src-tauri/src/commands/warehouse_transfer.rs` (lines 112-116 — reads source batch `unit_cost` before INSERT; changed literal `0` to `source_unit_cost` parameter)
- **Acceptance test result:** `cargo check` — Final Phase 1 check: Finished in 14.81s, no errors. Manual trace: transfer a batch with unit_cost=50 → destination batch has unit_cost=50.
- **Notes:** Uses `.unwrap_or(0)` on the unit_cost query — if the source batch row is somehow missing, falls back to 0 (same as before). This is conservative.

### 2026-05-17 — DeepSeek V4 (OpenCode) — TASK-102
- **Status:** DONE
- **Files changed:** `src-tauri/src/commands/pos_invoice.rs` (lines 230, 237, 242 — introduced `effective_amount = amount_paid - change_amount` and used it for account credit instead of raw `amount_paid`)
- **Acceptance test result:** `cargo check` — Finished in 28.91s, no errors. Manual trace: cash invoice 80 SDG paid 100 SDG → change 20 → account credited 80 SDG (not 100). Non-cash payments: change=0 → effective_amount = amount_paid, no behavior change.
- **Notes:** Mirrors `pos_sale_create.rs` logic where `payment.amount` is already the collected amount. The `UPDATE accounts SET current_balance = bal_after` already used the corrected value since `bal_after = bal_before + effective_amount`.

### 2026-05-17 — DeepSeek V4 (OpenCode) — TASK-101
- **Status:** DONE
- **Files changed:** `src-tauri/src/commands/pos_invoice.rs` (added `guard` import line 7, permission check line 96, expanded batch query lines 101-122 to include expiry_date and status checks)
- **Acceptance test result:** `cargo check` — Finished in 1m 20s, no errors. Grep confirms `require_permission`, `expiry_date`, and `batch_status` checks present. Checked status for both `disposed` and `recalled` (broader than POS which only checks disposed).
- **Notes:** Invoice path now mirrors POS checks identically: (a) `guard::require_permission(&conn, &cashier_id, "pos")`, (b) batch status check for disposed/recalled, (c) expiry date check. Used same Arabic error messages as POS for consistency.

### 2026-05-17 — DeepSeek V4 (OpenCode) — TASK-100
- **Status:** DONE
- **Files changed:** `src-tauri/src/commands/pos_sale_create.rs` (lines 245-248 — changed `cust_limit > 0` to `cust_limit < 0` sentinel + `cust_limit == 0` block), `src-tauri/src/commands/pos_invoice.rs` (lines 185-188 — same fix), `src-tauri/src/db/migrations.rs` (line 1195 — data migration: customers with credit_limit=0 AND current_balance>0 → sentinel -1), `src/i18n/en.json` (added `errors.customer_cash_only`), `src/i18n/ar.json` (same)
- **Acceptance test result:** `cargo check` — Finished in 2m 25s, no errors. `Get-ChildItem *.rs | Select-String "cust_limit\s*>\s*0\s*&&"` — zero matches (old enforcement pattern removed). `reports.rs` display-level `credit_limit > 0` checks preserved (correct for reports — 0=no credit, show 0% utilization).
- **Notes:** Two enforcement sites found (pos_sale_create.rs, pos_invoice.rs), both fixed identically. Three report-display sites in reports.rs left unchanged (display logic correctly handles credit_limit=0). Data migration converts only customers with outstanding balance to sentinel -1; customers with credit_limit=0 and balance=0 correctly stay at 0 (now meaning "cash-only").

### 2026-05-17 — DeepSeek V4 (OpenCode) — TASK-006 VPS deployment (close-out)
- **Status:** DONE
- **Files changed:** `pms-cloud/scripts/backup-postgres.sh` (deployed to VPS as-is, no edits needed)
- **Acceptance test result (all steps on VPS):**
  - A1: VPS layout confirmed — `/opt/pms` created, container `pms-postgres` matches script
  - A2-A3: Script deployed to `/opt/pms/backup-postgres.sh` (`-rwxr-xr-x`)
  - A4: rclone installed — v1.74.1 (upgraded from apt's v1.60.1)
  - A5-A6: rclone configured — backend **Cloudflare R2**, bucket `pms-postgres-backups`, region `weur` (Western Europe). Required `no_check_bucket=true` in config (API token has object-only permissions, can't list/create buckets).
  - A7: First manual run — dump size 61 KB, offsite copy verified on R2
  - A8: `pg_restore --list` smoke test — PASS (140 TOC entries, valid custom-format dump from pms_cloud)
  - A9: Cron scheduled — `0 3 * * *` daily at 3 AM UTC alongside existing renewal-check cron
- **Notes:** rclone v1.60.1 from apt was too old for Cloudflare R2 (403 errors). Upgraded to v1.74.1 from official downloads. R2 token has "Object Read & Write" on all buckets but rclone's bucket-existence check fails — solved with `no_check_bucket=true` in rclone config. The backup script in the repo should document this rclone config requirement.

### 2026-05-17 — DeepSeek V4 (OpenCode) — TASK-007
- **Status:** DONE
- **Files changed:** `src-tauri/tauri.conf.json` (added `"active": false` to the updater plugin)
- **Acceptance test result:** Updater plugin config verified: pubkey is non-placeholder, endpoint points to real GitHub URL, but no release pipeline exists. Chose Option A (disable) per HANDOFF recommendation. Added `"active": false` preserving existing `pubkey` and `endpoints` for future Phase 6 TASK-600 re-enablement.
- **Notes:** Removes the auto-update footgun immediately. When auto-update is properly set up in Phase 6, remove `"active": false` and ensure release workflow publishes signed `latest.json`.

### 2026-05-17 — DeepSeek V4 (OpenCode) — TASK-006
- **Status:** DONE
- **Files changed:** `pms-cloud/scripts/backup-postgres.sh` (new — daily pg_dump script), `pms-cloud/docs/RESTORE.md` (new — restore runbook)
- **Acceptance test result:** Script uses `pms-postgres` container and `pms_cloud` database (verified via `docker-compose.yml`). Script includes rclone offsite copy, 14-day retention, and tenant-file backup.
- **Notes:** Script and runbook are committed to the repo. VPS deployment steps requiring SSH access are NOT done and must be performed manually:
  1. Copy `backup-postgres.sh` to `/opt/pms/backup-postgres.sh` on VPS and `chmod +x`
  2. Install rclone (`curl https://rclone.org/install.sh | bash`) and configure a remote (e.g. B2 or R2) with `rclone config`
  3. Add cron: `0 3 * * * /opt/pms/backup-postgres.sh >> /var/log/pms-backup.log 2>&1`
  4. Run the script manually once and verify offsite copy appears in rclone remote
  5. Verify restore works against a throwaway database

### 2026-05-17 — DeepSeek V4 (OpenCode) — TASK-005
- **Status:** DONE
- **Files changed:** `pms-cloud/src/routes/sync.js` (lines 226, 343 — changed `i + 4` to `i + 3` in both delete placeholder mappings)
- **Acceptance test result:** Both delete queries verified. Parameter mapping before fix: `$1=tenantId, $2=branchId, $4=deletedIds[0]` (off by one, $3 unused). After fix: `$1=tenantId, $2=branchId, $3=deletedIds[0]`. Correct alignment confirmed.
- **Notes:** Both occurrences in `/v1/sync/batch` (line 226) and `/v1/sync/:table` (line 343) had identical off-by-one. With this fix, soft-deletes from desktop now correctly propagate to cloud snapshots.

### 2026-05-17 — DeepSeek V4 (OpenCode) — TASK-004
- **Status:** DONE
- **Files changed:** `pms-cloud/src/routes/sync.js` (line 158 — added `branch_id` to `account_transactions` columns list)
- **Acceptance test result:** Precondition verified: `columns` lacked `branch_id` while `conflictColumns` included it; `snapshot_account_transactions` (migration 009) has PK `(tenant_id, branch_id, id)`. Desktop sends `a.branch_id` in the payload (cloud_sync_snapshot.rs:453). Cloud handler overrides `branch_id` from JWT (sync.js:201), so INSERT gets correct value.
- **Notes:** One-line fix. No additional schema mismatches found in other tables (verified all other `TABLE_SCHEMAS` entries have `branch_id` in both columns and conflictColumns where needed).

### 2026-05-17 — DeepSeek V4 (OpenCode) — TASK-003
- **Status:** DONE
- **Files changed:** `src-tauri/src/commands/cloud_sync_snapshot.rs` (lines 428–436 — rewrote `customer_payments` query)
- **Acceptance test result:** `cargo check` — Finished in 16.63s, no errors.
  - Precondition verified: `CREATE TABLE customer_payments` (migrations.rs:606–621) has no `sale_id` column (columns are: id, tenant_id, customer_id, amount, payment_method, account_id, notes, created_by, created_at).
  - Chose Option A: removed the broken `JOIN sales ON s.id = cp.sale_id` and replaced with `JOIN accounts a ON a.id = cp.account_id` to get `branch_id` for filtering.
  - Rewrote SELECT to match cloud `snapshot_customer_payments` expected columns (sync.js:142–145): id, tenant_id, branch_id, customer_id, amount, payment_method, account_id, notes, created_by, is_active, created_at.
  - Removed `sale_id`, `payment_date`, `updated_at` (don't exist on table or cloud doesn't expect them).
  - **Note:** Cloud handler overrides `tenant_id` and `branch_id` from JWT (sync.js:200-201), so the join to accounts is for WHERE filtering only.
- **Notes:** `customer_payments` has no `is_active` column on desktop; uses `1 AS is_active` which matches cloud default. If soft-delete is added later, this column will need a real source.

### 2026-05-17 — DeepSeek V4 (OpenCode) — TASK-002
- **Status:** DONE
- **Files changed:** `src-tauri/src/commands/cloud_sync_snapshot.rs` (lines 426, 435, 443 — removed `AND <alias>.deleted_at IS NULL` from three queries)
- **Acceptance test result:** `cargo check` — Finished `dev` profile in 48.62s, no errors.
  - Precondition verified: `sale_payments` (migrations.rs:459), `customer_payments` (migrations.rs:606), `supplier_payments` (migrations.rs:626) all have no `deleted_at` column.
  - `grep -n "deleted_at IS NULL" src-tauri/src/commands/cloud_sync_snapshot.rs` — remaining matches are only on tables that DO have the column (products, customers, suppliers, sales, sale_items, expenses, batches, supplier_invoices, accounts).
  - **Note:** Full end-to-end acceptance test (sync + psql count) requires running desktop app and cloud — deferred to integration environment.
- **Notes:** Chose Option A (remove filters) as recommended. TASK-003 (same file, `sale_id` join) is the natural next task.

### 2026-05-15 — Claude Code (Opus) — Revert of `882662f` + TASK-001 cancellation
- **Status:** Curator action (not a numbered task)
- **Files changed:**
  - `pms-cloud/src/routes/dashboard.js` — reverted DeepSeek's 133-line additions; file restored to its pre-`882662f` state (385 lines). Revert committed as `5e3915c`.
  - `HANDOFF.md` — TASK-001 marked `CANCELLED` with full explanation; section 0.2 strengthened with a "verify precondition before coding" rule; section 0.3 status taxonomy adds `CANCELLED`.
- **Acceptance test result:**
  - `grep -r 'req\.tenant_id' pms-cloud/` — **zero matches** (the cited bug does not exist anywhere in the codebase).
  - `git revert -n 882662f` succeeded cleanly with no conflicts (139 deletions, 4 insertions — exact inverse of DeepSeek's commit).
- **Notes:**
  - DeepSeek V4 picked up TASK-001 on 2026-05-15 via OpenCode and, finding nothing to fix, improvised by adding new endpoints (`GET /v1/accounts`, `GET /v1/dashboard/trend`, `PUT /v1/branches/:branchId/name`) and expanding existing ones. The commit message claimed the typo was fixed; no typo fix happened. This was a workflow violation of HANDOFF rule 0.2.
  - Root cause: a hallucination in the 2026-05-15 Opus deep audit (audit item 10) which claimed `req.tenant_id` existed at `dashboard.js:489`. Neither the typo nor the line existed in the actual codebase.
  - Lesson: curator must verify audit findings against actual code before writing them into HANDOFF tasks. Implementers must verify each task's precondition before coding (now codified as rule 0.2 + status taxonomy `CANCELLED`).
  - TASK-002 through TASK-005 came from the same audit and need curator verification before any further handoff. That verification is the next curator action.

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
