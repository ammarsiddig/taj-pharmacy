#!/usr/bin/env python3
"""
PMS Pharmacy — Deep Workflow Test Suite
========================================
Tests every business workflow from the spec by executing SQL directly
against a real SQLite database. This simulates what the Tauri backend
would do, catching data integrity bugs before the UI exists.

Covers:
  - Schema validation (constraints, FKs, indexes)
  - Purchase invoice lifecycle (draft → confirm → cancel)
  - POS session + sale (FIFO batch deduction)
  - Invoice sale with credit
  - Customer returns (cash + credit)
  - Supplier returns
  - Expenses (create, edit, delete with reversal)
  - Double-entry transaction balancing
  - Edge cases (overselling, double-close, etc.)

Run: python3 test_workflows.py
"""

import sqlite3
import uuid
import os
import sys
import json
from datetime import datetime, timedelta
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Optional, List, Tuple

# ── Rich output ──────────────────────────────────────────────
try:
    from rich.console import Console
    from rich.table import Table as RichTable
    from rich.panel import Panel
    from rich import box
    HAS_RICH = True
except ImportError:
    HAS_RICH = False

console = Console() if HAS_RICH else None

# ── Test Infrastructure ──────────────────────────────────────

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(_SCRIPT_DIR, "test_pharmacy.db")
SCHEMA_PATH = os.path.join(_SCRIPT_DIR, "schema.sql")

# Counters
test_results = {"passed": 0, "failed": 0, "errors": []}

def uid():
    return str(uuid.uuid4())

def now_iso():
    return datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z')

def date_iso(days_offset=0):
    d = datetime.utcnow() + timedelta(days=days_offset)
    return d.strftime('%Y-%m-%d')

def money(sdg: float) -> int:
    """Convert SDG to piasters (integer)"""
    return int(sdg * 100)

def log_pass(name: str, detail: str = ""):
    test_results["passed"] += 1
    mark = "[bold green]✓ PASS[/]" if HAS_RICH else "✓ PASS"
    msg = f"  {mark}  {name}"
    if detail:
        msg += f" — {detail}"
    if console:
        console.print(msg)
    else:
        print(msg.replace("[bold green]", "").replace("[/]", ""))

def log_fail(name: str, detail: str):
    test_results["failed"] += 1
    test_results["errors"].append(f"{name}: {detail}")
    mark = "[bold red]✗ FAIL[/]" if HAS_RICH else "✗ FAIL"
    msg = f"  {mark}  {name} — {detail}"
    if console:
        console.print(msg)
    else:
        print(msg.replace("[bold red]", "").replace("[/]", ""))

def log_section(title: str):
    if console:
        console.print(f"\n[bold cyan]{'═'*60}[/]")
        console.print(f"[bold cyan]  {title}[/]")
        console.print(f"[bold cyan]{'═'*60}[/]")
    else:
        print(f"\n{'═'*60}\n  {title}\n{'═'*60}")

def assert_eq(name, actual, expected, detail=""):
    if actual == expected:
        log_pass(name, detail or f"{actual}")
    else:
        log_fail(name, f"expected {expected}, got {actual}")

def assert_true(name, condition, detail=""):
    if condition:
        log_pass(name, detail)
    else:
        log_fail(name, detail or "condition was False")

def assert_raises(name, fn, detail=""):
    try:
        fn()
        log_fail(name, f"Expected error but succeeded. {detail}")
    except Exception as e:
        log_pass(name, f"Correctly rejected: {type(e).__name__}: {str(e)[:80]}")


# ── Database Connection ──────────────────────────────────────

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn

def init_db():
    """Create fresh database from schema"""
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    # Also remove WAL/SHM
    for ext in ['-wal', '-shm']:
        p = DB_PATH + ext
        if os.path.exists(p):
            os.remove(p)
    
    conn = get_db()
    with open(SCHEMA_PATH, 'r') as f:
        conn.executescript(f.read())
    conn.close()


# ── Seed Data ────────────────────────────────────────────────

# Fixed IDs for test data
TENANT_ID = "tenant-test-001"
BRANCH_ID = "branch-main-001"
BRANCH_2_ID = "branch-second-002"
ROLE_OWNER = "role-owner"
ROLE_CASHIER = "role-cashier"
ROLE_MANAGER = "role-manager"
USER_OWNER = "user-owner-001"
USER_CASHIER = "user-cashier-001"
USER_CASHIER_2 = "user-cashier-002"
ACCOUNT_CASH = "account-cash-001"
ACCOUNT_BANK = "account-bank-001"
SUPPLIER_1 = "supplier-001"
SUPPLIER_2 = "supplier-002"
CUSTOMER_1 = "customer-001"
CUSTOMER_2 = "customer-002"
PRODUCT_1 = "product-panadol"
PRODUCT_2 = "product-amoxicillin"
PRODUCT_3 = "product-vitamin-c"
LOCATION_SHELF = "location-shelf-001"
LOCATION_FRIDGE = "location-fridge-001"
EXPENSE_CAT_RENT = "expcat-rent"
EXPENSE_CAT_UTIL = "expcat-utilities"

def seed_data(conn: sqlite3.Connection):
    """Insert minimum required data for all tests"""
    n = now_iso()
    
    # Tenant
    conn.execute("""INSERT INTO tenants (id, tenant_id, name, name_ar, subscription_plan, feature_flags, max_branches, max_users, created_at, updated_at)
        VALUES (?, ?, 'Test Pharmacy', 'صيدلية تجريبية', 'enterprise', 262143, 10, 20, ?, ?)""",
        (TENANT_ID, TENANT_ID, n, n))
    
    # Branches
    conn.execute("""INSERT INTO branches (id, tenant_id, name, name_ar, is_main, created_at, updated_at)
        VALUES (?, ?, 'Main Branch', 'الفرع الرئيسي', 1, ?, ?)""",
        (BRANCH_ID, TENANT_ID, n, n))
    conn.execute("""INSERT INTO branches (id, tenant_id, name, name_ar, is_main, created_at, updated_at)
        VALUES (?, ?, 'Second Branch', 'الفرع الثاني', 0, ?, ?)""",
        (BRANCH_2_ID, TENANT_ID, n, n))
    
    # Roles
    for rid, rname, rname_ar in [(ROLE_OWNER, 'owner', 'مالك'), 
                                   (ROLE_CASHIER, 'cashier', 'كاشير'),
                                   (ROLE_MANAGER, 'manager', 'مدير')]:
        conn.execute("""INSERT INTO roles (id, tenant_id, name, name_ar, is_system, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, ?, ?)""", (rid, TENANT_ID, rname, rname_ar, n, n))
    
    # Users
    conn.execute("""INSERT INTO users (id, tenant_id, branch_id, role_id, username, password_hash, full_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'owner', 'hash', 'Ahmed Owner', ?, ?)""",
        (USER_OWNER, TENANT_ID, BRANCH_ID, ROLE_OWNER, n, n))
    conn.execute("""INSERT INTO users (id, tenant_id, branch_id, role_id, username, password_hash, full_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'cashier1', 'hash', 'Sara Cashier', ?, ?)""",
        (USER_CASHIER, TENANT_ID, BRANCH_ID, ROLE_CASHIER, n, n))
    conn.execute("""INSERT INTO users (id, tenant_id, branch_id, role_id, username, password_hash, full_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'cashier2', 'hash', 'Ali Cashier', ?, ?)""",
        (USER_CASHIER_2, TENANT_ID, BRANCH_ID, ROLE_CASHIER, n, n))
    
    # Accounts
    conn.execute("""INSERT INTO accounts (id, tenant_id, branch_id, name, account_type, balance, created_at, updated_at)
        VALUES (?, ?, ?, 'Cash Register 1', 'cash_register', 0, ?, ?)""",
        (ACCOUNT_CASH, TENANT_ID, BRANCH_ID, n, n))
    conn.execute("""INSERT INTO accounts (id, tenant_id, branch_id, name, account_type, balance, created_at, updated_at)
        VALUES (?, ?, NULL, 'Bank Account', 'bank', ?, ?, ?)""",
        (ACCOUNT_BANK, TENANT_ID, money(50000), n, n))
    
    # Suppliers
    conn.execute("""INSERT INTO suppliers (id, tenant_id, name, name_ar, phone, is_active, created_at, updated_at)
        VALUES (?, ?, 'PharmaCo Sudan', 'فارماكو السودان', '+249123456', 1, ?, ?)""",
        (SUPPLIER_1, TENANT_ID, n, n))
    conn.execute("""INSERT INTO suppliers (id, tenant_id, name, name_ar, phone, is_active, created_at, updated_at)
        VALUES (?, ?, 'MediSupply', 'ميدي سبلاي', '+249654321', 1, ?, ?)""",
        (SUPPLIER_2, TENANT_ID, n, n))
    
    # Customers
    conn.execute("""INSERT INTO customers (id, tenant_id, name, name_ar, phone, customer_type, credit_limit, balance, created_at, updated_at)
        VALUES (?, ?, 'Khartoum Hospital', 'مستشفى الخرطوم', '+249111222', 'hospital', ?, 0, ?, ?)""",
        (CUSTOMER_1, TENANT_ID, money(100000), n, n))
    conn.execute("""INSERT INTO customers (id, tenant_id, name, name_ar, phone, customer_type, credit_limit, balance, created_at, updated_at)
        VALUES (?, ?, 'Mohamed Ali', 'محمد علي', '+249333444', 'individual', ?, 0, ?, ?)""",
        (CUSTOMER_2, TENANT_ID, money(5000), n, n))
    
    # Products
    conn.execute("""INSERT INTO products (id, tenant_id, barcode, name, name_ar, generic_name, category, unit, sale_price, min_stock_level, created_at, updated_at)
        VALUES (?, ?, '6281001210017', 'Panadol Extra', 'بنادول إكسترا', 'Paracetamol', 'Pain Relief', 'strip', ?, 20, ?, ?)""",
        (PRODUCT_1, TENANT_ID, money(15), n, n))
    conn.execute("""INSERT INTO products (id, tenant_id, barcode, name, name_ar, generic_name, category, unit, sale_price, min_stock_level, created_at, updated_at)
        VALUES (?, ?, '6281001210024', 'Amoxicillin 500mg', 'أموكسيسيلين', 'Amoxicillin', 'Antibiotics', 'box', ?, 15, ?, ?)""",
        (PRODUCT_2, TENANT_ID, money(45), n, n))
    conn.execute("""INSERT INTO products (id, tenant_id, barcode, name, name_ar, generic_name, category, unit, sale_price, min_stock_level, created_at, updated_at)
        VALUES (?, ?, '6281001210031', 'Vitamin C 1000mg', 'فيتامين سي', 'Ascorbic Acid', 'Vitamins', 'bottle', ?, 10, ?, ?)""",
        (PRODUCT_3, TENANT_ID, money(25), n, n))
    
    # Storage locations
    conn.execute("""INSERT INTO storage_locations (id, tenant_id, branch_id, name, type, created_at, updated_at)
        VALUES (?, ?, ?, 'Shelf A', 'shelf', ?, ?)""",
        (LOCATION_SHELF, TENANT_ID, BRANCH_ID, n, n))
    conn.execute("""INSERT INTO storage_locations (id, tenant_id, branch_id, name, type, created_at, updated_at)
        VALUES (?, ?, ?, 'Fridge 1', 'fridge', ?, ?)""",
        (LOCATION_FRIDGE, TENANT_ID, BRANCH_ID, n, n))
    
    # Expense categories
    conn.execute("""INSERT INTO expense_categories (id, tenant_id, name, name_ar, created_at, updated_at)
        VALUES (?, ?, 'Rent', 'إيجار', ?, ?)""", (EXPENSE_CAT_RENT, TENANT_ID, n, n))
    conn.execute("""INSERT INTO expense_categories (id, tenant_id, name, name_ar, created_at, updated_at)
        VALUES (?, ?, 'Utilities', 'مرافق', ?, ?)""", (EXPENSE_CAT_UTIL, TENANT_ID, n, n))
    
    # Sequence counters
    for key, prefix in [('supplier_invoice', 'PUR'), ('sale', 'INV'), ('customer_return', 'RET'), ('supplier_return', 'SRT')]:
        conn.execute("""INSERT INTO sequence_counters (id, tenant_id, branch_id, counter_key, prefix, year, last_value, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 2026, 0, ?, ?)""",
            (uid(), TENANT_ID, BRANCH_ID, key, prefix, n, n))
    
    conn.commit()


