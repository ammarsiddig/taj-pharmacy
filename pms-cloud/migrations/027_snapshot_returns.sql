-- 027_snapshot_returns: customer returns + return_items (TASK-704d)

CREATE TABLE IF NOT EXISTS snapshot_returns (
  tenant_id       TEXT      NOT NULL,
  id              TEXT      NOT NULL,
  branch_id       TEXT      NOT NULL,
  return_number   TEXT      NOT NULL,
  sale_id         TEXT,
  session_id      TEXT,
  return_type     TEXT      NOT NULL DEFAULT 'full',
  status          TEXT      NOT NULL DEFAULT 'completed',
  subtotal        BIGINT    NOT NULL DEFAULT 0,
  total           BIGINT    NOT NULL DEFAULT 0,
  refund_method   TEXT      NOT NULL DEFAULT 'cash',
  reason          TEXT,
  created_by      TEXT      NOT NULL,
  is_active       BOOLEAN   NOT NULL DEFAULT true,
  created_at      TEXT,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_returns_sale
  ON snapshot_returns(tenant_id, sale_id) WHERE sale_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS snapshot_return_items (
  tenant_id     TEXT      NOT NULL,
  id            TEXT      NOT NULL,
  return_id     TEXT      NOT NULL,
  sale_item_id  TEXT      NOT NULL,
  product_id    TEXT      NOT NULL,
  batch_id      TEXT      NOT NULL,
  quantity      BIGINT    NOT NULL,
  unit_price    BIGINT    NOT NULL,
  subtotal      BIGINT    NOT NULL,
  is_active     BOOLEAN   NOT NULL DEFAULT true,
  created_at    TEXT,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_return_items_return
  ON snapshot_return_items(tenant_id, return_id);
