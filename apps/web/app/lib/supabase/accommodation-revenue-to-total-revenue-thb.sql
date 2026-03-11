-- Standardize accommodation_daily_metrics revenue column: revenue → total_revenue_thb
-- Run this after updating app code to use total_revenue_thb for reads/writes.

-- 1. Add new column if not present
ALTER TABLE accommodation_daily_metrics
ADD COLUMN IF NOT EXISTS total_revenue_thb numeric;

-- 2. Backfill from revenue (if revenue still exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accommodation_daily_metrics' AND column_name = 'revenue'
  ) THEN
    UPDATE accommodation_daily_metrics
    SET total_revenue_thb = revenue
    WHERE total_revenue_thb IS NULL AND revenue IS NOT NULL;
  END IF;
END $$;

-- 3. Drop old column (run when app is deployed and using total_revenue_thb only)
-- ALTER TABLE accommodation_daily_metrics DROP COLUMN IF EXISTS revenue;

-- If your view accommodation_latest_metrics selects from accommodation_daily_metrics,
-- update the view to use total_revenue_thb instead of revenue, then run the DROP above.
