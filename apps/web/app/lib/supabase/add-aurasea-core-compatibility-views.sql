-- Phase 1: Compatibility views (alerts_final, branch intelligence helpers).
-- Prerequisites: public.today_summary (merged acc+F&B; see add-today-summary-view.sql).
-- Deprecated removed: public.today_summary_clean / today_summary_clean_v_next — use public.today_summary only.

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

-- 2) branch_recommendations (deduped over alerts_final — view, not table; no ctid deletes)
DROP VIEW IF EXISTS branch_recommendations CASCADE;
CREATE VIEW branch_recommendations AS
SELECT
  trim(bf.branch_id::text) AS branch_id,
  bf.metric_date::date AS metric_date,
  bf.alert_type::text AS recommendation_title
FROM (
  SELECT
    af.branch_id,
    af.metric_date,
    af.alert_type,
    ROW_NUMBER() OVER (
      PARTITION BY
        lower(trim(COALESCE(af.branch_id::text, ''))),
        (af.metric_date::date),
        lower(trim(COALESCE(af.alert_type::text, '')))
      ORDER BY af.metric_date DESC NULLS LAST
    ) AS rn
  FROM alerts_final af
) bf
WHERE bf.rn = 1
  AND bf.alert_type IS NOT NULL
  AND trim(COALESCE(bf.alert_type::text, '')) <> '';

-- 3) accommodation_health_today (health from today_summary)
DROP VIEW IF EXISTS accommodation_health_today CASCADE;
CREATE VIEW accommodation_health_today AS
SELECT branch_id, metric_date, health_score
FROM public.today_summary;

-- 4) branch_anomaly_signals (revenue + confidence from today_summary)
DROP VIEW IF EXISTS branch_anomaly_signals CASCADE;
CREATE VIEW branch_anomaly_signals AS
SELECT branch_id, metric_date, revenue, 0 AS confidence_score
FROM public.today_summary;

-- Grants
GRANT SELECT ON alerts_final TO anon, authenticated;
GRANT SELECT ON branch_recommendations TO anon, authenticated;
GRANT SELECT ON accommodation_health_today TO anon, authenticated;
GRANT SELECT ON branch_anomaly_signals TO anon, authenticated;
GRANT SELECT ON public.today_summary TO anon, authenticated;