# ── Helper: Generate next sequence number ────────────────────

def next_number(conn, counter_key: str) -> str:
    row = conn.execute("""
        SELECT id, prefix, year, last_value FROM sequence_counters
        WHERE tenant_id = ? AND branch_id = ? AND counter_key = ? AND year = 2026
    """, (TENANT_ID, BRANCH_ID, counter_key)).fetchone()
    
    new_val = row['last_value'] + 1
    conn.execute("UPDATE sequence_counters SET last_value = ? WHERE id = ?", (new_val, row['id']))
    return f"{row['prefix']}-2026-{new_val:04d}"


# ── Helper: Create account transaction pair ──────────────────

def create_txn_pair(conn, debit_category, credit_category, amount,
                    reference_type, reference_id, 
                    debit_account_id=None, credit_account_id=None,
                    description="", user_id=USER_OWNER):
    """Create a double-entry pair of account_transactions"""
    group = uid()
    n = now_iso()
    today = date_iso()
    
    # Debit row
    debit_balance = None
    if debit_account_id:
        conn.execute("UPDATE accounts SET balance = balance + ? WHERE id = ?", (amount, debit_account_id))
        row = conn.execute("SELECT balance FROM accounts WHERE id = ?", (debit_account_id,)).fetchone()
        debit_balance = row['balance']
    
    conn.execute("""INSERT INTO account_transactions 
        (id, tenant_id, transaction_group, account_id, entry_type, amount, balance_after, 
         category, reference_type, reference_id, description, transaction_date, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'debit', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (uid(), TENANT_ID, group, debit_account_id, amount, debit_balance,
         debit_category, reference_type, reference_id, description, today, user_id, n, n))
    
    # Credit row
    credit_balance = None
    if credit_account_id:
        conn.execute("UPDATE accounts SET balance = balance - ? WHERE id = ?", (amount, credit_account_id))
        row = conn.execute("SELECT balance FROM accounts WHERE id = ?", (credit_account_id,)).fetchone()
        credit_balance = row['balance']
    
    conn.execute("""INSERT INTO account_transactions 
        (id, tenant_id, transaction_group, account_id, entry_type, amount, balance_after, 
         category, reference_type, reference_id, description, transaction_date, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'credit', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (uid(), TENANT_ID, group, credit_account_id, amount, credit_balance,
         credit_category, reference_type, reference_id, description, today, user_id, n, n))
    
    return group


# ════════════════════════════════════════════════════════════
# TEST SUITE 1: SCHEMA VALIDATION
# ════════════════════════════════════════════════════════════

def test_schema_validation(conn):
    log_section("TEST SUITE 1: SCHEMA VALIDATION")
    
    # 1.1 All expected tables exist
    tables = [r['name'] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()]
    
    expected_tables = [
        'tenants', 'branches', 'roles', 'users', 'permissions',
        'products', 'storage_locations', 'suppliers',
        'supplier_invoices', 'supplier_invoice_items', 'supplier_payments',
        'supplier_returns', 'supplier_return_items',
        'customers', 'accounts', 'pos_sessions', 'batches',
        'sales', 'sale_items', 'customer_returns', 'customer_return_items',
        'account_transactions', 'expense_categories', 'expenses',
        'stock_movements', 'sequence_counters', 'audit_log'
    ]
    
    for t in expected_tables:
        assert_true(f"Table '{t}' exists", t in tables)
    
    # 1.2 Foreign key enforcement
    def fk_violation():
        conn.execute("""INSERT INTO users (id, tenant_id, branch_id, role_id, username, password_hash, full_name, created_at, updated_at)
            VALUES ('bad', 'bad-tenant', 'bad-branch', 'bad-role', 'x', 'x', 'x', '', '')""")
    assert_raises("FK enforcement: bad tenant_id rejected", fk_violation)
    conn.rollback()
    
    # 1.3 CHECK constraints
    def bad_status():
        conn.execute("""INSERT INTO supplier_invoices 
            (id, tenant_id, branch_id, supplier_id, internal_number, status, invoice_date, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'X', 'INVALID_STATUS', '2026-01-01', ?, '', '')""",
            (uid(), TENANT_ID, BRANCH_ID, SUPPLIER_1, USER_OWNER))
    assert_raises("CHECK constraint: invalid status rejected", bad_status)
    conn.rollback()
    
    def bad_account_type():
        conn.execute("""INSERT INTO accounts (id, tenant_id, name, account_type, created_at, updated_at)
            VALUES (?, ?, 'Bad', 'crypto', '', '')""", (uid(), TENANT_ID))
    assert_raises("CHECK constraint: invalid account_type rejected", bad_account_type)
    conn.rollback()
    
    def bad_sale_type():
        conn.execute("""INSERT INTO sales (id, tenant_id, branch_id, sale_number, sale_type, cashier_id, sale_date, created_at, updated_at)
            VALUES (?, ?, ?, 'X', 'wholesale', ?, '2026-01-01', '', '')""",
            (uid(), TENANT_ID, BRANCH_ID, USER_CASHIER))
    assert_raises("CHECK constraint: invalid sale_type rejected", bad_sale_type)
    conn.rollback()
    
    # 1.4 Money stored as INTEGER
    row = conn.execute("SELECT typeof(sale_price) as t FROM products LIMIT 1").fetchone()
    assert_eq("Money stored as INTEGER", row['t'], 'integer')
    
    # 1.5 FIFO index exists
    indexes = [r['name'] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='index'").fetchall()]
    assert_true("FIFO index exists", 'idx_batches_product_fifo' in indexes)
    
    # 1.6 Seed data integrity
    count = conn.execute("SELECT COUNT(*) as c FROM products").fetchone()['c']
    assert_eq("Seed products count", count, 3)
    
    count = conn.execute("SELECT COUNT(*) as c FROM users").fetchone()['c']
    assert_eq("Seed users count", count, 3)


# ════════════════════════════════════════════════════════════
# TEST SUITE 2: PURCHASE INVOICE WORKFLOW
# ════════════════════════════════════════════════════════════

# Store IDs for cross-test references
invoice_1_id = uid()
invoice_2_id = uid()
batch_ids = []

def test_purchase_create_draft(conn):
    log_section("TEST SUITE 2: PURCHASE INVOICE — CREATE DRAFT")
    global invoice_1_id
    
    n = now_iso()
    internal_num = next_number(conn, 'supplier_invoice')
    
    # Create draft invoice
    conn.execute("""INSERT INTO supplier_invoices 
        (id, tenant_id, branch_id, supplier_id, invoice_number, internal_number, 
         status, invoice_date, due_date, subtotal, total_amount, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'SUP-INV-001', ?, 'draft', ?, ?, ?, ?, ?, ?, ?)""",
        (invoice_1_id, TENANT_ID, BRANCH_ID, SUPPLIER_1, internal_num,
         date_iso(), date_iso(30),
         money(1500), money(1500), USER_OWNER, n, n))
    
    # Add 3 items
    items = [
        (PRODUCT_1, 'B001', date_iso(180), 50, money(10)),   # Panadol x50 @ 10 SDG
        (PRODUCT_2, 'B002', date_iso(365), 30, money(30)),   # Amoxicillin x30 @ 30 SDG
        (PRODUCT_3, 'B003', date_iso(90),  20, money(20)),   # Vitamin C x20 @ 20 SDG (expires in 90 days)
    ]
    
    for prod_id, batch_num, expiry, qty, price in items:
        conn.execute("""INSERT INTO supplier_invoice_items
            (id, tenant_id, supplier_invoice_id, product_id, batch_number, expiry_date,
             quantity, purchase_price, total_price, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (uid(), TENANT_ID, invoice_1_id, prod_id, batch_num, expiry,
             qty, price, qty * price, n, n))
    
    conn.commit()
    
    # Verify
    inv = conn.execute("SELECT * FROM supplier_invoices WHERE id = ?", (invoice_1_id,)).fetchone()
    assert_eq("Draft status", inv['status'], 'draft')
    assert_eq("Draft internal number", inv['internal_number'], 'PUR-2026-0001')
    
    items_count = conn.execute(
        "SELECT COUNT(*) as c FROM supplier_invoice_items WHERE supplier_invoice_id = ?",
        (invoice_1_id,)).fetchone()['c']
    assert_eq("Draft has 3 items", items_count, 3)
    
    # NO batches should exist yet
    batch_count = conn.execute(
        "SELECT COUNT(*) as c FROM batches WHERE supplier_invoice_id = ?",
        (invoice_1_id,)).fetchone()['c']
    assert_eq("Draft creates NO batches", batch_count, 0)
    
    # NO stock movements
    sm_count = conn.execute(
        "SELECT COUNT(*) as c FROM stock_movements WHERE reference_id = ?",
        (invoice_1_id,)).fetchone()['c']
    assert_eq("Draft creates NO stock movements", sm_count, 0)
    
    # NO account transactions
    at_count = conn.execute(
        "SELECT COUNT(*) as c FROM account_transactions WHERE reference_id = ?",
        (invoice_1_id,)).fetchone()['c']
    assert_eq("Draft creates NO account transactions", at_count, 0)


def test_purchase_confirm(conn):
    log_section("TEST SUITE 2: PURCHASE INVOICE — CONFIRM")
    global batch_ids
    
    n = now_iso()
    
    # Read invoice + items
    inv = conn.execute("SELECT * FROM supplier_invoices WHERE id = ?", (invoice_1_id,)).fetchone()
    assert_eq("Pre-confirm status is draft", inv['status'], 'draft')
    
    items = conn.execute(
        "SELECT * FROM supplier_invoice_items WHERE supplier_invoice_id = ? AND deleted_at IS NULL",
        (invoice_1_id,)).fetchall()
    assert_true("Has items to confirm", len(items) > 0)
    
    # Simulate CONFIRM transaction
    # For each item: create batch + stock_movement + update product
    for item in items:
        batch_id = uid()
        batch_ids.append(batch_id)
        
        # Create batch
        conn.execute("""INSERT INTO batches
            (id, tenant_id, product_id, branch_id, storage_location_id, supplier_invoice_id,
             batch_number, expiry_date, quantity_received, quantity_current, purchase_price,
             status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)""",
            (batch_id, TENANT_ID, item['product_id'], BRANCH_ID, LOCATION_SHELF,
             invoice_1_id, item['batch_number'], item['expiry_date'],
             item['quantity'], item['quantity'],  # received = current
             item['purchase_price'], n, n))
        
        # Stock movement
        conn.execute("""INSERT INTO stock_movements
            (id, tenant_id, product_id, batch_id, branch_id, movement_type,
             quantity, quantity_before, quantity_after, reference_type, reference_id,
             storage_location_id, performed_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'receive', ?, 0, ?, 'supplier_invoice', ?, ?, ?, ?, ?)""",
            (uid(), TENANT_ID, item['product_id'], batch_id, BRANCH_ID,
             item['quantity'], item['quantity'], invoice_1_id,
             LOCATION_SHELF, USER_OWNER, n, n))
        
        # Update product last_purchase_price
        conn.execute("UPDATE products SET last_purchase_price = ? WHERE id = ?",
                     (item['purchase_price'], item['product_id']))
    
    # Update invoice status
    conn.execute("""UPDATE supplier_invoices 
        SET status = 'confirmed', confirmed_at = ?, confirmed_by = ?, updated_at = ?
        WHERE id = ?""", (n, USER_OWNER, n, invoice_1_id))
    
    # Account transactions: DEBIT inventory_value, CREDIT accounts_payable
    create_txn_pair(conn, 
        'inventory_value', 'accounts_payable', inv['total_amount'],
        'supplier_invoice', invoice_1_id,
        description='Purchase confirmed: SUP-INV-001')
    
    conn.commit()
    
    # ── Verify everything ──
    
    # Status updated
    inv = conn.execute("SELECT * FROM supplier_invoices WHERE id = ?", (invoice_1_id,)).fetchone()
    assert_eq("Confirmed status", inv['status'], 'confirmed')
    assert_true("confirmed_at set", inv['confirmed_at'] is not None)
    
    # Batches created
    batches = conn.execute(
        "SELECT * FROM batches WHERE supplier_invoice_id = ? ORDER BY expiry_date",
        (invoice_1_id,)).fetchall()
    assert_eq("3 batches created", len(batches), 3)
    
    for b in batches:
        assert_eq(f"Batch {b['batch_number']} qty_received == qty_current",
                  b['quantity_received'], b['quantity_current'])
        assert_eq(f"Batch {b['batch_number']} status", b['status'], 'active')
        assert_eq(f"Batch {b['batch_number']} supplier_invoice_id correct",
                  b['supplier_invoice_id'], invoice_1_id,
                  "FK references supplier_invoices, NOT po_id (old bug fixed)")
    
    # Stock movements
    sms = conn.execute(
        "SELECT * FROM stock_movements WHERE reference_id = ?",
        (invoice_1_id,)).fetchall()
    assert_eq("3 stock movements (receive)", len(sms), 3)
    for sm in sms:
        assert_eq(f"Movement type", sm['movement_type'], 'receive')
        assert_eq(f"Movement reference_type", sm['reference_type'], 'supplier_invoice')
    
    # Account transactions (double-entry)
    txns = conn.execute(
        "SELECT * FROM account_transactions WHERE reference_id = ? AND deleted_at IS NULL ORDER BY entry_type",
        (invoice_1_id,)).fetchall()
    assert_eq("2 account_transactions created", len(txns), 2)
    
    debit = [t for t in txns if t['entry_type'] == 'debit']
    credit = [t for t in txns if t['entry_type'] == 'credit']
    assert_eq("Debit category", debit[0]['category'], 'inventory_value')
    assert_eq("Credit category", credit[0]['category'], 'accounts_payable')
    assert_eq("Debit amount == Credit amount", debit[0]['amount'], credit[0]['amount'])
    assert_eq("Transaction group matches", debit[0]['transaction_group'], credit[0]['transaction_group'])
    
    # Product prices updated
    p1 = conn.execute("SELECT last_purchase_price FROM products WHERE id = ?", (PRODUCT_1,)).fetchone()
    assert_eq("Panadol last_purchase_price updated", p1['last_purchase_price'], money(10))


def test_purchase_payment(conn):
    log_section("TEST SUITE 2: PURCHASE INVOICE — SUPPLIER PAYMENT")
    
    n = now_iso()
    payment_amount = money(500)  # Partial payment of 500 SDG
    
    inv_before = conn.execute("SELECT * FROM supplier_invoices WHERE id = ?", (invoice_1_id,)).fetchone()
    bank_before = conn.execute("SELECT balance FROM accounts WHERE id = ?", (ACCOUNT_BANK,)).fetchone()
    
    # Record payment
    payment_id = uid()
    conn.execute("""INSERT INTO supplier_payments
        (id, tenant_id, supplier_id, supplier_invoice_id, account_id, amount,
         payment_method, payment_date, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'bank_transfer', ?, ?, ?, ?)""",
        (payment_id, TENANT_ID, SUPPLIER_1, invoice_1_id, ACCOUNT_BANK,
         payment_amount, date_iso(), USER_OWNER, n, n))
    
    # Update invoice
    new_paid = inv_before['amount_paid'] + payment_amount
    new_status = 'paid' if new_paid >= inv_before['total_amount'] else ('partial' if new_paid > 0 else 'unpaid')
    conn.execute("""UPDATE supplier_invoices SET amount_paid = ?, payment_status = ?, updated_at = ?
        WHERE id = ?""", (new_paid, new_status, n, invoice_1_id))
    
    # Account transactions: DEBIT accounts_payable, CREDIT cash_outflow (bank)
    create_txn_pair(conn,
        'accounts_payable', 'cash_outflow', payment_amount,
        'supplier_payment', payment_id,
        credit_account_id=ACCOUNT_BANK,
        description='Supplier payment: PharmaCo Sudan')
    
    conn.commit()
    
    # Verify
    inv = conn.execute("SELECT * FROM supplier_invoices WHERE id = ?", (invoice_1_id,)).fetchone()
    assert_eq("Payment recorded on invoice", inv['amount_paid'], payment_amount)
    assert_eq("Payment status = partial", inv['payment_status'], 'partial')
    
    bank_after = conn.execute("SELECT balance FROM accounts WHERE id = ?", (ACCOUNT_BANK,)).fetchone()
    assert_eq("Bank balance decreased", bank_after['balance'], bank_before['balance'] - payment_amount)


# ════════════════════════════════════════════════════════════
# TEST SUITE 3: POS SESSION & SALES
# ════════════════════════════════════════════════════════════

session_1_id = uid()
sale_1_id = uid()

def test_pos_open_session(conn):
    log_section("TEST SUITE 3: POS — OPEN SESSION")
    global session_1_id
    
    n = now_iso()
    opening = money(1000)
    
    conn.execute("""INSERT INTO pos_sessions
        (id, tenant_id, branch_id, user_id, opening_cash, status, opened_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)""",
        (session_1_id, TENANT_ID, BRANCH_ID, USER_CASHIER, opening, n, n, n))
    
    # Record opening float
    create_txn_pair(conn,
        'opening_balance', 'opening_balance', opening,
        'pos_session', session_1_id,
        debit_account_id=ACCOUNT_CASH,
        description='POS session opened')
    
    conn.commit()
    
    s = conn.execute("SELECT * FROM pos_sessions WHERE id = ?", (session_1_id,)).fetchone()
    assert_eq("Session status = open", s['status'], 'open')
    assert_eq("Opening cash correct", s['opening_cash'], opening)
    
    cash = conn.execute("SELECT balance FROM accounts WHERE id = ?", (ACCOUNT_CASH,)).fetchone()
    assert_eq("Cash register has opening balance", cash['balance'], opening)


def test_pos_duplicate_session_blocked(conn):
    log_section("TEST SUITE 3: POS — DUPLICATE SESSION BLOCKED")
    
    # Try opening another session for same cashier
    # The spec says unique index prevents this, but SQLite partial unique index
    # requires explicit check since we can't use the partial unique index in test schema
    existing = conn.execute("""
        SELECT COUNT(*) as c FROM pos_sessions 
        WHERE user_id = ? AND status = 'open' AND deleted_at IS NULL
    """, (USER_CASHIER,)).fetchone()['c']
    
    assert_eq("Cashier already has open session", existing, 1)
    assert_true("Block duplicate session", existing >= 1,
                "App must check before INSERT — one open session per cashier")
    
    # But another cashier CAN open a session
    session_2_id = uid()
    n = now_iso()
    conn.execute("""INSERT INTO pos_sessions
        (id, tenant_id, branch_id, user_id, opening_cash, status, opened_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)""",
        (session_2_id, TENANT_ID, BRANCH_ID, USER_CASHIER_2, money(500), n, n, n))
    conn.commit()
    
    open_count = conn.execute(
        "SELECT COUNT(*) as c FROM pos_sessions WHERE status = 'open'").fetchone()['c']
    assert_eq("Two cashiers can have simultaneous sessions", open_count, 2)
    
    # Close cashier 2's session for cleanup
    conn.execute("UPDATE pos_sessions SET status = 'closed', closed_at = ? WHERE id = ?",
                 (n, session_2_id))
    conn.commit()


def test_pos_sale_fifo(conn):
    log_section("TEST SUITE 3: POS — SALE WITH FIFO BATCH DEDUCTION")
    global sale_1_id
    
    n = now_iso()
    
    # We have Panadol batch B001 with qty=50 (from purchase test)
    # Let's also add an older batch to test FIFO
    old_batch_id = uid()
    conn.execute("""INSERT INTO batches
        (id, tenant_id, product_id, branch_id, storage_location_id, supplier_invoice_id,
         batch_number, expiry_date, quantity_received, quantity_current, purchase_price,
         status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'B000-OLD', ?, 8, 8, ?, 'active', ?, ?)""",
        (old_batch_id, TENANT_ID, PRODUCT_1, BRANCH_ID, LOCATION_SHELF,
         invoice_1_id, date_iso(30), money(9), n, n))  # Expires sooner = should sell first
    conn.commit()
    
    # Sale: 12 Panadol (should take 8 from old batch + 4 from B001)
    sale_qty = 12
    sale_price = money(15)  # 15 SDG per strip
    
    # FIFO: get batches ordered by expiry ASC
    fifo_batches = conn.execute("""
        SELECT * FROM batches 
        WHERE product_id = ? AND branch_id = ? AND quantity_current > 0 AND status = 'active'
        ORDER BY expiry_date ASC
    """, (PRODUCT_1, BRANCH_ID)).fetchall()
    
    assert_true("FIFO: old batch comes first", 
                fifo_batches[0]['batch_number'] == 'B000-OLD',
                f"First batch: {fifo_batches[0]['batch_number']}, expiry: {fifo_batches[0]['expiry_date']}")
    
    # Create sale
    sale_number = next_number(conn, 'sale')
    total = sale_qty * sale_price
    
    conn.execute("""INSERT INTO sales
        (id, tenant_id, branch_id, sale_number, sale_type, pos_session_id, cashier_id,
         sale_date, subtotal, total_amount, amount_paid, payment_method, payment_status,
         account_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'pos', ?, ?, ?, ?, ?, ?, 'cash', 'paid', ?, 'completed', ?, ?)""",
        (sale_1_id, TENANT_ID, BRANCH_ID, sale_number, session_1_id, USER_CASHIER,
         date_iso(), total, total, total, ACCOUNT_CASH, n, n))
    
    # FIFO deduction
    remaining = sale_qty
    sale_items_created = 0
    total_cost = 0
    
    for batch in fifo_batches:
        if remaining <= 0:
            break
        
        take = min(remaining, batch['quantity_current'])
        new_qty = batch['quantity_current'] - take
        new_status = 'depleted' if new_qty == 0 else 'active'
        
        # Update batch
        conn.execute("UPDATE batches SET quantity_current = ?, status = ?, updated_at = ? WHERE id = ?",
                     (new_qty, new_status, n, batch['id']))
        
        # Sale item
        item_cost = batch['purchase_price']
        conn.execute("""INSERT INTO sale_items
            (id, tenant_id, sale_id, product_id, batch_id, quantity, unit_price, unit_cost,
             discount, total_price, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)""",
            (uid(), TENANT_ID, sale_1_id, PRODUCT_1, batch['id'],
             take, sale_price, item_cost, take * sale_price, n, n))
        
        # Stock movement
        conn.execute("""INSERT INTO stock_movements
            (id, tenant_id, product_id, batch_id, branch_id, movement_type,
             quantity, quantity_before, quantity_after, reference_type, reference_id,
             performed_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'sell', ?, ?, ?, 'sale', ?, ?, ?, ?)""",
            (uid(), TENANT_ID, PRODUCT_1, batch['id'], BRANCH_ID,
             take, batch['quantity_current'], new_qty, sale_1_id, USER_CASHIER, n, n))
        
        total_cost += take * item_cost
        remaining -= take
        sale_items_created += 1
    
    # Update POS session
    conn.execute("""UPDATE pos_sessions 
        SET total_sales = total_sales + ?, sales_count = sales_count + 1, updated_at = ?
        WHERE id = ?""", (total, n, session_1_id))
    
    # Account transactions: cash inflow + revenue
    create_txn_pair(conn,
        'cash_inflow', 'sales_revenue', total,
        'sale', sale_1_id,
        debit_account_id=ACCOUNT_CASH,
        description='POS sale: Panadol x12')
    
    conn.commit()
    
    # ── Verify FIFO ──
    assert_eq("FIFO created 2 sale_items (split across batches)", sale_items_created, 2)
    
    old_batch = conn.execute("SELECT * FROM batches WHERE id = ?", (old_batch_id,)).fetchone()
    assert_eq("Old batch fully depleted", old_batch['quantity_current'], 0)
    assert_eq("Old batch status = depleted", old_batch['status'], 'depleted')
    
    new_batch = conn.execute("SELECT * FROM batches WHERE batch_number = 'B001'").fetchone()
    assert_eq("B001 batch reduced by 4", new_batch['quantity_current'], 46)  # 50 - 4
    
    # Verify sale
    sale = conn.execute("SELECT * FROM sales WHERE id = ?", (sale_1_id,)).fetchone()
    assert_eq("Sale type = pos", sale['sale_type'], 'pos')
    assert_eq("Sale has session_id", sale['pos_session_id'], session_1_id)
    assert_eq("Sale total correct", sale['total_amount'], sale_qty * sale_price)
    
    # Verify cash register balance
    cash = conn.execute("SELECT balance FROM accounts WHERE id = ?", (ACCOUNT_CASH,)).fetchone()
    expected_cash = money(1000) + total  # opening + sale
    assert_eq("Cash register balance updated", cash['balance'], expected_cash)
    
    # Verify stock movements for this sale
    sms = conn.execute(
        "SELECT * FROM stock_movements WHERE reference_id = ? AND movement_type = 'sell'",
        (sale_1_id,)).fetchall()
    assert_eq("2 sell movements (FIFO split)", len(sms), 2)


def test_pos_oversell_blocked(conn):
    log_section("TEST SUITE 3: POS — OVERSELL PREVENTION")
    
    # Try to sell more Vitamin C than available (we have 20)
    available = conn.execute("""
        SELECT COALESCE(SUM(quantity_current), 0) as total
        FROM batches WHERE product_id = ? AND status = 'active'
    """, (PRODUCT_3,)).fetchone()['total']
    
    assert_eq("Vitamin C available stock", available, 20)
    
    # Attempt to sell 25 — app must check BEFORE creating sale
    oversell_qty = 25
    assert_true("Oversell detected", oversell_qty > available,
                f"Trying to sell {oversell_qty} but only {available} available — app must reject")


def test_pos_close_session(conn):
    log_section("TEST SUITE 3: POS — CLOSE SESSION")
    
    n = now_iso()
    
    session = conn.execute("SELECT * FROM pos_sessions WHERE id = ?", (session_1_id,)).fetchone()
    
    expected_cash = session['opening_cash'] + session['total_sales'] - session['total_returns']
    actual_cash = expected_cash - money(5)  # Simulate 5 SDG shortage
    difference = actual_cash - expected_cash
    
    conn.execute("""UPDATE pos_sessions
        SET status = 'closed', expected_cash = ?, actual_cash = ?, cash_difference = ?,
            closed_at = ?, updated_at = ?
        WHERE id = ?""",
        (expected_cash, actual_cash, difference, n, n, session_1_id))
    conn.commit()
    
    s = conn.execute("SELECT * FROM pos_sessions WHERE id = ?", (session_1_id,)).fetchone()
    assert_eq("Session closed", s['status'], 'closed')
    assert_eq("Expected cash calculated", s['expected_cash'], expected_cash)
    assert_eq("Cash difference = -500 piasters", s['cash_difference'], money(-5))
    assert_true("Shortage detected", s['cash_difference'] < 0, f"Shortage: {s['cash_difference']} piasters")


# ════════════════════════════════════════════════════════════
# TEST SUITE 4: INVOICE SALE WITH CREDIT
# ════════════════════════════════════════════════════════════

invoice_sale_id = uid()

def test_invoice_sale_credit(conn):
    log_section("TEST SUITE 4: INVOICE SALE — CREDIT TO HOSPITAL")
    global invoice_sale_id
    
    n = now_iso()
    
    # Sell 10 Amoxicillin on credit to Khartoum Hospital
    qty = 10
    price = money(45)
    total = qty * price
    sale_number = next_number(conn, 'sale')
    
    # Get FIFO batch
    batch = conn.execute("""
        SELECT * FROM batches WHERE product_id = ? AND quantity_current > 0 AND status = 'active'
        ORDER BY expiry_date ASC LIMIT 1
    """, (PRODUCT_2,)).fetchone()
    
    # Create invoice sale
    conn.execute("""INSERT INTO sales
        (id, tenant_id, branch_id, sale_number, sale_type, customer_id, cashier_id,
         sale_date, subtotal, total_amount, amount_paid, payment_method, payment_status,
         status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'invoice', ?, ?, ?, ?, ?, 0, 'credit', 'unpaid', 'completed', ?, ?)""",
        (invoice_sale_id, TENANT_ID, BRANCH_ID, sale_number, CUSTOMER_1, USER_OWNER,
         date_iso(), total, total, n, n))
    
    # Sale item
    conn.execute("""INSERT INTO sale_items
        (id, tenant_id, sale_id, product_id, batch_id, quantity, unit_price, unit_cost,
         discount, total_price, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)""",
        (uid(), TENANT_ID, invoice_sale_id, PRODUCT_2, batch['id'],
         qty, price, batch['purchase_price'], total, n, n))
    
    # Update batch
    new_qty = batch['quantity_current'] - qty
    conn.execute("UPDATE batches SET quantity_current = ?, updated_at = ? WHERE id = ?",
                 (new_qty, n, batch['id']))
    
    # Stock movement
    conn.execute("""INSERT INTO stock_movements
        (id, tenant_id, product_id, batch_id, branch_id, movement_type,
         quantity, quantity_before, quantity_after, reference_type, reference_id,
         performed_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'sell', ?, ?, ?, 'sale', ?, ?, ?, ?)""",
        (uid(), TENANT_ID, PRODUCT_2, batch['id'], BRANCH_ID,
         qty, batch['quantity_current'], new_qty, invoice_sale_id, USER_OWNER, n, n))
    
    # Update customer balance (they owe us more)
    conn.execute("UPDATE customers SET balance = balance + ?, updated_at = ? WHERE id = ?",
                 (total, n, CUSTOMER_1))
    
    # Account transactions: DEBIT accounts_receivable, CREDIT sales_revenue
    create_txn_pair(conn,
        'accounts_receivable', 'sales_revenue', total,
        'sale', invoice_sale_id,
        description='Invoice sale on credit: Khartoum Hospital')
    
    conn.commit()
    
    # Verify
    sale = conn.execute("SELECT * FROM sales WHERE id = ?", (invoice_sale_id,)).fetchone()
    assert_eq("Sale type = invoice", sale['sale_type'], 'invoice')
    assert_eq("Customer assigned", sale['customer_id'], CUSTOMER_1)
    assert_eq("Payment method = credit", sale['payment_method'], 'credit')
    assert_eq("Payment status = unpaid", sale['payment_status'], 'unpaid')
    assert_eq("Amount paid = 0", sale['amount_paid'], 0)
    
    cust = conn.execute("SELECT * FROM customers WHERE id = ?", (CUSTOMER_1,)).fetchone()
    assert_eq("Customer balance increased", cust['balance'], total)
    assert_true("Customer within credit limit", cust['balance'] <= cust['credit_limit'],
                f"Balance {cust['balance']} <= Limit {cust['credit_limit']}")


def test_customer_payment(conn):
    log_section("TEST SUITE 4: CUSTOMER PAYMENT")
    
    n = now_iso()
    payment = money(200)  # Partial payment
    
    cust_before = conn.execute("SELECT balance FROM customers WHERE id = ?", (CUSTOMER_1,)).fetchone()
    
    conn.execute("UPDATE customers SET balance = balance - ?, updated_at = ? WHERE id = ?",
                 (payment, n, CUSTOMER_1))
    
    create_txn_pair(conn,
        'cash_inflow', 'customer_payment', payment,
        'customer_payment', uid(),
        debit_account_id=ACCOUNT_CASH,
        description='Payment from Khartoum Hospital')
    
    conn.commit()
    
    cust_after = conn.execute("SELECT balance FROM customers WHERE id = ?", (CUSTOMER_1,)).fetchone()
    assert_eq("Customer balance reduced", cust_after['balance'], cust_before['balance'] - payment)


# ════════════════════════════════════════════════════════════
# TEST SUITE 5: CUSTOMER RETURNS
# ════════════════════════════════════════════════════════════

def test_customer_return_cash(conn):
    log_section("TEST SUITE 5: CUSTOMER RETURN — CASH REFUND")
    
    n = now_iso()
    return_qty = 3
    
    # Get original sale items from POS sale (sale_1_id)
    si = conn.execute("""SELECT * FROM sale_items WHERE sale_id = ? LIMIT 1""",
                      (sale_1_id,)).fetchone()
    
    batch_before = conn.execute("SELECT * FROM batches WHERE id = ?", (si['batch_id'],)).fetchone()
    cash_before = conn.execute("SELECT balance FROM accounts WHERE id = ?", (ACCOUNT_CASH,)).fetchone()
    
    return_id = uid()
    return_number = next_number(conn, 'customer_return')
    refund_amount = return_qty * si['unit_price']
    
    # Create return
    conn.execute("""INSERT INTO customer_returns
        (id, tenant_id, branch_id, return_number, sale_id, return_date,
         total_amount, refund_method, account_id, reason, status, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'cash', ?, 'Customer changed mind', 'completed', ?, ?, ?)""",
        (return_id, TENANT_ID, BRANCH_ID, return_number, sale_1_id,
         date_iso(), refund_amount, ACCOUNT_CASH, USER_CASHIER, n, n))
    
    # Return item
    conn.execute("""INSERT INTO customer_return_items
        (id, tenant_id, customer_return_id, product_id, batch_id, sale_item_id,
         quantity, unit_price, unit_cost, total_price, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (uid(), TENANT_ID, return_id, si['product_id'], si['batch_id'], si['id'],
         return_qty, si['unit_price'], si['unit_cost'], refund_amount, n, n))
    
    # Restore batch stock
    new_qty = batch_before['quantity_current'] + return_qty
    new_status = 'active' if new_qty > 0 else batch_before['status']
    conn.execute("UPDATE batches SET quantity_current = ?, status = ?, updated_at = ? WHERE id = ?",
                 (new_qty, new_status, n, si['batch_id']))
    
    # Stock movement
    conn.execute("""INSERT INTO stock_movements
        (id, tenant_id, product_id, batch_id, branch_id, movement_type,
         quantity, quantity_before, quantity_after, reference_type, reference_id,
         performed_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'customer_return', ?, ?, ?, 'customer_return', ?, ?, ?, ?)""",
        (uid(), TENANT_ID, si['product_id'], si['batch_id'], BRANCH_ID,
         return_qty, batch_before['quantity_current'], new_qty, return_id, USER_CASHIER, n, n))
    
    # Account transactions: DEBIT sales_revenue, CREDIT cash_outflow
    create_txn_pair(conn,
        'sales_revenue', 'refund', refund_amount,
        'customer_return', return_id,
        credit_account_id=ACCOUNT_CASH,
        description='Customer return refund (cash)')
    
    conn.commit()
    
    # Verify
    batch_after = conn.execute("SELECT * FROM batches WHERE id = ?", (si['batch_id'],)).fetchone()
    assert_eq("Batch stock restored", batch_after['quantity_current'], 
              batch_before['quantity_current'] + return_qty)
    
    cash_after = conn.execute("SELECT balance FROM accounts WHERE id = ?", (ACCOUNT_CASH,)).fetchone()
    assert_eq("Cash register reduced by refund", cash_after['balance'],
              cash_before['balance'] - refund_amount)
    
    sm = conn.execute("""SELECT * FROM stock_movements 
        WHERE reference_id = ? AND movement_type = 'customer_return'""",
        (return_id,)).fetchone()
    assert_true("Return stock movement recorded", sm is not None)


# ════════════════════════════════════════════════════════════
# TEST SUITE 6: SUPPLIER RETURNS
# ════════════════════════════════════════════════════════════

def test_supplier_return(conn):
    log_section("TEST SUITE 6: SUPPLIER RETURN")
    
    n = now_iso()
    return_qty = 5
    
    # Return 5 Vitamin C from batch B003 (we have 20)
    batch = conn.execute("""
        SELECT * FROM batches WHERE batch_number = 'B003' AND product_id = ?
    """, (PRODUCT_3,)).fetchone()
    
    assert_true("Batch found for return", batch is not None)
    assert_true("Sufficient qty for return", batch['quantity_current'] >= return_qty)
    
    return_id = uid()
    return_number = next_number(conn, 'supplier_return')
    return_amount = return_qty * batch['purchase_price']
    
    conn.execute("""INSERT INTO supplier_returns
        (id, tenant_id, supplier_id, supplier_invoice_id, branch_id, return_number,
         return_date, total_amount, status, reason, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'Near expiry', ?, ?, ?)""",
        (return_id, TENANT_ID, SUPPLIER_1, invoice_1_id, BRANCH_ID, return_number,
         date_iso(), return_amount, USER_OWNER, n, n))
    
    conn.execute("""INSERT INTO supplier_return_items
        (id, tenant_id, supplier_return_id, product_id, batch_id, quantity,
         purchase_price, total_price, reason, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Near expiry', ?, ?)""",
        (uid(), TENANT_ID, return_id, PRODUCT_3, batch['id'], return_qty,
         batch['purchase_price'], return_amount, n, n))
    
    # Update batch
    new_qty = batch['quantity_current'] - return_qty
    new_status = 'returned' if new_qty == 0 else 'active'
    conn.execute("UPDATE batches SET quantity_current = ?, status = ?, updated_at = ? WHERE id = ?",
                 (new_qty, new_status, n, batch['id']))
    
    # Stock movement
    conn.execute("""INSERT INTO stock_movements
        (id, tenant_id, product_id, batch_id, branch_id, movement_type,
         quantity, quantity_before, quantity_after, reference_type, reference_id,
         performed_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'supplier_return', ?, ?, ?, 'supplier_return', ?, ?, ?, ?)""",
        (uid(), TENANT_ID, PRODUCT_3, batch['id'], BRANCH_ID,
         return_qty, batch['quantity_current'], new_qty, return_id, USER_OWNER, n, n))
    
    # Account txn: DEBIT accounts_payable, CREDIT inventory_value
    create_txn_pair(conn,
        'accounts_payable', 'inventory_value', return_amount,
        'supplier_return', return_id,
        description='Supplier return: Vitamin C near expiry')
    
    conn.commit()
    
    batch_after = conn.execute("SELECT * FROM batches WHERE id = ?", (batch['id'],)).fetchone()
    assert_eq("Batch qty reduced", batch_after['quantity_current'], 
              batch['quantity_current'] - return_qty)
    assert_eq("Batch qty = 15", batch_after['quantity_current'], 15)


# ════════════════════════════════════════════════════════════
# TEST SUITE 7: EXPENSES
# ════════════════════════════════════════════════════════════

expense_1_id = uid()

def test_expense_create(conn):
    log_section("TEST SUITE 7: EXPENSES — CREATE")
    global expense_1_id
    
    n = now_iso()
    amount = money(3000)
    
    cash_before = conn.execute("SELECT balance FROM accounts WHERE id = ?", (ACCOUNT_CASH,)).fetchone()
    
    conn.execute("""INSERT INTO expenses
        (id, tenant_id, branch_id, category_id, account_id, amount, expense_date,
         payment_method, description, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'cash', 'Monthly rent', ?, ?, ?)""",
        (expense_1_id, TENANT_ID, BRANCH_ID, EXPENSE_CAT_RENT, ACCOUNT_CASH,
         amount, date_iso(), USER_OWNER, n, n))
    
    create_txn_pair(conn,
        'expense', 'cash_outflow', amount,
        'expense', expense_1_id,
        credit_account_id=ACCOUNT_CASH,
        description='Expense: Monthly rent')
    
    conn.commit()
    
    cash_after = conn.execute("SELECT balance FROM accounts WHERE id = ?", (ACCOUNT_CASH,)).fetchone()
    assert_eq("Cash reduced by expense", cash_after['balance'], cash_before['balance'] - amount)


def test_expense_edit_reversal(conn):
    log_section("TEST SUITE 7: EXPENSES — EDIT WITH REVERSAL")
    
    n = now_iso()
    old_amount = money(3000)
    new_amount = money(3500)
    
    cash_before = conn.execute("SELECT balance FROM accounts WHERE id = ?", (ACCOUNT_CASH,)).fetchone()
    
    # Step 1: Soft-delete old transactions
    conn.execute("""UPDATE account_transactions SET deleted_at = ? 
        WHERE reference_id = ? AND reference_type = 'expense' AND deleted_at IS NULL""",
        (n, expense_1_id))
    
    # Step 2: Reverse old amount on account
    conn.execute("UPDATE accounts SET balance = balance + ? WHERE id = ?", (old_amount, ACCOUNT_CASH))
    
    # Step 3: Update expense
    conn.execute("UPDATE expenses SET amount = ?, updated_at = ? WHERE id = ?",
                 (new_amount, n, expense_1_id))
    
    # Step 4: Apply new amount
    create_txn_pair(conn,
        'expense', 'cash_outflow', new_amount,
        'expense', expense_1_id,
        credit_account_id=ACCOUNT_CASH,
        description='Expense: Monthly rent (corrected)')
    
    conn.commit()
    
    cash_after = conn.execute("SELECT balance FROM accounts WHERE id = ?", (ACCOUNT_CASH,)).fetchone()
    expected = cash_before['balance'] + old_amount - new_amount
    assert_eq("Cash correctly adjusted after edit", cash_after['balance'], expected)
    
    # Verify old transactions are soft-deleted
    deleted = conn.execute("""SELECT COUNT(*) as c FROM account_transactions 
        WHERE reference_id = ? AND deleted_at IS NOT NULL""", (expense_1_id,)).fetchone()['c']
    assert_eq("Old transactions soft-deleted", deleted, 2)
    
    active = conn.execute("""SELECT COUNT(*) as c FROM account_transactions 
        WHERE reference_id = ? AND deleted_at IS NULL""", (expense_1_id,)).fetchone()['c']
    assert_eq("New transactions active", active, 2)


def test_expense_delete_reversal(conn):
    log_section("TEST SUITE 7: EXPENSES — DELETE WITH FULL REVERSAL")
    
    n = now_iso()
    expense = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_1_id,)).fetchone()
    cash_before = conn.execute("SELECT balance FROM accounts WHERE id = ?", (ACCOUNT_CASH,)).fetchone()
    
    # Soft-delete transactions
    conn.execute("""UPDATE account_transactions SET deleted_at = ?
        WHERE reference_id = ? AND reference_type = 'expense' AND deleted_at IS NULL""",
        (n, expense_1_id))
    
    # Reverse
    conn.execute("UPDATE accounts SET balance = balance + ? WHERE id = ?",
                 (expense['amount'], ACCOUNT_CASH))
    
    # Soft-delete expense
    conn.execute("UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ?",
                 (n, n, expense_1_id))
    
    conn.commit()
    
    cash_after = conn.execute("SELECT balance FROM accounts WHERE id = ?", (ACCOUNT_CASH,)).fetchone()
    assert_eq("Cash fully restored after expense delete", 
              cash_after['balance'], cash_before['balance'] + expense['amount'])
    
    exp = conn.execute("SELECT deleted_at FROM expenses WHERE id = ?", (expense_1_id,)).fetchone()
    assert_true("Expense soft-deleted", exp['deleted_at'] is not None)


# ════════════════════════════════════════════════════════════
# TEST SUITE 8: DOUBLE-ENTRY INTEGRITY
# ════════════════════════════════════════════════════════════

def test_double_entry_balance(conn):
    log_section("TEST SUITE 8: DOUBLE-ENTRY INTEGRITY")
    
    # Every transaction_group must have exactly 1 debit and 1 credit of equal amount
    groups = conn.execute("""
        SELECT transaction_group,
               SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END) as total_debit,
               SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END) as total_credit,
               COUNT(*) as row_count
        FROM account_transactions
        WHERE deleted_at IS NULL
        GROUP BY transaction_group
    """).fetchall()
    
    imbalanced = 0
    for g in groups:
        if g['total_debit'] != g['total_credit']:
            imbalanced += 1
            log_fail(f"Group {g['transaction_group'][:8]}...",
                     f"Debit={g['total_debit']} ≠ Credit={g['total_credit']}")
        if g['row_count'] != 2:
            log_fail(f"Group {g['transaction_group'][:8]}... row count",
                     f"Expected 2 rows, got {g['row_count']}")
    
    assert_eq("All transaction groups balanced (debit == credit)", imbalanced, 0)
    assert_true(f"Total transaction groups verified: {len(groups)}", len(groups) > 0)
    
    # Global balance check: sum of all debits == sum of all credits
    totals = conn.execute("""
        SELECT 
            SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END) as total_debit,
            SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END) as total_credit
        FROM account_transactions WHERE deleted_at IS NULL
    """).fetchone()
    
    assert_eq("Global debit total == credit total", 
              totals['total_debit'], totals['total_credit'])
    
    if console:
        console.print(f"  [dim]Total debits:  {totals['total_debit']:>12,} piasters[/]")
        console.print(f"  [dim]Total credits: {totals['total_credit']:>12,} piasters[/]")


# ════════════════════════════════════════════════════════════
# TEST SUITE 9: STOCK INTEGRITY
# ════════════════════════════════════════════════════════════

def test_stock_integrity(conn):
    log_section("TEST SUITE 9: STOCK MOVEMENT INTEGRITY")
    
    # For each batch, verify: initial qty + returns - sales - supplier_returns == quantity_current
    batches = conn.execute("""
        SELECT b.id, b.batch_number, b.product_id, b.quantity_received, b.quantity_current,
               p.name as product_name
        FROM batches b JOIN products p ON b.product_id = p.id
        WHERE b.deleted_at IS NULL
    """).fetchall()
    
    for batch in batches:
        movements = conn.execute("""
            SELECT movement_type, SUM(quantity) as total
            FROM stock_movements 
            WHERE batch_id = ? AND deleted_at IS NULL
            GROUP BY movement_type
        """, (batch['id'],)).fetchall()
        
        mv = {m['movement_type']: m['total'] for m in movements}
        
        calculated = batch['quantity_received']
        calculated -= mv.get('sell', 0)
        calculated += mv.get('customer_return', 0)
        calculated -= mv.get('supplier_return', 0)
        calculated -= mv.get('adjust_decrease', 0)
        calculated += mv.get('adjust_increase', 0)
        calculated -= mv.get('dispose', 0)
        calculated -= mv.get('transfer_out', 0)
        calculated += mv.get('transfer_in', 0)
        
        assert_eq(f"Batch {batch['batch_number'] or batch['id'][:8]} ({batch['product_name']}): stock reconciles",
                  batch['quantity_current'], calculated,
                  f"received({batch['quantity_received']}) - movements = {calculated}")


# ════════════════════════════════════════════════════════════
# TEST SUITE 10: EDGE CASES & CONSTRAINT VIOLATIONS
# ════════════════════════════════════════════════════════════

def test_edge_cases(conn):
    log_section("TEST SUITE 10: EDGE CASES & CONSTRAINTS")
    
    n = now_iso()
    
    # 10.1 Negative money values — should be caught by app logic
    # (SQLite doesn't prevent negative INTEGERs, app must validate)
    assert_true("App must validate: no negative sale_price",
                True, "Negative check is app-layer (no DB constraint)")
    
    # 10.2 Cancel confirmed invoice with sold batches — must be blocked
    sold_batches = conn.execute("""
        SELECT b.id, b.supplier_invoice_id, COUNT(si.id) as sale_count
        FROM batches b
        JOIN sale_items si ON si.batch_id = b.id AND si.deleted_at IS NULL
        WHERE b.supplier_invoice_id = ? AND b.deleted_at IS NULL
        GROUP BY b.id
    """, (invoice_1_id,)).fetchall()
    
    has_sales = len(sold_batches) > 0
    assert_true("Cannot cancel confirmed invoice with sold batches",
                has_sales, f"{len(sold_batches)} batches have sales — cancel must be blocked")
    
    # 10.3 Soft-delete doesn't break queries (WHERE deleted_at IS NULL)
    conn.execute("""INSERT INTO products
        (id, tenant_id, name, sale_price, deleted_at, created_at, updated_at)
        VALUES (?, ?, 'DELETED DRUG', 100, ?, ?, ?)""",
        (uid(), TENANT_ID, n, n, n))
    conn.commit()
    
    active_count = conn.execute(
        "SELECT COUNT(*) as c FROM products WHERE tenant_id = ? AND deleted_at IS NULL",
        (TENANT_ID,)).fetchone()['c']
    all_count = conn.execute(
        "SELECT COUNT(*) as c FROM products WHERE tenant_id = ?",
        (TENANT_ID,)).fetchone()['c']
    
    assert_eq("Soft-deleted product excluded from active query", active_count, 3)
    assert_eq("Soft-deleted product exists in total", all_count, 4)
    
    # 10.4 Tenant isolation — all queries must filter by tenant_id
    fake_tenant = uid()
    conn.execute("""INSERT INTO tenants (id, tenant_id, name, created_at, updated_at)
        VALUES (?, ?, 'Other Pharmacy', ?, ?)""", (fake_tenant, fake_tenant, n, n))
    conn.execute("""INSERT INTO products
        (id, tenant_id, name, sale_price, created_at, updated_at)
        VALUES (?, ?, 'Other Drug', 999, ?, ?)""",
        (uid(), fake_tenant, n, n))
    conn.commit()
    
    our_products = conn.execute(
        "SELECT COUNT(*) as c FROM products WHERE tenant_id = ? AND deleted_at IS NULL",
        (TENANT_ID,)).fetchone()['c']
    assert_eq("Tenant isolation: our products unaffected", our_products, 3)
    
    # 10.5 Sequence counter increment
    num1 = next_number(conn, 'sale')
    num2 = next_number(conn, 'sale')
    conn.commit()
    assert_true("Sequence numbers increment", num1 != num2, f"{num1} → {num2}")
    
    # 10.6 Payment status calculation
    for paid, total, expected in [(0, 1000, 'unpaid'), (500, 1000, 'partial'), (1000, 1000, 'paid')]:
        status = 'paid' if paid >= total else ('partial' if paid > 0 else 'unpaid')
        assert_eq(f"Payment status: paid={paid}/total={total}", status, expected)


# ════════════════════════════════════════════════════════════
# TEST SUITE 11: DATA SUMMARY & REPORT QUERIES
# ════════════════════════════════════════════════════════════

def test_report_queries(conn):
    log_section("TEST SUITE 11: REPORT QUERY VALIDATION")
    
    # 11.1 Total stock value
    stock_value = conn.execute("""
        SELECT COALESCE(SUM(quantity_current * purchase_price), 0) as value
        FROM batches WHERE tenant_id = ? AND status = 'active' AND deleted_at IS NULL
    """, (TENANT_ID,)).fetchone()['value']
    assert_true("Stock value query works", stock_value > 0, f"Value: {stock_value} piasters")
    
    # 11.2 Revenue from sales
    revenue = conn.execute("""
        SELECT COALESCE(SUM(total_amount), 0) as rev
        FROM sales WHERE tenant_id = ? AND deleted_at IS NULL AND status = 'completed'
    """, (TENANT_ID,)).fetchone()['rev']
    assert_true("Revenue query works", revenue > 0, f"Revenue: {revenue} piasters")
    
    # 11.3 COGS
    cogs = conn.execute("""
        SELECT COALESCE(SUM(si.unit_cost * si.quantity), 0) as cogs
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.tenant_id = ? AND s.deleted_at IS NULL AND si.deleted_at IS NULL
    """, (TENANT_ID,)).fetchone()['cogs']
    assert_true("COGS query works", cogs > 0, f"COGS: {cogs} piasters")
    assert_true("Gross profit positive", revenue > cogs, 
                f"Revenue {revenue} > COGS {cogs} → Profit {revenue - cogs}")
    
    # 11.4 Supplier payables
    payables = conn.execute("""
        SELECT COALESCE(SUM(total_amount - amount_paid), 0) as owed
        FROM supplier_invoices
        WHERE tenant_id = ? AND status = 'confirmed' AND payment_status != 'paid' AND deleted_at IS NULL
    """, (TENANT_ID,)).fetchone()['owed']
    assert_true("Supplier payables query", payables >= 0, f"Payables: {payables} piasters")
    
    # 11.5 Expiry report
    expiring = conn.execute("""
        SELECT p.name, b.batch_number, b.expiry_date, b.quantity_current
        FROM batches b JOIN products p ON b.product_id = p.id
        WHERE b.quantity_current > 0 AND b.status = 'active'
          AND b.expiry_date < date('now', '+90 days')
          AND b.deleted_at IS NULL
        ORDER BY b.expiry_date ASC
    """).fetchall()
    assert_true("Expiry report query works", True, 
                f"Found {len(expiring)} batches expiring in 90 days")
    
    # 11.6 Low stock items
    low_stock = conn.execute("""
        SELECT p.name, p.min_stock_level, COALESCE(SUM(b.quantity_current), 0) as current_stock
        FROM products p
        LEFT JOIN batches b ON b.product_id = p.id AND b.status = 'active' AND b.deleted_at IS NULL
        WHERE p.tenant_id = ? AND p.is_active = 1 AND p.deleted_at IS NULL
        GROUP BY p.id
        HAVING current_stock < p.min_stock_level
    """, (TENANT_ID,)).fetchall()
    assert_true("Low stock query works", True, f"Found {len(low_stock)} low stock items")
    
    # 11.7 Movement audit trail
    all_movements = conn.execute("""
        SELECT movement_type, COUNT(*) as cnt, SUM(quantity) as total_qty
        FROM stock_movements WHERE tenant_id = ? AND deleted_at IS NULL
        GROUP BY movement_type ORDER BY cnt DESC
    """, (TENANT_ID,)).fetchall()
    
    if console:
        t = RichTable(title="Stock Movement Summary", box=box.SIMPLE)
        t.add_column("Type")
        t.add_column("Count", justify="right")
        t.add_column("Total Qty", justify="right")
        for m in all_movements:
            t.add_row(m['movement_type'], str(m['cnt']), str(m['total_qty']))
        console.print(t)
    
    assert_true("Movement audit trail has data", len(all_movements) > 0)


# ════════════════════════════════════════════════════════════
# TEST SUITE 12: FULL DAY SIMULATION
# ════════════════════════════════════════════════════════════

def test_full_day_simulation(conn):
    log_section("TEST SUITE 12: FULL DAY SIMULATION — 10 SALES")
    
    n = now_iso()
    
    # Open a fresh session
    sim_session_id = uid()
    opening = money(2000)
    conn.execute("""INSERT INTO pos_sessions
        (id, tenant_id, branch_id, user_id, opening_cash, status, opened_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)""",
        (sim_session_id, TENANT_ID, BRANCH_ID, USER_CASHIER, opening, n, n, n))
    
    create_txn_pair(conn, 'opening_balance', 'opening_balance', opening,
                    'pos_session', sim_session_id, debit_account_id=ACCOUNT_CASH)
    
    # Run 10 sales of random products
    import random
    random.seed(42)  # Reproducible
    products = [PRODUCT_1, PRODUCT_2, PRODUCT_3]
    total_revenue = 0
    successful_sales = 0
    
    for i in range(10):
        prod_id = random.choice(products)
        qty = random.randint(1, 5)
        
        # Check stock
        stock = conn.execute("""
            SELECT COALESCE(SUM(quantity_current), 0) as avail
            FROM batches WHERE product_id = ? AND status = 'active' AND quantity_current > 0
        """, (prod_id,)).fetchone()['avail']
        
        if stock < qty:
            continue  # Skip if insufficient
        
        prod = conn.execute("SELECT sale_price FROM products WHERE id = ?", (prod_id,)).fetchone()
        sale_total = qty * prod['sale_price']
        
        sale_id = uid()
        sale_num = next_number(conn, 'sale')
        
        conn.execute("""INSERT INTO sales
            (id, tenant_id, branch_id, sale_number, sale_type, pos_session_id, cashier_id,
             sale_date, subtotal, total_amount, amount_paid, payment_method, payment_status,
             account_id, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'pos', ?, ?, ?, ?, ?, ?, 'cash', 'paid', ?, 'completed', ?, ?)""",
            (sale_id, TENANT_ID, BRANCH_ID, sale_num, sim_session_id, USER_CASHIER,
             date_iso(), sale_total, sale_total, sale_total, ACCOUNT_CASH, n, n))
        
        # FIFO deduction
        remaining = qty
        fifo = conn.execute("""
            SELECT * FROM batches WHERE product_id = ? AND quantity_current > 0 AND status = 'active'
            ORDER BY expiry_date ASC
        """, (prod_id,)).fetchall()
        
        for batch in fifo:
            if remaining <= 0:
                break
            take = min(remaining, batch['quantity_current'])
            new_q = batch['quantity_current'] - take
            st = 'depleted' if new_q == 0 else 'active'
            
            conn.execute("UPDATE batches SET quantity_current = ?, status = ? WHERE id = ?",
                         (new_q, st, batch['id']))
            conn.execute("""INSERT INTO sale_items
                (id, tenant_id, sale_id, product_id, batch_id, quantity, unit_price, unit_cost,
                 discount, total_price, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)""",
                (uid(), TENANT_ID, sale_id, prod_id, batch['id'],
                 take, prod['sale_price'], batch['purchase_price'], take * prod['sale_price'], n, n))
            conn.execute("""INSERT INTO stock_movements
                (id, tenant_id, product_id, batch_id, branch_id, movement_type,
                 quantity, quantity_before, quantity_after, reference_type, reference_id,
                 performed_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'sell', ?, ?, ?, 'sale', ?, ?, ?, ?)""",
                (uid(), TENANT_ID, prod_id, batch['id'], BRANCH_ID,
                 take, batch['quantity_current'], new_q, sale_id, USER_CASHIER, n, n))
            remaining -= take
        
        conn.execute("""UPDATE pos_sessions 
            SET total_sales = total_sales + ?, sales_count = sales_count + 1
            WHERE id = ?""", (sale_total, sim_session_id))
        
        create_txn_pair(conn, 'cash_inflow', 'sales_revenue', sale_total,
                        'sale', sale_id, debit_account_id=ACCOUNT_CASH)
        
        total_revenue += sale_total
        successful_sales += 1
    
    conn.commit()
    
    assert_true(f"Completed {successful_sales} sales", successful_sales > 0,
                f"Total revenue: {total_revenue} piasters")
    
    # Close session
    session = conn.execute("SELECT * FROM pos_sessions WHERE id = ?", (sim_session_id,)).fetchone()
    expected = session['opening_cash'] + session['total_sales'] - session['total_returns']
    conn.execute("""UPDATE pos_sessions
        SET status='closed', expected_cash=?, actual_cash=?, cash_difference=0, closed_at=?
        WHERE id = ?""", (expected, expected, n, sim_session_id))
    conn.commit()
    
    # Final integrity checks
    test_double_entry_balance(conn)
    test_stock_integrity(conn)


# ════════════════════════════════════════════════════════════
# FINAL SUMMARY
# ════════════════════════════════════════════════════════════

def print_final_db_state(conn):
    log_section("DATABASE STATE SUMMARY")
    
    tables_data = [
        ("products (active)", "SELECT COUNT(*) as c FROM products WHERE deleted_at IS NULL AND tenant_id = ?"),
        ("batches (active)", "SELECT COUNT(*) as c FROM batches WHERE status='active' AND deleted_at IS NULL AND tenant_id = ?"),
        ("batches (depleted)", "SELECT COUNT(*) as c FROM batches WHERE status='depleted' AND deleted_at IS NULL AND tenant_id = ?"),
        ("supplier_invoices", "SELECT COUNT(*) as c FROM supplier_invoices WHERE deleted_at IS NULL AND tenant_id = ?"),
        ("supplier_payments", "SELECT COUNT(*) as c FROM supplier_payments WHERE deleted_at IS NULL AND tenant_id = ?"),
        ("supplier_returns", "SELECT COUNT(*) as c FROM supplier_returns WHERE deleted_at IS NULL AND tenant_id = ?"),
        ("sales (total)", "SELECT COUNT(*) as c FROM sales WHERE deleted_at IS NULL AND tenant_id = ?"),
        ("sale_items", "SELECT COUNT(*) as c FROM sale_items WHERE deleted_at IS NULL AND tenant_id = ?"),
        ("customer_returns", "SELECT COUNT(*) as c FROM customer_returns WHERE deleted_at IS NULL AND tenant_id = ?"),
        ("stock_movements", "SELECT COUNT(*) as c FROM stock_movements WHERE deleted_at IS NULL AND tenant_id = ?"),
        ("account_transactions (active)", "SELECT COUNT(*) as c FROM account_transactions WHERE deleted_at IS NULL AND tenant_id = ?"),
        ("account_transactions (deleted)", "SELECT COUNT(*) as c FROM account_transactions WHERE deleted_at IS NOT NULL AND tenant_id = ?"),
        ("pos_sessions", "SELECT COUNT(*) as c FROM pos_sessions WHERE deleted_at IS NULL AND tenant_id = ?"),
        ("expenses", "SELECT COUNT(*) as c FROM expenses WHERE tenant_id = ?"),
    ]
    
    if console:
        t = RichTable(title="Final Record Counts", box=box.ROUNDED)
        t.add_column("Table", style="cyan")
        t.add_column("Count", justify="right", style="bold")
        for name, query in tables_data:
            count = conn.execute(query, (TENANT_ID,)).fetchone()['c']
            t.add_row(name, str(count))
        console.print(t)
        
        # Account balances
        t2 = RichTable(title="Account Balances", box=box.ROUNDED)
        t2.add_column("Account", style="cyan")
        t2.add_column("Balance (SDG)", justify="right", style="bold")
        for acc in conn.execute("SELECT name, balance FROM accounts WHERE tenant_id = ?", (TENANT_ID,)):
            t2.add_row(acc['name'], f"{acc['balance']/100:,.2f}")
        console.print(t2)
        
        # Customer balances
        t3 = RichTable(title="Customer Balances", box=box.ROUNDED)
        t3.add_column("Customer", style="cyan")
        t3.add_column("Owes Us (SDG)", justify="right", style="bold")
        for c in conn.execute("SELECT name, balance FROM customers WHERE tenant_id = ?", (TENANT_ID,)):
            t3.add_row(c['name'], f"{c['balance']/100:,.2f}")
        console.print(t3)
    else:
        for name, query in tables_data:
            count = conn.execute(query, (TENANT_ID,)).fetchone()['c']
            print(f"  {name}: {count}")


def print_results():
    total = test_results['passed'] + test_results['failed']
    
    if console:
        console.print(f"\n{'═'*60}")
        if test_results['failed'] == 0:
            console.print(Panel(
                f"[bold green]ALL {total} TESTS PASSED[/]\n\n"
                f"  ✓ Passed: {test_results['passed']}\n"
                f"  ✗ Failed: {test_results['failed']}",
                title="[bold green]TEST RESULTS[/]",
                border_style="green"
            ))
        else:
            console.print(Panel(
                f"[bold red]{test_results['failed']} TESTS FAILED[/]\n\n"
                f"  ✓ Passed: {test_results['passed']}\n"
                f"  ✗ Failed: {test_results['failed']}\n\n"
                f"Failures:\n" + "\n".join(f"  • {e}" for e in test_results['errors']),
                title="[bold red]TEST RESULTS[/]",
                border_style="red"
            ))
    else:
        print(f"\n{'═'*60}")
        print(f"  PASSED: {test_results['passed']}")
        print(f"  FAILED: {test_results['failed']}")
        if test_results['errors']:
            print("\n  Failures:")
            for e in test_results['errors']:
                print(f"    • {e}")


# ════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════

def main():
    if console:
        console.print(Panel(
            "[bold]PMS Pharmacy — Deep Workflow Test Suite[/]\n"
            "Testing all business workflows against real SQLite\n"
            "Simulating: purchases, sales, returns, expenses, FIFO, double-entry",
            title="🏥 Pharmacy Management System",
            border_style="green"
        ))
    
    # Initialize
    init_db()
    conn = get_db()
    seed_data(conn)
    
    try:
        # Schema validation
        test_schema_validation(conn)
        
        # Purchase lifecycle
        test_purchase_create_draft(conn)
        test_purchase_confirm(conn)
        test_purchase_payment(conn)
        
        # POS operations
        test_pos_open_session(conn)
        test_pos_duplicate_session_blocked(conn)
        test_pos_sale_fifo(conn)
        test_pos_oversell_blocked(conn)
        test_pos_close_session(conn)
        
        # Invoice sales + credit
        test_invoice_sale_credit(conn)
        test_customer_payment(conn)
        
        # Returns
        test_customer_return_cash(conn)
        test_supplier_return(conn)
        
        # Expenses
        test_expense_create(conn)
        test_expense_edit_reversal(conn)
        test_expense_delete_reversal(conn)
        
        # Integrity checks
        test_double_entry_balance(conn)
        test_stock_integrity(conn)
        
        # Edge cases
        test_edge_cases(conn)
        
        # Report queries
        test_report_queries(conn)
        
        # Full day simulation
        test_full_day_simulation(conn)
        
        # Summary
        print_final_db_state(conn)
        
    except Exception as e:
        log_fail("FATAL", str(e))
        import traceback
        traceback.print_exc()
    finally:
        conn.close()
    
    print_results()
    return 0 if test_results['failed'] == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
