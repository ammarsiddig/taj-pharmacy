# PMS Pharmacy — Testing Infrastructure

## What Was Tested

This test suite simulates an entire pharmacy work day against a real SQLite database, executing the same SQL your Tauri backend will run. **146 tests across 12 test suites**, all passing.

## Test Suites

| Suite | Tests | What It Proves |
|-------|-------|----------------|
| **1. Schema Validation** | 34 | All 27 tables created, FK constraints enforced, CHECK constraints reject bad data, money stored as INTEGER, FIFO index exists |
| **2. Purchase Invoice** | 27 | Draft creates NO stock/batches/transactions. Confirm creates batches + movements + double-entry. Payment reduces bank balance correctly. |
| **3. POS Sessions & Sales** | 15 | Session opens, duplicate blocked, FIFO splits sale across 2 batches (8 from old + 4 from new), oversell detected, session closes with shortage tracking |
| **4. Invoice Sale + Credit** | 7 | Credit sale to hospital, customer balance increases, partial payment reduces balance |
| **5. Customer Returns** | 3 | Stock restored to original batch, cash register reduced, movement logged |
| **6. Supplier Returns** | 4 | Batch quantity reduced, accounts_payable decreased |
| **7. Expenses** | 7 | Create deducts cash, edit reverses old + applies new, delete fully restores cash |
| **8. Double-Entry Integrity** | 6 | Every transaction_group has exactly 1 debit + 1 credit of equal amount. Global debits == credits (650,500 piasters) |
| **9. Stock Integrity** | 8 | For every batch: `received - sold + returned - supplier_returned == quantity_current` |
| **10. Edge Cases** | 9 | Can't cancel invoice with sold batches, soft-delete filtering works, tenant isolation, sequence counters increment |
| **11. Report Queries** | 8 | Stock valuation, revenue, COGS, gross profit, payables, expiry report, low stock, movement audit |
| **12. Full Day Simulation** | 18 | 10 random sales with FIFO, then re-verifies double-entry + stock integrity still hold |

## Key Bugs This Catches (from v3)

| v3 Bug | How This Test Catches It |
|--------|------------------------|
| `batches.po_id` stored two different table IDs | Tests verify `supplier_invoice_id` always references `supplier_invoices.id` |
| No SQL transactions → partial failures | Each workflow runs in a single transaction; FIFO across 2 batches would corrupt data without transactions |
| Two parallel return systems | Single `customer_returns` table tested for both POS and invoice returns |
| POS sales never wrote to accounts | Every sale creates `account_transactions` pair, verified by double-entry integrity check |
| `cancel_purchase` didn't reverse stock | Tests verify confirmed invoice cancellation checks for sold batches before allowing |
| Permissions stored but never checked | App-layer test — schema includes permission table, edge case tests document enforcement points |

## How to Run

```bash
# Just Python 3 + SQLite (both included in any modern system)
pip install rich  # Optional: for pretty output

cd pms-testing/db-tests
python3 test_workflows.py
```

## How to Use with Claude Code

### Method 1: Direct DB Testing (what this suite does)
Give Claude Code this prompt:
```
Run python3 test_workflows.py in pms-testing/db-tests/ and tell me if anything fails.
Then add a new test: create a purchase with 0 items and try to confirm it — it should fail.
```

### Method 2: Test Your Tauri Commands
Once your Rust backend exists, Claude Code can:
```
Write Rust integration tests for the confirm_purchase_invoice command.
Use a temp SQLite DB. Test: happy path, empty items rejection, 
inactive supplier rejection. Assert batches created, stock_movements 
created, account_transactions balanced.
```

### Method 3: Playwright E2E (once UI exists)
```
Install Playwright. Write E2E tests against localhost:1420.
Test: login → open POS → scan barcode 6281001210017 → verify Panadol 
added to cart → complete cash sale → verify receipt prints.
```

### Method 4: QA Session (most human-like)
```
Act as a QA tester. I'll run `npx tauri dev`. After each action I take 
in the UI, query the SQLite DB at {path} and verify:
1. The right tables were updated
2. account_transactions are balanced
3. Stock movements match batch quantities
Report PASS or FAIL for each check.
```

## Final Database State After Tests

```
Products:        3 active
Batches:         3 active, 1 depleted  
Sales:           12 (2 manual + 10 simulated)
Sale Items:      13 (FIFO splits = more items than sales)
Stock Movements: 18
Account Txns:    38 active, 4 soft-deleted (from expense edit)
Cash Register:   3,865.00 SDG
Bank Account:    49,500.00 SDG
Hospital Owes:   250.00 SDG
```
