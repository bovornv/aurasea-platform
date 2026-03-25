-- =============================================================================
-- Today's Priorities: stable schema (no required recommended_action / impact_estimate_thb)
-- =============================================================================
-- Alert source (first match):
--   1) public.today_summary_clean (preferred; no dependency on alerts pipeline)
--   2) public.alerts_today
--   3) public.branch_alerts_today
--   4) public.alerts_fix_this_first (last resort; may depend on alerts_enriched / today_summary_clean columns)
--   If none exist: empty view (app shows fallback priorities).
--
-- alert_type is read from to_jsonb(row) keys only (no f.alert_type column required):
--   alert_type, alertType, type, alert_name, alert_title, alert_kind, kind, name,
--   alert_message, alertMessage, message
-- branch_id from JSON: branch_id, branchId (falls back empty → row skipped).
-- Output: title, description, sort_score (+ legacy short_title, action_text).
--
-- Branch: GET /rest/v1/today_priorities_view?branch_id=eq.{uuid}&business_type=eq.{type}
--        &order=sort_score.desc&limit=3
-- =============================================================================

DROP VIEW IF EXISTS public.today_branch_priorities CASCADE;
DROP VIEW IF EXISTS public.today_priorities_view CASCADE;
DROP VIEW IF EXISTS public.today_priorities_clean CASCADE;
DROP VIEW IF EXISTS public.today_priorities CASCADE;

DO $$
DECLARE
  src text;
BEGIN
  IF to_regclass('public.today_summary_clean') IS NOT NULL THEN
    src := 'public.today_summary_clean';
  ELSIF to_regclass('public.alerts_today') IS NOT NULL THEN
    src := 'public.alerts_today';
  ELSIF to_regclass('public.branch_alerts_today') IS NOT NULL THEN
    src := 'public.branch_alerts_today';
  ELSIF to_regclass('public.alerts_fix_this_first') IS NOT NULL THEN
    src := 'public.alerts_fix_this_first';
  ELSE
    src := NULL;
  END IF;

  IF src IS NULL THEN
    EXECUTE $empty$
CREATE VIEW public.today_priorities_clean AS
SELECT *
FROM (
  VALUES (
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::numeric, NULL::text, NULL::text, NULL::numeric,
    NULL::integer, NULL::text, NULL::date
  )
) AS v(
  organization_id, branch_id, branch_name, alert_type,
  title, description, short_title, action_text,
  impact_estimate_thb, impact_label, reason_short, sort_score,
  rank, business_type, metric_date
)
WHERE false
$empty$;
    RAISE NOTICE 'today_priorities_clean: no alert source found (empty view). Run add-alerts-today-views.sql or rebuild-alerts-enriched-engine.sql.';
  ELSE
    IF src = 'public.today_summary_clean' THEN
      EXECUTE $ts$
