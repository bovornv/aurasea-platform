-- Migration: Rename 'date' column to 'metric_date' in daily_metrics and fnb_daily_metrics tables
-- Run this in your Supabase SQL Editor
-- 
-- PART 1: Rename column in daily_metrics table

-- Rename column in daily_metrics
ALTER TABLE daily_metrics 
  RENAME COLUMN date TO metric_date;

-- Rename constraint to match new column name
ALTER TABLE daily_metrics 
  DROP CONSTRAINT IF EXISTS unique_branch_date;
ALTER TABLE daily_metrics 
  ADD CONSTRAINT unique_branch_metric_date UNIQUE (branch_id, metric_date);

-- Recreate indexes with new column name
DROP INDEX IF EXISTS idx_daily_metrics_date;
DROP INDEX IF EXISTS idx_daily_metrics_branch_date;

CREATE INDEX IF NOT EXISTS idx_daily_metrics_metric_date ON daily_metrics(metric_date);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_branch_metric_date ON daily_metrics(branch_id, metric_date);

-- PART 2: Rename column in fnb_daily_metrics table

-- Rename column in fnb_daily_metrics
ALTER TABLE fnb_daily_metrics 
  RENAME COLUMN date TO metric_date;

-- Rename constraint to match new column name
ALTER TABLE fnb_daily_metrics 
  DROP CONSTRAINT IF EXISTS unique_fnb_branch_date;
ALTER TABLE fnb_daily_metrics 
  ADD CONSTRAINT unique_fnb_branch_metric_date UNIQUE (branch_id, metric_date);

-- Recreate indexes with new column name
DROP INDEX IF EXISTS idx_fnb_daily_metrics_date;
DROP INDEX IF EXISTS idx_fnb_daily_metrics_branch_date;

CREATE INDEX IF NOT EXISTS idx_fnb_daily_metrics_metric_date ON fnb_daily_metrics(metric_date);
CREATE INDEX IF NOT EXISTS idx_fnb_daily_metrics_branch_metric_date ON fnb_daily_metrics(branch_id, metric_date);

-- Verify the changes
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'daily_metrics' AND column_name = 'metric_date';
-- 
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'fnb_daily_metrics' AND column_name = 'metric_date';
