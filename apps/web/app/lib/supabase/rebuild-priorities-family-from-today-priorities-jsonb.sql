-- =============================================================================
-- Priorities pipeline: public.today_priorities → priorities_engine → ranked → API
-- File name still contains "jsonb" for history; engine now uses fixed tp columns.
-- =============================================================================
-- Confirmed today_priorities columns (physical schema):
--   organization_id uuid, branch_id text, branch_name text, alert_type text,
--   action_text text, action_short text, impact numeric, sort_score numeric
--
-- priorities_engine is the canonical layer (direct column reads from today_priorities
-- + branches + branch_status_current).
--
-- priorities_ranked LEFT JOINs today_priorities again on (organization_id, branch_id,
-- alert_type) so COALESCE(engine, fallback) fixes nulls if engine and base diverge.
--
-- User-facing mapping (branch_priorities_current / company_priorities_current):
--   title          = COALESCE(short_title, title, tp.alert_type || ' — ' || tp.branch_name)
--   description    = reason_short + '. ' + action_text, else action_short + '. ' + action_text
--   impact_thb     = COALESCE(impact_estimate_thb, impact_thb, tp.impact)
--   impact_label   = COALESCE(engine impact_label_raw, 'at risk' when impact_thb > 0, 'at risk')
--   sort_score     = COALESCE(engine.sort_score, tp.sort_score, 0)
--   rank           = COALESCE(source_rank, row_number by sort_score desc)
--
-- branch_priorities_current: latest metric_date per branch, top 2.
-- company_priorities_current: latest metric_date per organization, top 5.
--
-- Legacy today_priorities_* drops at end (no CASCADE). Keeps public.today_priorities.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) priorities_engine — real today_priorities columns + joins
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.priorities_engine AS
SELECT
  tp.organization_id,
  CASE
    WHEN trim(both FROM tp.branch_id) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      trim(both FROM tp.branch_id)::uuid
    ELSE NULL::uuid
  END AS branch_id,
  trim(both FROM tp.branch_id) AS branch_id_text,
  NULLIF(trim(both FROM tp.branch_name), '') AS branch_name,
  CASE
    WHEN lower(COALESCE(b.module_type::text, '')) IN ('fnb', 'restaurant', 'cafe', 'cafe_restaurant') THEN 'fnb'::text
    WHEN b.id IS NOT NULL THEN 'accommodation'::text
    ELSE 'accommodation'::text
  END AS business_type,
  COALESCE(NULLIF(trim(both FROM tp.alert_type), ''), 'priority'::text) AS alert_type,
  NULL::text AS title,
  NULLIF(trim(both FROM tp.action_short), '') AS short_title,
  NULLIF(trim(both FROM tp.action_short), '') AS reason_short,
  NULL::text AS description,
  NULLIF(trim(both FROM tp.action_text), '') AS action_text,
  tp.impact AS impact_thb,
  tp.impact AS impact_estimate_thb,
  NULL::text AS impact_label_raw,
  bsc.metric_date::date AS metric_date,
  COALESCE(tp.sort_score, 0::numeric) AS sort_score,
  NULL::text AS priority_segment,
  NULL::integer AS source_rank
FROM public.today_priorities tp
LEFT JOIN public.branches b ON trim(both FROM b.id::text) = trim(both FROM tp.branch_id)
LEFT JOIN public.branch_status_current bsc ON trim(both FROM bsc.branch_id::text) = trim(both FROM tp.branch_id);

COMMENT ON VIEW public.priorities_engine IS
  'Normalized from public.today_priorities (confirmed schema) + branches + branch_status_current.';

GRANT SELECT ON public.priorities_engine TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2–4) Drop downstream views; rebuild ranked + API views
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.company_priorities_current;
DROP VIEW IF EXISTS public.branch_priorities_current;
DROP VIEW IF EXISTS public.priorities_ranked;

