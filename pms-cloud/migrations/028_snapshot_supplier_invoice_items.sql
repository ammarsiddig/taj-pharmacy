-- 028_snapshot_supplier_invoice_items: line-item detail (TASK-704e)

CREATE TABLE IF NOT EXISTS snapshot_supplier_invoice_items (
  tenant_id     TEXT      NOT NULL,
  id            TEXT      NOT NULL,
  invoice_id    TEXT      NOT NULL,
  product_id    TEXT      NOT NULL,
  batch_number  TEXT,
  expiry_date   TEXT,
  quantity      BIGINT    NOT NULL,
  unit_cost     BIGINT    NOT NULL,
  sale_price    BIGINT    NOT NULL DEFAULT 0,
  subtotal      BIGINT    NOT NULL,
  is_active     BOOLEAN   NOT NULL DEFAULT true,
  created_at    TEXT,
  updated_at    TEXT,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_sii_invoice
  ON snapshot_supplier_invoice_items(tenant_id, invoice_id);
