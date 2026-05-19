-- 020: snapshot tables for supplier returns (TASK-704b)

CREATE TABLE IF NOT EXISTS snapshot_supplier_returns (
  tenant_id     TEXT      NOT NULL,
  id            TEXT      NOT NULL,
  branch_id     TEXT      NOT NULL,
  supplier_id   TEXT      NOT NULL,
  invoice_id    TEXT      NOT NULL,
  return_number TEXT      NOT NULL,
  return_date   TEXT      NOT NULL,
  total_amount  BIGINT    NOT NULL DEFAULT 0,
  status        TEXT      NOT NULL DEFAULT 'pending',
  reason        TEXT,
  notes         TEXT,
  created_by    TEXT      NOT NULL,
  confirmed_by  TEXT,
  confirmed_at  TEXT,
  is_active     BOOLEAN   NOT NULL DEFAULT true,
  created_at    TEXT,
  updated_at    TEXT,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_supplier_returns_supplier
  ON snapshot_supplier_returns(tenant_id, supplier_id);

CREATE TABLE IF NOT EXISTS snapshot_supplier_return_items (
  tenant_id           TEXT      NOT NULL,
  id                  TEXT      NOT NULL,
  supplier_return_id  TEXT      NOT NULL,
  product_id          TEXT      NOT NULL,
  batch_id            TEXT      NOT NULL,
  quantity            BIGINT    NOT NULL,
  unit_cost           BIGINT    NOT NULL,
  total_price         BIGINT    NOT NULL,
  reason              TEXT,
  is_active           BOOLEAN   NOT NULL DEFAULT true,
  created_at          TEXT,
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_supplier_return_items_return
  ON snapshot_supplier_return_items(tenant_id, supplier_return_id);
