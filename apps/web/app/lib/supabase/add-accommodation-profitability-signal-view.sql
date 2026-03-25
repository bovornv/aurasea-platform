-- Accommodation profitability signal (PostgREST-safe columns; no staff_cost).
-- daily_cost = (SUM(additional_cost_today over trailing 30 days ending latest metric_date) + monthly_fixed_cost) / 30
-- occupancy = rooms_sold / rooms_available, adr = revenue / rooms_sold, revpar = revenue / rooms_available
-- profit = revenue - daily_cost, profit_margin = profit / NULLIF(daily_cost, 0)
--
-- Run after accommodation_daily_metrics exists. If branch_performance_signal / branch_business_status
-- depend on this view, re-run add-branch-performance-signal-and-business-status.sql after this file.

DROP VIEW IF EXISTS public.accommodation_profitability_signal CASCADE;

CREATE VIEW public.accommodation_profitability_signal AS
WITH latest AS (
  SELECT DISTINCT ON (branch_id)
    branch_id,
    metric_date::date AS metric_date,
    COALESCE(revenue, 0)::numeric AS revenue,
    COALESCE(rooms_sold, 0)::integer AS rooms_sold,
    COALESCE(rooms_available, 0)::integer AS rooms_available,
    COALESCE(additional_cost_today, 0)::numeric AS additional_cost_today,
    COALESCE(monthly_fixed_cost, 0)::numeric AS monthly_fixed_cost
  FROM public.accommodation_daily_metrics
  ORDER BY branch_id, metric_date DESC NULLS LAST
),
agg30 AS (
  SELECT
    d.branch_id,
    SUM(COALESCE(d.additional_cost_today, 0)::numeric) AS additional_cost_30d
  FROM public.accommodation_daily_metrics d
  INNER JOIN latest l ON l.branch_id = d.branch_id
  WHERE d.metric_date::date >= (l.metric_date - INTERVAL '29 days')
    AND d.metric_date::date <= l.metric_date
  GROUP BY d.branch_id
),
prev_row AS (
  SELECT DISTINCT ON (d.branch_id)
    d.branch_id,
    COALESCE(d.revenue, 0)::numeric AS prev_revenue
  FROM public.accommodation_daily_metrics d
  INNER JOIN latest l ON l.branch_id = d.branch_id
  WHERE d.metric_date::date < l.metric_date
  ORDER BY d.branch_id, d.metric_date DESC NULLS LAST
),
calc AS (
  SELECT
    l.branch_id,
    l.metric_date,
    l.revenue,
    l.rooms_sold,
    l.rooms_available,
    COALESCE(a.additional_cost_30d, 0)::numeric AS additional_cost_30d,
    l.monthly_fixed_cost,
    (
      COALESCE(a.additional_cost_30d, 0)::numeric + l.monthly_fixed_cost
    ) / 30.0::numeric AS daily_cost,
    p.prev_revenue AS prev_revenue
  FROM latest l
  LEFT JOIN agg30 a ON a.branch_id = l.branch_id
  LEFT JOIN prev_row p ON p.branch_id = l.branch_id
)
SELECT
  c.branch_id::text AS branch_id,
  c.metric_date,
  c.revenue,
  CASE
    WHEN c.rooms_available > 0 AND c.rooms_sold >= 0
      THEN (c.rooms_sold::numeric / NULLIF(c.rooms_available::numeric, 0))::numeric
    ELSE NULL::numeric
  END AS occupancy_rate,
  CASE
    WHEN c.rooms_sold > 0
      THEN (c.revenue / NULLIF(c.rooms_sold::numeric, 0))::numeric
    ELSE NULL::numeric
  END AS adr,
  CASE
    WHEN c.rooms_available > 0
      THEN (c.revenue / NULLIF(c.rooms_available::numeric, 0))::numeric
    ELSE NULL::numeric
  END AS revpar,
  c.additional_cost_30d,
  c.daily_cost,
  (c.revenue - c.daily_cost)::numeric AS profit,
  CASE
    WHEN c.daily_cost > 0::numeric
      THEN ((c.revenue - c.daily_cost) / c.daily_cost)::numeric
    ELSE NULL::numeric
  END AS profit_margin,
  CASE
    WHEN c.prev_revenue IS NULL THEN NULL::text
    WHEN (c.revenue - c.daily_cost) > (COALESCE(c.prev_revenue, 0) - c.daily_cost) + 0.01::numeric
      THEN 'up'::text
    WHEN (c.revenue - c.daily_cost) < (COALESCE(c.prev_revenue, 0) - c.daily_cost) - 0.01::numeric
      THEN 'down'::text
    ELSE 'flat'::text
  END AS profitability_trend,
  CASE
    WHEN c.daily_cost <= 0::numeric THEN
      'Insufficient cost basis (set additional_cost_today and/or monthly_fixed_cost).'::text
    WHEN c.rooms_sold <= 0 OR c.rooms_available <= 0 THEN
      'Profit vs blended daily cost; room KPIs incomplete for ADR/RevPAR.'::text
    ELSE
      format(
        'Blended daily cost ฿%s (30d variable + monthly fixed); profit ฿%s; margin vs cost %s%%.',
        round(c.daily_cost, 0)::text,
        round(c.revenue - c.daily_cost, 0)::text,
        CASE
          WHEN c.daily_cost > 0::numeric
            THEN round(((c.revenue - c.daily_cost) / c.daily_cost) * 100.0, 1)::text
          ELSE '—'
        END
      )
  END AS profitability_explanation
FROM calc c;

COMMENT ON VIEW public.accommodation_profitability_signal IS
  'Latest accommodation row: ADR/revpar/occupancy from revenue & rooms; daily_cost = (sum additional 30d + monthly_fixed) / 30; profit vs prior day (same cost basis) drives trend.';

GRANT SELECT ON public.accommodation_profitability_signal TO anon, authenticated;
