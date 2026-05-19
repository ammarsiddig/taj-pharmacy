-- 021: snapshot table for POS sessions (TASK-704c)

CREATE TABLE IF NOT EXISTS snapshot_pos_sessions (
  tenant_id      TEXT      NOT NULL,
  id             TEXT      NOT NULL,
  branch_id      TEXT      NOT NULL,
  cashier_id     TEXT      NOT NULL,
  account_id     TEXT      NOT NULL,
  status         TEXT      NOT NULL DEFAULT 'open',
  opening_cash   BIGINT    NOT NULL DEFAULT 0,
  expected_cash  BIGINT    NOT NULL DEFAULT 0,
  actual_cash    BIGINT,
  cash_difference BIGINT,
  total_sales    BIGINT    NOT NULL DEFAULT 0,
  total_returns  BIGINT    NOT NULL DEFAULT 0,
  sales_count    INTEGER   NOT NULL DEFAULT 0,
  opened_at      TEXT,
  closed_at      TEXT,
  notes          TEXT,
  is_active      BOOLEAN   NOT NULL DEFAULT true,
  created_at     TEXT,
  updated_at     TEXT,
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_pos_sessions_branch_date
  ON snapshot_pos_sessions(tenant_id, branch_id, opened_at DESC);
