-- Fix Supabase analytics views: drop order and recreate accommodation_anomaly_signals
-- with required columns (branch_id, metric_date, anomaly_score, early_signal, confidence_score)
-- using branch_daily_metrics. Then recreate branch_anomaly_signals.
--
-- After running: reload PostgREST schema cache (Supabase Dashboard → Settings → API → Reload schema cache,
-- or POST /rest/v1/ with header Cache-Control: no-store, or run NOTIFY pgrst, 'reload schema';)

-- 1. Drop branch_anomaly_signals with CASCADE (drops dependency so we can drop accommodation_anomaly_signals)
DROP VIEW IF EXISTS branch_anomaly_signals CASCADE;

-- 2. Drop accommodation_anomaly_signals
DROP VIEW IF EXISTS accommodation_anomaly_signals;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'accommodation_anomaly_signals') THEN
    DROP TABLE accommodation_anomaly_signals CASCADE;
  END IF;
END $$;

-- 3. Recreate accommodation_anomaly_signals using branch_daily_metrics
--    Columns: branch_id, metric_date, anomaly_score, early_signal, confidence_score
CREATE VIEW accommodation_anomaly_signals AS
WITH base AS (
  SELECT
    branch_id,
    metric_date,
    COALESCE(revenue, 0) AS rev,
    AVG(COALESCE(revenue, 0)) OVER (
      PARTITION BY branch_id ORDER BY metric_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS avg_7d,
    STDDEV(COALESCE(revenue, 0)) OVER (
      PARTITION BY branch_id ORDER BY metric_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS std_7d
  FROM branch_daily_metrics
)
SELECT
  branch_id,
  metric_date,
  CASE WHEN std_7d IS NULL OR std_7d = 0 THEN NULL ELSE (rev - avg_7d) / NULLIF(std_7d, 0) END AS anomaly_score,
  CASE
    WHEN std_7d IS NULL OR std_7d = 0 THEN 'normal'::text
    WHEN (rev - avg_7d) / NULLIF(std_7d, 0) < -1.5 THEN 'demand_drop'
    WHEN (rev - avg_7d) / NULLIF(std_7d, 0) > 1.5 THEN 'demand_spike'
    ELSE 'normal'
  END AS early_signal,
  70::numeric AS confidence_score
FROM base;

-- 4. Recreate branch_anomaly_signals (unified view)
--    fnb_anomaly_signals may not have early_signal; use NULL or anomaly-derived for UNION compatibility.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'branch_anomaly_signals') THEN
    DROP TABLE branch_anomaly_signals CASCADE;
  END IF;
END $$;
DROP VIEW IF EXISTS branch_anomaly_signals;

CREATE VIEW branch_anomaly_signals AS
SELECT
  branch_id,
  metric_date,
  'fnb'::text AS business_type,
  anomaly_score,
  confidence_score,
  anomaly_score AS revenue_anomaly_score
FROM fnb_anomaly_signals
UNION ALL
SELECT
  branch_id,
  metric_date,
  'accommodation'::text AS business_type,
  anomaly_score,
  confidence_score,
  anomaly_score AS revenue_anomaly_score
FROM accommodation_anomaly_signals;

-- 5. Reload PostgREST schema cache (Supabase picks this up to refresh API schema)
NOTIFY pgrst, 'reload schema';