CREATE VIEW public.today_priorities_clean AS
WITH base AS (
  SELECT
    t.branch_id::text AS branch_id,
    t.metric_date::date AS metric_date,
    jb.jb AS j,
    COALESCE(b.organization_id::text, NULLIF(TRIM(BOTH FROM jb.jb->>'organization_id'), '')) AS organization_id,
    COALESCE(NULLIF(TRIM(BOTH FROM b.branch_name), ''), NULLIF(TRIM(BOTH FROM b.name), ''), NULLIF(TRIM(BOTH FROM jb.jb->>'branch_name'), '')) AS branch_name
  FROM public.today_summary_clean t
  CROSS JOIN LATERAL (SELECT to_jsonb(t) AS jb) jb
  LEFT JOIN public.branches b ON b.id::text = t.branch_id::text
  WHERE t.branch_id IS NOT NULL
),
signals AS (
  SELECT
    organization_id,
    branch_id,
    branch_name,
    metric_date,
    COALESCE(NULLIF(TRIM(BOTH FROM j->>'revenue_delta_day'), '')::numeric, NULL::numeric) AS revenue_delta_day,
    COALESCE(NULLIF(TRIM(BOTH FROM j->>'occupancy_delta_week'), '')::numeric, NULL::numeric) AS occupancy_delta_week,
    COALESCE(
      NULLIF(TRIM(BOTH FROM j->>'total_revenue'), '')::numeric,
      NULLIF(TRIM(BOTH FROM j->>'revenue'), '')::numeric,
      NULLIF(TRIM(BOTH FROM j->>'total_revenue_thb'), '')::numeric,
      NULLIF(TRIM(BOTH FROM j->>'revenue_thb'), '')::numeric,
      0::numeric
    ) AS revenue_thb
  FROM base
  WHERE organization_id IS NOT NULL AND TRIM(BOTH FROM organization_id) <> ''
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
    'accommodation'::text AS business_type
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
    'accommodation'::text AS business_type
  FROM signals s
  WHERE s.occupancy_delta_week IS NOT NULL AND s.occupancy_delta_week <= -10
),
enriched AS (
  SELECT
    r.organization_id,
    r.branch_id::text AS branch_id,
    r.branch_name,
    r.alert_type_raw AS alert_type,
    (
      CASE
        WHEN NULLIF(TRIM(BOTH FROM r.branch_name), '') IS NOT NULL THEN
          TRIM(BOTH FROM REPLACE(r.alert_type_raw, '_'::text, ' '::text))
          || ' — '::text
          || TRIM(BOTH FROM r.branch_name)
        ELSE NULLIF(TRIM(BOTH FROM REPLACE(r.alert_type_raw, '_'::text, ' '::text)), ''::text)
      END
    ) AS title,
    (
      CASE
        WHEN lower(r.alert_type_raw) LIKE '%revenue%' THEN
          'Revenue is under pressure vs yesterday. Review pricing, promos, and channel mix; log context in Enter Data.'::text
        WHEN lower(r.alert_type_raw) LIKE '%occupancy%' OR lower(r.alert_type_raw) LIKE '%low%' THEN
          'Occupancy is soft. Review rate fences, packages, and local demand; cross-check Trends for drift.'::text
        ELSE
          'Focus on this signal today: confirm numbers in Enter Data and review context on Trends.'::text
      END
    ) AS description,
    NULL::numeric AS impact_estimate_thb,
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
    *,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id, branch_id, alert_type
      ORDER BY sort_score DESC NULLS LAST
    ) AS dedup_rn
  FROM enriched
)
SELECT
  d.organization_id,
  d.branch_id,
  d.branch_name,
  d.alert_type,
  d.title,
  d.description,
  d.title AS short_title,
  d.description AS action_text,
  d.impact_estimate_thb,
  d.impact_label,
  LEFT(d.description, 240) AS reason_short,
  d.sort_score,
  ROW_NUMBER() OVER (
    PARTITION BY d.organization_id
    ORDER BY d.sort_score DESC NULLS LAST, d.branch_id, d.alert_type
  )::integer AS rank,
  d.business_type,
  d.metric_date
