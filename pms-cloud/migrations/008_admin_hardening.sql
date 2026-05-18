-- 008_admin_hardening: Admin hardening columns, tables, indexes

-- Additive columns to tenants (all ALTER TABLE ADD COLUMN IF NOT EXISTS)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS current_plan TEXT NOT NULL DEFAULT 'basic';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_users INT NOT NULL DEFAULT 5;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_branches INT NOT NULL DEFAULT 3;

-- Admin audit log
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    tenant_id UUID,
    target_type TEXT,
    target_id TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenant renewal trail
CREATE TABLE IF NOT EXISTS tenant_renewals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    days_added INT NOT NULL,
    new_expires_at TIMESTAMPTZ NOT NULL,
    paid_amount_cents BIGINT,
    paid_method TEXT,
    paid_at TIMESTAMPTZ,
    license_key TEXT,
    created_by TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes (use IF NOT EXISTS for idempotency)
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants (is_suspended, expires_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_expires ON tenants (expires_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_tokens_tenant ON api_tokens (tenant_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_license_keys_tenant ON license_keys (tenant_id);
CREATE INDEX IF NOT EXISTS idx_license_keys_status ON license_keys (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_tenant_synced ON activity_log (tenant_id, synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_tenant ON admin_audit_log (tenant_id, created_at DESC);
