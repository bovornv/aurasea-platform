-- Company Today — opportunities (metrics-only; public.today_summary + public.branches)
-- Canonical body: rebuild-alerts-enriched-engine.sql STEP 6e.
-- Contract: organization_id, branch_id, branch_name, metric_date, title, description, opportunity_text, sort_score
-- DROP + CREATE avoids 42P16 when column order drifts vs CREATE OR REPLACE.

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
      WHEN LOWER(COALESCE(
        b.module_type::text,
        TRIM(j.jb->>'module_type'),
        TRIM(j.jb->>'business_type'),
        ''
      )) IN (
        'accommodation', 'hotel', 'hotel_resort', 'rooms', 'hotel_with_cafe'
      ) THEN 'accommodation'::text
      WHEN LOWER(COALESCE(
        b.module_type::text,
        TRIM(j.jb->>'module_type'),
        TRIM(j.jb->>'business_type'),
        ''
      )) IN (
        'fnb', 'restaurant', 'cafe', 'cafe_restaurant'
      ) THEN 'fnb'::text
      ELSE COALESCE(
        NULLIF(LOWER(TRIM(COALESCE(b.module_type::text, TRIM(j.jb->>'module_type'), ''))), ''),
        'unknown'
      )::text
    END AS branch_type
  FROM public.today_summary t
  CROSS JOIN LATERAL (SELECT row_to_json(t)::jsonb AS jb) j
  LEFT JOIN public.branches b ON b.id::text = TRIM(BOTH FROM t.branch_id::text)
  WHERE b.organization_id IS NOT NULL
),
daily AS (
  SELECT
    d.organization_id,
    d.branch_id,
    d.branch_name,
    d.branch_type,
    d.metric_date,
    COALESCE(NULLIF(TRIM(d.j->>'revenue_delta_day'), '')::numeric, NULL::numeric) AS revenue_delta_day,
    COALESCE(
      NULLIF(TRIM(d.j->>'occupancy_rate'), '')::numeric,
      CASE
        WHEN NULLIF(TRIM(COALESCE(d.j->>'rooms_available', d.j->>'capacity', '')), '')::numeric > 0::numeric
        THEN (
          COALESCE(
            NULLIF(TRIM(COALESCE(d.j->>'utilized', d.j->>'rooms_sold', '')), '')::numeric,
            0::numeric
          )
          / NULLIF(TRIM(COALESCE(d.j->>'rooms_available', d.j->>'capacity', '')), '')::numeric
        ) * 100::numeric
        ELSE NULL::numeric
      END
    ) AS occ_pct,
    COALESCE(NULLIF(TRIM(d.j->>'occupancy_delta_week'), '')::numeric, NULL::numeric) AS occupancy_delta_week
  FROM base d
),
signals AS (
  SELECT
    d.organization_id,
    d.branch_id,
    d.branch_name,
    d.metric_date,
    (
      CASE
        WHEN d.branch_type = 'accommodation'
          AND EXTRACT(ISODOW FROM d.metric_date::timestamp) >= 5 THEN
          'Weekend yield package window'::text
        WHEN d.branch_type = 'accommodation' THEN
          'Accommodation revenue momentum'::text
        WHEN d.branch_type = 'fnb' THEN
          'F&B revenue momentum'::text
        ELSE
          'Revenue momentum'::text
      END
    ) AS title,
    (
      'Branch: '
      || COALESCE(
        NULLIF(TRIM(BOTH FROM d.branch_name::text), ''),
        TRIM(BOTH FROM d.branch_id::text)
      )
    )::text AS description,
    (
      CASE
        WHEN d.branch_type = 'accommodation'
          AND EXTRACT(ISODOW FROM d.metric_date::timestamp) >= 5 THEN
          'Weekend booking pace looks firm — test a fenced package, room-type ladder, and RevPAR yield before '
          || 'widening discounts.'::text
        WHEN d.branch_type = 'accommodation' THEN
          'Accommodation revenue is outpacing recent nights — nudge ADR, room mix, and booking pace while '
          || 'demand holds.'::text
        WHEN d.branch_type = 'fnb' THEN
          'F&B revenue is up versus recent days — lift average ticket with bundles, add-ons, and sharper '
          || 'conversion on the same traffic.'::text
        ELSE
          'Top-line revenue is ahead of recent days — validate price vs mix before adding cost or labor.'::text
      END
    ) AS opportunity_text,
    LEAST(
      82::numeric,
      68::numeric
      + (
        (LEAST(ABS(COALESCE(d.revenue_delta_day, 0::numeric)), 100::numeric) - 10::numeric)
        / 90::numeric
        * 14::numeric
      )
    ) AS sort_score
  FROM daily d
  WHERE d.revenue_delta_day IS NOT NULL
    AND d.revenue_delta_day >= 10::numeric
    AND d.revenue_delta_day <= 100::numeric

  UNION ALL

  SELECT
    d.organization_id,
    d.branch_id,
    d.branch_name,
    d.metric_date,
    'Occupancy building week-on-week'::text AS title,
    (
      'Branch: '
      || COALESCE(
        NULLIF(TRIM(BOTH FROM d.branch_name::text), ''),
        TRIM(BOTH FROM d.branch_id::text)
      )
    )::text AS description,
    (
      'Same-week occupancy is climbing versus last week — tighten ADR and package structure while rooms sold '
      || 'and booking pace improve.'::text
    ) AS opportunity_text,
    LEAST(
      80::numeric,
      64::numeric
      + (
        LEAST(COALESCE(d.occupancy_delta_week, 0::numeric), 40::numeric)
        / 40::numeric
        * 18::numeric
      )
    ) AS sort_score
  FROM daily d
  WHERE d.branch_type = 'accommodation'
    AND d.occupancy_delta_week IS NOT NULL
    AND d.occupancy_delta_week >= 5::numeric
    AND d.occupancy_delta_week <= 100::numeric

  UNION ALL

  SELECT
    d.organization_id,
    d.branch_id,
    d.branch_name,
    d.metric_date,
    'Lift ADR at firm occupancy'::text AS title,
    (
      'Branch: '
      || COALESCE(
        NULLIF(TRIM(BOTH FROM d.branch_name::text), ''),
        TRIM(BOTH FROM d.branch_id::text)
      )
    )::text AS description,
    (
      'Occupancy is elevated — protect rate integrity, ladder premium room types, and test yield to lift RevPAR '
      || 'without volume-led discounting.'::text
    ) AS opportunity_text,
    LEAST(
      78::numeric,
      62::numeric
      + (
        LEAST(
          GREATEST(COALESCE(d.occ_pct, 0::numeric) - 68::numeric, 0::numeric)
          / NULLIF(100::numeric - 68::numeric, 0::numeric),
          1::numeric
        )
        * 20::numeric
      )
    ) AS sort_score
  FROM daily d
  WHERE d.branch_type = 'accommodation'
    AND d.occ_pct IS NOT NULL
    AND d.occ_pct >= 68::numeric
    AND (d.revenue_delta_day IS NULL OR d.revenue_delta_day < 10::numeric)

  UNION ALL

  SELECT
    d.organization_id,
    d.branch_id,
    d.branch_name,
    d.metric_date,
    'Weekend room + dining bundle'::text AS title,
    (
      'Branch: '
      || COALESCE(
        NULLIF(TRIM(BOTH FROM d.branch_name::text), ''),
        TRIM(BOTH FROM d.branch_id::text)
      )
    )::text AS description,
    (
      'Weekend nights show healthy occupancy — bundle premium room with a dining credit to capture '
      || 'willingness-to-pay and lift blended RevPAR.'::text
    ) AS opportunity_text,
    LEAST(
      76::numeric,
      58::numeric
      + (
        LEAST(
          GREATEST(COALESCE(d.occ_pct, 0::numeric) - 52::numeric, 0::numeric)
          / NULLIF(100::numeric - 52::numeric, 0::numeric),
          1::numeric
        )
        * 18::numeric
      )
    ) AS sort_score
  FROM daily d
  WHERE d.branch_type = 'accommodation'
    AND EXTRACT(ISODOW FROM d.metric_date::timestamp) >= 5
    AND d.occ_pct IS NOT NULL
    AND d.occ_pct >= 52::numeric
    AND (d.revenue_delta_day IS NULL OR d.revenue_delta_day < 10::numeric)
),
best_signal AS (
  SELECT DISTINCT ON (s.branch_id, s.metric_date)
    s.organization_id,
    s.branch_id,
    s.branch_name,
    s.metric_date,
    s.title,
    s.description,
    s.opportunity_text,
    s.sort_score
  FROM signals s
  ORDER BY
    s.branch_id,
    s.metric_date,
    s.sort_score DESC NULLS LAST,
    s.title ASC
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
FROM best_signal b;

COMMENT ON VIEW public.opportunities_today IS
  'today_summary + branches: best opportunity per (branch_id, metric_date); Branch: label; bounded sort_score 58–82.';

GRANT SELECT ON public.opportunities_today TO anon, authenticated;
