-- =============================================================================
-- MIGRATION: Consolidate on public.today_summary only (clean/candidate family removed)
-- =============================================================================
-- Run in order in one maintenance window:
--
--   STEP A — this file: recreate public.today_summary (CASCADE drops direct view children).
--   STEP B — rebuild-alerts-enriched-engine.sql (from repo; restores alerts + Today panels).
--   STEP C — fix-company-status-current-and-today-dashboard.sql (company_status_current, today_company_dashboard).
--   STEP D — add-accommodation-today-metrics-ui-view.sql (optional UI view).
--   STEP E — fix-today-priorities-stable-schema.sql (today_priorities_*).
--   STEP F — drop-today-summary-clean-family.sql (drops legacy names if still present).
--
-- Objects rewired in-repo (reference public.today_summary, not *_clean*):
--   rebuild-alerts-enriched-engine.sql → alerts_enriched STEP 2, whats_working_today, …
--   fix-today-priorities-stable-schema.sql → today_priorities_ranked
--   add-alerts-today-views.sql → legacy alerts_* stack
--   add-aurasea-core-compatibility-views.sql → accommodation_health_today, branch_anomaly_signals
-- =============================================================================

-- STEP A.1: CASCADE drops direct view children — run B–E immediately after.
DROP VIEW IF EXISTS public.today_summary CASCADE;

CREATE VIEW public.today_summary AS
WITH base AS (
  SELECT
    COALESCE(a.branch_id, f.branch_id) AS branch_id,
    COALESCE(a.metric_date, f.metric_date)::date AS metric_date,
    COALESCE(a.revenue, 0)::numeric AS accommodation_revenue,
    COALESCE(f.revenue, f.total_sales, 0)::numeric AS fnb_revenue,
    f.total_customers::integer AS customers,
    a.rooms_sold,
    a.rooms_available
  FROM public.accommodation_daily_metrics a
  FULL OUTER JOIN public.fnb_daily_metrics f
    ON a.branch_id = f.branch_id
    AND (a.metric_date::date) = (f.metric_date::date)
),
d AS (
  SELECT
    branch_id,
    metric_date,
    accommodation_revenue,
    fnb_revenue,
    (accommodation_revenue + fnb_revenue) AS total_revenue,
    COALESCE(customers, 0)::integer AS customers,
    rooms_sold,
    rooms_available,
    CASE
      WHEN COALESCE(rooms_available, 0) > 0 THEN (rooms_sold::numeric / rooms_available) * 100
      ELSE NULL
    END AS occupancy_rate,
    CASE
      WHEN COALESCE(rooms_sold, 0) > 0 THEN accommodation_revenue / NULLIF(rooms_sold, 0)
      ELSE NULL
    END AS adr,
    CASE
      WHEN COALESCE(rooms_available, 0) > 0 THEN accommodation_revenue / NULLIF(rooms_available, 0)
      ELSE NULL
    END AS revpar,
    CASE
      WHEN COALESCE(customers, 0) > 0 THEN fnb_revenue / NULLIF(customers, 0)
      ELSE NULL
    END AS avg_ticket
  FROM base
)
SELECT
  d.branch_id,
  d.metric_date,
  d.total_revenue AS revenue,
  d.customers,
  d.rooms_sold,
  d.rooms_available,
  d.occupancy_rate,
  d.adr,
  d.revpar,
  d.avg_ticket,
  p.total_revenue AS revenue_yesterday,
  w.rooms_sold AS utilized_last_week,
  w.rooms_available AS capacity_last_week,
  CASE
    WHEN p.total_revenue IS NOT NULL AND p.total_revenue > 0
    THEN (d.total_revenue - p.total_revenue) / p.total_revenue * 100
    ELSE NULL
  END AS revenue_delta_day,
  CASE
    WHEN w.rooms_available IS NOT NULL
      AND w.rooms_available > 0
      AND w.rooms_sold IS NOT NULL
      AND (w.rooms_sold::numeric / w.rooms_available) > 0
      AND d.rooms_available IS NOT NULL
      AND d.rooms_available > 0
      AND d.rooms_sold IS NOT NULL
    THEN (
      (d.rooms_sold::numeric / d.rooms_available)
      - (w.rooms_sold::numeric / w.rooms_available)
    ) / (w.rooms_sold::numeric / w.rooms_available) * 100
    ELSE NULL
  END AS occupancy_delta_week,
  CASE
    WHEN p.total_revenue IS NOT NULL AND d.total_revenue > p.total_revenue THEN 80
    ELSE 60
  END AS health_score,
  d.accommodation_revenue,
  d.fnb_revenue,
  d.total_revenue,
  d.total_revenue AS total_revenue_thb,
  d.accommodation_revenue AS accommodation_revenue_thb,
  d.fnb_revenue AS fnb_revenue_thb,
  d.total_revenue AS revenue_thb,
  CASE
    WHEN p.accommodation_revenue IS NOT NULL AND p.accommodation_revenue > 0
    THEN (d.accommodation_revenue - p.accommodation_revenue) / p.accommodation_revenue * 100
    ELSE NULL
  END AS accommodation_revenue_delta_day,
  CASE
    WHEN p.fnb_revenue IS NOT NULL AND p.fnb_revenue > 0
    THEN (d.fnb_revenue - p.fnb_revenue) / p.fnb_revenue * 100
    ELSE NULL
  END AS fnb_revenue_delta_day,
  d.rooms_sold AS utilized,
  d.rooms_available AS capacity,
  d.customers AS total_customers,
  d.customers AS transactions
FROM d
LEFT JOIN d p
  ON d.branch_id = p.branch_id
  AND p.metric_date = d.metric_date - INTERVAL '1 day'
LEFT JOIN d w
  ON d.branch_id = w.branch_id
  AND w.metric_date = d.metric_date - INTERVAL '7 days';

GRANT SELECT ON public.today_summary TO anon;
GRANT SELECT ON public.today_summary TO authenticated;

COMMENT ON VIEW public.today_summary IS
  'Canonical merged branch-day metrics (acc + F&B). Single source for alerts, priorities, and Today panels.';

-- Next: rebuild-alerts-enriched-engine.sql, fix-company-status-current-and-today-dashboard.sql,
-- add-accommodation-today-metrics-ui-view.sql, fix-today-priorities-stable-schema.sql,
-- then drop-today-summary-clean-family.sql.
