-- Migration: Rename 'date' column to 'metric_date' in daily_metrics and fnb_daily_metrics tables
-- SAFE VERSION: Checks if column exists before renaming
-- Run this in your Supabase SQL Editor
-- 
-- PART 1: Rename column in daily_metrics table (only if 'date' exists)

-- Check if 'date' column exists, then rename to 'metric_date'
DO $$
BEGIN
  -- Check if 'date' column exists in daily_metrics
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'daily_metrics' 
      AND column_name = 'date'
      AND table_schema = 'public'
  ) THEN
    -- Rename column in daily_metrics
    ALTER TABLE daily_metrics 
      RENAME COLUMN date TO metric_date;
    
    RAISE NOTICE 'Renamed date to metric_date in daily_metrics';
  ELSE
    RAISE NOTICE 'Column "date" does not exist in daily_metrics (already using metric_date?)';
  END IF;
END $$;

-- Rename constraint to match new column name (only if old constraint exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'unique_branch_date'
      AND table_name = 'daily_metrics'
  ) THEN
    ALTER TABLE daily_metrics 
      DROP CONSTRAINT unique_branch_date;
    ALTER TABLE daily_metrics 
      ADD CONSTRAINT unique_branch_metric_date UNIQUE (branch_id, metric_date);
    
    RAISE NOTICE 'Updated constraint in daily_metrics';
  ELSE
    RAISE NOTICE 'Constraint unique_branch_date does not exist (already updated?)';
  END IF;
END $$;

-- Recreate indexes with new column name (drop old ones if they exist)
DROP INDEX IF EXISTS idx_daily_metrics_date;
DROP INDEX IF EXISTS idx_daily_metrics_branch_date;

CREATE INDEX IF NOT EXISTS idx_daily_metrics_metric_date ON daily_metrics(metric_date);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_branch_metric_date ON daily_metrics(branch_id, metric_date);

-- PART 2: Rename column in fnb_daily_metrics table (only if 'date' exists)

-- Check if 'date' column exists, then rename to 'metric_date'
DO $$
BEGIN
  -- Check if 'date' column exists in fnb_daily_metrics
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'fnb_daily_metrics' 
      AND column_name = 'date'
      AND table_schema = 'public'
  ) THEN
    -- Rename column in fnb_daily_metrics
    ALTER TABLE fnb_daily_metrics 
      RENAME COLUMN date TO metric_date;
    
    RAISE NOTICE 'Renamed date to metric_date in fnb_daily_metrics';
  ELSE
    RAISE NOTICE 'Column "date" does not exist in fnb_daily_metrics (already using metric_date?)';
  END IF;
END $$;

-- Rename constraint to match new column name (only if old constraint exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'unique_fnb_branch_date'
      AND table_name = 'fnb_daily_metrics'
  ) THEN
    ALTER TABLE fnb_daily_metrics 
      DROP CONSTRAINT unique_fnb_branch_date;
    ALTER TABLE fnb_daily_metrics 
      ADD CONSTRAINT unique_fnb_branch_metric_date UNIQUE (branch_id, metric_date);
    
    RAISE NOTICE 'Updated constraint in fnb_daily_metrics';
  ELSE
    RAISE NOTICE 'Constraint unique_fnb_branch_date does not exist (already updated?)';
  END IF;
END $$;

-- Recreate indexes with new column name (drop old ones if they exist)
DROP INDEX IF EXISTS idx_fnb_daily_metrics_date;
DROP INDEX IF EXISTS idx_fnb_daily_metrics_branch_date;

CREATE INDEX IF NOT EXISTS idx_fnb_daily_metrics_metric_date ON fnb_daily_metrics(metric_date);
CREATE INDEX IF NOT EXISTS idx_fnb_daily_metrics_branch_metric_date ON fnb_daily_metrics(branch_id, metric_date);

-- Verify the changes
SELECT 
  table_name,
  column_name,
  data_type 
FROM information_schema.columns 
WHERE table_name IN ('daily_metrics', 'fnb_daily_metrics') 
  AND column_name IN ('date', 'metric_date')
ORDER BY table_name, column_name;
