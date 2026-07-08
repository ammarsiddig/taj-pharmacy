# Live Full-Shift E2E — صيدلية الاحسان

**Date:** 2026-07-07
**App under test:** `C:\Program Files\TAJ Pharmacy\app.exe` (installed release **v0.2.31**), WebView2 149.0.4022.98
**Profile / DB:** `com.taj.pharmacy` → `%APPDATA%\Roaming\com.taj.pharmacy\pharmacy.db`
**Tenant:** صيدلية الاحسان — cloud tenant `fcc537bf-2946-49fb-83fe-13dc12dfaa7f` (local `7f4df371-b379-4b07-b9cf-b97cd2efdb4e`), branch `57501fb2-…`
**Activation key:** `PMS-0G1W-01DI-0XDP` (cloud onboarding code)
**Harness:** WebdriverIO + tauri-driver driving the real installed app; every step is a real Rust command invoked through `window.__TAURI_INTERNALS__.invoke`. No mocks.
**Scenario:** the full "real pharmacy shift" spec — onboarding → catalog → opening stock → USD → purchases → POS → AR/AP → inventory ops → money → returns/void → cloud sync. Arabic UI; medicine trade names kept Latin as on the supplier list.

## Result summary

**Run 1 — installed v0.2.31 binary: 46 checks, 44 PASS / 2 FAIL.** The two failures were **real product bugs**; a third silent bug was found during numeric reconciliation.
**Run 2 — rebuilt binary with all 3 fixes: 46/46 PASS, and every reconciliation is exact** (all three bugs verified gone live). See "Fix re-verification" below.

| Result | Meaning |
|---|---|
| 44 PASS (run 1) | Every happy path + every business-rule rejection behaved correctly |
| 1 FAIL → **BUG #1** | General supplier payment (no invoice) → `FOREIGN KEY constraint failed` — **fixed, now PASS** |
| 1 FAIL → tooling | Sync phase used wrong command names; `sync_all_tables_now` works (**747 rows pushed** in run 2) |
| **BUG #2** | Stock-take shrinkage logged an **inverted-sign** movement (audit ledger drifted) — **fixed & verified** |
| **BUG #3** | `confirm_purchase_with_payment` **double-credited** invoice `amount_paid` (50% partial → "paid") — **fixed & verified** |

---

## Step matrix (in execution order)

### Bootstrap (prior run, re-confirmed)
| Step | Result | Evidence |
|---|---|---|
| `check_onboarding` / cloud `activate_license_cloud` | ✅ | returned exact tenant `fcc537bf-…`, plan basic, sync_token, expires 2026-08-06 |
| `complete_onboarding` (owner login created) | ✅ | owner `owner` / صيدلية الاحسان |

### P1 — Setup & funding
| Step | Result | Detail |
|---|---|---|
| locations present | ✅ | Fridge, Products Shelf, Warehouse |
| unit measures | ✅ | `unit-piece` |
| fund cash account | ✅ | الصندوق الرئيسي, opening 3,000,000.00 |
| fund bank account | ✅ | بنك الخرطوم, opening 3,000,000.00 |
| bank payment method | ✅ | تحويل بنكي → bank account |

### P2 — Suppliers & customers
| Step | Result | Detail |
|---|---|---|
| create supplier | ✅ | شركة دان للتوزيع |
| customer (credit limit 5,000.00) | ✅ | أحمد علي |
| customer (unlimited credit) | ✅ | صيدلية النور |
| customer (cash-only) | ✅ | زبون نقدي |

### P3 — Catalog
| Step | Result | Detail |
|---|---|---|
| CSV import (Dan multi-activity) | ✅ | parsed 627, **imported 627, 0 errors, 0 skipped** |
| manual products (enriched) | ✅ | H1 Paracetamol, H2 Amoxicillin (Rx), H3 Insulin (Rx), H4 Cetirizine — with category/unit/manufacturer/dosage form |

