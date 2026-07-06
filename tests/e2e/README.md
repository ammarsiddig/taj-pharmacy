# TAJ Pharmacy — E2E Test Harness

End-to-end tests that drive the **real installed desktop app** (`app.exe`) and the
**Owner PWA** (`pharmacy.taj.systems`) against **real data**. Non-destructive and
self-cleaning by design.

Two drivers, because two very different surfaces:

| Suite | Surface | Tooling | Writes data? |
| --- | --- | --- | --- |
| `spike` | Installed desktop exe | tauri-driver + WebdriverIO | No (pre-login read) |
| `safe`  | Installed desktop exe | tauri-driver + WebdriverIO | **No** (read/verify only) |
| `write` | Installed desktop exe | tauri-driver + WebdriverIO | Yes — **self-reversing**, gated |
| `pwa`   | Owner PWA (cloud)     | Playwright (Chromium)      | **Never** (read-only) |

---

## Feasibility spike — RESULT: ✅ PASS

The go/no-go question was: *can tauri-driver + WebdriverIO actually attach to the
installed **release** build on Windows?* (Tauri v2 WebDriver is experimental.)

**It can.** On the owner's machine the spike launched
`C:\Program Files\TAJ Pharmacy\app.exe`, attached over WebView2
`149.0.4022.98`, and read the login screen (`<h1>TAJ Pharmacy</h1>` + the
username/password inputs) — 2 assertions passing. No debug build or PWA-only
fallback is needed.

Reproduce it any time:

```powershell
npm run spike        # from tests/e2e
```

### Run results — 2026-07-05

| Suite | Result |
| --- | --- |
| `spike` | ✅ **PASS** — attaches to the installed exe, reads the login screen |
| `safe` (desktop) | ✅ **4/4 PASS** — navigation, multi-location single-row, Session History (wide range), no sync-failure banner |
| `pwa` › recently-synced data | ✅ **PASS** — cloud shows data synced from the desktop |
| `pwa` › Activity page | ❌ **FAIL (as intended)** — Activity returns `200` but renders a blank body (no items, no empty state). The suite catches the known production bug. |
| `write` (desktop) | ⏳ Authored; run supervised the first time (creates a tagged product; needs sellable stock) |

#### Note on the desktop login + feature lock (fixed in the harness)

Early runs showed every premium page (POS/Products/Warehouse/Reports) as
**feature-locked**, even though the account is the **owner** role and the tenant
is fully licensed (`get_license_info` → `is_valid: true, feature_flags: 0`). Root
cause: the app's `LicenseProvider` fetches the license **once at mount**. Under
automation the app mounts on the *login screen* (no tenant context yet), so that
fetch fails and the license context stays `null` until a 5-minute retry — locking
every feature-gated page. When you launch the app normally you're already logged
in at mount, so it succeeds instantly and you never see this.

**Fix (harness-side, no app change):** `login()` reloads the app after
authenticating, so `LicenseProvider` re-mounts **with** the tenant present and the
features unlock immediately. This is a real app quirk worth noting — after an
in-session login the license context isn't refreshed — but the harness works
around it cleanly.

---

## Prerequisites (one-time, per machine)

1. **Rust/Cargo** — to build `tauri-driver`:
   ```powershell
   cargo install tauri-driver --locked
   ```
   Installs to `%USERPROFILE%\.cargo\bin\tauri-driver.exe`.

2. **msedgedriver matching the WebView2 runtime.** The desktop app renders in
   WebView2; the WebDriver that drives it **must match that runtime's version**.
   The setup script reads your WebView2 version from the registry and downloads
   the exact `msedgedriver` into `tests/e2e/.drivers/`:
   ```powershell
   npm run setup:driver        # from tests/e2e   (or: npm run e2e:setup from repo root)
   ```
   Confirmed match on this machine: WebView2 `149.0.4022.98` →
   msedgedriver `149.0.4022.98`. **Re-run this after any WebView2/Edge update** —
   a version mismatch is the #1 cause of "session not created" failures.

3. **Node deps:**
   ```powershell
   npm install                 # from tests/e2e
   ```

4. **Playwright browser (PWA suite only):**
   ```powershell
   npx playwright install chromium
   ```

Everything above is bundled in one command from the repo root:
```powershell
npm run e2e:setup
```

---

## Running

From the repo root (delegates into `tests/e2e`):

```powershell
npm run e2e:spike      # prove the harness attaches (no login, no data)
npm run e2e:safe       # read-only desktop suite
npm run e2e:write      # money-path desktop suite (GATED — see below)
npm run e2e:pwa        # read-only Owner PWA suite
```

Or from inside `tests/e2e`: `npm run spike | safe | write | pwa`.

### Close the desktop app first

The desktop suites launch **their own** instance of `app.exe`. Two instances on
one SQLite database is unsafe, so the runner refuses to start while the app is
open. Close it, or let the runner close it for you:

```powershell
$env:TAJ_E2E_CLOSE_APP="1"; npm run e2e:safe
```

