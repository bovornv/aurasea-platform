-- =============================================================================
-- Branch Performance Drivers (Today + Trends charts)
-- =============================================================================
-- Sources ONLY: public.branch_daily_metrics + public.today_summary (joined on branch_id + metric_date).
-- Does not reference accommodation_daily_metrics, fnb_daily_metrics, or today_summary_clean.
--
-- Accommodation: revenue + rooms_sold/rooms_available from branch_daily_metrics; occupancy/ADR/revpar fallbacks
-- from branch_daily_metrics when today_summary lacks room columns; deltas + health from today_summary when present.
-- F&B: revenue + customers from branch_daily_metrics; avg_ticket + revenue_delta_day + health from today_summary;
-- transactions = COALESCE(t.transactions, t.customers, d.customers); fnb_revenue_delta_day = prior-day % from
-- branch_daily_metrics.revenue (today_summary often omits fnb_revenue_delta_day).
--
-- Prerequisites: public.branch_daily_metrics (canonical read model), public.today_summary, public.branches
-- After run: GET /rest/v1/branch_performance_drivers_accommodation?branch_id=eq.{uuid}&order=metric_date.asc
-- =============================================================================

CREATE OR REPLACE VIEW public.branch_performance_drivers_accommodation AS
SELECT DISTINCT ON (d.branch_id, d.metric_date)
  d.branch_id::uuid AS branch_id,
  d.metric_date::date AS metric_date,
  COALESCE(d.revenue, 0)::numeric AS revenue,
  COALESCE(
    t.occupancy_rate,
    CASE
      WHEN COALESCE(NULLIF(d.rooms_available, 0), 0) > 0
      THEN (
        COALESCE(d.rooms_sold, 0)::numeric
        / NULLIF(d.rooms_available::numeric, 0)
      ) * 100::numeric
      ELSE NULL::numeric
    END
  ) AS occupancy_rate,
  COALESCE(
    t.revpar,
    CASE
      WHEN COALESCE(NULLIF(d.rooms_available, 0), 0) > 0
      THEN COALESCE(d.revenue, 0)::numeric / NULLIF(d.rooms_available::numeric, 0)
      ELSE NULL::numeric
    END
  ) AS revpar,
  COALESCE(
    t.adr,
    CASE
      WHEN COALESCE(NULLIF(d.rooms_sold, 0), 0) > 0
      THEN COALESCE(d.revenue, 0)::numeric / NULLIF(d.rooms_sold::numeric, 0)
      ELSE NULL::numeric
    END,
    d.adr
  ) AS adr,
  d.rooms_sold::bigint AS rooms_sold,
  d.rooms_available::bigint AS rooms_available,
  t.revenue_delta_day,
  t.occupancy_delta_week,
  t.health_score
FROM public.branch_daily_metrics d
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

CREATE OR REPLACE VIEW public.branch_performance_drivers_fnb AS
SELECT DISTINCT ON (d.branch_id, d.metric_date)
  d.branch_id::uuid AS branch_id,
  d.metric_date::date AS metric_date,
  COALESCE(d.revenue, 0)::numeric AS revenue,
  COALESCE(d.customers, 0)::numeric AS customers,
  COALESCE(t.transactions, t.customers, d.customers)::numeric AS transactions,
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
  CASE
    WHEN dp.revenue IS NOT NULL AND dp.revenue::numeric > 0
    THEN (
      COALESCE(d.revenue, 0)::numeric - dp.revenue::numeric
    ) / NULLIF(dp.revenue::numeric, 0) * 100::numeric
    ELSE NULL::numeric
  END AS fnb_revenue_delta_day,
  t.health_score
FROM public.branch_daily_metrics d
INNER JOIN public.branches b
  ON trim(both FROM b.id::text) = trim(both FROM d.branch_id::text)
LEFT JOIN public.branch_daily_metrics dp
  ON trim(both FROM dp.branch_id::text) = trim(both FROM d.branch_id::text)
  AND dp.metric_date::date = d.metric_date::date - INTERVAL '1 day'
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
  'Performance driver series: revenue and room counts from branch_daily_metrics; occupancy_rate/revpar/adr prefer today_summary else derived from branch_daily_metrics; deltas from today_summary.';

COMMENT ON VIEW public.branch_performance_drivers_fnb IS
  'Performance driver series: revenue+customers from branch_daily_metrics; fnb_revenue_delta_day = prior calendar day % vs branch_daily_metrics.revenue; transactions COALESCE(summary.transactions, summary.customers, daily.customers); avg_ticket/revenue_delta_day/health from today_summary.';

GRANT SELECT ON public.branch_performance_drivers_accommodation TO anon, authenticated;
GRANT SELECT ON public.branch_performance_drivers_fnb TO anon, authenticated;
