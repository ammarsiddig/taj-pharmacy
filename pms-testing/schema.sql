-- PMS Pharmacy - Complete Schema for Testing
-- This file creates all tables, indexes, and seed data

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;

-- ============================================================
-- TENANT & AUTH
-- ============================================================

CREATE TABLE IF NOT EXISTS tenants (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL,
    name                TEXT NOT NULL,
    name_ar             TEXT,
    license_number      TEXT,
    phone               TEXT,
    email               TEXT,
    address             TEXT,
    address_ar          TEXT,
    logo_path           TEXT,
    currency_code       TEXT NOT NULL DEFAULT 'SDG',
    timezone            TEXT NOT NULL DEFAULT 'Africa/Khartoum',
    fiscal_year_start   INTEGER NOT NULL DEFAULT 1,
    receipt_header      TEXT,
    receipt_footer      TEXT,
    print_logo          INTEGER NOT NULL DEFAULT 1,
    subscription_plan   TEXT NOT NULL DEFAULT 'basic'
                        CHECK (subscription_plan IN ('basic','professional','enterprise')),
    subscription_status TEXT NOT NULL DEFAULT 'active'
                        CHECK (subscription_status IN ('active','expired','suspended')),
    subscription_expiry TEXT,
    max_branches        INTEGER NOT NULL DEFAULT 1,
    max_users           INTEGER NOT NULL DEFAULT 2,
    feature_flags       INTEGER NOT NULL DEFAULT 0,
    onboarding_completed INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at          TEXT
);

