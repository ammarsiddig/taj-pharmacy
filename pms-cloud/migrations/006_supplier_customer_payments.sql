-- Migration 006: Snapshot tables for payments
-- Enables Owner PWA to see supplier payment history, customer payment history,
-- and POS split-payment details.

-- Supplier payments
CREATE TABLE IF NOT EXISTS snapshot_supplier_payments (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  invoice_id TEXT,
  amount BIGINT NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  account_id TEXT NOT NULL,
  payment_date TEXT NOT NULL,
  notes TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, branch_id, id)
);
CREATE INDEX IF NOT EXISTS idx_snap_sp_supplier ON snapshot_supplier_payments(tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_snap_sp_invoice ON snapshot_supplier_payments(tenant_id, invoice_id) WHERE invoice_id IS NOT NULL;

-- Customer payments
CREATE TABLE IF NOT EXISTS snapshot_customer_payments (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  amount BIGINT NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  account_id TEXT NOT NULL,
  notes TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, branch_id, id)
);
CREATE INDEX IF NOT EXISTS idx_snap_cp_customer ON snapshot_customer_payments(tenant_id, customer_id);

-- Sale payments (POS split payments)
CREATE TABLE IF NOT EXISTS snapshot_sale_payments (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  payment_method_id TEXT,
  payment_method_name TEXT DEFAULT '',
  amount BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, branch_id, id)
);
CREATE INDEX IF NOT EXISTS idx_snap_sap_sale ON snapshot_sale_payments(tenant_id, sale_id);
