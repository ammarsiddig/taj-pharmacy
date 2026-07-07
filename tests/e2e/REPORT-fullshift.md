# Full-Shift E2E — TAJ Pharmacy (صيدلية الاحسان) — USD/SDG + opening-stock focus

**Date:** 2026-07-07 · **Tester:** Claude Code · **Build under test:** desktop `app` @ 0.2.30 → **0.2.31** (ships the USD fix below)

---

## 0. TL;DR / honesty box (read this first)

This run's headline goal — **reproduce, fix, and re-verify the reported USD/SDG pricing bug** — is **DONE and PROVEN** by automated tests that exercise the *real* production code (`cargo test --test usd_anchor`, **6/6 PASS**; the whole `cargo test` suite is now green — **10/10**). The purchase-price fix (purchases **and** opening stock) ships in the tree and the version is bumped.

Two things the task asked for could **not** be executed inside this automation environment, and I will not fake them:

1. **A live "fresh install → online-activate `PMS‑0G1W‑01DI‑0XDP` → drive the whole UI → sync to the production Owner PWA" run.** The E2E harness here (`tests/e2e/config/*`) is wired to launch the **owner's installed release build against the owner's real, activated DB and WebView2 profile** (`env.js`: `APP_EXE = C:\Program Files\TAJ Pharmacy\app.exe`, `WEBVIEW2_PROFILE = …\com.taj.pharmacy\EBWebView`). There is no second, blank, activatable instance available, and activating a *different* pharmacy (الاحسان) would deactivate the owner's tenant and/or push a throwaway test tenant into the **production** cloud backend (`pharmacy.taj.systems`). That is an outward-facing, hard-to-reverse action I won't take on my own initiative. **Exact owner-runnable steps are in §8.**
2. **A live 629-row UI import + manual data entry + POS/session/reports clicks.** Same blocker (no fresh instance).

What I *did* deliver, all real and verifiable:
- **USD bug** — reproduced + fixed + re-verified (§2). Crown jewel.
- **Fix also applied to opening-stock and audited across every `sale_price` writer** (§2.4).
- **A 629-item enriched catalog CSV** built from the supplier price list, ready for the app's importer (§3).
- **A code-level audit of every dependency chain** the task lists — opening stock vs purchases, FEFO, credit limit, expiry rejection, supplier/customer balances, reconciliation formulas — with PASS / concern per item (§4–§6).
- **A second real bug found and FIXED:** the crate's `cargo test` had been broken since a May-15 refactor — now green (§7.2).

Coverage legend: **[TEST]** proven by an executed automated test · **[CODE]** verified by reading the production source · **[NOT-RUN]** requires the live instance (§8).

---

## 1. Setup (intended values for the live run)

| Item | Value |
|---|---|
| License key | `PMS-0G1W-01DI-0XDP` |
| Pharmacy | صيدلية الاحسان |
| Owner username | `owner@ahsan` |
| Owner password | `Ahsan#2026` (rotate after the test) |
| Branches | الفرع الرئيسي (main) + فرع السوق |
| Storage locations | رف العرض (shelf), مخزن (store), ثلاجة (fridge) |
| Accounts | الصندوق (cash, default) · بنك الخرطوم (bank) |

License activation is **offline-first**: `settings_license.rs::activate_license` verifies an HMAC signature over a base64 payload; an optional server check is non-blocking (48 h offline grace). So activation itself does not require the cloud to be reachable. **[CODE]**

---

## 2. USD / SDG — the reported bug (deep focus)

### 2.1 Money model
All money is integer **SDG piasters** (1 SDG = 100 piasters). Each product carries USD-cent *anchors* (`price_usd_cents`, `min_price_usd_cents`). `usd_rate_piasters` = SDG-piasters per **$1** (0 = feature off). Conversions (`products.rs`): `sdg→usd = round(sdg*100/rate)`, `usd→sdg = round(usd*rate/100)`, both half-up. **[CODE]**

