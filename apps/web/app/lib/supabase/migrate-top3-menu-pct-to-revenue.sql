-- Migration: Change top3_menu_share_pct to top3_menu_revenue
-- PART 1: Update daily_metrics table to store revenue amount instead of percentage
-- 
-- This migration:
-- 1. Adds top3_menu_revenue column (if not exists)
-- 2. Migrates existing data from top3_menu_pct to top3_menu_revenue (if column exists)
-- 3. Drops top3_menu_pct column (if exists)
-- 4. Drops top3_menu_share_pct column from fnb_daily_metrics (if exists)

-- Step 1: Add new column to daily_metrics (if not exists)
ALTER TABLE daily_metrics 
ADD COLUMN IF NOT EXISTS top3_menu_revenue NUMERIC CHECK (top3_menu_revenue IS NULL OR top3_menu_revenue >= 0);

-- Step 2: Migrate existing data from top3_menu_pct to top3_menu_revenue
-- Only migrate if we have revenue data to calculate from
UPDATE daily_metrics
SET top3_menu_revenue = CASE
  WHEN top3_menu_pct IS NOT NULL 
    AND top3_menu_pct > 0 
    AND revenue IS NOT NULL 
    AND revenue > 0
  THEN (top3_menu_pct / 100.0) * revenue
  ELSE NULL
END
WHERE top3_menu_pct IS NOT NULL 
  AND (top3_menu_revenue IS NULL OR top3_menu_revenue = 0);

-- Step 3: Drop old percentage column from daily_metrics (if exists)
ALTER TABLE daily_metrics 
DROP COLUMN IF EXISTS top3_menu_pct;

-- Step 4: Handle fnb_daily_metrics table (if it exists)
-- Drop top3_menu_share_pct column from fnb_daily_metrics
ALTER TABLE fnb_daily_metrics
DROP COLUMN IF EXISTS top3_menu_share_pct;

-- Step 5: Add top3_menu_revenue to fnb_daily_metrics (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'fnb_daily_metrics') THEN
    ALTER TABLE fnb_daily_metrics
    ADD COLUMN IF NOT EXISTS top3_menu_revenue NUMERIC CHECK (top3_menu_revenue IS NULL OR top3_menu_revenue >= 0);
  END IF;
END $$;

-- Step 6: Verify migration
SELECT 
  COUNT(*) as total_rows,
  COUNT(top3_menu_revenue) as rows_with_top3_revenue,
  COUNT(top3_menu_pct) as rows_with_old_pct
FROM daily_metrics;
