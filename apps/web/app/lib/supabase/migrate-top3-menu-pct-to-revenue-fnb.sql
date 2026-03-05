-- Migration: Change top3_menu_share_pct to top3_menu_revenue in fnb_daily_metrics table
-- PART 1: Update fnb_daily_metrics table to store revenue amount instead of percentage

-- Step 1: Add new column (if not exists)
ALTER TABLE fnb_daily_metrics
ADD COLUMN IF NOT EXISTS top3_menu_revenue NUMERIC CHECK (top3_menu_revenue IS NULL OR top3_menu_revenue >= 0);

-- Step 2: Migrate existing data (convert percentage to revenue amount)
-- Only migrate if we have revenue data to calculate from
-- Note: Uses 'revenue' column (unified schema) or 'total_sales' (legacy fnb_daily_metrics)
UPDATE fnb_daily_metrics
SET top3_menu_revenue = CASE
  WHEN top3_menu_share_pct IS NOT NULL 
    AND top3_menu_share_pct > 0 
    AND COALESCE(revenue, total_sales) IS NOT NULL 
    AND COALESCE(revenue, total_sales) > 0
  THEN (top3_menu_share_pct / 100.0) * COALESCE(revenue, total_sales)
  ELSE NULL
END
WHERE top3_menu_share_pct IS NOT NULL;

-- Step 3: Drop old column (after migration)
ALTER TABLE fnb_daily_metrics
DROP COLUMN IF EXISTS top3_menu_share_pct;

-- Step 4: Verify migration
SELECT 
  COUNT(*) as total_rows,
  COUNT(top3_menu_revenue) as rows_with_top3_revenue,
  COUNT(top3_menu_share_pct) as rows_with_old_pct
FROM fnb_daily_metrics;
