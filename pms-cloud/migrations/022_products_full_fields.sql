-- 022: add product detail fields to snapshot (TASK-703a)

ALTER TABLE snapshot_products
  ADD COLUMN IF NOT EXISTS generic_name        TEXT,
  ADD COLUMN IF NOT EXISTS generic_name_ar     TEXT,
  ADD COLUMN IF NOT EXISTS dosage_form         TEXT,
  ADD COLUMN IF NOT EXISTS manufacturer        TEXT,
  ADD COLUMN IF NOT EXISTS active_ingredient   TEXT,
  ADD COLUMN IF NOT EXISTS storage_conditions  TEXT,
  ADD COLUMN IF NOT EXISTS is_prescription     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_path          TEXT;
