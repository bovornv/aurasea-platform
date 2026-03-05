-- Migration: Fix constraints and indexes for metric_date column
-- Use this if your tables already have metric_date column (not date)
-- Run this in your Supabase SQL Editor

-- PART 1: Fix daily_metrics constraints and indexes

-- Drop old constraints if they exist (using old column name)
ALTER TABLE daily_metrics 
  DROP CONSTRAINT IF EXISTS unique_branch_date;

-- Add correct constraint with metric_date
ALTER TABLE daily_metrics 
  DROP CONSTRAINT IF EXISTS unique_branch_metric_date;
ALTER TABLE daily_metrics 
  ADD CONSTRAINT unique_branch_metric_date UNIQUE (branch_id, metric_date);

-- Drop old indexes if they exist
DROP INDEX IF EXISTS idx_daily_metrics_date;
DROP INDEX IF EXISTS idx_daily_metrics_branch_date;

-- Create correct indexes with metric_date
CREATE INDEX IF NOT EXISTS idx_daily_metrics_metric_date ON daily_metrics(metric_date);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_branch_metric_date ON daily_metrics(branch_id, metric_date);

-- PART 2: Fix fnb_daily_metrics constraints and indexes

-- Drop old constraints if they exist (using old column name)
ALTER TABLE fnb_daily_metrics 
  DROP CONSTRAINT IF EXISTS unique_fnb_branch_date;

-- Add correct constraint with metric_date
ALTER TABLE fnb_daily_metrics 
  DROP CONSTRAINT IF EXISTS unique_fnb_branch_metric_date;
ALTER TABLE fnb_daily_metrics 
  ADD CONSTRAINT unique_fnb_branch_metric_date UNIQUE (branch_id, metric_date);

-- Drop old indexes if they exist
DROP INDEX IF EXISTS idx_fnb_daily_metrics_date;
DROP INDEX IF EXISTS idx_fnb_daily_metrics_branch_date;

-- Create correct indexes with metric_date
CREATE INDEX IF NOT EXISTS idx_fnb_daily_metrics_metric_date ON fnb_daily_metrics(metric_date);
CREATE INDEX IF NOT EXISTS idx_fnb_daily_metrics_branch_metric_date ON fnb_daily_metrics(branch_id, metric_date);

-- Verify everything is correct
SELECT 
  'Constraints' as check_type,
  constraint_name,
  table_name
FROM information_schema.table_constraints
WHERE constraint_name IN (
  'unique_branch_metric_date',
  'unique_fnb_branch_metric_date'
)
ORDER BY table_name;

SELECT 
  'Indexes' as check_type,
  indexname as index_name,
  tablename as table_name
FROM pg_indexes
WHERE indexname IN (
  'idx_daily_metrics_metric_date',
  'idx_daily_metrics_branch_metric_date',
  'idx_fnb_daily_metrics_metric_date',
  'idx_fnb_daily_metrics_branch_metric_date'
)
ORDER BY tablename, indexname;