-- Join today_priorities for explicit fallbacks (org + branch_id text + alert_type)
CREATE VIEW public.priorities_ranked AS
WITH base AS (
  SELECT
    e.organization_id,
    e.branch_id,
    e.branch_id_text,
    e.branch_name,
    e.business_type,
    e.alert_type,
    e.title,
    e.short_title,
    e.reason_short,
    e.description,
    e.action_text,
    e.impact_thb,
    e.impact_estimate_thb,
    e.impact_label_raw,
    e.metric_date,
    COALESCE(e.sort_score, f.sort_score, 0::numeric) AS sort_score,
    e.priority_segment,
    e.source_rank,
    f.action_short AS fb_action_short,
    f.action_text AS fb_action_text,
    f.branch_name AS fb_branch_name,
    f.alert_type AS fb_alert_type,
    COALESCE(e.impact_estimate_thb, e.impact_thb, f.impact) AS impact_fallback,
    f.impact AS fb_impact
  FROM public.priorities_engine e
  LEFT JOIN LATERAL (
    SELECT f0.*
    FROM public.today_priorities f0
    WHERE f0.organization_id IS NOT DISTINCT FROM e.organization_id
      AND trim(both FROM f0.branch_id) = trim(both FROM e.branch_id_text)
      AND COALESCE(trim(both FROM f0.alert_type), '') = COALESCE(trim(both FROM e.alert_type), '')
    ORDER BY f0.sort_score DESC NULLS LAST
    LIMIT 1
  ) f ON TRUE
)
SELECT
  b.organization_id,
  b.branch_id,
  b.branch_id_text,
  b.branch_name,
  b.business_type,
  b.alert_type,
  b.title,
  b.short_title,
  b.reason_short,
  b.description,
  b.action_text,
  b.impact_thb,
  b.impact_estimate_thb,
  b.impact_label_raw,
  b.metric_date,
  b.sort_score,
  b.priority_segment,
  b.source_rank,
  b.fb_action_short,
  b.fb_action_text,
  b.fb_branch_name,
  b.fb_alert_type,
  b.impact_fallback,
  b.fb_impact,
  ROW_NUMBER() OVER (
    PARTITION BY trim(both FROM b.branch_id_text)
    ORDER BY
      b.sort_score DESC NULLS LAST,
      COALESCE(b.source_rank, 2147483647) ASC,
      b.alert_type ASC,
      COALESCE(b.short_title, b.title, '') ASC
  )::integer AS branch_rank
FROM base b
WHERE NULLIF(trim(both FROM b.branch_id_text), '') IS NOT NULL;

COMMENT ON VIEW public.priorities_ranked IS
  'priorities_engine + today_priorities join for impact/sort fallbacks; branch_rank by sort_score desc.';

GRANT SELECT ON public.priorities_ranked TO anon, authenticated;

-- branch_priorities_current
CREATE VIEW public.branch_priorities_current AS
WITH ranked AS (
  SELECT * FROM public.priorities_ranked
),
latest AS (
  SELECT
    r.branch_id_text,
    MAX(r.metric_date) AS mx
  FROM ranked r
  GROUP BY r.branch_id_text
),
date_scoped AS (
  SELECT r.*
  FROM ranked r
  INNER JOIN latest l ON trim(both FROM r.branch_id_text) = trim(both FROM l.branch_id_text)
    AND r.metric_date IS NOT DISTINCT FROM l.mx
),
top2 AS (
  SELECT
    d.*,
    ROW_NUMBER() OVER (
      PARTITION BY trim(both FROM d.branch_id_text)
      ORDER BY
        d.sort_score DESC NULLS LAST,
        d.branch_rank ASC
    )::integer AS pick_rn
  FROM date_scoped d
),
mapped AS (
  SELECT
    t.organization_id,
    t.branch_id,
    t.branch_name,
    t.business_type,
    t.alert_type,
    COALESCE(
      NULLIF(trim(both FROM t.short_title), ''),
      NULLIF(trim(both FROM t.title), ''),
      NULLIF(
        trim(both FROM COALESCE(t.fb_alert_type, t.alert_type))
        || ' — '::text
        || trim(both FROM COALESCE(t.fb_branch_name, t.branch_name, '')),
        ' — '
      )
    ) AS title,
    NULLIF(
      trim(
        both
        FROM
          CASE
            WHEN NULLIF(trim(both FROM t.reason_short), '') IS NOT NULL
            AND NULLIF(trim(both FROM t.action_text), '') IS NOT NULL THEN
              trim(both FROM t.reason_short) || '. '::text || trim(both FROM t.action_text)
            WHEN NULLIF(trim(both FROM t.reason_short), '') IS NOT NULL THEN
              trim(both FROM t.reason_short)
            WHEN NULLIF(trim(both FROM t.action_text), '') IS NOT NULL THEN
              trim(both FROM t.action_text)
            WHEN NULLIF(trim(both FROM COALESCE(t.fb_action_short, t.reason_short)), '') IS NOT NULL
            AND NULLIF(trim(both FROM COALESCE(t.fb_action_text, t.action_text)), '') IS NOT NULL THEN
              trim(both FROM COALESCE(t.fb_action_short, ''))
              || '. '::text
              || trim(both FROM COALESCE(t.fb_action_text, ''))
            WHEN NULLIF(trim(both FROM COALESCE(t.fb_action_short, '')), '') IS NOT NULL THEN
              trim(both FROM t.fb_action_short)
            WHEN NULLIF(trim(both FROM COALESCE(t.fb_action_text, '')), '') IS NOT NULL THEN
              trim(both FROM t.fb_action_text)
            ELSE COALESCE(NULLIF(trim(both FROM t.description), ''), '')
          END
      ),
      ''
    ) AS description,
    t.sort_score,
    COALESCE(t.source_rank, t.branch_rank)::integer AS rank,
    COALESCE(
      NULLIF(trim(both FROM t.impact_label_raw), ''),
      CASE
        WHEN COALESCE(t.impact_fallback, t.fb_impact, 0::numeric) > 0::numeric THEN 'at risk'::text
        ELSE NULL::text
      END,
      'at risk'::text
    ) AS impact_label,
    t.metric_date,
    COALESCE(t.impact_fallback, t.fb_impact, t.impact_estimate_thb, t.impact_thb) AS impact_thb,
    t.short_title,
    t.action_text,
    COALESCE(t.impact_fallback, t.fb_impact, t.impact_estimate_thb, t.impact_thb) AS impact_estimate_thb
  FROM top2 t
  WHERE t.pick_rn <= 2
)
SELECT
  m.organization_id,
  m.branch_id,
  m.branch_name,
  m.business_type,
  m.alert_type,
  m.title,
  m.description,
  m.sort_score,
  m.rank,
  m.impact_label,
  m.metric_date,
  m.impact_thb,
  m.short_title,
  m.action_text,
  m.impact_estimate_thb
