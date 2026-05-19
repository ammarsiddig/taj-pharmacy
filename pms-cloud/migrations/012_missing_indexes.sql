-- 012_missing_indexes: indexes for query performance (TASK-702)
CREATE INDEX IF NOT EXISTS idx_snapshot_pos_sales_customer ON snapshot_pos_sales(tenant_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_snapshot_expenses_branch_date ON snapshot_expenses(tenant_id, branch_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_snapshot_customer_payments_customer ON snapshot_customer_payments(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_snapshot_account_transactions_account ON snapshot_account_transactions(tenant_id, account_id);
