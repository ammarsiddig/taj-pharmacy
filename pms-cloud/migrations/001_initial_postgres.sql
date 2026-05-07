-- PMS Cloud PostgreSQL Schema - Table-Snapshot Sync Model
-- Phase 5: Read-Replica Architecture

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tenants (pharmacies)
CREATE TABLE IF NOT EXISTS tenants (
    id               TEXT PRIMARY KEY,
    pharmacy_name    TEXT,
    first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_sync_at     TIMESTAMPTZ,
    total_syncs      INTEGER NOT NULL DEFAULT 0,
    is_suspended     BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sync state per table (tracks last sync for delta sync)
CREATE TABLE IF NOT EXISTS sync_state (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    table_name       TEXT NOT NULL,
    last_sync_at     TIMESTAMPTZ NOT NULL,
    last_row_version INTEGER NOT NULL DEFAULT 0, -- for optimistic concurrency
    row_count        INTEGER NOT NULL DEFAULT 0,
    UNIQUE(tenant_id, table_name)
);

-- Owners (for PWA dashboard login)
CREATE TABLE IF NOT EXISTS owners (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        TEXT NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    email            TEXT NOT NULL UNIQUE,
    password_hash    TEXT NOT NULL,
    display_name     TEXT,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- API tokens for desktop sync authentication
CREATE TABLE IF NOT EXISTS api_tokens (
    token            TEXT PRIMARY KEY,
    tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    label            TEXT,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table snapshots: products (read-replica from desktop)
CREATE TABLE IF NOT EXISTS snapshot_products (
    id               TEXT NOT NULL, -- original desktop ID
    tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id        TEXT NOT NULL DEFAULT 'main-branch',
    name             TEXT NOT NULL,
    name_ar          TEXT,
    barcode          TEXT,
    category         TEXT,
    unit_measure     TEXT,
    purchase_price   INTEGER NOT NULL DEFAULT 0,
    sale_price       INTEGER NOT NULL DEFAULT 0,
    tax_percent      DECIMAL(5,2) NOT NULL DEFAULT 0,
    min_stock        INTEGER NOT NULL DEFAULT 0,
    current_stock    INTEGER NOT NULL DEFAULT 0,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at       TIMESTAMPTZ NOT NULL, -- from desktop
    synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, branch_id, id)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_products_tenant ON snapshot_products(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_snapshot_products_barcode ON snapshot_products(tenant_id, barcode);
CREATE INDEX IF NOT EXISTS idx_snapshot_products_category ON snapshot_products(tenant_id, category);

-- Table snapshots: batches (read-replica)
CREATE TABLE IF NOT EXISTS snapshot_batches (
    id               TEXT NOT NULL,
    tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id        TEXT NOT NULL DEFAULT 'main-branch',
    product_id       TEXT NOT NULL,
    batch_number     TEXT NOT NULL,
    expiry_date      DATE,
    quantity         INTEGER NOT NULL DEFAULT 0,
    purchase_price   INTEGER NOT NULL DEFAULT 0,
    location_id      TEXT,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at       TIMESTAMPTZ NOT NULL,
    synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, branch_id, id)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_batches_tenant ON snapshot_batches(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_snapshot_batches_product ON snapshot_batches(tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_snapshot_batches_expiry ON snapshot_batches(tenant_id, expiry_date);

-- Table snapshots: customers (read-replica)
CREATE TABLE IF NOT EXISTS snapshot_customers (
    id               TEXT NOT NULL,
    tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id        TEXT NOT NULL DEFAULT 'main-branch',
    name             TEXT NOT NULL,
    name_ar          TEXT,
    phone            TEXT,
    credit_limit     INTEGER NOT NULL DEFAULT 0,
    current_balance  INTEGER NOT NULL DEFAULT 0,
    total_purchases  INTEGER NOT NULL DEFAULT 0,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at       TIMESTAMPTZ NOT NULL,
    synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, branch_id, id)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_customers_tenant ON snapshot_customers(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_snapshot_customers_phone ON snapshot_customers(tenant_id, phone);

-- Table snapshots: suppliers (read-replica)
CREATE TABLE IF NOT EXISTS snapshot_suppliers (
    id               TEXT NOT NULL,
    tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id        TEXT NOT NULL DEFAULT 'main-branch',
    name             TEXT NOT NULL,
    phone            TEXT,
    email            TEXT,
    address          TEXT,
    current_balance  INTEGER NOT NULL DEFAULT 0,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at       TIMESTAMPTZ NOT NULL,
    synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, branch_id, id)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_suppliers_tenant ON snapshot_suppliers(tenant_id, branch_id);

-- Table snapshots: POS sales (read-replica)
CREATE TABLE IF NOT EXISTS snapshot_pos_sales (
    id               TEXT NOT NULL,
    tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id        TEXT NOT NULL DEFAULT 'main-branch',
    session_id       TEXT NOT NULL,
    sale_number      TEXT NOT NULL,
    customer_id      TEXT,
    customer_name    TEXT,
    total            INTEGER NOT NULL DEFAULT 0,
    tax_amount       INTEGER NOT NULL DEFAULT 0,
    discount         INTEGER NOT NULL DEFAULT 0,
    payment_method   TEXT NOT NULL,
    payment_status   TEXT NOT NULL DEFAULT 'paid',
    amount_paid      INTEGER NOT NULL DEFAULT 0,
    balance_due      INTEGER NOT NULL DEFAULT 0,
    cashier_name     TEXT,
    notes            TEXT,
    is_return        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL,
    synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, branch_id, id)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_pos_sales_tenant ON snapshot_pos_sales(tenant_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshot_pos_sales_customer ON snapshot_pos_sales(tenant_id, customer_id);

-- Table snapshots: POS sale items (read-replica)
CREATE TABLE IF NOT EXISTS snapshot_pos_sale_items (
    id               TEXT NOT NULL,
    tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id        TEXT NOT NULL DEFAULT 'main-branch',
    sale_id          TEXT NOT NULL,
    product_id       TEXT NOT NULL,
    product_name     TEXT NOT NULL,
    batch_id         TEXT,
    batch_number     TEXT,
    quantity         INTEGER NOT NULL,
    unit_price       INTEGER NOT NULL,
    subtotal         INTEGER NOT NULL,
    synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, branch_id, id)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_pos_sale_items_sale ON snapshot_pos_sale_items(tenant_id, sale_id);

-- Table snapshots: expenses (read-replica)
CREATE TABLE IF NOT EXISTS snapshot_expenses (
    id               TEXT NOT NULL,
    tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id        TEXT NOT NULL DEFAULT 'main-branch',
    category         TEXT NOT NULL,
    amount           INTEGER NOT NULL DEFAULT 0,
    description      TEXT,
    expense_date     DATE NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL,
    synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, branch_id, id)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_expenses_tenant ON snapshot_expenses(tenant_id, branch_id, expense_date DESC);

-- Table snapshots: stock movements (read-replica)
CREATE TABLE IF NOT EXISTS snapshot_stock_movements (
    id               TEXT NOT NULL,
    tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id        TEXT NOT NULL DEFAULT 'main-branch',
    product_id       TEXT NOT NULL,
    batch_id         TEXT,
    movement_type    TEXT NOT NULL, -- 'in', 'out', 'adjustment', 'transfer'
    quantity         INTEGER NOT NULL,
    reference_type   TEXT, -- 'purchase', 'sale', 'adjustment', 'return'
    reference_id     TEXT,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL,
    synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, branch_id, id)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_stock_movements_tenant ON snapshot_stock_movements(tenant_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshot_stock_movements_product ON snapshot_stock_movements(tenant_id, product_id);

-- Pre-computed dashboard aggregations (updated by sync)
CREATE TABLE IF NOT EXISTS dashboard_summaries (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id             TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id             TEXT NOT NULL DEFAULT 'main-branch',
    
    -- Product stats
    products_count        INTEGER NOT NULL DEFAULT 0,
    low_stock_count       INTEGER NOT NULL DEFAULT 0,
    out_of_stock_count    INTEGER NOT NULL DEFAULT 0,
    expiring_soon_count   INTEGER NOT NULL DEFAULT 0,
    
    -- Sales stats (today)
    today_sales_count     INTEGER NOT NULL DEFAULT 0,
    today_sales_total     INTEGER NOT NULL DEFAULT 0,
    today_cash_sales      INTEGER NOT NULL DEFAULT 0,
    today_credit_sales    INTEGER NOT NULL DEFAULT 0,
    
    -- Sales stats (this month)
    month_sales_count     INTEGER NOT NULL DEFAULT 0,
    month_sales_total     INTEGER NOT NULL DEFAULT 0,
    
    -- Customer/Supplier stats
    customers_count       INTEGER NOT NULL DEFAULT 0,
    total_receivables     INTEGER NOT NULL DEFAULT 0,
    suppliers_count       INTEGER NOT NULL DEFAULT 0,
    total_payables        INTEGER NOT NULL DEFAULT 0,
    
    -- Expense stats (this month)
    month_expenses_total  INTEGER NOT NULL DEFAULT 0,
    
    -- Computed at
    computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(tenant_id, branch_id)
);

-- Activity log (for owner dashboard feed)
CREATE TABLE IF NOT EXISTS activity_log (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id        TEXT NOT NULL DEFAULT 'main-branch',
    event_type       TEXT NOT NULL, -- 'sale', 'purchase', 'expense', 'stock_alert'
    entity_type      TEXT NOT NULL, -- 'pos_sale', 'supplier_invoice', 'expense'
    entity_id        TEXT NOT NULL,
    summary          TEXT NOT NULL, -- human-readable summary
    amount           INTEGER, -- optional monetary value
    occurred_at      TIMESTAMPTZ NOT NULL,
    synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_log_tenant ON activity_log(tenant_id, branch_id, synced_at DESC);

-- Encrypted database backups
CREATE TABLE IF NOT EXISTS backups (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    file_size        INTEGER NOT NULL,
    file_path        TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_backups_tenant ON backups(tenant_id, created_at DESC);

-- License keys
CREATE TABLE IF NOT EXISTS license_keys (
    key              TEXT PRIMARY KEY,
    tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    status           TEXT NOT NULL DEFAULT 'pending',
    expires_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Announcements from admin to pharmacy
CREATE TABLE IF NOT EXISTS announcements (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    message          TEXT NOT NULL,
    type             TEXT NOT NULL DEFAULT 'info',
    is_read          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_announcements_tenant ON announcements(tenant_id, created_at DESC);

-- Legacy: Keep sync_events table for migration period (will be removed in Phase 6)
CREATE TABLE IF NOT EXISTS sync_events (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_id         TEXT NOT NULL,
    event_type       TEXT NOT NULL,
    entity_type      TEXT NOT NULL,
    entity_id        TEXT NOT NULL,
    payload          JSONB,
    received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at       TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_events_event_id ON sync_events(tenant_id, event_id);
