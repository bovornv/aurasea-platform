-- =============================================================================
-- Today's Priorities: single-source architecture
-- =============================================================================
-- Single API source:
--   public.today_priorities_view  →  SELECT * FROM public.today_priorities_ranked
--
-- Legacy views removed to avoid duplication/confusion:
--   today_priorities, today_priorities_clean, today_branch_priorities (and any old today_priorities_view)
--
-- Source of truth is today_summary_clean (+ branches) only.
-- If there are no triggered insights, the view returns 0 rows and the UI shows empty state
-- (no hardcoded/generic suggestions).
--
-- Output: title (impact inline), description, sort_score, rank, impact_thb, impact_label, metric_date.
-- Dedup: one row per (branch_id, problem_type), strongest by impact_thb desc.
--
-- Branch: GET /rest/v1/today_priorities_view?branch_id=eq.{uuid}&business_type=eq.{type}
--        &order=sort_score.desc&limit=4
-- =============================================================================

DROP VIEW IF EXISTS public.today_priorities_view CASCADE;
DROP VIEW IF EXISTS public.today_priorities_ranked CASCADE;
DROP VIEW IF EXISTS public.today_branch_priorities CASCADE;
DROP VIEW IF EXISTS public.today_priorities_clean CASCADE;
DROP VIEW IF EXISTS public.today_priorities CASCADE;

DO $$
DECLARE
  src text;
BEGIN
  IF to_regclass('public.today_summary_clean') IS NOT NULL THEN
    src := 'public.today_summary_clean';
  ELSE
    src := NULL;
  END IF;

  IF src IS NULL THEN
    EXECUTE $empty$
CREATE VIEW public.today_priorities_ranked AS
SELECT *
FROM (
  VALUES (
    NULL::uuid, NULL::uuid, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text,
    NULL::numeric, NULL::integer, NULL::text, NULL::date, NULL::numeric
  )
) AS v(
  organization_id, branch_id, branch_name, business_type,
  alert_type, title, description,
  sort_score, rank, impact_label, metric_date, impact_thb
)
WHERE false
$empty$;
    RAISE NOTICE 'today_priorities_ranked: today_summary_clean missing (empty view).';
  ELSE
    EXECUTE $ts$
