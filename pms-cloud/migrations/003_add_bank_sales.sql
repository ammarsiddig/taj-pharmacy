-- Add today_bank_sales column to dashboard_summaries
ALTER TABLE dashboard_summaries
  ADD COLUMN IF NOT EXISTS today_bank_sales BIGINT NOT NULL DEFAULT 0;
