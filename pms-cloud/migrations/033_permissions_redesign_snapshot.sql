-- 033: Permissions redesign snapshot tables (Phase 9 TASK-910)

-- Extend snapshot_users with new permission columns
ALTER TABLE snapshot_users ADD COLUMN IF NOT EXISTS home_branch_id TEXT;
ALTER TABLE snapshot_users ADD COLUMN IF NOT EXISTS see_all_branches BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE snapshot_users ADD COLUMN IF NOT EXISTS session_token_invalidated_at TIMESTAMPTZ;

-- Snapshot for role-level permissions
CREATE TABLE IF NOT EXISTS snapshot_role_permissions (
    tenant_id  TEXT      NOT NULL,
    role_id    TEXT      NOT NULL,
    resource   TEXT      NOT NULL,
    level      TEXT      NOT NULL CHECK (level IN ('none','read','write')),
    synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, role_id, resource)
);

-- Snapshot for user-level permission overrides
CREATE TABLE IF NOT EXISTS snapshot_user_permission_overrides (
    tenant_id  TEXT      NOT NULL,
    user_id    TEXT      NOT NULL,
    resource   TEXT      NOT NULL,
    level      TEXT      NOT NULL CHECK (level IN ('none','read','write')),
    synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, user_id, resource)
);
