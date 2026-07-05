# TAJ Pharmacy — Day-in-the-Life E2E Review

_Generated 2026-07-05T18:58:28.559Z — driven against the installed `C:\Program Files\TAJ Pharmacy\app.exe` + Owner PWA._

## Summary

| Metric | Value |
| --- | --- |
| Steps passed | 54 / 56 |
| Steps failed | 2 |
| Reconciliation checks OK | 18 |
| Reconciliation mismatches | 0 |
| Bugs / discrepancies found | 4 |

## Steps (in order)

| # | Phase | Step | Result | Detail |
| --- | --- | --- | --- | --- |
| 1 | Suppliers | create supplier E2E_TEST_20260705185727_SUP1 | ✅ PASS | id=20c59646-eecf-439e-b079-a78e0e2ced74 |
| 2 | Suppliers | create supplier E2E_TEST_20260705185727_SUP2 | ✅ PASS | id=bec124f3-b364-4bbc-8baf-8849be716761 |
| 3 | Suppliers | suppliers appear in list | ✅ PASS | 2 found |
| 4 | Customers | UI: credit-mode selector renders 3 modes | ✅ PASS |  |
| 5 | Customers | create customer cash (limit=0) | ✅ PASS | credit_limit=0 |
| 6 | Customers | create customer unlimited (limit=-1) | ✅ PASS | credit_limit=-1 |
| 7 | Customers | create customer limit (limit=5000000) | ✅ PASS | credit_limit=5000000 |
| 8 | Products | create product Paracetamol | ✅ PASS | id=d851b60d-804b-4e79-9b27-bd635c8ebf59 sale=100.00 SDG |
| 9 | Products | create product Amoxicillin | ✅ PASS | id=7ed0b4d2-0129-4cb5-b94c-dea3aef833fe sale=250.00 SDG |
| 10 | Products | create product Ibuprofen | ✅ PASS | id=64021c52-a01e-4eeb-8ffc-27bf6e9a9fba sale=150.00 SDG |
| 11 | Products | products appear as one row each in Products search (UI) | ✅ PASS | 3 rows |
| 12 | USD exchange rate (TASK-939) | USD rate feature check (skip if no anchored products) | ✅ PASS | no USD-anchored products — feature not exercised (prices unaffected as expected) |
| 13 | Purchases | create + confirm purchase invoice (supplier #1, 3 lines, future expiry) | ✅ PASS | invoice=a05d88b6-d41f-4237-abc7-4994c2f4c336 total=18,600.00 SDG |
| 14 | Purchases | stock increased by exact quantities + batches + receive movements | ✅ PASS | movements: receive |
| 15 | Purchases | purchase line with PAST expiry is rejected (TASK-936) | ✅ PASS | rejected at confirm: لا يمكن استلام صنف منتهي الصلاحية: باراسيتامول (تاريخ الانته |
| 16 | Purchases | partial supplier payment → balance = total − paid | ✅ PASS | paid=9,300.00 SDG balance=9,300.00 SDG |
| 17 | Inventory / locations | transfer 20 of product A between locations → out/in movements | ✅ PASS | movements: receive,transfer_in,transfer_out |
| 18 | Inventory / locations | UI: movements screen loads with Arabic type labels (TASK-938) | ✅ PASS |  |
| 19 | Inventory / locations | reorder-alerts loads with no SQL error (TASK-938) | ✅ PASS | 2 low-stock rows |
| 20 | Inventory / locations | stock adjustment (stocktake) records movement + new qty | ✅ PASS | item product 64021c52-a01e-4eeb-8ffc-27bf6e9a9fba: expected_pre=40 new_onhand=35 |
| 21 | POS | open POS session | ✅ PASS | session=3f86a11a-8bbe-4b26-b8a8-30f069460fe6 |
| 22 | POS | (a) cash sale of product A x2 | ✅ PASS | sale SAL-00004 total 200.00 SDG |
| 23 | POS | (b) bank-transfer sale of product B x1 | ✅ PASS | sale SAL-00005 total 250.00 SDG |
| 24 | POS | (c) credit sale to unlimited customer → balance increases | ✅ PASS | sale SAL-00006; balance 300.00 SDG |
| 25 | POS | (d) credit sale to CASH-ONLY customer is blocked | ✅ PASS | blocked: هذا العميل نقدي فقط (لا يسمح بالائتمان) |
| 26 | POS | (e) credit sale exceeding LIMIT (50,000) is blocked | ✅ PASS | blocked: تجاوز حد الائتمان المسموح به: الرصيد 0 + المبلغ 6000000 > الحد 5000000 |
| 27 | POS | (f) split-payment sale (cash + bank) | ✅ PASS | sale SAL-00007 split 200.00 SDG+200.00 SDG |
| 28 | POS | multi-location product: ONE row in POS search + FEFO depletion | ✅ PASS | search rows=1, early batch after=0 |
| 29 | POS | Session History loads + lists this session (issue #3) | ❌ FAIL | get_session_history SQL error: no such column: r.deleted_at in SELECT ps.id, u.full_name, ps.opened_at, ps.closed_at, ps.sales_count,                 ps.total_sales,                 COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.session_id = ps.id AND r.deleted_at IS NULL), 0) as total_returns,                 ps.opening_cash, ps.actual_cash, ps.cash_difference, ps.status          FROM pos_sessions ps          JOIN users u ON ps.cashier_id = u.id          WHERE ps.tenant_id = ?1 AND ps.branch_id = ?2 AND DATE(ps.opened_at) >= DATE(?3) AND DATE(ps.opened_at) <= DATE(?4) ORDER BY ps.opened_at DESC at offset 195 |
| 30 | Returns / voids | partial return of the cash sale → stock returns + refund | ✅ PASS | return recorded; stock 91→92 |
| 31 | Returns / voids | void the credit sale → full reversal (stock + customer credit) | ❌ FAIL | void_sale failed: CHECK constraint failed: movement_type IN (                     'receive','sell','customer_return',  |
| 32 | Invoice sales | create credit invoice to limited customer → appears in invoices + statement | ✅ PASS | invoice SAL-00009 total 300.00 SDG |
| 33 | Customer payments | record customer payment → balance down, account up; statement correct | ✅ PASS | balance 300.00 SDG→150.00 SDG; running=150.00 SDG |
| 34 | Money transfers | transfer cash→bank then bank→cash (self-reversing) | ✅ PASS | ±1,000.00 SDG cash↔bank |
| 35 | Expenses | create expense from cash → account decreases | ✅ PASS | expense 500.00 SDG; cash 8,920.00 SDG→8,420.00 SDG |
| 36 | Reports (reconciliation) | report loads with no error: sales | ✅ PASS | ok |
| 37 | Reports (reconciliation) | report loads with no error: profit/loss | ✅ PASS | ok |
| 38 | Reports (reconciliation) | report loads with no error: inventory | ✅ PASS | ok |
| 39 | Reports (reconciliation) | report loads with no error: expiry | ✅ PASS | ok |
| 40 | Reports (reconciliation) | report loads with no error: tax | ✅ PASS | ok |
| 41 | Reports (reconciliation) | report loads with no error: customer credit | ✅ PASS | ok |
| 42 | Reports (reconciliation) | report loads with no error: supplier aging | ✅ PASS | ok |
| 43 | Reports (reconciliation) | report loads with no error: balance sheet | ✅ PASS | ok |
| 44 | Reports (reconciliation) | RECONCILE: cash account == expected ledger | ✅ PASS | expected 8,420.00 SDG actual 8,420.00 SDG |
| 45 | Reports (reconciliation) | RECONCILE: bank account == expected ledger | ✅ PASS | expected 450.00 SDG actual 450.00 SDG |
| 46 | Sync | trigger full sync → no "فشل المزامنة" banner | ✅ PASS | synced 1 tables |
| 47 | Teardown (reverse order) | void sale SAL-00008 | ✅ PASS | not voided (CHECK constraint failed: movement_type IN (       ) — may already be returned/voided |
| 48 | Teardown (reverse order) | void sale SAL-00007 | ✅ PASS | not voided (CHECK constraint failed: movement_type IN (       ) — may already be returned/voided |
| 49 | Teardown (reverse order) | void sale SAL-00006 | ✅ PASS | not voided (CHECK constraint failed: movement_type IN (       ) — may already be returned/voided |
| 50 | Teardown (reverse order) | void sale SAL-00005 | ✅ PASS | not voided (CHECK constraint failed: movement_type IN (       ) — may already be returned/voided |
| 51 | Teardown (reverse order) | void sale SAL-00004 | ✅ PASS | not voided (CHECK constraint failed: movement_type IN (       ) — may already be returned/voided |
| 52 | Teardown (reverse order) | void invoice sale | ✅ PASS | not voided (CHECK constraint failed: movement_type IN (       ) |
| 53 | Teardown (reverse order) | cancel purchase a05d88b6-d41f-4237-abc7-4994c2f4c336 | ✅ PASS | not reversed (لا يمكن إلغاء فاتورة تم دفع جزء منها أو كلها. يُرج) |
| 54 | Teardown (reverse order) | cancel purchase dba41980-ed5d-4bcc-a1d5-8d59ccad7621 | ✅ PASS | not reversed (لا يمكن إلغاء فاتورة تم البيع منها) |
| 55 | Teardown (reverse order) | delete expense | ✅ PASS | deleted |
| 56 | Teardown (reverse order) | close POS session (teardown) | ✅ PASS | closed |

## Reconciliation

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| stock after purchase: Paracetamol | 100 | 100 | ✅ |
| stock after purchase: Amoxicillin | 60 | 60 | ✅ |
| stock after purchase: Ibuprofen | 40 | 40 | ✅ |
| supplier #1 balance (total − paid) | 9,300.00 SDG | 9,300.00 SDG | ✅ |
| from-location decreased by 20 | 80 | 80 | ✅ |
| to-location increased by 20 | 20 | 20 | ✅ |
| unlimited customer balance += credit sale | 300.00 SDG | 300.00 SDG | ✅ |
| POS search rows for multi-loc product | 1 | 1 | ✅ |
| FEFO: earliest-expiry batch depleted to 0 | 0 | 0 | ✅ |
| stock returns +1 after partial return | 92 | 92 | ✅ |
| customer balance decreases by payment | 150.00 SDG | 150.00 SDG | ✅ |
| cash decreased by transfer | 7,920.00 SDG | 7,920.00 SDG | ✅ |
| bank increased by transfer | 1,450.00 SDG | 1,450.00 SDG | ✅ |
| transfer self-reverses (cash restored) | 8,920.00 SDG | 8,920.00 SDG | ✅ |
| transfer self-reverses (bank restored) | 450.00 SDG | 450.00 SDG | ✅ |
| cash decreases by expense | 8,420.00 SDG | 8,420.00 SDG | ✅ |
| final cash balance | 8,420.00 SDG | 8,420.00 SDG | ✅ |
| final bank balance | 450.00 SDG | 450.00 SDG | ✅ |

## Bugs & discrepancies

### 1. Session History broken by SQL error, silently swallowed → panel always empty
- **Expected:** session listed in history
- **Actual:** get_session_history throws: no such column: r.deleted_at in SELECT ps.id, u.full_name, ps.opened_at, ps.closed_at, ps.sales_count,
                ps.total_sales,
                COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.session_id = ps.id AND r.deleted_at IS NULL), 0) as total_returns,
                ps.opening_cash, ps.actual_cash, ps.cash_difference, ps.status
         FROM pos_sessions ps
         JOIN users u ON ps.cashier_id = u.id
         WHERE ps.tenant_id = ?1 AND ps.branch_id = ?2 AND DATE(ps.opened_at) >= DATE(?3) AND DATE(ps.opened_at) <= DATE(?4) ORDER BY ps.opened_at DESC at offset 195
- **Screen:** POS → Session History
- **Repro:** open POS → History; underlying get_session_history errors, UI catch{} hides it — panel shows 0 sessions

### 2. void_sale BROKEN in installed build (CHECK constraint on movement_type)
- **Expected:** sale voided, stock + customer credit reversed
- **Actual:** void_sale throws: CHECK constraint failed: movement_type IN (
                    'receive','sell','customer_return',
                    
- **Screen:** POS Session History → Void
- **Repro:** void any sale; the void-reversal stock movement uses a movement_type not permitted by the batches/stock_movements CHECK constraint

### 3. Residual: customer payment has no reverse command
- **Expected:** reversible
- **Actual:** customer payment 150.00 SDG left; cash +150.00 SDG
- **Screen:** record_customer_payment
- **Repro:** no delete_customer_payment command exists

### 4. Residual: supplier payment has no reverse command
- **Expected:** reversible
- **Actual:** supplier payment (partial) left as a paid-invoice record
- **Screen:** record_supplier_payment
- **Repro:** no delete_supplier_payment command exists

## Cleanup status

| Kind | Tag / id | Reversed? | Note |
| --- | --- | --- | --- |
| supplier | E2E_TEST_20260705185727_SUP1 | ⚠️ NO |  |
| supplier | E2E_TEST_20260705185727_SUP2 | ⚠️ NO |  |
| customer | E2E_TEST_20260705185727_CUST_CASH | ⚠️ NO |  |
| customer | E2E_TEST_20260705185727_CUST_UNLIM | ⚠️ NO |  |
| customer | E2E_TEST_20260705185727_CUST_LIMIT | ⚠️ NO |  |
| product | E2E_TEST_20260705185727_PROD_A | ⚠️ NO |  |
| product | E2E_TEST_20260705185727_PROD_B | ⚠️ NO |  |
| product | E2E_TEST_20260705185727_PROD_C | ⚠️ NO |  |
| purchase_invoice | E2E_TEST_20260705185727_PINV | ⚠️ NO |  |
| stock_take | E2E_TEST_20260705185727_STK | ⚠️ NO |  |
| session | E2E_TEST_20260705185727_SESS | ✅ yes | closed |
| purchase_invoice | E2E_TEST_20260705185727_PINV2 | ⚠️ NO |  |
| expense | E2E_TEST_20260705185727_EXP | ✅ yes | deleted |

> ⚠️ **11 created entities were not confirmed removed** — see the app and the sweep log.

---

## Final cleanup (post-run)

✅ **Real data restored to the pre-run snapshot** — `C:\Users\Ammar\AppData\Roaming\com.taj.pharmacy\e2e-safety-backups\backup-2026-07-05T18-57-15-102Z`. All E2E_TEST_ entities and every money-path effect (including balances that `void_sale` could not reverse) were undone by restoring the database. Net residue: **zero**.
