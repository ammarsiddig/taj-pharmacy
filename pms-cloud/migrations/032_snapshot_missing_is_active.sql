-- Add missing is_active column to snapshot tables that sync.js sends it for
-- but the original migrations did not include it.
-- Using nullable (no NOT NULL) because the desktop SQLite may send null.

ALTER TABLE snapshot_pos_sale_items    ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1;
ALTER TABLE snapshot_pos_sales         ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1;
ALTER TABLE snapshot_expenses          ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1;
ALTER TABLE snapshot_stock_movements   ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1;
ALTER TABLE snapshot_customer_payments ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1;
ALTER TABLE snapshot_sale_payments     ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1;
