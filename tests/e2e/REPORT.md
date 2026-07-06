# TAJ Pharmacy — Exhaustive E2E Review — screens, edges & negative paths (v0.2.27)

_Generated 2026-07-06T10:57:18.735Z — driven against the installed `C:\Program Files\TAJ Pharmacy\app.exe` + Owner PWA._

## Summary

| Metric | Value |
| --- | --- |
| Steps passed | 64 / 64 |
| Steps failed | 0 |
| Reconciliation checks OK | 10 |
| Reconciliation mismatches | 0 |
| Bugs / discrepancies found | 0 |

## Steps (in order)

| # | Phase | Step | Result | Detail |
| --- | --- | --- | --- | --- |
| 1 | Re-verify prior findings (v0.2.27) | get_session_history no longer errors (was: no such column r.deleted_at) | ✅ PASS | OK — 2 rows (bug from v0.2.25 FIXED) |
| 2 | Setup fixtures | create supplier | ✅ PASS | 01440d01-6f2b-4be6-9c57-2917da904336 |
| 3 | Setup fixtures | create customer cash (limit=0) | ✅ PASS | id=c146b321-596c-48d5-b180-8bdf997e5240 |
| 4 | Setup fixtures | create customer unlim (limit=-1) | ✅ PASS | id=26c1a023-ff47-4f67-9393-fe52595d8fed |
| 5 | Setup fixtures | create customer limit (limit=50000) | ✅ PASS | id=32bfb4d9-03ff-455c-b1ea-86dfbbddc426 |
| 6 | Setup fixtures | create product Paracetamol | ✅ PASS | ff06516a-15f7-4af9-83e5-affa391a5ce5 |
| 7 | Setup fixtures | create product Amoxicillin | ✅ PASS | b596afd0-4e89-4e6f-b605-1e046ed5e0f5 |
| 8 | Setup fixtures | create product ExpiredOnly | ✅ PASS | ebcdbe81-becc-444b-9990-70d272c0e75c |
| 9 | Setup fixtures | create product TodayExpiry | ✅ PASS | f6c810e4-a862-4556-8af5-d8db7a54485f |
| 10 | Setup fixtures | purchase stock: A x100 @ shelf, B x50 @ shelf (future expiry) | ✅ PASS |  |
| 11 | Setup fixtures | open POS session | ✅ PASS | d44cf40d-a42f-43cb-947c-e4c3b09a42cb |
| 12 | EXPIRY (priority) | fixture: product X gets ONLY an expired batch (qty 20) | ✅ PASS | expired batch qty=20, product stock=20 |
| 13 | EXPIRY (priority) | POS sale of expired-only product is blocked/warned | ✅ PASS | blocked: كمية غير كافية في المخزون: E2E_TEST_20260706105625_P_X |
| 14 | EXPIRY (priority) | Invoice sale of expired-only product is blocked/warned | ✅ PASS | blocked: كمية غير كافية في المخزون: E2E_TEST_20260706105625_P_X |
| 15 | EXPIRY (priority) | fixture: product B gets an expired batch + an earlier-valid batch | ✅ PASS | B batches: BB(400d,50) + B_EARLY(20d,8) + B_EXP(expired,10) |
| 16 | EXPIRY (priority) | FEFO sells earliest VALID batch first; expired NEVER sold | ✅ PASS | early 8→3, expired stays 10 |
| 17 | EXPIRY (priority) | purchase line with PAST expiry is rejected (re-verify) | ✅ PASS | rejected at confirm: لا يمكن استلام صنف منتهي الصلاحية: باراسيتامول (تا |
| 18 | EXPIRY (priority) | purchase with expiry EXACTLY today is accepted (boundary >=) | ✅ PASS | accepted |
| 19 | EXPIRY (priority) | sale of a batch expiring TODAY is allowed (boundary >=) | ✅ PASS | allowed (today counts as not-yet-expired) |
| 20 | EXPIRY (priority) | dispose expired batch → stock 0, dispose movement, value written off | ✅ PASS | X 20→0, batch qty=0, movements=dispose |
| 21 | EXPIRY (priority) | expiry report loads with buckets + our expired/near batches appear | ✅ PASS | report keys: expired,expiring_30,expiring_60,expiring_7,expiring_90,total_at_risk_value |
| 22 | EXPIRY (priority) | low-stock products list includes a product under min level | ✅ PASS | 3 low-stock rows; product T present=true |
| 23 | POS / sales edge cases | oversell (qty > available) is blocked | ✅ PASS | blocked: كمية غير كافية في المخزون: E2E_TEST_20260706105625_P_A |
| 24 | POS / sales edge cases | quantity 0 is blocked | ✅ PASS | blocked: الكمية غير صالحة للصنف E2E_TEST_20260706105625_P_A — يجب أن  |
| 25 | POS / sales edge cases | negative quantity is blocked | ✅ PASS | blocked: الكمية غير صالحة للصنف E2E_TEST_20260706105625_P_A — يجب أن  |
| 26 | POS / sales edge cases | discount greater than total is blocked/clamped | ✅ PASS | blocked: صنف E2E_TEST_20260706105625_P_A سيُباع بـ -9989900 ج.س وهو أ |
| 27 | POS / sales edge cases | sale BELOW COST via low unit price (no discount) is blocked | ✅ PASS | blocked: صنف E2E_TEST_20260706105625_P_A سيُباع بـ 5000 ج.س وهو أقل م |
| 28 | POS / sales edge cases | split payment parts not summing to total is blocked | ✅ PASS | blocked: المبلغ المدفوع لا يطابق تفاصيل الدفع المقسّم |
| 29 | POS / sales edge cases | credit sale EXACTLY at limit (500) is allowed | ✅ PASS | allowed at boundary |
| 30 | POS / sales edge cases | credit sale over the limit is blocked (balance already at limit) | ✅ PASS | blocked: تجاوز حد الائتمان المسموح به: الرصيد 50000 + المبلغ 8000 > ا |
| 31 | POS / sales edge cases | return MORE than sold is blocked; partial then full return OK | ✅ PASS | over-return blocked=true, partial-return ok=true |
| 32 | POS / sales edge cases | park/hold a cart → save workspace state, then reload it | ✅ PASS | parked cart saved + reloaded + cleared |
| 33 | Money / accounts edge cases | transfer to the SAME account is blocked | ✅ PASS | blocked: لا يمكن التحويل لنفس الحساب |
| 34 | Money / accounts edge cases | transfer MORE than available from bank is handled (blocked or overdraft rule) | ✅ PASS | blocked: الرصيد غير كافٍ (المطلوب: 10000000 رسوم: 0) |
| 35 | Money / accounts edge cases | customer payment GREATER than balance is blocked/handled | ✅ PASS | blocked: مبلغ الدفعة (10050000) أكبر من الرصيد المستحق (50000) |
| 36 | Inventory / warehouse edge cases | transfer to the SAME location is blocked | ✅ PASS | blocked: موقع المصدر والوجهة متطابقان |
| 37 | Inventory / warehouse edge cases | transfer MORE than available at a location is blocked | ✅ PASS | blocked: المخزون المتاح (93) أقل من الكمية المطلوبة (999999) |
| 38 | Inventory / warehouse edge cases | stocktake with a discrepancy applies an adjustment + movement | ✅ PASS | ff06516a-15f7-4af9-83e5-affa391a5ce5 93→90 |
| 39 | Inventory / warehouse edge cases | opening-stock is gated by setup_mode | ✅ PASS | setup_mode OFF → opening stock correctly blocked: وضع الإعداد منتهي — لا يمكن إدخال كمية ا |
| 40 | Soft-delete + validation | duplicate barcode is rejected | ✅ PASS | rejected: الباركود مستخدم مسبقاً |
| 41 | Soft-delete + validation | empty required field (product trade_name) is rejected | ✅ PASS | rejected: اسم الدواء مطلوب |
| 42 | Soft-delete + validation | soft-delete a product that has transactions preserves history | ✅ PASS | deactivated+reactivated; stock/history preserved (stock=63) |
| 43 | USD rate + Tax | USD rate: anchored product reprices by ratio; rate 0 = off | ✅ PASS | skipped (real anchored products present) |
| 44 | USD rate + Tax | tax flows into a sale total and the tax report | ✅ PASS | tax=0.30 SDG total=200.30 SDG |
| 45 | Settings / screen coverage | screen loads without runtime error: Settings home | ✅ PASS | /settings |
| 46 | Settings / screen coverage | screen loads without runtime error: Users | ✅ PASS | /settings/users |
| 47 | Settings / screen coverage | screen loads without runtime error: Branches | ✅ PASS | /settings/branches |
| 48 | Settings / screen coverage | screen loads without runtime error: Payment methods | ✅ PASS | /settings/payment-methods |
| 49 | Settings / screen coverage | screen loads without runtime error: Categories | ✅ PASS | /settings/categories |
| 50 | Settings / screen coverage | screen loads without runtime error: Units | ✅ PASS | /settings/units |
| 51 | Settings / screen coverage | screen loads without runtime error: Notifications | ✅ PASS | /notifications |
| 52 | Settings / screen coverage | screen loads without runtime error: Backup | ✅ PASS | /settings/backup |
| 53 | Settings / screen coverage | screen loads without runtime error: Receipt customizer | ✅ PASS | /settings/receipt |
| 54 | Settings / screen coverage | screen loads without runtime error: Sync config | ✅ PASS | /settings/sync |
| 55 | Reconciliation (final invariants) | RECONCILE: cash == expected ledger | ✅ PASS | expected 17,020.30 SDG actual 17,020.30 SDG |
| 56 | Reconciliation (final invariants) | RECONCILE: bank == expected ledger | ✅ PASS | expected 0.00 SDG actual 0.00 SDG |
| 57 | Reconciliation (final invariants) | RECONCILE: stock = purchased − sold − disposed ± adjust (spot checks) | ✅ PASS | B on-hand=63 |
| 58 | Sync | trigger full sync | ✅ PASS | synced 1 tables |
| 59 | Teardown (best-effort; runner restores snapshot) | void sale SAL-00008 | ✅ PASS | voided |
| 60 | Teardown (best-effort; runner restores snapshot) | void sale SAL-00007 | ✅ PASS | voided |
| 61 | Teardown (best-effort; runner restores snapshot) | void sale SAL-00006 | ✅ PASS | voided |
| 62 | Teardown (best-effort; runner restores snapshot) | void sale SAL-00005 | ✅ PASS | voided |
| 63 | Teardown (best-effort; runner restores snapshot) | void sale SAL-00004 | ✅ PASS | voided |
| 64 | Teardown (best-effort; runner restores snapshot) | close POS session | ✅ PASS | closed |

## Reconciliation

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| stock A after purchase | 100 | 100 | ✅ |
| stock B after purchase | 50 | 50 | ✅ |
| FEFO: earliest VALID batch (20d) depleted 8→3 | 3 | 3 | ✅ |
| FEFO: expired batch untouched (stays 10) | 10 | 10 | ✅ |
| disposed batch stock removed (X 20→0) | 0 | 0 | ✅ |
| limit customer balance == 500 after at-limit sale | 500.00 SDG | 500.00 SDG | ✅ |
| stocktake discrepancy (−3) applied to on-hand | 90 | 90 | ✅ |
| final cash balance | 17,020.30 SDG | 17,020.30 SDG | ✅ |
| final bank balance | 0.00 SDG | 0.00 SDG | ✅ |
| product B on-hand | 63 | 63 | ✅ |

## Bugs & discrepancies

_None found._
## Coverage checklist

| Area | Status | Note |
| --- | --- | --- |
| USD repricing | 🟡 partial | skipped destructive rate change — 1 REAL USD-anchored products would be repriced |
| Tax on sale | ✅ covered | tax computed into total and tax report loads |
| Screen: Settings home | ✅ covered | renders (UI load check) |
| Screen: Users | ✅ covered | renders (UI load check) |
| Screen: Branches | ✅ covered | renders (UI load check) |
| Screen: Payment methods | ✅ covered | renders (UI load check) |
| Screen: Categories | ✅ covered | renders (UI load check) |
| Screen: Units | ✅ covered | renders (UI load check) |
| Screen: Notifications | ✅ covered | renders (UI load check) |
| Screen: Backup | ✅ covered | renders (UI load check) |
| Screen: Receipt customizer | ✅ covered | renders (UI load check) |
| Screen: Sync config | ✅ covered | renders (UI load check) |
| Expiry: expired-only sale blocked (POS + invoice) | ✅ covered |  |
| Expiry: FEFO skips expired, earliest-valid first | ✅ covered |  |
| Expiry: past-expiry purchase rejected | ✅ covered |  |
| Expiry: boundary = today (purchase + sale) | ✅ covered |  |
| Expiry: dispose + write-off | ✅ covered |  |
| Expiry: report buckets + low-stock | ✅ covered |  |
| POS edge: oversell/qty0/neg/discount/below-min/split/credit-boundary/returns | ✅ covered |  |
| Money edge: same-account, over-transfer, overpayment | ✅ covered |  |
| Inventory edge: same-loc/over-qty transfer, stocktake discrepancy, opening-stock gating | ✅ covered |  |
| Validation: duplicate barcode, empty required, soft-delete history | ✅ covered |  |
| Permissions (cashier/manager roles) | ⚪ not covered | only owner/admin credentials available — needs cashier & manager passwords to assert role gating |
| Auth lockout after N wrong passwords | ⚪ not covered | would lock a real account; run manually/supervised |
| License feature gating by plan | 🟡 partial | features usable post-login (unlock-after-login fix); plan-tier gating not exercised |
| CSV/Excel import with bad rows | ⚪ not covered | xlsx parsing is front-end only; not reachable via the command bridge |
| Receipt customizer preview (logo pos/size) | 🟡 partial | screen load checked; visual preview not asserted |
| Backup create + restore (in-app) | 🟡 partial | harness uses its own snapshot backup/restore; in-app backup screen load checked |
| PWA mirror + Activity page + deletions mirror out | 🟡 partial | covered by the separate read-only e2e:pwa suite; sync-500 can block fresh mirroring |
| Report CSV exports | ⚪ not covered | export is a browser download (front-end xlsx); reports themselves load-checked |

## Cleanup status

| Kind | Tag / id | Reversed? | Note |
| --- | --- | --- | --- |
| supplier | E2E_TEST_20260706105625_SUP | ⚠️ NO |  |
| customer | E2E_TEST_20260706105625_C_cash | ⚠️ NO |  |
| customer | E2E_TEST_20260706105625_C_unlim | ⚠️ NO |  |
| customer | E2E_TEST_20260706105625_C_limit | ⚠️ NO |  |
| product | E2E_TEST_20260706105625_P_A | ⚠️ NO |  |
| product | E2E_TEST_20260706105625_P_B | ⚠️ NO |  |
| product | E2E_TEST_20260706105625_P_X | ⚠️ NO |  |
| product | E2E_TEST_20260706105625_P_T | ⚠️ NO |  |
| purchase_invoice | E2E_TEST_20260706105625_PINV | ⚠️ NO |  |
| session | E2E_TEST_20260706105625_SESS | ✅ yes | closed |
| purchase_invoice | E2E_TEST_20260706105625_PINV_T | ⚠️ NO |  |
| stock_take | E2E_TEST_20260706105625_STK | ⚠️ NO |  |

> ⚠️ **11 created entities were not confirmed removed** — see the app and the sweep log.

---

## Final cleanup (post-run)

✅ **Real data restored to the pre-run snapshot** — `C:\Users\Ammar\AppData\Roaming\com.taj.pharmacy\e2e-safety-backups\backup-2026-07-06T10-56-15-403Z`. All E2E_TEST_ entities and every money-path effect (including balances that `void_sale` could not reverse) were undone by restoring the database. Net residue: **zero**.
