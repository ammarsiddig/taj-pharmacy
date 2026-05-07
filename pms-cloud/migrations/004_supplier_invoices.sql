-- Snapshot table for supplier invoices (Owner PWA: Supplier Accounts)
CREATE TABLE IF NOT EXISTS snapshot_supplier_invoices (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  supplier_id TEXT,
  supplier_name TEXT DEFAULT '',
  invoice_number TEXT DEFAULT '',
  invoice_date TEXT,
  status TEXT DEFAULT 'confirmed',
  payment_status TEXT DEFAULT 'unpaid',
  total BIGINT DEFAULT 0,
  amount_paid BIGINT DEFAULT 0,
  balance_due BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  PRIMARY KEY (tenant_id, branch_id, id)
);
CREATE INDEX IF NOT EXISTS idx_snap_si_supplier ON snapshot_supplier_invoices(tenant_id, supplier_id);
