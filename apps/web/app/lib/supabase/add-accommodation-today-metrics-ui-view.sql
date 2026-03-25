-- Accommodation Today top metrics row for PostgREST: `accommodation_today_metrics_ui`
-- App: getAccommodationTodayMetricsUi — eq(branch_id), order metric_date desc, limit 1
--
-- Fixes:
--   - health_score: COALESCE(today_summary_clean.health_score, 50) so UI never shows empty Health
--   - Join today_summary_clean on branch_id via ::text (uuid vs text safe) + metric_date
--
-- Prerequisites: public.accommodation_daily_metrics, public.today_summary_clean
-- Revenue column: revenue OR total_revenue_thb (detected below)

DO $$
DECLARE
  rev_sql text;
  ddl text;
BEGIN
  IF to_regclass('public.accommodation_daily_metrics') IS NULL THEN
    RAISE EXCEPTION 'public.accommodation_daily_metrics is required';
  END IF;
  IF to_regclass('public.today_summary_clean') IS NULL THEN
    RAISE EXCEPTION 'public.today_summary_clean is required (run fix-today-summary-clean or rebuild pipeline first)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accommodation_daily_metrics' AND column_name = 'revenue'
  ) THEN
    rev_sql := 'COALESCE(a.revenue, 0)::numeric';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accommodation_daily_metrics' AND column_name = 'total_revenue_thb'
  ) THEN
    rev_sql := 'COALESCE(a.total_revenue_thb, 0)::numeric';
  ELSE
    RAISE EXCEPTION 'accommodation_daily_metrics needs column revenue or total_revenue_thb';
  END IF;

  ddl := format(
    $v$
DROP VIEW IF EXISTS public.accommodation_today_metrics_ui CASCADE;
CREATE VIEW public.accommodation_today_metrics_ui AS
SELECT
  a.branch_id::uuid AS branch_id,
  a.metric_date::date AS metric_date,
  %1$s AS revenue,
  t.revenue_delta_day AS revenue_delta,
  CASE
    WHEN COALESCE(a.rooms_available, 0) > 0 AND a.rooms_sold IS NOT NULL
    THEN (a.rooms_sold::numeric / NULLIF(a.rooms_available::numeric, 0))::numeric
    ELSE NULL::numeric
  END AS occupancy,
  a.rooms_sold AS rooms_sold,
  a.rooms_available AS rooms_available,
  CASE
    WHEN COALESCE(a.rooms_sold, 0) > 0 THEN (%1$s / NULLIF(a.rooms_sold::numeric, 0))::numeric
    ELSE NULL::numeric
  END AS adr,
  CASE
    WHEN COALESCE(a.rooms_available, 0) > 0 THEN (%1$s / NULLIF(a.rooms_available::numeric, 0))::numeric
    ELSE NULL::numeric
  END AS revpar,
  COALESCE(t.health_score, 50::numeric)::numeric AS health_score
FROM public.accommodation_daily_metrics a
LEFT JOIN public.today_summary_clean t
  ON t.branch_id::text = a.branch_id::text
 AND t.metric_date::date = a.metric_date::date
$v$,
    rev_sql
  );

  EXECUTE ddl;
END $$;

COMMENT ON VIEW public.accommodation_today_metrics_ui IS
  'Per-day accommodation KPIs + revenue_delta_day and health from today_summary_clean; health defaults to 50.';

GRANT SELECT ON public.accommodation_today_metrics_ui TO anon, authenticated;