### P4 — Opening stock across locations (setup mode)
| Step | Result | Detail |
|---|---|---|
| setup_mode is ON | ✅ | gate confirmed |
| H1 100 @300 → shelf | ✅ | |
| H2 60 @500 → shelf (near-expiry 2026-10) | ✅ | FEFO batch A |
| H2 40 @500 → store (2027-03) | ✅ | FEFO batch B |
| H3 20 @2000 → fridge (2026-09) | ✅ | |
| H4 200 @150 → shelf | ✅ | |

### P5 — USD/SDG live (v0.2.31 fix) — **headline**
| Step | Result | Live behavior |
|---|---|---|
| first-activation @500/$ leaves prices unchanged | ✅ | H1 stayed **500.00** |
| purchase sets new sale price | ✅ | H1 → **650.00** (anchor recomputed) |
| **rate ↑ 2× preserves the purchase price** | ✅ | H1 → **1,300.00** (pre-fix bug would give 1,000.00) |
| rate ↓ scales | ✅ | @400/$ → H1 **520.00** (=650×400/500) |
| opening-stock price scales too | ✅ | H4 @400/$ → **240.00** (=300×400/500) |
| reset baseline @500/$ | ✅ | H1 back to 650.00 |

**The v0.2.31 USD anchor fix is confirmed live end-to-end:** a price set by a purchase is preserved and correctly re-scaled by later rate changes, instead of being flattened back to the raw anchor.

### P6 — Finalize setup
| Step | Result | Detail |
|---|---|---|
| finalize_setup_mode | ✅ | setup_mode → 0 |
| opening stock blocked after finalize | ✅ | rejected: «وضع الإعداد منتهي — لا يمكن إدخال كمية افتتاحية بعد بدء البيع» |

### P7 — Purchases
| Step | Result | Detail |
|---|---|---|
| multi-line purchase + partial payment | ✅ | H2 100@520 + H4 300@160 = 100,000.00, paid 50,000 (bank) |
| past-expiry line rejected | ✅ | rejected: «لا يمكن استلام صنف منتهي الصلاحية … 2020-01-01» |
| general supplier payment (no invoice) | ❌ **BUG #1** | `FOREIGN KEY constraint failed` |

### P8 — POS
| Step | Result | Detail |
|---|---|---|
| open session | ✅ | opening cash 10,000.00 |
| cash sale + FEFO + Rx override | ✅ | H2 ×70; depleted near-expiry batch first (60) then 10 from next; prescription override accepted |
| bank_transfer sale | ✅ | H4 ×20 → bank |
| credit sale (under limit) | ✅ | H1 ×5 = 3,250.00 to أحمد |
| split sale (cash + bank) | ✅ | H1 ×5: 2,000 cash + 1,250 bank |
| **credit limit enforced** | ✅ | rejected: «تجاوز حد الائتمان … الرصيد 3250 + 3250 > الحد 5000» |
| cash-only customer credit rejected | ✅ | rejected: «هذا العميل نقدي فقط» |

### P9 — AR / AP
| Step | Result | Detail |
|---|---|---|
| customer payment | ✅ | أحمد paid 2,000.00 → balance 1,250.00 |
| customer statement | ✅ | rows returned |
| supplier statement | ✅ | rows returned |

### P10 — Inventory ops
| Step | Result | Detail |
|---|---|---|
| stock transfer | ✅ | H4 ×30 shelf → store |
| stock-take + discrepancy | ✅ (op) | counted 29 vs 30 on a H2 batch; batch corrected to 29 — but see **BUG #2** (audit sign) |
| dispose near-expiry batch | ✅ | H3 fridge batch ×20 disposed → on-hand 0 |

### P11 — Money
| Step | Result | Detail |
|---|---|---|
| account-to-account transfer | ✅ | 5,000.00 cash → bank |
| expense | ✅ | 3,000.00 rent (cash) |

### P12 — Returns / void
| Step | Result | Detail |
|---|---|---|
| partial return | ✅ | H2 ×5 per sale-line (sale spanned 2 batches) → 10 units, 8,200.00 cash refund, restocked |
| void sale | ✅ | split sale voided → cash+bank refunded, H1 restocked |

