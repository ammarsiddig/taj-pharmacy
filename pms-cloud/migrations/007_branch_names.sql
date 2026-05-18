-- 007_branch_names: Add branch_names JSONB to tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS branch_names JSONB NOT NULL DEFAULT '{}';
