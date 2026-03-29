-- =============================================================================
-- Branch Performance Drivers (Today + Trends charts)
-- =============================================================================
-- Sources ONLY: public.daily_metrics + public.today_summary (joined on branch_id + metric_date).
-- Does not reference accommodation_daily_metrics, fnb_daily_metrics, or today_summary_clean.
--
-- Accommodation: revenue history from daily_metrics; occupancy/ADR/revpar/rooms/deltas from today_summary.
-- F&B: revenue + customers from daily_metrics; avg_ticket + deltas (+ transactions) from today_summary.
--
-- Prerequisites: public.daily_metrics, public.today_summary, public.branches
-- After run: GET /rest/v1/branch_performance_drivers_accommodation?branch_id=eq.{uuid}&order=metric_date.asc
-- =============================================================================

DROP VIEW IF EXISTS public.branch_performance_drivers_fnb CASCADE;
DROP VIEW IF EXISTS public.branch_performance_drivers_accommodation CASCADE;

CREATE VIEW public.branch_performance_drivers_accommodation AS
SELECT DISTINCT ON (d.branch_id, d.metric_date)
  d.branch_id::uuid AS branch_id,
  d.metric_date::date AS metric_date,
  COALESCE(d.revenue, 0)::numeric AS revenue,
  COALESCE(
    t.occupancy_rate,
    CASE
      WHEN COALESCE(NULLIF(t.rooms_available, 0), NULLIF(d.rooms_available, 0), 0) > 0
      THEN (
        COALESCE(t.rooms_sold, d.rooms_sold, 0)::numeric
        / NULLIF(COALESCE(NULLIF(t.rooms_available, 0), NULLIF(d.rooms_available, 0))::numeric, 0)
      ) * 100::numeric
      ELSE NULL::numeric
    END
  ) AS occupancy_rate,
  COALESCE(
    t.revpar,
    CASE
      WHEN COALESCE(NULLIF(t.rooms_available, 0), NULLIF(d.rooms_available, 0), 0) > 0
      THEN COALESCE(d.revenue, 0)::numeric
        / NULLIF(COALESCE(NULLIF(t.rooms_available, 0), NULLIF(d.rooms_available, 0))::numeric, 0)
      ELSE NULL::numeric
    END
  ) AS revpar,
  COALESCE(
    t.adr,
    CASE
      WHEN COALESCE(NULLIF(t.rooms_sold, 0), NULLIF(d.rooms_sold, 0), 0) > 0
      THEN COALESCE(d.revenue, 0)::numeric
        / NULLIF(COALESCE(NULLIF(t.rooms_sold, 0), NULLIF(d.rooms_sold, 0))::numeric, 0)
      ELSE NULL::numeric
    END,
    d.adr
  ) AS adr,
  COALESCE(t.rooms_sold, d.rooms_sold)::bigint AS rooms_sold,
  COALESCE(t.rooms_available, d.rooms_available)::bigint AS rooms_available,
  t.revenue_delta_day,
  t.occupancy_delta_week,
  t.health_score
FROM public.daily_metrics d
INNER JOIN public.branches b
  ON trim(both FROM b.id::text) = trim(both FROM d.branch_id::text)
LEFT JOIN public.today_summary t
  ON trim(both FROM t.branch_id::text) = trim(both FROM d.branch_id::text)
  AND t.metric_date::date = d.metric_date::date
WHERE LOWER(COALESCE(b.module_type::text, '')) IN (
  'accommodation', 'hotel', 'hotel_resort', 'rooms', 'hotel_with_cafe'
)
  AND (d.rooms_sold IS NOT NULL OR d.rooms_available IS NOT NULL)
ORDER BY
  d.branch_id,
  d.metric_date,
  (CASE WHEN d.rooms_sold IS NOT NULL OR d.rooms_available IS NOT NULL THEN 0 ELSE 1 END),
  d.created_at DESC NULLS LAST;

CREATE VIEW public.branch_performance_drivers_fnb AS
SELECT DISTINCT ON (d.branch_id, d.metric_date)
  d.branch_id::uuid AS branch_id,
  d.metric_date::date AS metric_date,
  COALESCE(d.revenue, 0)::numeric AS revenue,
  COALESCE(d.customers, 0)::numeric AS customers,
  COALESCE(t.transactions, t.total_customers, t.customers)::numeric AS transactions,
  COALESCE(
    t.avg_ticket,
    CASE
      WHEN COALESCE(d.customers, 0) > 0
        THEN COALESCE(d.revenue, 0)::numeric / NULLIF(d.customers::numeric, 0)
      ELSE NULL::numeric
    END,
    d.avg_ticket
  ) AS avg_ticket,
  t.revenue_delta_day,
  t.fnb_revenue_delta_day,
  t.health_score
FROM public.daily_metrics d
INNER JOIN public.branches b
  ON trim(both FROM b.id::text) = trim(both FROM d.branch_id::text)
LEFT JOIN public.today_summary t
  ON trim(both FROM t.branch_id::text) = trim(both FROM d.branch_id::text)
  AND t.metric_date::date = d.metric_date::date
WHERE LOWER(COALESCE(b.module_type::text, '')) IN (
  'fnb', 'restaurant', 'cafe', 'cafe_restaurant'
)
  AND (d.customers IS NOT NULL OR d.avg_ticket IS NOT NULL OR d.revenue IS NOT NULL)
ORDER BY
  d.branch_id,
  d.metric_date,
  (CASE WHEN d.customers IS NOT NULL OR d.avg_ticket IS NOT NULL THEN 0 ELSE 1 END),
  d.created_at DESC NULLS LAST;

COMMENT ON VIEW public.branch_performance_drivers_accommodation IS
  'Performance driver series: revenue from daily_metrics; occupancy/ADR/revpar/rooms/deltas from today_summary; branch_id+metric_date join.';

COMMENT ON VIEW public.branch_performance_drivers_fnb IS
  'Performance driver series: revenue+customers from daily_metrics; avg_ticket/transactions/deltas from today_summary; branch_id+metric_date join.';

GRANT SELECT ON public.branch_performance_drivers_accommodation TO anon, authenticated;
GRANT SELECT ON public.branch_performance_drivers_fnb TO anon, authenticated;
