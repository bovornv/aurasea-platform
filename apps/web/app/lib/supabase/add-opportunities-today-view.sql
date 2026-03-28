-- Company Today — opportunities (metrics-only; one row per branch when a signal fires)
-- Canonical body: rebuild-alerts-enriched-engine.sql STEP 6e.
-- Contract: organization_id, branch_id, branch_name, metric_date, title, description, opportunity_text, sort_score
DROP VIEW IF EXISTS public.opportunities_today CASCADE;

CREATE VIEW public.opportunities_today AS
WITH base AS (
  SELECT
    t.branch_id::uuid AS branch_id,
    t.metric_date::date AS metric_date,
    j.jb AS j,
    b.organization_id::uuid AS organization_id,
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
  FROM public.today_summary t
  CROSS JOIN LATERAL (SELECT row_to_json(t)::jsonb AS jb) j
  LEFT JOIN public.branches b ON b.id::text = TRIM(BOTH FROM t.branch_id::text)
  WHERE b.organization_id IS NOT NULL
),
latest AS (
  SELECT DISTINCT ON (branch_id)
    organization_id,
    branch_id,
    branch_name,
    branch_type,
    metric_date,
    COALESCE(NULLIF(TRIM(j->>'revenue_delta_day'), '')::numeric, NULL::numeric) AS revenue_delta_day,
    COALESCE(
      NULLIF(TRIM(j->>'total_revenue'), '')::numeric,
      NULLIF(TRIM(j->>'revenue'), '')::numeric,
      NULLIF(TRIM(j->>'total_revenue_thb'), '')::numeric,
      NULLIF(TRIM(j->>'revenue_thb'), '')::numeric,
      0::numeric
    ) AS revenue_thb,
    COALESCE(
      NULLIF(TRIM(j->>'occupancy_rate'), '')::numeric,
      CASE
        WHEN NULLIF(TRIM(COALESCE(j->>'rooms_available', j->>'capacity', '')), '')::numeric > 0::numeric
        THEN (
          COALESCE(
            NULLIF(TRIM(COALESCE(j->>'utilized', j->>'rooms_sold', '')), '')::numeric,
            0::numeric
          )
          / NULLIF(TRIM(COALESCE(j->>'rooms_available', j->>'capacity', '')), '')::numeric
        ) * 100::numeric
        ELSE NULL::numeric
      END
    ) AS occ_pct,
    COALESCE(NULLIF(TRIM(j->>'occupancy_delta_week'), '')::numeric, NULL::numeric) AS occupancy_delta_week
  FROM base
  ORDER BY branch_id, metric_date DESC NULLS LAST
),
signals AS (
  SELECT
    l.organization_id,
    l.branch_id,
    l.branch_name,
    l.metric_date,
    (
      CASE
        WHEN l.branch_type = 'accommodation'
          AND EXTRACT(ISODOW FROM l.metric_date::timestamp) >= 5 THEN
          'Add a weekend package'::text
        WHEN l.branch_type = 'fnb' THEN
          'Increase avg ticket'::text
        ELSE
          'Raise price slightly'::text
      END
    ) AS title,
    ('Branch: ' || l.branch_name)::text AS description,
    (
      CASE
        WHEN l.branch_type = 'accommodation'
          AND EXTRACT(ISODOW FROM l.metric_date::timestamp) >= 5 THEN
          'Strong weekend demand — add a fenced package or rate ladder at ' || l.branch_name || ' to capture upside without broad discounting.'
        WHEN l.branch_type = 'fnb' THEN
          'Customer traffic is rising — increase average ticket with bundles, add-ons, and suggestive selling at ' || l.branch_name || '.'
        ELSE
          'Demand looks healthy — test a small price or mix uplift at ' || l.branch_name || ' while monitoring conversion.'
      END
    ) AS opportunity_text,
    (
      150::numeric
      + COALESCE(l.revenue_thb, 0)::numeric / 2000::numeric
      + ((abs(hashtext(COALESCE(l.branch_id::text, '') || COALESCE(l.branch_name, ''))))::numeric % 1000000::numeric) / 1000000000::numeric
    ) AS sort_score
  FROM latest l
  WHERE l.revenue_delta_day IS NOT NULL
    AND l.revenue_delta_day >= 10

  UNION ALL

  SELECT
    l.organization_id,
    l.branch_id,
    l.branch_name,
    l.metric_date,
    'Capture rising occupancy'::text AS title,
    ('Branch: ' || l.branch_name)::text AS description,
    (
      'Week-on-week occupancy is improving at '
      || l.branch_name
      || ' — prioritize ADR/package upsells and in-house F&B conversion while demand is building.'
    )::text AS opportunity_text,
    (
      145::numeric
      + LEAST(COALESCE(l.occupancy_delta_week, 0::numeric), 25::numeric) * 1.5::numeric
      + COALESCE(l.revenue_thb, 0)::numeric / 2500::numeric
    ) AS sort_score
  FROM latest l
  WHERE l.branch_type = 'accommodation'
    AND l.occupancy_delta_week IS NOT NULL
    AND l.occupancy_delta_week >= 5::numeric

  UNION ALL

  SELECT
    l.organization_id,
    l.branch_id,
    l.branch_name,
    l.metric_date,
    'Lift ADR on strong occupancy'::text AS title,
    ('Branch: ' || l.branch_name)::text AS description,
    (
      'Occupancy is elevated at '
      || l.branch_name
      || ' — protect rate integrity, promote premium room types, and attach F&B experiences to lift RevPAR.'
    )::text AS opportunity_text,
    (
      138::numeric
      + COALESCE(l.occ_pct, 0::numeric) / 4::numeric
      + COALESCE(l.revenue_thb, 0)::numeric / 3000::numeric
    ) AS sort_score
  FROM latest l
  WHERE l.branch_type = 'accommodation'
    AND l.occ_pct IS NOT NULL
    AND l.occ_pct >= 68::numeric
    AND (l.revenue_delta_day IS NULL OR l.revenue_delta_day < 10::numeric)

  UNION ALL

  SELECT
    l.organization_id,
    l.branch_id,
    l.branch_name,
    l.metric_date,
    'Add a weekend package'::text AS title,
    ('Branch: ' || l.branch_name)::text AS description,
    (
      'Weekend nights are active at '
      || l.branch_name
      || ' with healthy occupancy — package premium room + F&B to capture willingness-to-pay.'
    )::text AS opportunity_text,
    (
      132::numeric
      + COALESCE(l.occ_pct, 0::numeric) / 5::numeric
    ) AS sort_score
  FROM latest l
  WHERE l.branch_type = 'accommodation'
    AND EXTRACT(ISODOW FROM l.metric_date::timestamp) >= 5
    AND l.occ_pct IS NOT NULL
    AND l.occ_pct >= 52::numeric
    AND (l.revenue_delta_day IS NULL OR l.revenue_delta_day < 10::numeric)
),
best_per_branch AS (
  SELECT DISTINCT ON (s.branch_id)
    s.organization_id,
    s.branch_id,
    s.branch_name,
    s.metric_date,
    s.title,
    s.description,
    s.opportunity_text,
    s.sort_score
  FROM signals s
  ORDER BY s.branch_id, s.sort_score DESC NULLS LAST, s.metric_date DESC NULLS LAST
)
SELECT
  b.organization_id,
  b.branch_id,
  b.branch_name,
  b.metric_date,
  b.title,
  b.description,
  b.opportunity_text,
  b.sort_score
FROM best_per_branch b;

COMMENT ON VIEW public.opportunities_today IS
  'Opportunity-style signals only; one row per branch (best score); accommodation uses occupancy deltas / occupancy %, not only revenue_delta_day.';

GRANT SELECT ON public.opportunities_today TO anon, authenticated;
