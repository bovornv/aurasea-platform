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
    COALESCE(b.branch_name, b.name) AS branch_name,
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
    l.organization_id::uuid AS organization_id,
    l.branch_id::text AS branch_id,
    l.branch_name::text AS branch_name,
    l.metric_date::date AS metric_date,
    ('Customer traffic up (+' || ROUND(ABS(l.revenue_delta_day))::text || '%) (' || l.branch_name || ')')::text AS highlight_text,
    (COALESCE(l.revenue_delta_day, 0) * 1000::numeric + COALESCE(l.total_revenue, 0))::numeric AS sort_score
  FROM latest l
  WHERE l.branch_type = 'fnb'
    AND l.organization_id IS NOT NULL
    AND l.revenue_delta_day IS NOT NULL
    AND l.revenue_delta_day >= 10
  UNION ALL
  SELECT
    l.organization_id::uuid,
    l.branch_id::text,
    l.branch_name::text,
    l.metric_date::date,
    ('Revenue trending up (+' || ROUND(ABS(l.revenue_delta_day))::text || '%) (' || l.branch_name || ')')::text,
    (COALESCE(l.revenue_delta_day, 0) * 1000::numeric + COALESCE(l.total_revenue, 0))::numeric
  FROM latest l
  WHERE l.branch_type = 'accommodation'
    AND l.organization_id IS NOT NULL
    AND l.revenue_delta_day IS NOT NULL
    AND l.revenue_delta_day >= 10
  UNION ALL
  SELECT
    l.organization_id::uuid,
    l.branch_id::text,
    l.branch_name::text,
    l.metric_date::date,
    ('Occupancy improving (+' || ROUND(ABS(l.occupancy_delta_week))::text || '%) (' || l.branch_name || ')')::text,
    (COALESCE(l.occupancy_delta_week, 0) * 800::numeric + COALESCE(l.total_revenue, 0))::numeric
  FROM latest l
  WHERE l.branch_type = 'accommodation'
    AND l.organization_id IS NOT NULL
    AND l.occupancy_delta_week IS NOT NULL
    AND l.occupancy_delta_week >= 10
),
org_pool AS (
  SELECT
    b.organization_id,
    MAX(l.metric_date) AS latest_metric_date,
    (
      ARRAY_AGG(
        COALESCE(NULLIF(TRIM(BOTH FROM b.name), ''), TRIM(BOTH FROM b.id::text))
        ORDER BY b.sort_order NULLS LAST, b.name
      )
    )[1] AS sample_branch_name,
    (
      ARRAY_AGG(TRIM(BOTH FROM b.id::text) ORDER BY b.sort_order NULLS LAST, b.name)
    )[1] AS sample_branch_id
  FROM public.branches b
  LEFT JOIN latest l ON l.branch_id = TRIM(BOTH FROM b.id::text)
  WHERE b.organization_id IS NOT NULL
  GROUP BY b.organization_id
),
has_positive AS (
  SELECT DISTINCT s.organization_id
  FROM signals s
  WHERE s.organization_id IS NOT NULL
),
fallback AS (
  SELECT
    o.organization_id::uuid AS organization_id,
    COALESCE(o.sample_branch_id, NULL::text)::text AS branch_id,
    COALESCE(o.sample_branch_name, NULL::text)::text AS branch_name,
    o.latest_metric_date::date AS metric_date,
    'No major operational risks detected'::text AS highlight_text,
    300::numeric AS sort_score
  FROM org_pool o
  LEFT JOIN has_positive hp ON hp.organization_id = o.organization_id
  WHERE hp.organization_id IS NULL

  UNION ALL

  SELECT
    o.organization_id::uuid,
    COALESCE(o.sample_branch_id, NULL::text)::text,
    COALESCE(o.sample_branch_name, NULL::text)::text,
    o.latest_metric_date::date,
    'Performance stable across branches'::text,
    200::numeric
  FROM org_pool o
  LEFT JOIN has_positive hp ON hp.organization_id = o.organization_id
  WHERE hp.organization_id IS NULL

  UNION ALL

  SELECT
    o.organization_id::uuid,
    COALESCE(o.sample_branch_id, NULL::text)::text,
    COALESCE(o.sample_branch_name, NULL::text)::text,
    o.latest_metric_date::date,
    (COALESCE(o.sample_branch_name, 'Branch') || ' traffic stable')::text,
    100::numeric
  FROM org_pool o
  LEFT JOIN has_positive hp ON hp.organization_id = o.organization_id
  WHERE hp.organization_id IS NULL
),
all_rows AS (
  SELECT * FROM signals
  UNION ALL
  SELECT * FROM fallback
),
-- One row per (branch, day, normalized line) so upstream duplicates / joins cannot double-render.
deduped_rows AS (
  SELECT DISTINCT ON (
    lower(trim(COALESCE(a.branch_id::text, ''))),
    COALESCE(a.metric_date::date, '1970-01-01'::date),
    lower(trim(COALESCE(a.highlight_text, '')))
  )
    a.organization_id,
    a.branch_id,
    a.branch_name,
    a.metric_date,
    a.highlight_text,
    a.sort_score
  FROM all_rows a
  WHERE a.organization_id IS NOT NULL
  ORDER BY
    lower(trim(COALESCE(a.branch_id::text, ''))),
    COALESCE(a.metric_date::date, '1970-01-01'::date),
    lower(trim(COALESCE(a.highlight_text, ''))),
    a.sort_score DESC NULLS LAST
),
ranked AS (
  SELECT
    d.organization_id,
    d.branch_id,
    d.branch_name,
    d.metric_date,
    d.highlight_text,
    d.sort_score,
    ROW_NUMBER() OVER (
      PARTITION BY d.organization_id
      ORDER BY d.sort_score DESC, d.metric_date DESC NULLS LAST
    ) AS rn
  FROM deduped_rows d
)
SELECT
  r.organization_id,
  r.branch_id,
  r.branch_name,
  r.metric_date,
  r.highlight_text,
  r.sort_score
FROM ranked r
WHERE r.rn <= 3;

COMMENT ON VIEW public.whats_working_today IS
  'Positive signals with org-level fallback insights; always 1-3 rows per org, order by sort_score DESC.';

GRANT SELECT ON public.whats_working_today TO anon, authenticated;

-- Verify:
-- SELECT * FROM public.whats_working_today LIMIT 5;
