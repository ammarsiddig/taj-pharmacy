-- Fix snapshot_accounts and snapshot_account_transactions:
-- 1. Add missing synced_at column
-- 2. Fix primary key to include branch_id (required for ON CONFLICT in batch sync)
-- 3. Add missing branch_id column to account_transactions

ALTER TABLE snapshot_accounts ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE snapshot_account_transactions ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE snapshot_account_transactions ADD COLUMN IF NOT EXISTS branch_id TEXT NOT NULL DEFAULT 'main-branch';
ALTER TABLE snapshot_account_transactions ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1;

-- Rebuild primary keys to include branch_id (matching all other snapshot tables)
ALTER TABLE snapshot_accounts DROP CONSTRAINT IF EXISTS snapshot_accounts_pkey;
ALTER TABLE snapshot_accounts ADD PRIMARY KEY (tenant_id, branch_id, id);

ALTER TABLE snapshot_account_transactions DROP CONSTRAINT IF EXISTS snapshot_account_transactions_pkey;
ALTER TABLE snapshot_account_transactions ADD PRIMARY KEY (tenant_id, branch_id, id);