CREATE VIEW public.today_priorities_ranked AS
WITH base AS (
  SELECT
    t.branch_id::uuid AS branch_id,
    t.metric_date::date AS metric_date,
    jb.jb AS j,
    COALESCE(b.organization_id::uuid, NULLIF(TRIM(BOTH FROM jb.jb->>'organization_id'), '')::uuid) AS organization_id,
    COALESCE(NULLIF(TRIM(BOTH FROM b.branch_name), ''), NULLIF(TRIM(BOTH FROM b.name), ''), NULLIF(TRIM(BOTH FROM jb.jb->>'branch_name'), '')) AS branch_name,
    CASE
      WHEN LOWER(COALESCE(b.module_type::text, '')) IN ('fnb','restaurant','cafe','cafe_restaurant') THEN 'fnb'::text
      ELSE 'accommodation'::text
    END AS business_type
  FROM public.today_summary_clean t
  CROSS JOIN LATERAL (SELECT to_jsonb(t) AS jb) jb
  LEFT JOIN public.branches b ON trim(both FROM b.id::text) = trim(both FROM t.branch_id::text)
  WHERE t.branch_id IS NOT NULL
),
signals AS (
  SELECT
    organization_id,
    branch_id,
    branch_name,
    metric_date,
    business_type,
    COALESCE(NULLIF(TRIM(BOTH FROM j->>'revenue_delta_day'), '')::numeric, NULL::numeric) AS revenue_delta_day,
    COALESCE(NULLIF(TRIM(BOTH FROM j->>'occupancy_delta_week'), '')::numeric, NULL::numeric) AS occupancy_delta_week,
    COALESCE(NULLIF(TRIM(BOTH FROM j->>'occupancy_rate'), '')::numeric, NULL::numeric) AS occupancy_rate,
    COALESCE(NULLIF(TRIM(BOTH FROM j->>'adr'), '')::numeric, NULL::numeric) AS adr,
    COALESCE(NULLIF(TRIM(BOTH FROM j->>'revpar'), '')::numeric, NULL::numeric) AS revpar,
    COALESCE(NULLIF(TRIM(BOTH FROM j->>'customers'), '')::numeric, NULLIF(TRIM(BOTH FROM j->>'total_customers'), '')::numeric, NULL::numeric) AS customers,
    COALESCE(
      NULLIF(TRIM(BOTH FROM j->>'total_revenue'), '')::numeric,
      NULLIF(TRIM(BOTH FROM j->>'revenue'), '')::numeric,
      NULLIF(TRIM(BOTH FROM j->>'accommodation_revenue'), '')::numeric,
      NULLIF(TRIM(BOTH FROM j->>'total_revenue_thb'), '')::numeric,
      NULLIF(TRIM(BOTH FROM j->>'revenue_thb'), '')::numeric,
      0::numeric
    ) AS revenue_thb
  FROM base
),
raw AS (
  SELECT
    s.organization_id,
    s.branch_id,
    s.branch_name,
    s.metric_date,
    'Revenue Drop'::text AS alert_type_raw,
    s.revenue_delta_day AS delta_pct,
    s.revenue_thb AS revenue_thb,
    s.business_type AS business_type
  FROM signals s
  WHERE s.revenue_delta_day IS NOT NULL AND s.revenue_delta_day <= -10
  UNION ALL
  SELECT
    s.organization_id,
    s.branch_id,
    s.branch_name,
    s.metric_date,
    'Low Occupancy'::text AS alert_type_raw,
    s.occupancy_delta_week AS delta_pct,
    s.revenue_thb AS revenue_thb,
    s.business_type AS business_type
  FROM signals s
  WHERE s.business_type = 'accommodation'
    AND s.occupancy_delta_week IS NOT NULL
    AND s.occupancy_delta_week <= -10
  UNION ALL
  SELECT
    s.organization_id,
    s.branch_id,
    s.branch_name,
    s.metric_date,
    'Occupancy low (level)'::text AS alert_type_raw,
    NULL::numeric AS delta_pct,
    s.revenue_thb AS revenue_thb,
    s.business_type AS business_type
  FROM signals s
  WHERE s.business_type = 'accommodation'
    AND s.occupancy_rate IS NOT NULL
    AND s.occupancy_rate < 60
  UNION ALL
  SELECT
    s.organization_id,
    s.branch_id,
    s.branch_name,
    s.metric_date,
    'ADR under pressure'::text AS alert_type_raw,
    NULL::numeric AS delta_pct,
    s.revenue_thb AS revenue_thb,
    s.business_type AS business_type
  FROM signals s
  WHERE s.business_type = 'accommodation'
    AND s.adr IS NOT NULL
    AND s.revpar IS NOT NULL
    AND s.revpar > s.adr * 0.6
  UNION ALL
  SELECT
    s.organization_id,
    s.branch_id,
    s.branch_name,
    s.metric_date,
    'Customer traffic low (level)'::text AS alert_type_raw,
    NULL::numeric AS delta_pct,
    s.revenue_thb AS revenue_thb,
    s.business_type AS business_type
  FROM signals s
  WHERE s.business_type = 'fnb'
    AND s.customers IS NOT NULL
    AND s.customers < 20
),
enriched AS (
  SELECT
    r.organization_id,
    r.branch_id AS branch_id,
    r.branch_name,
    r.alert_type_raw AS alert_type,
    (
      CASE
        WHEN r.alert_type_raw IN ('Low Occupancy'::text, 'Occupancy low (level)'::text) THEN 'occupancy'::text
        WHEN r.alert_type_raw = 'Revenue Drop'::text THEN 'revenue_drop'::text
        WHEN r.alert_type_raw = 'ADR under pressure'::text THEN 'adr_pressure'::text
        WHEN r.alert_type_raw = 'Customer traffic low (level)'::text THEN 'fnb_traffic'::text
        ELSE regexp_replace(lower(r.alert_type_raw), '[[:space:]]+'::text, '_'::text, 'g'::text)
      END
    ) AS problem_type,
    (
      CASE
        WHEN NULLIF(TRIM(BOTH FROM r.branch_name), '') IS NOT NULL THEN
          TRIM(BOTH FROM REPLACE(r.alert_type_raw, '_'::text, ' '::text))
          || ' — '::text
          || TRIM(BOTH FROM r.branch_name)
        ELSE NULLIF(TRIM(BOTH FROM REPLACE(r.alert_type_raw, '_'::text, ' '::text)), ''::text)
      END
    ) AS title_base,
    (
      CASE
        WHEN r.alert_type_raw = 'Revenue Drop' THEN
          'Revenue is down vs yesterday. Check pricing, channel mix, and packages; log context in Enter Data.'::text
        WHEN r.alert_type_raw = 'Low Occupancy' THEN
          'Occupancy is down vs last week. Review rate fences, packages, and availability; validate in Trends.'::text
        WHEN r.alert_type_raw = 'Occupancy low (level)' THEN
          'Occupancy level is low today. Consider OTA boosts, last-minute packages, and pricing fences.'::text
        WHEN r.alert_type_raw = 'ADR under pressure' THEN
          'ADR looks soft vs RevPAR signal. Review discounting, room mix, and channel leakage.'::text
        WHEN r.alert_type_raw = 'Customer traffic low (level)' THEN
          'Customer count is low today. Review promos, operating hours, and top-sellers; validate in Trends.'::text
        ELSE 'Review today signals in Trends and log context in Enter Data.'::text
      END
    ) AS description,
    (
      CASE
        WHEN r.alert_type_raw = 'Revenue Drop'::text
          AND COALESCE(r.revenue_thb, 0::numeric) > 0::numeric
          AND r.delta_pct IS NOT NULL THEN
          GREATEST(
            round(r.revenue_thb * LEAST(0.35::numeric, abs(r.delta_pct) / 100.0 * 0.45)),
            1000::numeric
          )
        WHEN r.alert_type_raw IN ('Low Occupancy'::text, 'Occupancy low (level)'::text)
          AND COALESCE(r.revenue_thb, 0::numeric) > 0::numeric THEN
          GREATEST(round(r.revenue_thb * 0.08), 500::numeric)
        WHEN r.alert_type_raw = 'ADR under pressure'::text
          AND COALESCE(r.revenue_thb, 0::numeric) > 0::numeric THEN
          GREATEST(round(r.revenue_thb * 0.04), 500::numeric)
        WHEN r.alert_type_raw = 'Customer traffic low (level)'::text
          AND COALESCE(r.revenue_thb, 0::numeric) > 0::numeric THEN
          GREATEST(round(r.revenue_thb * 0.06), 300::numeric)
        WHEN COALESCE(r.revenue_thb, 0::numeric) > 0::numeric THEN
          GREATEST(round(r.revenue_thb * 0.03), 300::numeric)
        ELSE NULL::numeric
      END
    ) AS impact_thb,
    'at risk'::text AS impact_label,
    (
      COALESCE(
        CASE
          WHEN r.delta_pct IS NOT NULL THEN abs(r.delta_pct) * 100::numeric
          ELSE NULL::numeric
        END,
        2000::numeric
      )
      + COALESCE(r.revenue_thb, 0)::numeric / 1000000::numeric
      + ((abs(hashtext(COALESCE(r.branch_id::text, '') || r.alert_type_raw)))::numeric % 1000000::numeric)
        / 1000000000::numeric
    ) AS sort_score,
    r.business_type,
    r.metric_date
  FROM raw r
),
dedup AS (
  SELECT
    e.*,
    ROW_NUMBER() OVER (
      PARTITION BY e.branch_id, e.problem_type
      ORDER BY e.impact_thb DESC NULLS LAST, e.sort_score DESC NULLS LAST, e.alert_type
    ) AS dedup_rn
  FROM enriched e
),
picked AS (
  SELECT * FROM dedup WHERE dedup_rn = 1
)
SELECT
  p.organization_id AS organization_id,
  p.branch_id AS branch_id,
  p.branch_name AS branch_name,
  p.business_type AS business_type,
  p.alert_type AS alert_type,
  trim(
    BOTH
    FROM
      p.title_base
      || CASE
           WHEN p.impact_thb IS NOT NULL THEN
             ' (฿'::text || trim(BOTH FROM to_char(round(p.impact_thb), 'FM999,999,999,999'::text)) || ')'::text
           ELSE ''::text
         END
  ) AS title,
  p.description AS description,
  (COALESCE(p.impact_thb, 0::numeric) * 1000000000000::numeric + p.sort_score) AS sort_score,
  ROW_NUMBER() OVER (
    PARTITION BY p.branch_id, p.business_type
    ORDER BY COALESCE(p.impact_thb, 0::numeric) DESC, p.sort_score DESC NULLS LAST, p.alert_type
  )::integer AS rank,
  p.impact_label AS impact_label,
  p.metric_date AS metric_date,
  p.impact_thb AS impact_thb
FROM picked p
$ts$;
    RAISE NOTICE 'today_priorities_ranked: using source today_summary_clean';
  END IF;
END $$;

COMMENT ON VIEW public.today_priorities_ranked IS
  'Single source of truth for priorities: branch-ranked, business-specific insights derived from today_summary_clean.';

GRANT SELECT ON public.today_priorities_ranked TO anon, authenticated;

CREATE VIEW public.today_priorities_view AS
SELECT
  r.organization_id AS organization_id,
  r.branch_id AS branch_id,
  r.branch_name AS branch_name,
  r.business_type AS business_type,
  r.alert_type AS alert_type,
  r.title AS title,
  r.description AS description,
  r.sort_score AS sort_score,
  r.rank AS rank,
  r.impact_label AS impact_label,
  r.metric_date AS metric_date,
  r.impact_thb AS impact_thb,
  r.impact_thb AS impact_estimate_thb
FROM public.today_priorities_ranked r;

COMMENT ON VIEW public.today_priorities_view IS
  'Single priorities API view; filter branch_id, order=sort_score.desc, limit=4 for first + next moves.';

GRANT SELECT ON public.today_priorities_view TO anon, authenticated;
