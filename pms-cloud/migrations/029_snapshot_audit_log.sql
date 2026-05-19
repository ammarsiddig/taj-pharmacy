-- 029_snapshot_audit_log: desktop audit trail (TASK-704f)
-- Uses changes_json (not details) matching desktop schema.
-- Desktop push LIMITed to last 30 days to avoid cloud bloat.

CREATE TABLE IF NOT EXISTS snapshot_audit_log (
  tenant_id     TEXT      NOT NULL,
  id            TEXT      NOT NULL,
  user_id       TEXT      NOT NULL,
  action        TEXT      NOT NULL,
  entity_type   TEXT      NOT NULL,
  entity_id     TEXT      NOT NULL,
  changes_json  TEXT,
  is_active     BOOLEAN   NOT NULL DEFAULT true,
  created_at    TEXT,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_audit_log_entity
  ON snapshot_audit_log(tenant_id, entity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshot_audit_log_user
  ON snapshot_audit_log(tenant_id, user_id, created_at DESC);
