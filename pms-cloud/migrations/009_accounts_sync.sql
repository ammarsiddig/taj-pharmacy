-- 009_accounts_sync: Snapshot tables for accounts + account_transactions sync
CREATE TABLE IF NOT EXISTS snapshot_accounts (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    name TEXT NOT NULL,
    name_ar TEXT,
    account_type TEXT NOT NULL,
    current_balance BIGINT NOT NULL DEFAULT 0,
    is_default INT NOT NULL DEFAULT 0,
    is_active INT NOT NULL DEFAULT 1,
    bank_provider TEXT,
    internal_fee BIGINT NOT NULL DEFAULT 0,
    external_fee BIGINT NOT NULL DEFAULT 0,
    phone_label TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS snapshot_account_transactions (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL DEFAULT 'main-branch',
    account_id TEXT NOT NULL,
    transaction_type TEXT NOT NULL,
    direction TEXT NOT NULL,
    amount BIGINT NOT NULL,
    balance_before BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    reference_type TEXT,
    reference_id TEXT,
    description TEXT,
    created_by TEXT,
    is_active INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, branch_id, id)
);

CREATE INDEX IF NOT EXISTS idx_snapshot_acctx_account ON snapshot_account_transactions(tenant_id, account_id, created_at DESC);

-- Add is_active to snapshot tables that lack it (for soft-delete sync)
ALTER TABLE snapshot_pos_sales ADD COLUMN IF NOT EXISTS is_active INT NOT NULL DEFAULT 1;
ALTER TABLE snapshot_pos_sale_items ADD COLUMN IF NOT EXISTS is_active INT NOT NULL DEFAULT 1;
ALTER TABLE snapshot_expenses ADD COLUMN IF NOT EXISTS is_active INT NOT NULL DEFAULT 1;
ALTER TABLE snapshot_stock_movements ADD COLUMN IF NOT EXISTS is_active INT NOT NULL DEFAULT 1;
ALTER TABLE snapshot_supplier_payments ADD COLUMN IF NOT EXISTS is_active INT NOT NULL DEFAULT 1;
ALTER TABLE snapshot_customer_payments ADD COLUMN IF NOT EXISTS is_active INT NOT NULL DEFAULT 1;
ALTER TABLE snapshot_sale_payments ADD COLUMN IF NOT EXISTS is_active INT NOT NULL DEFAULT 1;
ALTER TABLE snapshot_account_transactions ADD COLUMN IF NOT EXISTS is_active INT NOT NULL DEFAULT 1;
