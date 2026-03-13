-- Anomaly pipeline:
-- F&B: trigger on fnb_daily_metrics → INSERT into fnb_anomaly_signals (table).
-- Accommodation: no insert; accommodation_anomaly_signals is a VIEW (computed from accommodation_daily_metrics).
-- branch_anomaly_signals = read-only UNION view over fnb table + accommodation view.
--
-- If you have update_branch_kpi_metrics() that inserts into accommodation_anomaly_signals, drop or replace it:
--   DROP FUNCTION IF EXISTS update_branch_kpi_metrics() CASCADE;
-- Then use this migration's triggers (fn_sync_fnb_anomaly_signals, fn_sync_accommodation_anomaly_signals).

-- ---------------------------------------------------------------------------
-- 1. F&B anomaly table only (accommodation uses a view, not a table)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fnb_anomaly_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  anomaly_score numeric,
  confidence_score numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE(branch_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_fnb_anomaly_signals_branch_date ON fnb_anomaly_signals(branch_id, metric_date DESC);

-- ---------------------------------------------------------------------------
-- 2. Drop any existing triggers that wrote to branch_anomaly_signals
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS tr_sync_fnb_anomaly_signals ON fnb_daily_metrics;
DROP TRIGGER IF EXISTS tr_sync_anomaly_signals_fnb ON fnb_daily_metrics;
DROP TRIGGER IF EXISTS tr_anomaly_signals_fnb ON fnb_daily_metrics;

DROP TRIGGER IF EXISTS tr_sync_accommodation_anomaly_signals ON accommodation_daily_metrics;
DROP TRIGGER IF EXISTS tr_sync_anomaly_signals_accommodation ON accommodation_daily_metrics;
DROP TRIGGER IF EXISTS tr_anomaly_signals_accommodation ON accommodation_daily_metrics;

-- ---------------------------------------------------------------------------
-- 3. F&B trigger: insert into fnb_anomaly_signals only
-- ---------------------------------------------------------------------------

-- F&B: use revenue (fnb_daily_metrics.revenue). If your table has total_revenue_thb instead, replace revenue with total_revenue_thb in this function and the trigger below.
CREATE OR REPLACE FUNCTION fn_sync_fnb_anomaly_signals()
RETURNS TRIGGER AS $$
DECLARE
  avg_7d numeric;
  std_7d numeric;
  score numeric;
  conf numeric;
  rev numeric;
BEGIN
  rev := COALESCE(NEW.revenue, 0);
  SELECT AVG(COALESCE(revenue, 0)), STDDEV(COALESCE(revenue, 0))
  INTO avg_7d, std_7d
  FROM fnb_daily_metrics
  WHERE branch_id = NEW.branch_id
    AND metric_date <= NEW.metric_date
    AND metric_date > NEW.metric_date - INTERVAL '7 days';

  IF avg_7d IS NULL OR COALESCE(std_7d, 0) = 0 THEN
    score := NULL;
    conf := NULL;
  ELSE
    score := (rev - avg_7d) / NULLIF(std_7d, 0);
    conf := LEAST(100, GREATEST(0, 70));
  END IF;

  INSERT INTO fnb_anomaly_signals (branch_id, metric_date, anomaly_score, confidence_score)
  VALUES (NEW.branch_id, NEW.metric_date, score, conf)
  ON CONFLICT (branch_id, metric_date)
  DO UPDATE SET anomaly_score = EXCLUDED.anomaly_score, confidence_score = EXCLUDED.confidence_score;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_sync_fnb_anomaly_signals
  AFTER INSERT OR UPDATE OF revenue, metric_date
  ON fnb_daily_metrics
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_fnb_anomaly_signals();

-- ---------------------------------------------------------------------------
-- 4. Accommodation trigger: no-op (trigger still fires; accommodation uses VIEW only)
-- Do NOT insert into accommodation_anomaly_signals — it is a view, not a table.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_sync_accommodation_anomaly_signals()
RETURNS TRIGGER AS $$
BEGIN
  -- Accommodation anomaly metrics are computed by the view accommodation_anomaly_signals.
  -- No insert here; view reads from accommodation_daily_metrics.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fire on revenue (accommodation_daily_metrics uses revenue; if your schema has total_revenue_thb, use that instead)
CREATE TRIGGER tr_sync_accommodation_anomaly_signals
  AFTER INSERT OR UPDATE OF revenue, metric_date
  ON accommodation_daily_metrics
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_accommodation_anomaly_signals();

-- ---------------------------------------------------------------------------
-- 5. Accommodation anomaly: read-only VIEW (computed from accommodation_daily_metrics)
-- Drop dependent view first, then accommodation_anomaly_signals.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS branch_anomaly_signals;
DROP VIEW IF EXISTS accommodation_anomaly_signals;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'accommodation_anomaly_signals') THEN
    DROP TABLE accommodation_anomaly_signals CASCADE;
  END IF;
END $$;

-- Use revenue (accommodation_daily_metrics.revenue); if your table has total_revenue_thb instead, replace revenue with total_revenue_thb
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
  FROM accommodation_daily_metrics
)
SELECT
  branch_id,
  metric_date,
  CASE WHEN std_7d IS NULL OR std_7d = 0 THEN NULL ELSE (rev - avg_7d) / NULLIF(std_7d, 0) END AS anomaly_score,
  70::numeric AS confidence_score
FROM base;

-- ---------------------------------------------------------------------------
-- 6. Read-only unified view (do not INSERT/UPSERT into this)
-- ---------------------------------------------------------------------------

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