FROM mapped m;

COMMENT ON VIEW public.branch_priorities_current IS
  'Latest metric_date per branch, top 2; title/description/impact from engine + today_priorities fallbacks.';

GRANT SELECT ON public.branch_priorities_current TO anon, authenticated;

-- company_priorities_current
CREATE VIEW public.company_priorities_current AS
WITH ranked AS (
  SELECT * FROM public.priorities_ranked
  WHERE organization_id IS NOT NULL
),
org_latest AS (
  SELECT
    r.organization_id,
    MAX(r.metric_date) AS mx
  FROM ranked r
  GROUP BY r.organization_id
),
date_scoped AS (
  SELECT r.*
  FROM ranked r
  INNER JOIN org_latest ol ON r.organization_id = ol.organization_id
    AND r.metric_date IS NOT DISTINCT FROM ol.mx
),
org_pick AS (
  SELECT
    d.*,
    ROW_NUMBER() OVER (
      PARTITION BY d.organization_id
      ORDER BY
        d.sort_score DESC NULLS LAST,
        trim(both FROM d.branch_id_text) ASC,
        d.alert_type ASC,
        COALESCE(d.short_title, d.title, '') ASC
    )::integer AS org_rank
  FROM date_scoped d
),
mapped AS (
  SELECT
    o.organization_id,
    o.branch_id,
    o.branch_name,
    o.business_type,
    o.alert_type,
    COALESCE(
      NULLIF(trim(both FROM o.short_title), ''),
      NULLIF(trim(both FROM o.title), ''),
      NULLIF(
        trim(both FROM COALESCE(o.fb_alert_type, o.alert_type))
        || ' — '::text
        || trim(both FROM COALESCE(o.fb_branch_name, o.branch_name, '')),
        ' — '
      )
    ) AS title,
    NULLIF(
      trim(
        both
        FROM
          CASE
            WHEN NULLIF(trim(both FROM o.reason_short), '') IS NOT NULL
            AND NULLIF(trim(both FROM o.action_text), '') IS NOT NULL THEN
              trim(both FROM o.reason_short) || '. '::text || trim(both FROM o.action_text)
            WHEN NULLIF(trim(both FROM o.reason_short), '') IS NOT NULL THEN
              trim(both FROM o.reason_short)
            WHEN NULLIF(trim(both FROM o.action_text), '') IS NOT NULL THEN
              trim(both FROM o.action_text)
            WHEN NULLIF(trim(both FROM COALESCE(o.fb_action_short, '')), '') IS NOT NULL
            AND NULLIF(trim(both FROM COALESCE(o.fb_action_text, '')), '') IS NOT NULL THEN
              trim(both FROM o.fb_action_short) || '. '::text || trim(both FROM o.fb_action_text)
            WHEN NULLIF(trim(both FROM COALESCE(o.fb_action_short, '')), '') IS NOT NULL THEN
              trim(both FROM o.fb_action_short)
            WHEN NULLIF(trim(both FROM COALESCE(o.fb_action_text, '')), '') IS NOT NULL THEN
              trim(both FROM o.fb_action_text)
            ELSE COALESCE(NULLIF(trim(both FROM o.description), ''), '')
          END
      ),
      ''
    ) AS description,
    o.sort_score,
    o.org_rank AS rank,
    COALESCE(
      NULLIF(trim(both FROM o.impact_label_raw), ''),
      CASE
        WHEN COALESCE(o.impact_fallback, o.fb_impact, 0::numeric) > 0::numeric THEN 'at risk'::text
        ELSE NULL::text
      END,
      'at risk'::text
    ) AS impact_label,
    o.metric_date,
    COALESCE(o.impact_fallback, o.fb_impact, o.impact_estimate_thb, o.impact_thb) AS impact_thb,
    COALESCE(o.impact_fallback, o.fb_impact, o.impact_estimate_thb, o.impact_thb) AS impact_estimate_thb,
    o.short_title,
    o.action_text,
    CASE
      WHEN o.org_rank = 1 THEN 'fix_first'::text
      WHEN o.org_rank BETWEEN 2 AND 4 THEN 'next_moves'::text
      ELSE 'more'::text
    END AS priority_segment
  FROM org_pick o
  WHERE o.org_rank <= 5
)
SELECT
  m.organization_id,
  m.branch_id,
  m.branch_name,
  m.business_type,
  m.alert_type,
  m.title,
  m.description,
  m.sort_score,
  m.rank,
  m.impact_label,
  m.metric_date,
  m.impact_thb,
  m.impact_estimate_thb,
  m.short_title,
  m.action_text,
  m.priority_segment
