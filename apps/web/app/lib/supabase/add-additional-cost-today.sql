-- Add optional column additional_cost_today (THB) to daily_metrics.
-- Does not change RLS or foreign keys.
-- Run in Supabase SQL Editor.

ALTER TABLE daily_metrics
ADD COLUMN IF NOT EXISTS additional_cost_today numeric DEFAULT 0;

COMMENT ON COLUMN daily_metrics.additional_cost_today IS 'Optional daily additional cost in THB; increases daily cost for calculations.';
