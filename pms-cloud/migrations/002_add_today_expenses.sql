-- Add today_expenses_total to dashboard_summaries (additive migration)
ALTER TABLE dashboard_summaries
  ADD COLUMN IF NOT EXISTS today_expenses_total INTEGER NOT NULL DEFAULT 0;
