-- 019: snapshot tables for users + branches (TASK-704a)

CREATE TABLE IF NOT EXISTS snapshot_users (
  tenant_id     TEXT      NOT NULL,
  id            TEXT      NOT NULL,
  branch_id     TEXT,
  role_id       TEXT      NOT NULL,
  username      TEXT      NOT NULL,
  full_name     TEXT      NOT NULL,
  full_name_ar  TEXT,
  phone         TEXT,
  is_active     BOOLEAN   NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_users_branch
  ON snapshot_users(tenant_id, branch_id) WHERE branch_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS snapshot_branches (
  tenant_id   TEXT      NOT NULL,
  id          TEXT      NOT NULL,
  name        TEXT      NOT NULL,
  name_ar     TEXT,
  address     TEXT,
  phone       TEXT,
  is_main     BOOLEAN   NOT NULL DEFAULT false,
  is_active   BOOLEAN   NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ,
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id)
);
