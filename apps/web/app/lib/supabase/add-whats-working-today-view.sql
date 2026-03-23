-- Company Today — positive signals (balances priorities / problems)
-- GET /rest/v1/whats_working_today?select=*&organization_id=eq.{uuid}&order=sort_score.desc&limit=3
-- Requires: public.today_summary_clean, public.branches
--
-- Full WITH chain (run entire script): base → latest per branch → signals → final select
DROP VIEW IF EXISTS public.whats_working_today CASCADE;

CREATE VIEW public.whats_working_today AS
WITH base AS (
  SELECT
    t.branch_id::text AS branch_id,
    t.metric_date::date AS metric_date,
    COALESCE(t.total_revenue, 0)::numeric AS total_revenue,
    t.revenue_delta_day::numeric AS revenue_delta_day,
    t.occupancy_delta_week::numeric AS occupancy_delta_week,
    b.organization_id,
    b.name AS branch_name,
    CASE
      WHEN LOWER(COALESCE(b.module_type::text, '')) IN (
        'accommodation', 'hotel', 'hotel_resort', 'rooms', 'hotel_with_cafe'
      ) THEN 'accommodation'::text
      WHEN LOWER(COALESCE(b.module_type::text, '')) IN (
        'fnb', 'restaurant', 'cafe', 'cafe_restaurant'
      ) THEN 'fnb'::text
      ELSE COALESCE(LOWER(TRIM(b.module_type::text)), 'unknown')
    END AS branch_type
  FROM public.today_summary_clean t
  LEFT JOIN public.branches b ON b.id::text = TRIM(BOTH FROM t.branch_id::text)
),
latest AS (
  SELECT DISTINCT ON (branch_id)
    branch_id,
    metric_date,
    total_revenue,
    revenue_delta_day,
    occupancy_delta_week,
    organization_id,
    branch_name,
    branch_type
  FROM base
  ORDER BY branch_id, metric_date DESC NULLS LAST
),
signals AS (
  SELECT
    l.organization_id,
    l.branch_id,
    l.branch_name,
    l.metric_date,
    'Customer traffic up (+' || ROUND(ABS(l.revenue_delta_day))::text || '%) (' || l.branch_name || ')' AS highlight_text,
    (COALESCE(l.revenue_delta_day, 0) * 1000::numeric + COALESCE(l.total_revenue, 0)) AS sort_score
  FROM latest l
  WHERE l.branch_type = 'fnb'
    AND l.organization_id IS NOT NULL
    AND l.revenue_delta_day IS NOT NULL
    AND l.revenue_delta_day >= 10
  UNION ALL
  SELECT
    l.organization_id,
    l.branch_id,
    l.branch_name,
    l.metric_date,
    'Revenue trending up (+' || ROUND(ABS(l.revenue_delta_day))::text || '%) (' || l.branch_name || ')',
    (COALESCE(l.revenue_delta_day, 0) * 1000::numeric + COALESCE(l.total_revenue, 0))
  FROM latest l
  WHERE l.branch_type = 'accommodation'
    AND l.organization_id IS NOT NULL
    AND l.revenue_delta_day IS NOT NULL
    AND l.revenue_delta_day >= 10
  UNION ALL
  SELECT
    l.organization_id,
    l.branch_id,
    l.branch_name,
    l.metric_date,
    'Occupancy improving (+' || ROUND(ABS(l.occupancy_delta_week))::text || '%) (' || l.branch_name || ')',
    (COALESCE(l.occupancy_delta_week, 0) * 800::numeric + COALESCE(l.total_revenue, 0))
  FROM latest l
  WHERE l.branch_type = 'accommodation'
    AND l.organization_id IS NOT NULL
    AND l.occupancy_delta_week IS NOT NULL
    AND l.occupancy_delta_week >= 10
)
SELECT
  s.organization_id,
  s.branch_id,
  s.branch_name,
  s.metric_date,
  s.highlight_text,
  s.sort_score
FROM signals s;

COMMENT ON VIEW public.whats_working_today IS
  'Positive deltas from latest row per branch; order by sort_score DESC; highlight_text for UI bullets.';

GRANT SELECT ON public.whats_working_today TO anon, authenticated;

-- Verify:
-- SELECT * FROM public.whats_working_today LIMIT 5;