FROM mapped m;

COMMENT ON VIEW public.company_priorities_current IS
  'Latest metric_date per org, top 5; same fallback mapping as branch_priorities_current.';

GRANT SELECT ON public.company_priorities_current TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5) Legacy drops (no CASCADE)
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.today_priorities_view;
DROP VIEW IF EXISTS public.today_priorities_company_view;
DROP VIEW IF EXISTS public.today_priorities_ranked;
DROP VIEW IF EXISTS public.today_priorities_clean;
DROP VIEW IF EXISTS public.today_branch_priorities;

-- =============================================================================
-- Verification
-- =============================================================================
-- Null checks (expect impact_thb / impact_label populated when tp.impact > 0):
--   SELECT
--     count(*) FILTER (WHERE impact_thb IS NULL) AS null_impact_thb,
--     count(*) FILTER (WHERE impact_label IS NULL OR impact_label = '') AS null_lbl
--   FROM public.branch_priorities_current;
--
--   SELECT
--     count(*) FILTER (WHERE impact_thb IS NULL) AS null_impact_thb,
--     count(*) FILTER (WHERE impact_label IS NULL OR impact_label = '') AS null_lbl
--   FROM public.company_priorities_current;
--
-- Engine vs base alignment:
--   SELECT e.branch_id_text, e.impact_thb AS engine_impact, p.impact AS tp_impact
--   FROM public.priorities_engine e
--   INNER JOIN public.today_priorities p
--     ON p.organization_id = e.organization_id
--    AND trim(p.branch_id) = trim(e.branch_id_text)
--    AND coalesce(trim(p.alert_type), '') = coalesce(trim(e.alert_type), '')
--   LIMIT 20;
--
-- Row counts:
--   SELECT 'today_priorities', count(*) FROM public.today_priorities
--   UNION ALL SELECT 'priorities_engine', count(*) FROM public.priorities_engine
--   UNION ALL SELECT 'priorities_ranked', count(*) FROM public.priorities_ranked
--   UNION ALL SELECT 'branch_priorities_current', count(*) FROM public.branch_priorities_current
--   UNION ALL SELECT 'company_priorities_current', count(*) FROM public.company_priorities_current;
--
-- Top 2 per branch:
--   SELECT branch_id, count(*) FROM public.branch_priorities_current GROUP BY branch_id HAVING count(*) > 2;