### Credentials & test data (environment variables)

Nothing is hardcoded. Set what each suite needs:

| Variable | Needed by | Purpose |
| --- | --- | --- |
| `TAJ_DESKTOP_USER`, `TAJ_DESKTOP_PASS` | safe, write | Real desktop login |
| `TAJ_PWA_USER`, `TAJ_PWA_PASS` | pwa | Real owner cloud login |
| `TAJ_E2E_MULTILOC_PRODUCT` | safe, pwa | Trade name of a product stocked in >1 location (for the single-row assertion). If unset, safe falls back to a generic "no duplicate rows" check. |
| `TAJ_E2E_SELLABLE_PRODUCT` | write | A tagged product that already has sellable stock (see Write suite) |
| `TAJ_E2E_CLOSE_APP=1` | any desktop | Let the runner close a running app instead of erroring |
| `TAJ_E2E_WRITE_OK=yes` | write | Explicit opt-in — the write suite will not run without it |

PowerShell example:
```powershell
$env:TAJ_DESKTOP_USER="owner"; $env:TAJ_DESKTOP_PASS="…"
$env:TAJ_E2E_MULTILOC_PRODUCT="باراسيتامول 500"
npm run e2e:safe
```

Machine-specific paths (installed exe, DB, drivers) are auto-detected in
`config/env.js` and can each be overridden with an env var if this harness moves
to another machine — see the top of that file.

---

## Data-safety guarantees

This harness runs against a **real, live pharmacy database**. The safety model:

1. **Backup before every desktop run.** The runner copies `pharmacy.db` +
   its WAL sidecars (`-wal`, `-shm`) to
   `…\Roaming\com.taj.pharmacy\e2e-safety-backups\backup-<timestamp>\` *while the
   app is closed* (so the snapshot is consistent). Restore explicitly:
   ```powershell
   node desktop/helpers/db-backup.js restore "<backup-dir>"
   ```
   The harness's own `backups/` folder is separate from the app's — we never
   touch the app's backups.

2. **Create-only, uniquely tagged.** Tests may create entities **only** with the
   prefix `E2E_TEST_<timestamp>`. They never modify or delete a pre-existing
   record, and never run any global/wipe/destructive operation.

3. **Delete exactly what we made.** After the `write` suite, the runner sweeps
   the database and hard-deletes **only** rows matching `E2E_TEST_%`
   (`desktop/helpers/cleanup.js`, allow-listed to `products.trade_name`). It
   refuses to run while the app is open. Dry-run any time:
   ```powershell
   node desktop/helpers/cleanup.js            # lists tagged rows, deletes nothing
   node desktop/helpers/cleanup.js --delete   # removes them
   ```

4. **Money paths self-reverse.** The `write` suite's sale is **voided** in-app
   before teardown; its past-expiry purchase is **rejected by the app** and never
   saved. Net effect on real books: zero.

5. **PWA is read-only.** The Owner PWA suite only navigates and reads. It issues
   no mutating request to the cloud.

6. **Native OS dialogs are not clicked.** Print dialogs, file pickers, etc. are
   OS-native and cannot be driven via WebView WebDriver — the tests assert app
   **state** instead.

---

## What each suite checks

### `safe` (read/verify only)
- Logs in.
- Navigates POS / Products / Warehouse / Reports without crashing.
- Product search shows a multi-location product as **exactly one row**.
- Session History loads over a **wide** date range (5 years).
- **No `فشل المزامنة`** sync-failure banner after a sync settles.

### `write` (money-path, gated — `TAJ_E2E_WRITE_OK=yes`)
- Rejects a purchase line with a **past expiry** (nothing saved).
- Creates an `E2E_TEST_` product → opens a session → sells it → closes → asserts
  it appears in Session History → **voids** it. The product row is swept at
  teardown.

> **Supervised first run.** Unlike the spike, the write suite's UI steps were
> authored from source but not yet validated against the live app. Run it
> **supervised** the first time and tune selectors if the markup has shifted. A
> freshly created product has **zero stock**, so to actually complete a sale you
> must either seed one unit of opening stock for the tagged product, or point
> `TAJ_E2E_SELLABLE_PRODUCT` at a tagged product that already has stock. If
> neither is present the suite stops before the sale (and still cleans up).

### `full` — day-in-the-life review (money-path, gated — `TAJ_E2E_WRITE_OK=yes`)
One long ordered scenario that behaves like a real pharmacist for a full day, then
reconciles: create 2 suppliers, 3 customers (cash-only / unlimited / limited credit),
3 bilingual products → purchase with batches + future expiry (and a rejected
past-expiry line) → partial supplier payment → inter-location transfer + stocktake +
reorder alerts → open POS session → cash / bank / credit / blocked-credit /
over-limit / split sales → multi-location **one-row + FEFO** check → partial return →
void → outside-POS credit invoice → customer payment + statement → account transfer →
expense → open **every report** → reconcile stock, cash, bank, customer, supplier
against the operations → sync. Every step records PASS/FAIL and the run never aborts
on one failure.

- **How it drives the app.** Transactions run through the app's **own Tauri command
  layer** (executed inside the running installed app via its invoke bridge) — the
  real Rust logic: credit limits, past-expiry rejection, FEFO, stock movements. The
  **DB is the reconciliation source of truth**; the **UI** is used for the
  screen-specific checks (credit-mode selector, bilingual labels, movements Arabic
  labels, reorder screen, session history, multi-location row). Methodology is
  disclosed in the report.
- **Output:** `tests/e2e/REPORT.md` — per-step PASS/FAIL, a reconciliation table
  (expected vs actual, exact numbers), every bug with repro + screen, and a cleanup
  section.
- **Teardown is a full snapshot RESTORE**, not command-by-command reversal. Because
  `void_sale` is broken on the installed build and payments have no reverse command,
  command-based teardown cannot restore account balances. So `npm run e2e:full`
  takes a snapshot, runs, and **restores the snapshot** at the end — guaranteeing the
  real data (balances included) returns to its exact pre-run state, zero residue.
  (Run it only via the runner, which backs up first; a raw `wdio` run has no backup
  to restore.)

Run it:
```powershell
$env:TAJ_DESKTOP_USER="admin"; $env:TAJ_DESKTOP_PASS="admin123"
$env:TAJ_E2E_WRITE_OK="yes"; $env:TAJ_E2E_CLOSE_APP="1"
npm run e2e:full        # from repo root: npm run e2e:full
```

### `exhaustive` — full-surface + negative paths (money-path, gated — `TAJ_E2E_WRITE_OK=yes`)
The widest suite: every screen and feature plus the edge and **negative** cases the
day-in-the-life run skips, with **expiry** as the priority focus. Same engine as
`full` (drives the app's own Tauri commands, DB is the reconciliation truth), same
teardown (snapshot **restore** — verified pristine after).

What it asserts, happy-path **and** failure-path:
- **Expiry (priority):** expired-only stock cannot be sold (POS + invoice); FEFO sells
  the earliest *valid* batch and never an expired one; past-expiry purchase rejected;
  expiry-**exactly-today** boundary is inclusive (purchase + sale allowed); dispose an
  expired batch (stock removed, `dispose` movement, value written off); expiry-report
  buckets (7/30/60/90 + at-risk value); low-stock alerts.
- **POS edge:** oversell, qty 0, negative qty, discount > total, below-cost/below-min,
  split parts not summing, credit-limit boundary (exactly-at vs one-piaster-over),
  return more than sold, park/hold cart round-trip.
- **Money edge:** same-account transfer, over-transfer (overdraft), customer overpayment.
- **Inventory edge:** same-location & over-qty transfer, stocktake discrepancy
  adjustment, opening-stock gated by `setup_mode`.
- **Validation:** duplicate barcode, empty required field, soft-delete preserves history.
- **USD rate + tax**, **all settings/warehouse screens** load without a runtime error,
  and a final **reconciliation** of cash/bank/stock against the operations.

The report ends with an explicit **coverage checklist** (covered / partial / not-covered)
so nothing is skipped silently — role-based permissions, auth lockout, plan-tier license
gating, CSV import, and report CSV exports are called out as needing manual/supervised runs.

```powershell
$env:TAJ_DESKTOP_USER="admin"; $env:TAJ_DESKTOP_PASS="admin123"
$env:TAJ_E2E_WRITE_OK="yes"; $env:TAJ_E2E_CLOSE_APP="1"
npm run e2e:exhaustive        # from repo root: npm run e2e:exhaustive
```

### `pwa` (read-only)
- Logs into `pharmacy.taj.systems` as the real owner.
- After a desktop sync, asserts recently-synced data appears (Products page
  non-empty; optionally the `TAJ_E2E_MULTILOC_PRODUCT`).
- Asserts the **Activity** page loads without a runtime error. **This is expected
  to fail today** — the Activity page is currently broken in production, and this
  test is here to catch exactly that. A failing Activity test is a real finding,
  not a harness bug.

---

## App code hooks

None required. The desktop selectors rely only on markup that already exists in
the installed build (input `name`s, nav `href`s, Arabic labels) — **no rebuild or
reinstall is needed** to run the suites. If future stable `data-testid` hooks are
added to the app they must be **additive** (invisible in production) and gated per
the HANDOFF conventions.

---

## Layout

```
tests/e2e/
  config/         env.js (paths/creds), wdio.shared.js, wdio.{spike,safe,write}.js
  desktop/
    helpers/      app.js (login/nav/selectors), db-backup.js, cleanup.js, driver-process.js
    specs/        spike.e2e.js, safe.e2e.js, write.e2e.js
  pwa/
    specs/        pwa.safe.spec.js
    playwright.config.js
  scripts/        run-desktop.mjs, run-pwa.mjs, setup-driver.mjs
  .drivers/       msedgedriver.exe (git-ignored)
```