FROM dedup d
WHERE d.dedup_rn = 1
$ts$;
      RAISE NOTICE 'today_priorities_clean: using source today_summary_clean';
    ELSE
      EXECUTE (
        $head$
CREATE VIEW public.today_priorities_clean AS
WITH raw AS (
  SELECT * FROM (
    SELECT
      TRIM(BOTH FROM COALESCE(
        NULLIF(jb.jb->>'branch_id', ''),
        NULLIF(jb.jb->>'branchId', ''),
        NULLIF(jb.jb->>'branch_id_text', '')
      )) AS branch_id,
      jb.jb,
      TRIM(BOTH FROM COALESCE(
        NULLIF(jb.jb->>'alert_type', ''),
        NULLIF(jb.jb->>'alertType', ''),
        NULLIF(jb.jb->>'type', ''),
        NULLIF(jb.jb->>'alert_name', ''),
        NULLIF(jb.jb->>'alert_title', ''),
        NULLIF(jb.jb->>'alert_kind', ''),
        NULLIF(jb.jb->>'kind', ''),
        NULLIF(jb.jb->>'name', ''),
        NULLIF(jb.jb->>'alert_message', ''),
        NULLIF(jb.jb->>'alertMessage', ''),
        NULLIF(jb.jb->>'message', ''),
        ''
      )) AS alert_type_raw,
      COALESCE(
        CASE WHEN b.organization_id IS NOT NULL THEN b.organization_id::text END,
        NULLIF(TRIM(BOTH FROM jb.jb->>'organization_id'), '')
      ) AS organization_id,
      COALESCE(
        NULLIF(TRIM(BOTH FROM b.branch_name), ''),
        NULLIF(TRIM(BOTH FROM b.name), ''),
        NULLIF(TRIM(BOTH FROM jb.jb->>'branch_name'), '')
      ) AS branch_name,
      b.module_type AS branch_module_type,
      jb.jb->>'branch_type' AS jb_branch_type,
      jb.jb->>'alert_stream' AS jb_alert_stream
    FROM
$head$
      || src
      || $mid$
      f
      CROSS JOIN LATERAL (SELECT to_jsonb(f) AS jb) jb
      LEFT JOIN public.branches b ON b.id::text = TRIM(BOTH FROM COALESCE(
        NULLIF(jb.jb->>'branch_id', ''),
        NULLIF(jb.jb->>'branchId', ''),
        ''
      ))
  ) z
  WHERE z.branch_id IS NOT NULL
    AND z.branch_id <> ''
    AND z.alert_type_raw IS NOT NULL
    AND z.alert_type_raw <> ''
),
enriched AS (
  SELECT
    r.organization_id,
    r.branch_id::text AS branch_id,
    r.branch_name,
    r.alert_type_raw AS alert_type,
    (
      CASE
        WHEN NULLIF(TRIM(BOTH FROM r.branch_name), '') IS NOT NULL THEN
          TRIM(BOTH FROM REPLACE(r.alert_type_raw, '_'::text, ' '::text))
          || ' — '::text
          || TRIM(BOTH FROM r.branch_name)
        ELSE NULLIF(TRIM(BOTH FROM REPLACE(r.alert_type_raw, '_'::text, ' '::text)), ''::text)
      END
    ) AS title,
    (
      CASE
        WHEN lower(r.alert_type_raw) LIKE '%revenue%' THEN
          'Revenue is under pressure vs yesterday. Review pricing, promos, and channel mix; log context in Enter Data.'::text
        WHEN lower(r.alert_type_raw) LIKE '%occupancy%' OR lower(r.alert_type_raw) LIKE '%low%' THEN
          'Occupancy is soft. Review rate fences, packages, and local demand; cross-check Trends for drift.'::text
        WHEN lower(r.alert_type_raw) LIKE '%customer%' THEN
          'Customer traffic is down. Check staffing, offer mix, and repeat visits; capture today''s detail in Enter Data.'::text
        WHEN lower(r.alert_type_raw) LIKE '%opportunity%' THEN
          'There''s upside in this signal—test a targeted offer or package and measure over the next few days.'::text
        ELSE
          'Focus on this signal today: confirm numbers in Enter Data and review context on Trends.'::text
      END
    ) AS description,
    NULL::numeric AS impact_estimate_thb,
    (
      CASE
        WHEN lower(r.alert_type_raw) LIKE '%opportunity%'
          OR lower(COALESCE(r.jb_alert_stream, ''::text)) LIKE '%opportunity%'
        THEN 'opportunity'::text
        ELSE 'at risk'::text
      END
    ) AS impact_label,
    (
      COALESCE(
        CASE
          WHEN (r.jb->>'priority_score') ~ '^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$'
          THEN (r.jb->>'priority_score')::numeric
          ELSE NULL::numeric
        END,
        CASE
          WHEN (r.jb->>'severity') ~ '^-?[0-9]+(\.[0-9]+)?$'
          THEN (r.jb->>'severity')::numeric * 500::numeric
          ELSE NULL::numeric
        END,
        CASE
          WHEN lower(r.alert_type_raw) LIKE '%revenue%' THEN 4000::numeric
          WHEN lower(r.alert_type_raw) LIKE '%occupancy%' OR lower(r.alert_type_raw) LIKE '%low%' THEN 3900::numeric
          WHEN lower(r.alert_type_raw) LIKE '%customer%' THEN 3800::numeric
          WHEN lower(r.alert_type_raw) LIKE '%opportunity%' THEN 2500::numeric
          ELSE 2000::numeric
        END
      )
      + ((abs(hashtext(COALESCE(r.branch_id::text, '') || r.alert_type_raw)))::numeric % 1000000::numeric)
        / 1000000000::numeric
    ) AS sort_score,
    (
      CASE
        WHEN lower(COALESCE(r.branch_module_type::text, '')) IN (
          'fnb', 'restaurant', 'cafe', 'cafe_restaurant'
        ) THEN 'fnb'::text
        WHEN lower(COALESCE(r.jb_branch_type, '')) IN ('fnb', 'restaurant', 'cafe', 'cafe_restaurant') THEN 'fnb'::text
        WHEN lower(COALESCE(r.jb_alert_stream, '')) = 'fnb' THEN 'fnb'::text
        WHEN lower(COALESCE(r.jb_alert_stream, '')) = 'accommodation' THEN 'accommodation'::text
        ELSE 'accommodation'::text
      END
    ) AS business_type,
    (
      CASE
        WHEN (r.jb->>'metric_date') ~ '^\d{4}-\d{2}-\d{2}'
        THEN (r.jb->>'metric_date')::date
        ELSE NULL::date
      END
    ) AS metric_date_hint
  FROM raw r
  WHERE r.organization_id IS NOT NULL
    AND TRIM(BOTH FROM r.organization_id) <> ''
),
dedup AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id, branch_id, alert_type
      ORDER BY sort_score DESC NULLS LAST
    ) AS dedup_rn
  FROM enriched
)
SELECT
  d.organization_id,
  d.branch_id,
  d.branch_name,
  d.alert_type,
  d.title,
  d.description,
  d.title AS short_title,
  d.description AS action_text,
  d.impact_estimate_thb,
  d.impact_label,
  LEFT(d.description, 240) AS reason_short,
  d.sort_score,
  ROW_NUMBER() OVER (
    PARTITION BY d.organization_id
    ORDER BY d.sort_score DESC NULLS LAST, d.branch_id, d.alert_type
  )::integer AS rank,
  d.business_type,
  d.metric_date_hint AS metric_date
