-- Add missing synced_at column to snapshot_accounts and snapshot_account_transactions
ALTER TABLE snapshot_accounts ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE snapshot_account_transactions ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ DEFAULT NOW();
