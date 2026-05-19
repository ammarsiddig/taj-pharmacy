-- 025_pos_sales_full_fields: add sale detail columns (TASK-703d)
-- desktop has: sale_type, change_amount, payment_method_id, void_reason
-- desktop does NOT have: account_id — skip

ALTER TABLE snapshot_pos_sales
  ADD COLUMN IF NOT EXISTS sale_type           TEXT,
  ADD COLUMN IF NOT EXISTS change_amount       BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method_id   TEXT,
  ADD COLUMN IF NOT EXISTS void_reason         TEXT;
