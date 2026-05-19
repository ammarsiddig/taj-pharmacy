-- 013_admin_audit_log_tenant_id_text: fix UUID/TEXT type mismatch (TASK-701)
-- tenants.id is TEXT; admin_audit_log.tenant_id was UUID.
-- Safe conversion: copy→drop→rename. Data is preserved.

ALTER TABLE admin_audit_log ADD COLUMN tenant_id_text TEXT;
UPDATE admin_audit_log SET tenant_id_text = tenant_id::text WHERE tenant_id IS NOT NULL;
ALTER TABLE admin_audit_log DROP COLUMN tenant_id;
ALTER TABLE admin_audit_log RENAME COLUMN tenant_id_text TO tenant_id;

-- Recreate index on the corrected column type
DROP INDEX IF EXISTS idx_admin_audit_tenant;
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_tenant ON admin_audit_log(tenant_id, created_at DESC);
