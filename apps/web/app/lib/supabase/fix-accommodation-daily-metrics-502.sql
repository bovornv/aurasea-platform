-- ============================================================
-- FIX 502 on /rest/v1/accommodation_daily_metrics
-- Causes addressed:
-- 1. accommodation_anomaly_signals VIEW may reference total_revenue_thb
--    while table has "revenue" (or vice versa) → invalid view.
-- 2. Trigger fires on total_revenue_thb but column is revenue → invalid trigger.
-- Run diagnose-accommodation-daily-metrics-502.sql first to confirm.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Recreate accommodation_anomaly_signals using the column that exists
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS branch_anomaly_signals;
DROP VIEW IF EXISTS accommodation_anomaly_signals;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accommodation_daily_metrics' AND column_name = 'revenue') THEN
    CREATE VIEW accommodation_anomaly_signals AS
    WITH base AS (
      SELECT branch_id, metric_date,
        COALESCE(revenue, 0) AS rev,
        AVG(COALESCE(revenue, 0)) OVER (PARTITION BY branch_id ORDER BY metric_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS avg_7d,
        STDDEV(COALESCE(revenue, 0)) OVER (PARTITION BY branch_id ORDER BY metric_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS std_7d
      FROM accommodation_daily_metrics
    )
    SELECT branch_id, metric_date,
      CASE WHEN std_7d IS NULL OR std_7d = 0 THEN NULL ELSE (rev - avg_7d) / NULLIF(std_7d, 0) END AS anomaly_score,
      70::numeric AS confidence_score
    FROM base;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accommodation_daily_metrics' AND column_name = 'total_revenue_thb') THEN
    CREATE VIEW accommodation_anomaly_signals AS
    WITH base AS (
      SELECT branch_id, metric_date,
        COALESCE(total_revenue_thb, 0) AS rev,
        AVG(COALESCE(total_revenue_thb, 0)) OVER (PARTITION BY branch_id ORDER BY metric_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS avg_7d,
        STDDEV(COALESCE(total_revenue_thb, 0)) OVER (PARTITION BY branch_id ORDER BY metric_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS std_7d
      FROM accommodation_daily_metrics
    )
    SELECT branch_id, metric_date,
      CASE WHEN std_7d IS NULL OR std_7d = 0 THEN NULL ELSE (rev - avg_7d) / NULLIF(std_7d, 0) END AS anomaly_score,
      70::numeric AS confidence_score
    FROM base;
  ELSE
    RAISE EXCEPTION 'accommodation_daily_metrics has neither revenue nor total_revenue_thb. Add one column.';
  END IF;
END $$;

CREATE VIEW branch_anomaly_signals AS
SELECT branch_id, metric_date, 'fnb'::text AS business_type, anomaly_score, confidence_score, anomaly_score AS revenue_anomaly_score FROM fnb_anomaly_signals
UNION ALL
SELECT branch_id, metric_date, 'accommodation'::text AS business_type, anomaly_score, confidence_score, anomaly_score AS revenue_anomaly_score FROM accommodation_anomaly_signals;

-- ---------------------------------------------------------------------------
-- 2. Create trigger function if missing (no-op; accommodation uses VIEW only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_sync_accommodation_anomaly_signals()
RETURNS TRIGGER AS $$
BEGIN
  -- Accommodation anomaly is computed by the view accommodation_anomaly_signals.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 3. Recreate trigger on the column that exists
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS tr_sync_accommodation_anomaly_signals ON accommodation_daily_metrics;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accommodation_daily_metrics' AND column_name = 'revenue') THEN
    EXECUTE 'CREATE TRIGGER tr_sync_accommodation_anomaly_signals AFTER INSERT OR UPDATE OF revenue, metric_date ON accommodation_daily_metrics FOR EACH ROW EXECUTE FUNCTION fn_sync_accommodation_anomaly_signals()';
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accommodation_daily_metrics' AND column_name = 'total_revenue_thb') THEN
    EXECUTE 'CREATE TRIGGER tr_sync_accommodation_anomaly_signals AFTER INSERT OR UPDATE OF total_revenue_thb, metric_date ON accommodation_daily_metrics FOR EACH ROW EXECUTE FUNCTION fn_sync_accommodation_anomaly_signals()';
  END IF;
END $$;
