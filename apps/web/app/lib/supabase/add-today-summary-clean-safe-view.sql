-- today_summary_clean_safe — stable PostgREST API for the web app
-- Run after today_summary_clean exists.
--
-- Fixes:
--   - branch_id exposed as TEXT (matches public.branches.id text IDs; avoids UUID cast 400s)
--   - Columns the app selects are always present (no PGRST204 missing column)
--   - health_score never NULL (computed fallback when base is NULL)
--
-- App code queries ONLY today_summary_clean_safe, not today_summary_clean.

CREATE OR REPLACE VIEW today_summary_clean_safe AS
SELECT
  t.branch_id::text AS branch_id,
  t.metric_date::date AS metric_date,
  COALESCE(t.total_revenue, 0)::numeric AS total_revenue,
  COALESCE(t.accommodation_revenue, t.total_revenue, 0)::numeric AS accommodation_revenue,
  COALESCE(t.fnb_revenue, 0)::numeric AS fnb_revenue,
  COALESCE(t.customers, 0)::numeric AS customers,
  -- Base view uses capacity/utilized (not rooms_available/rooms_sold on many deployments)
  COALESCE(t.capacity, 0)::integer AS capacity,
  COALESCE(t.utilized, 0)::integer AS utilized,
  COALESCE(t.capacity, 0)::integer AS rooms_available,
  COALESCE(t.utilized, 0)::integer AS rooms_sold,
  t.occupancy_rate::numeric AS occupancy_rate,
  -- Many today_summary_clean definitions omit adr/revpar; derive from revenue + rooms
  CASE
    WHEN COALESCE(t.utilized, 0) > 0
    THEN (COALESCE(t.total_revenue, 0)::numeric / NULLIF(t.utilized::numeric, 0))
    ELSE NULL::numeric
  END AS adr,
  CASE
    WHEN COALESCE(t.capacity, 0) > 0
    THEN (COALESCE(t.total_revenue, 0)::numeric / NULLIF(t.capacity::numeric, 0))
    ELSE NULL::numeric
  END AS revpar,
  t.revenue_delta_day::numeric AS revenue_delta_day,
  t.occupancy_delta_week::numeric AS occupancy_delta_week,
  CASE
    WHEN COALESCE(t.customers, 0) > 0 AND COALESCE(t.fnb_revenue, t.total_revenue, 0) > 0
    THEN (COALESCE(t.fnb_revenue, t.total_revenue, 0)::numeric / NULLIF(t.customers::numeric, 0))
    ELSE NULL::numeric
  END AS avg_ticket,
  NULL::numeric AS revenue_yesterday,
  -- Base view often has no health_score; derive from revenue_delta_day when present
  CASE
    WHEN t.revenue_delta_day IS NULL THEN 70::numeric
    WHEN t.revenue_delta_day >= 0 THEN 76::numeric
    ELSE 58::numeric
  END AS health_score
FROM today_summary_clean t;

COMMENT ON VIEW today_summary_clean_safe IS
  'Application-facing summary: TEXT branch_id, stable columns, computed health_score. Do not query today_summary_clean from the app.';

GRANT SELECT ON today_summary_clean_safe TO anon, authenticated;

-- If your today_summary_clean uses different names, adjust the FROM clause above
-- (e.g. add COALESCE(t.total_revenue, t.revenue) if you only have revenue).