FROM dedup d
WHERE d.dedup_rn = 1
$mid$
      );
      RAISE NOTICE 'today_priorities_clean: using alert source %', src;
    END IF;
  END IF;
END $$;

COMMENT ON VIEW public.today_priorities_clean IS
  'Priorities from alert_type + optional JSON (alerts_fix_this_first or alerts_today); title/description/sort_score generated.';

GRANT SELECT ON public.today_priorities_clean TO anon, authenticated;

CREATE VIEW public.today_priorities_view AS
SELECT
  c.organization_id,
  c.branch_id,
  c.branch_name,
  c.alert_type,
  c.title,
  c.description,
  c.short_title,
  c.action_text,
  c.impact_estimate_thb,
  c.impact_label,
  c.reason_short,
  c.sort_score,
  c.rank,
  (
    CASE
      WHEN LOWER(COALESCE(b.module_type::text, '')) IN (
        'fnb', 'restaurant', 'cafe', 'cafe_restaurant'
      ) THEN 'fnb'::text
      WHEN LOWER(COALESCE(b.module_type::text, '')) IN (
        'accommodation', 'hotel', 'hotel_resort', 'rooms', 'hotel_with_cafe'
      ) THEN 'accommodation'::text
      ELSE c.business_type
    END
  ) AS business_type,
  c.metric_date
FROM public.today_priorities_clean c
LEFT JOIN public.branches b ON b.id::text = TRIM(BOTH FROM c.branch_id::text);

COMMENT ON VIEW public.today_priorities_view IS
  'Stable priorities API: filter branch_id, order=sort_score.desc, limit=3; title/description/sort_score.';

GRANT SELECT ON public.today_priorities_view TO anon, authenticated;

CREATE VIEW public.today_branch_priorities AS
SELECT
  v.branch_id,
  v.business_type,
  v.metric_date,
  COALESCE(v.title, v.short_title) AS short_title,
  COALESCE(v.description, v.action_text) AS action_text,
  v.impact_estimate_thb,
  v.impact_label,
  v.sort_score,
  ROW_NUMBER() OVER (
    PARTITION BY v.branch_id, v.business_type
    ORDER BY v.sort_score DESC NULLS LAST, v.alert_type
  )::integer AS rank
FROM public.today_priorities_view v;

COMMENT ON VIEW public.today_branch_priorities IS
  'Legacy branch wrapper over today_priorities_view.';

GRANT SELECT ON public.today_branch_priorities TO anon, authenticated;

CREATE VIEW public.today_priorities AS
SELECT
  organization_id,
  branch_id,
  branch_name,
  alert_type,
  action_text,
  LEFT(description, 120) AS action_short,
  COALESCE(impact_estimate_thb, 0::numeric) AS impact,
  sort_score
FROM public.today_priorities_clean;

COMMENT ON VIEW public.today_priorities IS
  'Compact priorities row; order sort_score DESC.';

GRANT SELECT ON public.today_priorities TO anon, authenticated;