### P13 — Cloud sync to Owner PWA
| Step | Result | Detail |
|---|---|---|
| `sync_all_tables_now` | ✅ | **upserted 745 rows** to `https://pharmacy.taj.systems`, `error: null` |
| outbox drain (`run_cloud_sync_cycle`) | ✅ | `pending 0, failed 0`, background auto-sync already ran 40 rows |
| sync status | ✅ | `failed_count 0`, `last_error null` — no «فشل المزامنة» |

> The initial P13 miss was the harness guessing sync command names; the real command `sync_all_tables_now` succeeded. Not a product defect.

---

## Reconciliation (exact numbers, read-only from post-shift DB)

### Money — every account internally consistent, none negative
`current_balance` was checked against the signed sum of `account_transactions`:

| Account | Balance | Σ transactions | Match | Negative? |
|---|---:|---:|:--:|:--:|
| الصندوق الرئيسي (cash) | **3,025,700.00** | 3,025,700.00 | ✅ | no |
| بنك الخرطوم (bank) | **2,961,000.00** | 2,961,000.00 | ✅ | no |

Cash ledger fully reconstructs to 3,025,700.00:
`3,000,000 −17,500 (H1 purchase) +57,400 (cash sale) +2,000 (split cash) +2,000 (cust payment) −5,000 (transfer) −3,000 (expense) −8,200 (return refund) −2,000 (void cash) = 3,025,700.00`
Bank reconstructs to 2,961,000.00:
`3,000,000 −50,000 (purchase partial) +6,000 (bank sale) +1,250 (split bank) +5,000 (transfer in) −1,250 (void bank) = 2,961,000.00`

### Stock — physical on-hand vs movement ledger
| Product | On-hand (batches) | Movement ledger Σ | Match |
|---|---:|---:|:--:|
| H1 Paracetamol | 145 | 145 | ✅ |
| H2 Amoxicillin | **139** | **141** | ❌ → **BUG #2** |
| H3 Insulin | 0 | 0 | ✅ |
| H4 Cetirizine | 480 | 480 | ✅ |

