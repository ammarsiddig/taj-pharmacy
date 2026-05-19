-- Migration 030: Add deleted_at to tenants table for soft-delete support.
-- Required by TASK-600-C (Admin Trash page: GET /admin/tenants/deleted).
-- Additive only — IF NOT EXISTS guard makes this safe to re-run.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