CREATE TABLE IF NOT EXISTS branches (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL,
    name        TEXT NOT NULL,
    name_ar     TEXT,
    address     TEXT,
    address_ar  TEXT,
    phone       TEXT,
    is_main     INTEGER NOT NULL DEFAULT 0,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at  TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS roles (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL,
    name        TEXT NOT NULL,
    name_ar     TEXT,
    description TEXT,
    is_system   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at  TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL,
    branch_id       TEXT NOT NULL,
    role_id         TEXT NOT NULL,
    username        TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    full_name       TEXT NOT NULL,
    full_name_ar    TEXT,
    phone           TEXT,
    email           TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    last_login_at   TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at      TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS permissions (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    feature     TEXT NOT NULL,
    allowed     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at  TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS license_keys (
    id            TEXT PRIMARY KEY,
    tenant_id     TEXT NOT NULL,
    key_hash      TEXT NOT NULL UNIQUE,
    plan          TEXT NOT NULL,
    activated_at  TEXT NOT NULL,
    expires_at    TEXT,
    max_branches  INTEGER NOT NULL DEFAULT 1,
    max_users     INTEGER NOT NULL DEFAULT 2,
    feature_flags INTEGER NOT NULL DEFAULT 0,
    activated_by  TEXT,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_license_keys_tenant
    ON license_keys(tenant_id, activated_at);

CREATE TABLE IF NOT EXISTS license_server_cache (
    tenant_id           TEXT PRIMARY KEY,
    key_hash            TEXT NOT NULL,
    server_valid        INTEGER NOT NULL DEFAULT 1,
    revoked             INTEGER NOT NULL DEFAULT 0,
    last_checked_at     TEXT NOT NULL,
    next_check_at       TEXT,
    offline_grace_until TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- ============================================================
-- PRODUCTS & INVENTORY
-- ============================================================

CREATE TABLE IF NOT EXISTS unit_measures (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL,
    name        TEXT NOT NULL,
    name_ar     TEXT,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at  TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS payment_methods (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL,
    name        TEXT NOT NULL,
    name_ar     TEXT,
    method_type TEXT NOT NULL DEFAULT 'bank_transfer'
                CHECK (method_type IN ('cash','bank_transfer','credit')),
    account_id  TEXT,
    is_default  INTEGER NOT NULL DEFAULT 0,
    is_active   INTEGER NOT NULL DEFAULT 1,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at  TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS products (
    id                      TEXT PRIMARY KEY,
    tenant_id               TEXT NOT NULL,
    barcode                 TEXT,
    name                    TEXT NOT NULL,
    name_ar                 TEXT,
    generic_name            TEXT,
    generic_name_ar         TEXT,
    category                TEXT,
    category_ar             TEXT,
    dosage_form             TEXT,
    strength                TEXT,
    unit                    TEXT NOT NULL DEFAULT 'piece',
    unit_id                 TEXT,
    enable_sub_units        INTEGER NOT NULL DEFAULT 0,
    sub_unit_id             TEXT,
    sub_unit_ratio          INTEGER,
    sale_price              INTEGER NOT NULL,
    min_sale_price          INTEGER,
    last_purchase_price     INTEGER,
    min_stock_level         INTEGER NOT NULL DEFAULT 10,
    requires_prescription   INTEGER NOT NULL DEFAULT 0,
    drug_master_id          TEXT,
    is_active               INTEGER NOT NULL DEFAULT 1,
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at              TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (unit_id) REFERENCES unit_measures(id),
    FOREIGN KEY (sub_unit_id) REFERENCES unit_measures(id)
);

CREATE TABLE IF NOT EXISTS storage_locations (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL,
    branch_id   TEXT NOT NULL,
    name        TEXT NOT NULL,
    name_ar     TEXT,
    type        TEXT NOT NULL DEFAULT 'shelf'
                CHECK (type IN ('shelf','fridge','warehouse')),
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at  TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- ============================================================
-- PURCHASING
-- ============================================================

CREATE TABLE IF NOT EXISTS suppliers (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL,
    name        TEXT NOT NULL,
    name_ar     TEXT,
    phone       TEXT,
    email       TEXT,
    address     TEXT,
    address_ar  TEXT,
    tax_number  TEXT,
    notes       TEXT,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at  TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS supplier_invoices (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL,
    branch_id           TEXT NOT NULL,
    supplier_id         TEXT NOT NULL,
    invoice_number      TEXT,
    internal_number     TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','confirmed','cancelled')),
    invoice_date        TEXT NOT NULL,
    due_date            TEXT,
    subtotal            INTEGER NOT NULL DEFAULT 0,
    discount_amount     INTEGER NOT NULL DEFAULT 0,
    tax_amount          INTEGER NOT NULL DEFAULT 0,
    total_amount        INTEGER NOT NULL DEFAULT 0,
    amount_paid         INTEGER NOT NULL DEFAULT 0,
    payment_status      TEXT NOT NULL DEFAULT 'unpaid'
                        CHECK (payment_status IN ('unpaid','partial','paid')),
    notes               TEXT,
    confirmed_at        TEXT,
    confirmed_by        TEXT,
    cancelled_at        TEXT,
    cancelled_by        TEXT,
    cancellation_reason TEXT,
    created_by          TEXT NOT NULL,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at          TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS supplier_invoice_items (
    id                      TEXT PRIMARY KEY,
    tenant_id               TEXT NOT NULL,
    supplier_invoice_id     TEXT NOT NULL,
    product_id              TEXT NOT NULL,
    batch_number            TEXT,
    expiry_date             TEXT NOT NULL,
    quantity                INTEGER NOT NULL,
    purchase_price          INTEGER NOT NULL,
    total_price             INTEGER NOT NULL,
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at              TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (supplier_invoice_id) REFERENCES supplier_invoices(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS supplier_payments (
    id                      TEXT PRIMARY KEY,
    tenant_id               TEXT NOT NULL,
    supplier_id             TEXT NOT NULL,
    supplier_invoice_id     TEXT NOT NULL,
    account_id              TEXT NOT NULL,
    amount                  INTEGER NOT NULL,
    payment_method          TEXT NOT NULL DEFAULT 'cash'
                            CHECK (payment_method IN ('cash','bank_transfer','cheque','mobile_money')),
    payment_date            TEXT NOT NULL,
    reference_number        TEXT,
    notes                   TEXT,
    created_by              TEXT NOT NULL,
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at              TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (supplier_invoice_id) REFERENCES supplier_invoices(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS supplier_returns (
    id                      TEXT PRIMARY KEY,
    tenant_id               TEXT NOT NULL,
    supplier_id             TEXT NOT NULL,
    supplier_invoice_id     TEXT NOT NULL,
    branch_id               TEXT NOT NULL,
    return_number           TEXT NOT NULL,
    return_date             TEXT NOT NULL,
    total_amount            INTEGER NOT NULL DEFAULT 0,
    status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','confirmed','cancelled')),
    reason                  TEXT,
    notes                   TEXT,
    created_by              TEXT NOT NULL,
    confirmed_by            TEXT,
    confirmed_at            TEXT,
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at              TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (supplier_invoice_id) REFERENCES supplier_invoices(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS supplier_return_items (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL,
    supplier_return_id  TEXT NOT NULL,
    product_id          TEXT NOT NULL,
    batch_id            TEXT NOT NULL,
    quantity            INTEGER NOT NULL,
    purchase_price      INTEGER NOT NULL,
    total_price         INTEGER NOT NULL,
    reason              TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at          TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (supplier_return_id) REFERENCES supplier_returns(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (batch_id) REFERENCES batches(id)
);

-- ============================================================
-- SALES
-- ============================================================

CREATE TABLE IF NOT EXISTS customers (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL,
    name            TEXT NOT NULL,
    name_ar         TEXT,
    phone           TEXT,
    email           TEXT,
    address         TEXT,
    address_ar      TEXT,
    customer_type   TEXT NOT NULL DEFAULT 'individual'
                    CHECK (customer_type IN ('individual','business','hospital','clinic')),
    credit_limit    INTEGER NOT NULL DEFAULT 0,
    balance         INTEGER NOT NULL DEFAULT 0,
    tax_number      TEXT,
    notes           TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at      TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS accounts (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL,
    branch_id       TEXT,
    name            TEXT NOT NULL,
    name_ar         TEXT,
    account_type    TEXT NOT NULL
                    CHECK (account_type IN ('cash_register','bank','mobile_money')),
    balance         INTEGER NOT NULL DEFAULT 0,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at      TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE IF NOT EXISTS pos_sessions (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL,
    branch_id           TEXT NOT NULL,
    user_id             TEXT NOT NULL,
    opening_cash        INTEGER NOT NULL DEFAULT 0,
    expected_cash       INTEGER,
    actual_cash         INTEGER,
    cash_difference     INTEGER,
    total_sales         INTEGER NOT NULL DEFAULT 0,
    total_returns       INTEGER NOT NULL DEFAULT 0,
    sales_count         INTEGER NOT NULL DEFAULT 0,
    returns_count       INTEGER NOT NULL DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','closed')),
    opened_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    closed_at           TEXT,
    notes               TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at          TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS batches (
    id                      TEXT PRIMARY KEY,
    tenant_id               TEXT NOT NULL,
    product_id              TEXT NOT NULL,
    branch_id               TEXT NOT NULL,
    storage_location_id     TEXT,
    supplier_invoice_id     TEXT NOT NULL,
    batch_number            TEXT,
    expiry_date             TEXT NOT NULL,
    quantity_received       INTEGER NOT NULL,
    quantity_current        INTEGER NOT NULL,
    purchase_price          INTEGER NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','depleted','expired','disposed','returned')),
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at              TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (storage_location_id) REFERENCES storage_locations(id),
    FOREIGN KEY (supplier_invoice_id) REFERENCES supplier_invoices(id)
);

CREATE TABLE IF NOT EXISTS sales (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL,
    branch_id           TEXT NOT NULL,
    sale_number         TEXT NOT NULL,
    sale_type           TEXT NOT NULL
                        CHECK (sale_type IN ('pos','invoice')),
    pos_session_id      TEXT,
    customer_id         TEXT,
    cashier_id          TEXT NOT NULL,
    sale_date           TEXT NOT NULL,
    subtotal            INTEGER NOT NULL DEFAULT 0,
    discount_amount     INTEGER NOT NULL DEFAULT 0,
    tax_amount          INTEGER NOT NULL DEFAULT 0,
    total_amount        INTEGER NOT NULL DEFAULT 0,
    amount_paid         INTEGER NOT NULL DEFAULT 0,
    payment_method      TEXT NOT NULL DEFAULT 'cash'
                        CHECK (payment_method IN ('cash','credit','partial')),
    payment_method_id   TEXT,
    payment_method_name TEXT,
    payment_status      TEXT NOT NULL DEFAULT 'paid'
                        CHECK (payment_status IN ('paid','partial','unpaid')),
    account_id          TEXT,
    notes               TEXT,
    status              TEXT NOT NULL DEFAULT 'completed'
                        CHECK (status IN ('completed','returned','partially_returned','voided')),
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at          TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (pos_session_id) REFERENCES pos_sessions(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (cashier_id) REFERENCES users(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id)
);

CREATE TABLE IF NOT EXISTS sale_items (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL,
    sale_id         TEXT NOT NULL,
    product_id      TEXT NOT NULL,
    batch_id        TEXT NOT NULL,
    quantity        INTEGER NOT NULL,
    unit_price      INTEGER NOT NULL,
    unit_cost       INTEGER NOT NULL,
    discount        INTEGER NOT NULL DEFAULT 0,
    total_price     INTEGER NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at      TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (batch_id) REFERENCES batches(id)
);

CREATE TABLE IF NOT EXISTS customer_returns (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL,
    branch_id           TEXT NOT NULL,
    return_number       TEXT NOT NULL,
    sale_id             TEXT,
    customer_id         TEXT,
    pos_session_id      TEXT,
    return_date         TEXT NOT NULL,
    total_amount        INTEGER NOT NULL DEFAULT 0,
    refund_method       TEXT NOT NULL DEFAULT 'cash'
                        CHECK (refund_method IN ('cash','credit')),
    account_id          TEXT,
    reason              TEXT,
    notes               TEXT,
    status              TEXT NOT NULL DEFAULT 'completed'
                        CHECK (status IN ('completed','voided')),
    created_by          TEXT NOT NULL,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at          TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (pos_session_id) REFERENCES pos_sessions(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS customer_return_items (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL,
    customer_return_id  TEXT NOT NULL,
    product_id          TEXT NOT NULL,
    batch_id            TEXT NOT NULL,
    sale_item_id        TEXT,
    quantity            INTEGER NOT NULL,
    unit_price          INTEGER NOT NULL,
    unit_cost           INTEGER NOT NULL,
    total_price         INTEGER NOT NULL,
    reason              TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at          TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (customer_return_id) REFERENCES customer_returns(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (batch_id) REFERENCES batches(id),
    FOREIGN KEY (sale_item_id) REFERENCES sale_items(id)
);

-- ============================================================
-- FINANCE
-- ============================================================

CREATE TABLE IF NOT EXISTS account_transactions (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL,
    transaction_group   TEXT NOT NULL,
    account_id          TEXT,
    entry_type          TEXT NOT NULL
                        CHECK (entry_type IN ('debit','credit')),
    amount              INTEGER NOT NULL,
    balance_after       INTEGER,
    category            TEXT NOT NULL,
    reference_type      TEXT NOT NULL,
    reference_id        TEXT NOT NULL,
    description         TEXT,
    transaction_date    TEXT NOT NULL,
    created_by          TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at          TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS expense_categories (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL,
    name        TEXT NOT NULL,
    name_ar     TEXT,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at  TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS expenses (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL,
    branch_id           TEXT NOT NULL,
    category_id         TEXT NOT NULL,
    account_id          TEXT NOT NULL,
    amount              INTEGER NOT NULL,
    expense_date        TEXT NOT NULL,
    payment_method      TEXT NOT NULL DEFAULT 'cash'
                        CHECK (payment_method IN ('cash','bank_transfer','cheque','mobile_money')),
    description         TEXT,
    reference_number    TEXT,
    created_by          TEXT NOT NULL,
    approved_by         TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at          TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (category_id) REFERENCES expense_categories(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL,
    product_id          TEXT NOT NULL,
    batch_id            TEXT NOT NULL,
    branch_id           TEXT NOT NULL,
    movement_type       TEXT NOT NULL
                        CHECK (movement_type IN (
                            'receive','sell','customer_return','supplier_return',
                            'transfer_out','transfer_in','adjust_increase',
                            'adjust_decrease','dispose'
                        )),
    quantity            INTEGER NOT NULL,
    quantity_before     INTEGER NOT NULL,
    quantity_after      INTEGER NOT NULL,
    reference_type      TEXT NOT NULL,
    reference_id        TEXT NOT NULL,
    storage_location_id TEXT,
    notes               TEXT,
    performed_by        TEXT NOT NULL,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at          TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (batch_id) REFERENCES batches(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (performed_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS asset_categories (
    id                      TEXT PRIMARY KEY,
    tenant_id               TEXT NOT NULL,
    name                    TEXT NOT NULL,
    name_ar                 TEXT,
    useful_life_years       INTEGER NOT NULL,
    depreciation_method     TEXT NOT NULL DEFAULT 'straight_line'
                            CHECK (depreciation_method IN ('straight_line','declining_balance')),
    salvage_rate            REAL NOT NULL DEFAULT 0.0,
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at              TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS assets (
    id                      TEXT PRIMARY KEY,
    tenant_id               TEXT NOT NULL,
    branch_id               TEXT NOT NULL,
    category_id             TEXT NOT NULL,
    name                    TEXT NOT NULL,
    asset_code              TEXT,
    serial_number           TEXT,
    purchase_date           TEXT NOT NULL,
    purchase_cost           INTEGER NOT NULL,
    salvage_value           INTEGER NOT NULL DEFAULT 0,
    useful_life_years       INTEGER NOT NULL,
    depreciation_method     TEXT NOT NULL DEFAULT 'straight_line'
                            CHECK (depreciation_method IN ('straight_line','declining_balance')),
    status                  TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','disposed','written_off')),
    disposal_date           TEXT,
    disposal_value          INTEGER,
    notes                   TEXT,
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at              TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (category_id) REFERENCES asset_categories(id)
);

CREATE INDEX IF NOT EXISTS idx_assets_tenant_branch ON assets(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);

CREATE TABLE IF NOT EXISTS depreciation_entries (
    id                      TEXT PRIMARY KEY,
    tenant_id               TEXT NOT NULL,
    asset_id                TEXT NOT NULL,
    period_year             INTEGER NOT NULL,
    period_month            INTEGER NOT NULL,
    opening_nbv             INTEGER NOT NULL,
    depreciation            INTEGER NOT NULL,
    closing_nbv             INTEGER NOT NULL,
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at              TEXT,
    UNIQUE(asset_id, period_year, period_month),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (asset_id) REFERENCES assets(id)
);

CREATE TABLE IF NOT EXISTS sequence_counters (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL,
    branch_id   TEXT,
    counter_key TEXT NOT NULL,
    prefix      TEXT NOT NULL,
    year        INTEGER NOT NULL,
    last_value  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL,
    user_id         TEXT NOT NULL,
    action          TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_id       TEXT NOT NULL,
    changes_json    TEXT,
    ip_address      TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS backup_log (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL,
    backup_type     TEXT NOT NULL DEFAULT 'local'
                    CHECK (backup_type IN ('local','cloud')),
    file_path       TEXT,
    file_size       INTEGER,
    status          TEXT NOT NULL DEFAULT 'completed'
                    CHECK (status IN ('started','completed','failed')),
    sync_status     TEXT NOT NULL DEFAULT 'pending'
                    CHECK (sync_status IN ('pending','synced','failed')),
    remote_id       TEXT,
    error_message   TEXT,
    started_at      TEXT NOT NULL,
    completed_at    TEXT,
    created_by      TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS cloud_config (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL UNIQUE,
    cloud_endpoint  TEXT,
    cloud_token     TEXT,
    cloud_enabled   INTEGER NOT NULL DEFAULT 0,
    last_sync_at    TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS cloud_sync_state (
    tenant_id           TEXT PRIMARY KEY,
    last_synced_at      TEXT,
    last_attempt_at     TEXT,
    last_error          TEXT,
    last_auto_run_at    TEXT,
    last_run_mode       TEXT,
    last_run_processed  INTEGER NOT NULL DEFAULT 0,
    last_run_synced     INTEGER NOT NULL DEFAULT 0,
    last_run_failed     INTEGER NOT NULL DEFAULT 0,
    last_run_retried    INTEGER NOT NULL DEFAULT 0,
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS cloud_sync_outbox (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_id       TEXT NOT NULL,
    payload_json    TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','synced','failed')),
    attempt_count   INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TEXT,
    last_error      TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_cloud_sync_outbox_status
    ON cloud_sync_outbox(tenant_id, status, created_at);

-- ============================================================
-- KEY INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_batches_product_fifo ON batches(product_id, expiry_date ASC)
    WHERE quantity_current > 0 AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_batches_supplier_invoice ON batches(supplier_invoice_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_acct_txn_group ON account_transactions(transaction_group);
CREATE INDEX IF NOT EXISTS idx_acct_txn_reference ON account_transactions(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_sales_session ON sales(pos_session_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_batch ON sale_items(batch_id);