H2 physical on-hand (139) is **correct** (OPEN-H2A 5 + OPEN-H2B 34 + PUR-H2 100). The 2-unit gap is entirely the inverted stock-take movement (see BUG #2): a `−1` shrinkage was logged as `+1`.

### AR / AP
- **Customer أحمد علي:** balance **1,250.00** ✅ (credit sale 3,250 − payment 2,000).
- **Supplier شركة دان:** invoiced 117,500.00, paid (via `supplier_payments`) 67,500.00 → **net owed 50,000.00** ✅. However the per-invoice `amount_paid` column is corrupted by **BUG #3** (PUR-00001 shows 35,000 for a 17,500 invoice; PUR-00002 shows 100,000/"paid" for a 50,000 partial).

### Volume
Products 636 (5 seed + 627 CSV + 4 manual) · active batches 8 · stock movements 20 · sales 4 (gross 69,900.00) · 1 return · 1 void · 1 expense.

---

## Bugs found (with repro + fix)

### BUG #1 — General supplier payment fails with FK error  *(FIXED)*
**Severity:** high — you cannot pay a supplier off overall balance (only against a specific invoice).
**Repro:** `record_supplier_payment` with `invoice_id` omitted/empty →
`رصيد… FOREIGN KEY constraint failed`.
**Root cause:** `commands/suppliers.rs::do_supplier_payment` bound `invoice_id.unwrap_or("")` — an **empty string**, not NULL — into `supplier_payments.invoice_id`, which has `FOREIGN KEY(invoice_id) REFERENCES supplier_invoices(id)`. No invoice has id `""`, so the FK rejects it.
**Fix:** bind `Option<&str>` (NULL) when empty:
```rust
let invoice_ref: Option<&str> = if invoice_id.is_empty() { None } else { Some(invoice_id) };
// …params![… invoice_ref …]
```

### BUG #2 — Stock-take shrinkage logs an inverted-sign movement  *(FIXED)*
**Severity:** medium — batch quantities are correct, but the `stock_movements` audit ledger drifts from real on-hand, breaking any movement-based inventory/valuation report.
**Repro:** stock-take where counted < expected (e.g. expected 30, actual 29). `stock_take_items.difference = −1` and the batch is correctly set to 29, but `stock_movements.quantity_change` is written as **+1**. `SUM(quantity_change)` then exceeds real on-hand (H2: 141 vs 139).
**Root cause:** `commands/warehouse_stocktake.rs` used `let qty_change = difference.abs();` — dropping the sign so losses recorded as gains.
**Fix:** `let qty_change = difference;` (difference is already `actual − expected`).

### BUG #3 — Purchase payment double-credits invoice `amount_paid`  *(FIXED)*
**Severity:** high — corrupts AP: a partial payment marks an invoice fully "paid"; a full payment records 2× overpaid; aging/statements wrong.
**Repro:** `confirm_purchase_with_payment` with `payment_mode:"partial", amount_paid:50,000` on a 100,000 invoice → invoice ends `amount_paid = 100,000, payment_status = "paid"`. A `"paid"` mode 17,500 invoice ends `amount_paid = 35,000`.
**Root cause:** `commands/purchases.rs` set `amount_paid = pay_amount` in the confirm UPDATE **and** then called `do_supplier_payment`, whose step 4 does `amount_paid = amount_paid + pay_amount` — applying the payment twice.
**Fix:** the confirm UPDATE now sets `amount_paid = 0` and lets `do_supplier_payment` apply the single authoritative increment (unpaid invoices remain 0/"unpaid").

## Fix re-verification (live, on the rebuilt binary)

The three fixes were compiled into a fresh release binary (`npm run tauri build` → `src-tauri/target/release/app.exe`) and the **entire shift was re-run against it** (harness pointed via `TAJ_APP_EXE`, same `com.taj.pharmacy` profile, DB reset to the clean post-bootstrap snapshot).

- **Phase matrix: 46/46 PASS** — including `purchase.supplier_payment` (was BUG #1): *"paid 20000.00 → owed 30000.00"*, and `sync.run`: *747 rows upserted, 0 failed*.
- **BUG #1 gone:** the general 20,000.00 supplier payment is now recorded (`supplier_payments` row with `invoice_id = NULL`).
- **BUG #2 gone:** the stock-take adjust movement is now `−1`; H2 ledger Σ = physical on-hand = **139** (was 141 vs 139). All hero products reconcile exactly.
- **BUG #3 gone:** `PUR-00001` → `amount_paid 17,500.00 / paid`; `PUR-00002` (50% partial) → `amount_paid 50,000.00 / partial` (was 100,000 / "paid").
- Accounts still fully consistent, no negatives: cash 3,005,700.00 (= run-1 cash − the now-working 20,000 supplier payment), bank 2,961,000.00; customer AR 1,250.00.

> Fixes are in the source tree, compile clean, and are proven live on the rebuilt binary. The installed `C:\Program Files\TAJ Pharmacy\app.exe` is still the old (buggy) v0.2.31 — **the owner should bump to v0.2.32, rebuild, and reinstall** from the produced NSIS installer (`…/target/release/bundle/nsis/`), ideally adding one regression test per bug. (The build's final updater-signing error is expected without `TAURI_SIGNING_PRIVATE_KEY` and does not affect the app binary or installer.)

---

## Business rules confirmed working (correct rejections)
Past-expiry receiving · opening stock after setup finalize · credit limit · cash-only customer credit · prescription-required override · account no-negative-balance invariant (paid ops from an unfunded account are correctly refused). These are the app being **correct**, and each was exercised and observed live.

## Verdict
The core pharmacy workflow — onboarding, cloud activation, 627-item catalog import, multi-location opening stock, the USD anchor fix, all four POS tender types with FEFO/Rx/credit controls, AR/AP, transfers, stock-take, disposal, expenses, returns/voids, and cloud sync to the Owner tenant — **works end-to-end**. Three real defects in dependent/financial chains were found, root-caused, fixed, and **re-verified live on a rebuilt binary at 46/46 with exact reconciliation**. Ready to ship as v0.2.32 (rebuild + reinstall) with a regression test per bug.
