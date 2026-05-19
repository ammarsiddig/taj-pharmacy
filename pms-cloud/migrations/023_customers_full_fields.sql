-- 023_customers_full_fields: add customer detail columns (TASK-703b)

ALTER TABLE snapshot_customers
  ADD COLUMN IF NOT EXISTS email   TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS notes   TEXT;
