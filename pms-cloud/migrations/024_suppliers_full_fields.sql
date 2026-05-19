-- 024_suppliers_full_fields: add supplier detail columns (TASK-703c)

ALTER TABLE snapshot_suppliers
  ADD COLUMN IF NOT EXISTS name_ar          TEXT,
  ADD COLUMN IF NOT EXISTS contact_person   TEXT,
  ADD COLUMN IF NOT EXISTS notes            TEXT;
