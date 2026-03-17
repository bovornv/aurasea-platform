-- Phase 1: Compatibility views so frontend does not break before migration.
-- Prerequisites: today_summary must exist (run add-today-summary-view.sql first).
-- For alerts_final we create it from branch_alerts_display if that exists; else you must create alerts_final yourself.

-- Step 0: Create today_summary_clean from existing today_summary (so we have the "core" view name).
-- Do not drop today_summary later; it stays as the source.
DROP VIEW IF EXISTS today_summary_clean CASCADE;
CREATE VIEW today_summary_clean AS
SELECT * FROM today_summary;

-- Step 1: Create alerts_final from branch_alerts_display if it exists (else skip or create manually).
DROP VIEW IF EXISTS alerts_final CASCADE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'branch_alerts_display') THEN
    EXECUTE 'CREATE VIEW alerts_final AS SELECT branch_id, metric_date, alert_code AS alert_type FROM branch_alerts_display';
  ELSE
    -- Stub so branch_recommendations can be created (no rows)
    CREATE VIEW alerts_final AS
    SELECT NULL::text AS branch_id, NULL::date AS metric_date, NULL::text AS alert_type
    WHERE false;
  END IF;
END $$;

-- 2) branch_recommendations (alias over alerts_final)
DROP VIEW IF EXISTS branch_recommendations CASCADE;
CREATE VIEW branch_recommendations AS
SELECT branch_id, metric_date, alert_type AS recommendation_title
FROM alerts_final;

-- 3) accommodation_health_today (health from today_summary_clean)
DROP VIEW IF EXISTS accommodation_health_today CASCADE;
CREATE VIEW accommodation_health_today AS
SELECT branch_id, metric_date, health_score
FROM today_summary_clean;

-- 4) branch_anomaly_signals (revenue + confidence from today_summary_clean)
DROP VIEW IF EXISTS branch_anomaly_signals CASCADE;
CREATE VIEW branch_anomaly_signals AS
SELECT branch_id, metric_date, revenue, 0 AS confidence_score
FROM today_summary_clean;

-- (today_summary already exists from add-today-summary-view.sql; do not drop it.)

-- Grants
GRANT SELECT ON today_summary_clean TO anon, authenticated;
GRANT SELECT ON alerts_final TO anon, authenticated;
GRANT SELECT ON branch_recommendations TO anon, authenticated;
GRANT SELECT ON accommodation_health_today TO anon, authenticated;
GRANT SELECT ON branch_anomaly_signals TO anon, authenticated;
GRANT SELECT ON today_summary TO anon, authenticated;
