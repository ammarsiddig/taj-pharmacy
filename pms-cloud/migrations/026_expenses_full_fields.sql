-- 026_expenses_full_fields: add expense detail columns (TASK-703e)
-- desktop has: payment_method, notes, created_by
-- desktop does NOT have: reference_number, approved_by — skip

ALTER TABLE snapshot_expenses
  ADD COLUMN IF NOT EXISTS payment_method   TEXT,
  ADD COLUMN IF NOT EXISTS notes            TEXT,
  ADD COLUMN IF NOT EXISTS created_by       TEXT;
