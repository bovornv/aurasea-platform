-- Anomaly pipeline: write to per-business tables; read from unified view.
-- F&B trigger → fnb_anomaly_signals. Accommodation trigger → accommodation_anomaly_signals.
-- branch_anomaly_signals = read-only UNION view (no INSERT/UPSERT into it).

-- ---------------------------------------------------------------------------
-- 1. Underlying tables (insertable)
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

CREATE TABLE IF NOT EXISTS accommodation_anomaly_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  anomaly_score numeric,
  confidence_score numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE(branch_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_fnb_anomaly_signals_branch_date ON fnb_anomaly_signals(branch_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_accommodation_anomaly_signals_branch_date ON accommodation_anomaly_signals(branch_id, metric_date DESC);

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

CREATE OR REPLACE FUNCTION fn_sync_fnb_anomaly_signals()
RETURNS TRIGGER AS $$
DECLARE
  avg_7d numeric;
  std_7d numeric;
  score numeric;
  conf numeric;
BEGIN
  SELECT AVG(total_revenue_thb), STDDEV(total_revenue_thb)
  INTO avg_7d, std_7d
  FROM fnb_daily_metrics
  WHERE branch_id = NEW.branch_id
    AND metric_date <= NEW.metric_date
    AND metric_date > NEW.metric_date - INTERVAL '7 days';

  IF avg_7d IS NULL OR COALESCE(std_7d, 0) = 0 THEN
    score := NULL;
    conf := NULL;
  ELSE
    score := (NEW.total_revenue_thb - avg_7d) / NULLIF(std_7d, 0);
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
  AFTER INSERT OR UPDATE OF total_revenue_thb, metric_date
  ON fnb_daily_metrics
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_fnb_anomaly_signals();

-- ---------------------------------------------------------------------------
-- 4. Accommodation trigger: insert into accommodation_anomaly_signals only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_sync_accommodation_anomaly_signals()
RETURNS TRIGGER AS $$
DECLARE
  avg_7d numeric;
  std_7d numeric;
  score numeric;
  conf numeric;
  rev numeric;
BEGIN
  rev := COALESCE(NEW.total_revenue_thb, 0);

  SELECT AVG(COALESCE(total_revenue_thb, 0)), STDDEV(COALESCE(total_revenue_thb, 0))
  INTO avg_7d, std_7d
  FROM accommodation_daily_metrics
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

  INSERT INTO accommodation_anomaly_signals (branch_id, metric_date, anomaly_score, confidence_score)
  VALUES (NEW.branch_id, NEW.metric_date, score, conf)
  ON CONFLICT (branch_id, metric_date)
  DO UPDATE SET anomaly_score = EXCLUDED.anomaly_score, confidence_score = EXCLUDED.confidence_score;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_sync_accommodation_anomaly_signals
  AFTER INSERT OR UPDATE OF total_revenue_thb, metric_date
  ON accommodation_daily_metrics
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_accommodation_anomaly_signals();

-- ---------------------------------------------------------------------------
-- 5. Read-only unified view (do not INSERT/UPSERT into this)
-- Shape: branch_id, metric_date, business_type, anomaly_score, confidence_score
-- Plus revenue_anomaly_score alias for app backward compatibility.
-- If branch_anomaly_signals was a table, drop it so we can create the view.
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
