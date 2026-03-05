-- ============================================================
-- STEP 9 ONLY: Migrate data from weekly_metrics (if exists)
-- Run this if you already ran steps 1-8 and only need to fix STEP 9
-- ============================================================

BEGIN;

DO $$
DECLARE
  weekly_count INTEGER;
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'weekly_metrics') THEN
    SELECT COUNT(*) INTO weekly_count FROM weekly_metrics;
    
    IF weekly_count > 0 THEN
      -- Distribute weekly totals across 7 days using LATERAL join
      -- Use CTE to avoid issues with set-returning functions in WHERE clause
      INSERT INTO daily_metrics (branch_id, metric_date, revenue, cost, cash_balance)
      WITH expanded_weekly AS (
        SELECT 
          w.branch_id,
          (w.week_start_date + (day_offset || ' days')::interval)::DATE AS metric_date,
          COALESCE(w.revenue_7d, 0) / 7 AS revenue,
          COALESCE(w.costs_7d, 0) / 7 AS cost,
          w.cash_balance
        FROM weekly_metrics w
        CROSS JOIN LATERAL generate_series(0, 6) AS day_offset
      )
      SELECT 
        e.branch_id,
        e.metric_date,
        e.revenue,
        e.cost,
        e.cash_balance
      FROM expanded_weekly e
      WHERE NOT EXISTS (
        SELECT 1 FROM daily_metrics d 
        WHERE d.branch_id = e.branch_id 
        AND d.metric_date = e.metric_date
      )
      ON CONFLICT (branch_id, metric_date) DO NOTHING;
      
      RAISE NOTICE 'Migrated % weekly_metrics rows to daily_metrics', weekly_count;
    ELSE
      RAISE NOTICE 'No weekly_metrics data to migrate';
    END IF;
  ELSE
    RAISE NOTICE 'weekly_metrics table does not exist - skipping migration';
  END IF;
END $$;

COMMIT;

-- Verification
SELECT 
  (SELECT COUNT(*) FROM daily_metrics) as daily_count,
  (SELECT COUNT(*) FROM weekly_metrics_backup) as weekly_backup_count;