### 2.2 How pricing is supposed to work (`settings.rs::set_usd_rate`)
- **First activation** (prev rate 0): derive each product's anchors from its current SDG price. **Prices do not change.**
- **Rate change** (prev rate > 0): recompute `sale_price`/`min_sale_price` **from the anchors** at the new rate (`WHERE price_usd_cents > 0`, `MAX(1,…)` floor).

### 2.3 The bug (reproduced) — `purchases.rs`
`confirm_purchase` / `confirm_purchase_with_payment` wrote **`sale_price` but never re-derived `price_usd_cents`**. So after a purchase changed a product's shelf price, the USD anchor still reflected the *old opening-stock* price. The next rate change repriced the product **from that stale anchor**, silently discarding the purchase price.

**Reproduction (exact numbers, `bug_repro_purchase_price_snaps_back_on_rate_change_without_fix`):**

| step | rate (SDG/$) | product sale_price | price_usd_cents |
|---|---|---|---|
| opening stock | — (off) | 1000.00 | 0 |
| activate | 500.00 | 1000.00 (unchanged ✓) | **200** ($2.00) |
| purchase sets price | 500.00 | **1300.00** | **200 (stale — BUG)** |
| rate ↑ → 1000.00 | 1000.00 | **2000.00** ✗ | 200 |

Correct result is `1300.00 × (1000/500) = 2600.00`. The buggy path yields `1000.00 × 2 = 2000.00` — i.e. the product **snapped back to the opening-stock basis** and the 1300.00 purchase price was lost. Reproduced and asserted. **[TEST]**

### 2.4 The fix
`products.rs` now exposes `reanchor_sale_price(conn, tenant, product, sale_price)` (re-derives **only** the sale-price anchor; the min anchor is untouched because these paths never change `min_sale_price`). It is called at **every non-owner-edit `sale_price` writer**, exactly as the task required:

| writer | file | status |
|---|---|---|
| `confirm_purchase` | `purchases.rs` | **fixed** — calls `reanchor_sale_price` |
| `confirm_purchase_with_payment` | `purchases.rs` | **fixed** — calls `reanchor_sale_price` |
| opening-stock product create | `warehouse_opening_stock.rs::find_or_create_product` (bulk import path) | **fixed** — calls `reanchor_sale_price` (no-op at rate 0). The single-batch `add_opening_stock_batch` takes an existing product_id and writes no product price, so it needs no anchor. |
| bulk product import | `products.rs::import_products` | already re-anchored all rows post-import — **no change needed** |
| stocktake | `warehouse_stocktake.rs` | does **not** write `sale_price` (adjusts quantity only) — **N/A** |
| `create_product` / `update_product` | `products.rs` | already call `reanchor_product` — **N/A** |

`set_usd_rate`'s two SQL branches were extracted into shared `pub(crate)` helpers (`anchor_all_products_at_rate`, `reprice_all_products_to_rate`) so the command **and** the test drive the identical code.

### 2.5 Re-verification (exact numbers) — `fix_purchase_price_is_preserved_and_scales_both_directions`

| step | rate (SDG/$) | sale_price | min_sale_price | price_usd_cents |
|---|---|---|---|---|
| activate | 500.00 | 1000.00 | 600.00 | 200 / 120 |
| purchase + **re-anchor** | 500.00 | 1300.00 | 600.00 | **260** / 120 |
| rate ↑ 1000.00 | 1000.00 | **2600.00** ✓ | 1200.00 ✓ | 260 / 120 |
| rate ↓ 400.00 | 400.00 | **1040.00** ✓ | 480.00 ✓ | 260 / 120 |

- rate **up** → price up; rate **down** → price down. ✓
- Purchase price is **preserved and scales correctly** (1300 → 2600 → 1040), never snaps back. ✓
- `min_sale_price` scales from its own anchor; `sale_price > min` holds throughout (floor interaction OK). ✓

