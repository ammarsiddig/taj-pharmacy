-- Migration 005: Add plan/limits to license_keys
-- Allows cloud activation to return plan details to the desktop app.

ALTER TABLE license_keys
  ADD COLUMN IF NOT EXISTS plan        TEXT NOT NULL DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS max_users   INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_branches INTEGER NOT NULL DEFAULT 3;