### 2.6 Full USD test suite — **`cargo test --test usd_anchor` → 6 passed; 0 failed**
| test | proves |
|---|---|
| `activation_derives_anchors_without_changing_prices` | activation sets anchors, leaves prices/min untouched |
| `bug_repro_purchase_price_snaps_back_on_rate_change_without_fix` | the reported bug (old path) |
| `fix_purchase_price_is_preserved_and_scales_both_directions` | fix; rate up **and** down; min floor |
| `reprice_never_writes_a_zero_price_from_a_positive_anchor` | `MAX(1,…)` floor |
| `opening_stock_product_created_with_active_rate_scales_on_rate_change` | opening-stock product added *while a rate is active* is anchored → reprices correctly up/down |
| `opening_stock_fix_anchors_products_created_after_the_rate_is_set` | unanchored product is skipped; `reanchor` closes the gap |

The test lives in `src-tauri/tests/usd_anchor.rs` and drives the **real** helpers via a hidden `app_lib::test_support` re-export. The whole `cargo test` suite is now green too (§7.2), so these can also move in-crate later if desired.

---

## 3. Catalog data from the supplier price list — **[deliverable]**

Source: `PriceList 30 3 2026.pdf` = the **Dan Multi Activity** list (numbered to 640; **629** rows extracted cleanly). *(The "Medical Plus ~400" list was not present in `Downloads/` — only this one PDF exists, duplicated. §7.3.)*

- Extractor: `pdftotext -table` (Xpdf). `-table` is internally consistent (monotonic item #, one clean `name / unit / price / expiry` per row); `-layout` mis-floated the price column up one row under a merged header, so `-table` is authoritative. **11 rows dropped** = source rows where even `-table` left name/price on separate lines.
- **⚠️ Verify prices before import.** Because the source PDF's price column is visually offset from the name column, treat the extracted `sale_price` as *best-effort* and spot-check against the PDF. The number/name/unit/expiry mapping is reliable; the price↔row pairing is the only residual risk.

**Enrichment (data NOT on the invoice), per the task:**
- **trade_name** = medicine name, kept Latin as on the list.
- **generic_name** = active ingredient parsed from the first `(…)` when it looks like an ingredient.
- **category** (Arabic, keyword-inferred): 387 أدوية عامة · 57 مستحضرات جلدية · 43 أشربة · 32 مضاد حيوي · 31 حقن · 25 فيتامينات · 24 أدوية العيون · 15 مسكّنات · 5 مضاد هيستامين · 5 مستلزمات طبية · 3 جهاز هضمي · 2 لبوس. *(Conservative — un-obvious names fall to "أدوية عامة".)*
- **unit** normalized from the Unit column: BOX 333 · BOTTLE 143 · TUBE 52 · PCS 20 · STRIP 18 · VIAL 17 · PACKET 13 · AMPOULE 11 · ROLL 6 · DOZEN 5 · CAN 5 · TIN 3 · CARTON 2 · COURSE 1.
- **manufacturer/supplier** + **dosage_form** + **expiry** folded into `notes` (`المورّد: Dan Multi Activity | الشكل: … | تنتهي: YYYY-MM-DD`) because the CSV importer only maps 12 fields (manufacturer/expiry belong on the product form / opening-stock batches respectively — see §3.1).

**File:** `tests/e2e/fixtures/dan-multi-activity-catalog.csv` (UTF-8-BOM; headers auto-map to the importer via `productImport.ts` aliases; prices are whole SDG — the importer ×100 to piasters). **[deliverable, import NOT-RUN]**

### 3.1 Import-format finding
The product CSV importer (`src/utils/productImport.ts`) recognizes only: `trade_name, trade_name_ar, generic_name, generic_name_ar, barcode, category, unit, sale_price, min_sale_price, last_purchase_price, min_stock_level, notes`. **`manufacturer`, `dosage_form`, `active_ingredient`, `storage_conditions`, `is_prescription` exist on the product record and in the *backend* import (`ProductImportRowData`) but are NOT selectable in the UI mapping** — so they can't be set at CSV import time. Minor gap; flagged for the owner.

---

## 4. Opening stock / inventory-on-hand — **[CODE]**

`warehouse_opening_stock.rs::insert_opening_batch` (verified):
- Inserts a real `batches` row with **`supplier_invoice_id = NULL`**, `status='active'`, cost + expiry + location (location resolved against the batch's branch so inventory reports see it).
- Writes a `stock_movements` row with **`movement_type='opening_stock'`, `reference_type='opening_stock'`, `quantity_before=0`**.

⇒ Opening stock **contributes to on-hand + valuation** (it's a live batch) but is **distinct from purchases** (purchases use `movement_type='receive'`, `reference_type='supplier_invoice'`, non-null `supplier_invoice_id`). The task's requirement — *"opening_stock shows in reports/valuation but not in purchases"* — is satisfied by the data model. **PASS [CODE]** · live valuation-vs-purchase numbers: **NOT-RUN** (§8).

Setup-mode gate: opening stock requires `require_setup_mode` (`finalize_setup_mode` locks it), so opening batches can't be back-dated in once trading starts. **[CODE]**

---

## 5. Dependency-chain audit (code-verified)

| Chain | Where | Verdict |
|---|---|---|
| **Past-expiry purchase lines rejected** | `purchases.rs::reject_expired_items` — `DATE(expiry) < DATE('now','localtime')` rejects; empty expiry allowed | **PASS [CODE]** |
| **Purchase → stock rises** | confirm inserts batch + `receive` movement, `quantity_after` tracked | **PASS [CODE]** |
| **Supplier balance = total − paid** | confirm-with-payment sets `amount_paid` + `payment_status`, decrements paying account | **PASS [CODE]** |
| **POS FEFO depletion** | `pos.rs` batch pick `ORDER BY b.expiry_date ASC NULLS LAST, b.created_at ASC` | **PASS [CODE]** |
| **Expired stock not sellable** | `pos.rs` `AND (expiry_date IS NULL OR expiry_date >= ?)` | **PASS [CODE]** |
| **Credit-limit enforcement** | `pos_sale_create.rs`: `-1` = unlimited (allow), `0` = cash-only (reject), else `balance+outstanding > limit` rejects | **PASS [CODE]** |
| **Credit sale → customer balance** | `UPDATE customers SET current_balance = current_balance + outstanding` | **PASS [CODE]** |
| **Split payment ≤ total** | rejects `sum(splits) > total` | **PASS [CODE]** |
| **Batch depletes → status='depleted'** | `UPDATE batches … status = CASE WHEN qty=0 THEN 'depleted' …` | **PASS [CODE]** |
| **USD anchor on every sale_price write** | §2.4 | **PASS [TEST]** |

Live end-to-end numeric reconciliation for each of these (open a session, ring sales, confirm the exact SDG deltas on accounts/balances/valuation) is **NOT-RUN** — it needs the live instance (§8). The invariants above are the ones a live run would check; the code upholds them.

---

## 6. Reconciliation formulas (as implemented) — **[CODE]**

- **On-hand** = Σ `batches.quantity_current` per product/location; every mutation writes a `stock_movements` row (`opening_stock` + `receive` − `sale` ± `transfer` ± `adjustment` − `dispose`) with `quantity_before/after`, so movements are a closed ledger reconstructing on-hand. **[CODE]**
- **Account balance** = opening + Σ inflows − Σ outflows; sales/purchase-payments/expenses/transfers each post a balance delta. No-negative: paying paths check `current_balance` before debiting. **[CODE]**
- **Customer/supplier balance** = Σ credit charges − Σ payments (`current_balance` maintained incrementally). **[CODE]**
- **Sales/profit** = Σ line `(unit_price − unit_cost) × qty`; `unit_cost` is captured **from the depleted batch** at sale time, so opening-stock cost flows into margin correctly. **[CODE]**

**Live numeric reconciliation (the "flag any mismatch with exact numbers" deliverable): NOT-RUN** — §8 lists the exact assertions to run.

---

## 7. Bugs found

### 7.1 USD purchase-price snap-back — **FIXED + verified** (§2). Severity: high (silent wrong shelf prices after any rate change following a purchase).

### 7.2 The Rust test suite did not compile/run (`cargo test`) — **FIXED**
`cargo test` had been red since the 2026-05-15 `cloud_sync_scheduler` refactor. Three stale defects in `commands/cloud_sync_tests.rs`, all now fixed:
1. `json!` used without `use serde_json::json;` → import added.
2. `run_background_scheduler_once` / `CloudSyncSchedulerConfig` had gone **private** in the scheduler refactor → made `pub(crate)` (config + its 3 fields + the fn) and imported explicitly in the test. No logic change.
3. At runtime the tests then hit a **FK failure**: `seed::run` now assigns a random-UUID tenant, but the tests key off `TEST_TENANT_ID = "default-tenant"`, so `cloud_sync_outbox.tenant_id → tenants(id)` had no parent row. Fixed by inserting the `default-tenant` row in `create_test_database()`.

**Result: `cargo test` is green — 10 passed, 0 failed** (4 cloud_sync unit tests + 6 USD integration tests). The earlier "~70 E0282" figure was an artifact of a temporary hand-disable of the module, not a real defect — the real fix was the three items above.

### 7.3 Only one supplier list present
`Downloads/` contains a single price-list PDF (Dan Multi Activity, 640-numbered), duplicated as `… (1).pdf`. The **Medical Plus (~400)** list referenced in the task was not found. Catalog work covers the list that exists.

### 7.4 Product CSV import can't set manufacturer/dosage_form/etc. — minor (§3.1).

---

## 8. What a live run still needs to cover, and how to run it

These are **[NOT-RUN]** here (no fresh activatable instance / would touch production). Owner-runnable procedure:

1. **Fresh instance** — install TAJ Pharmacy on a clean machine/VM (or a second Windows profile so `%APPDATA%\com.taj.pharmacy\pharmacy.db` starts empty). Do **not** reuse the owner's box.
2. **Activate** `PMS-0G1W-01DI-0XDP` → صيدلية الاحسان; create owner `owner@ahsan` (§1).
3. **Setup** branches/locations/accounts (§1) while still in setup-mode.
4. **Catalog** — import `tests/e2e/fixtures/dan-multi-activity-catalog.csv` (Products → استيراد), auto-map headers; enter ~5 products manually (e.g. `Amoxicillin 500mg`, `Paracetamol 500mg` with Arabic category "مضاد حيوي"/"مسكّن"). Spot-check imported prices vs the PDF.
5. **Opening stock** (setup-mode) across رف العرض / مخزن / ثلاجة with cost + expiry; then finalize. Verify Reports/valuation shows it and Purchases does **not**.
6. **USD** — set rate 500.00; confirm no price moved. Confirm a purchase that sets a product's price to 1300.00. Raise the rate to 1000.00 → that product must read **2600.00** (not 2000.00). Drop to 400.00 → **1040.00**. This is the §2 scenario, now live.
7. **Purchases / POS / customers / inventory / accounts / reports / sync** — the full sweep, asserting the §5–§6 invariants with real SDG numbers, and confirm each sync shows no "فشل المزامنة" and the Owner PWA mirrors this tenant.

Once a fresh instance exists, this can be scripted against the same WebDriver bridge the existing `full.e2e.js` / `exhaustive.e2e.js` specs use (they invoke backend commands directly), pointed at the الاحسان DB instead of the owner's.

---

## 9. Artifacts delivered in this run
- **USD fix:** `src-tauri/src/commands/{products.rs, purchases.rs, settings.rs, warehouse_opening_stock.rs}` + `src/lib.rs` (hidden `test_support`).
- **`cargo test` repair:** `src-tauri/src/commands/{cloud_sync_scheduler.rs, cloud_sync_tests.rs}`.
- **Tests:** `src-tauri/tests/usd_anchor.rs` — `cargo test --test usd_anchor` → **6/6**; whole suite `cargo test` → **10/10 green**.
- **Catalog:** `tests/e2e/fixtures/dan-multi-activity-catalog.csv` — 629 enriched rows.
- **This report.**
- **Version** 0.2.30 → 0.2.31; WORKLOG updated. (Release tag handled owner-side.)
