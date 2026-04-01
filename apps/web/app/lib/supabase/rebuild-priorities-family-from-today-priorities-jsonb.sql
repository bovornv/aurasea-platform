-- =============================================================================
-- Priorities pipeline: today_priorities (JSONB) → priorities_engine → ranked → API
-- =============================================================================
-- priorities_engine is the canonical normalized layer (to_jsonb(today_priorities) only).
-- priorities_ranked, branch_priorities_current, company_priorities_current are rebuilt
-- from priorities_engine with explicit user-facing field mapping.
--
-- Branch API mapping (branch_priorities_current):
--   title         = COALESCE(short_title, title, humanized alert_type)
--   description   = reason_short || '. ' || action_text (either part optional)
--   impact_thb    = impact_estimate_thb
--   impact_label  = COALESCE(impact_label, 'at risk' if money > 0, else 'at risk')
--   rank          = COALESCE(source_rank from JSON, row_number by sort_score desc)
--   metric_date   = from branch_status_current (via engine), latest snapshot per branch
--
-- Keeps public.today_priorities. Legacy today_priorities_* drops at end (no CASCADE).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) priorities_engine — JSON keys + joins (no fixed today_priorities columns)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.priorities_engine AS
WITH raw AS (
  SELECT to_jsonb(tp) AS j
  FROM public.today_priorities tp
),
extracted AS (
  SELECT
    r.j,
    NULLIF(
      trim(
        both
        FROM
          COALESCE(r.j ->> 'branch_id', r.j ->> 'branchId', r.j ->> 'BranchId')
      ),
      ''
    ) AS branch_id_txt,
    NULLIF(
      trim(
        both
        FROM
          COALESCE(
            r.j ->> 'organization_id',
            r.j ->> 'organizationId',
            r.j ->> 'OrganizationId'
          )
      ),
      ''
    ) AS organization_id_txt
  FROM raw r
),
joined AS (
  SELECT
    e.j,
    e.branch_id_txt,
    e.organization_id_txt,
    CASE
      WHEN e.branch_id_txt ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        e.branch_id_txt::uuid
      ELSE NULL::uuid
    END AS branch_id,
    CASE
      WHEN e.organization_id_txt ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        e.organization_id_txt::uuid
      ELSE NULL::uuid
    END AS organization_id_from_row
  FROM extracted e
)
SELECT
  COALESCE(x.organization_id_from_row, b.organization_id::uuid) AS organization_id,
  x.branch_id,
  COALESCE(
    NULLIF(trim(both FROM x.j ->> 'branch_name'), ''),
    NULLIF(trim(both FROM x.j ->> 'branchName'), ''),
    NULLIF(trim(both FROM b.branch_name::text), ''),
    NULLIF(trim(both FROM b.name::text), '')
  ) AS branch_name,
  CASE
    WHEN lower(COALESCE(b.module_type::text, '')) IN ('fnb', 'restaurant', 'cafe', 'cafe_restaurant') THEN 'fnb'::text
    WHEN b.id IS NOT NULL THEN 'accommodation'::text
    WHEN lower(trim(both FROM COALESCE(x.j ->> 'business_type', x.j ->> 'businessType', ''))) IN ('fnb', 'restaurant', 'cafe', 'cafe_restaurant') THEN 'fnb'::text
    WHEN lower(trim(both FROM COALESCE(x.j ->> 'business_type', x.j ->> 'businessType', ''))) = 'accommodation' THEN 'accommodation'::text
    ELSE 'accommodation'::text
  END AS business_type,
  COALESCE(
    NULLIF(trim(both FROM x.j ->> 'alert_type'), ''),
    NULLIF(trim(both FROM x.j ->> 'alertType'), ''),
    NULLIF(trim(both FROM x.j ->> 'problem_type'), ''),
    NULLIF(trim(both FROM x.j ->> 'problemType'), ''),
    'priority'::text
  ) AS alert_type,
  COALESCE(
    NULLIF(trim(both FROM x.j ->> 'title'), ''),
    NULLIF(trim(both FROM x.j ->> 'Title'), ''),
    NULLIF(trim(both FROM x.j ->> 'short_title'), ''),
    NULLIF(trim(both FROM x.j ->> 'shortTitle'), ''),
    NULLIF(trim(both FROM x.j ->> 'headline'), ''),
    NULLIF(trim(both FROM x.j ->> 'Headline'), '')
  ) AS title,
  COALESCE(
    NULLIF(trim(both FROM x.j ->> 'short_title'), ''),
    NULLIF(trim(both FROM x.j ->> 'shortTitle'), ''),
    NULLIF(trim(both FROM x.j ->> 'headline'), ''),
    NULLIF(trim(both FROM x.j ->> 'Headline'), ''),
    NULLIF(trim(both FROM x.j ->> 'title'), ''),
    NULLIF(trim(both FROM x.j ->> 'Title'), ''),
    NULLIF(
      initcap(
        replace(
          trim(both FROM COALESCE(x.j ->> 'alert_type', x.j ->> 'alertType', 'priority')),
          '_'::text,
          ' '::text
        )
      ),
      ''
    )
  ) AS short_title,
  COALESCE(
    NULLIF(trim(both FROM x.j ->> 'reason_short'), ''),
    NULLIF(trim(both FROM x.j ->> 'reasonShort'), ''),
    NULLIF(trim(both FROM x.j ->> 'summary'), ''),
    NULLIF(trim(both FROM x.j ->> 'Summary'), ''),
    NULLIF(trim(both FROM x.j ->> 'context'), ''),
    NULLIF(trim(both FROM x.j ->> 'details'), '')
  ) AS reason_short,
  COALESCE(
    NULLIF(trim(both FROM x.j ->> 'description'), ''),
    NULLIF(trim(both FROM x.j ->> 'Description'), ''),
    NULLIF(trim(both FROM x.j ->> 'action_text'), ''),
    NULLIF(trim(both FROM x.j ->> 'actionText'), '')
  ) AS description,
  COALESCE(
    NULLIF(trim(both FROM x.j ->> 'action_text'), ''),
    NULLIF(trim(both FROM x.j ->> 'actionText'), ''),
    NULLIF(trim(both FROM x.j ->> 'recommended_action'), ''),
    NULLIF(trim(both FROM x.j ->> 'recommendedAction'), ''),
    NULLIF(trim(both FROM x.j ->> 'description'), ''),
    NULLIF(trim(both FROM x.j ->> 'Description'), '')
  ) AS action_text,
  COALESCE(
    NULLIF(replace(trim(both FROM x.j ->> 'impact_thb'), ',', ''), '')::numeric,
    NULLIF(replace(trim(both FROM x.j ->> 'impactThb'), ',', ''), '')::numeric,
    NULLIF(replace(trim(both FROM x.j ->> 'impact_estimate_thb'), ',', ''), '')::numeric,
    NULLIF(replace(trim(both FROM x.j ->> 'impactEstimateThb'), ',', ''), '')::numeric,
    NULLIF(replace(trim(both FROM x.j ->> 'estimated_impact'), ',', ''), '')::numeric
  ) AS impact_thb,
  COALESCE(
    NULLIF(replace(trim(both FROM x.j ->> 'impact_estimate_thb'), ',', ''), '')::numeric,
    NULLIF(replace(trim(both FROM x.j ->> 'impactEstimateThb'), ',', ''), '')::numeric,
    NULLIF(replace(trim(both FROM x.j ->> 'impact_thb'), ',', ''), '')::numeric,
    NULLIF(replace(trim(both FROM x.j ->> 'impactThb'), ',', ''), '')::numeric,
    NULLIF(replace(trim(both FROM x.j ->> 'estimated_impact'), ',', ''), '')::numeric
  ) AS impact_estimate_thb,
  NULLIF(trim(both FROM x.j ->> 'impact_label'), '') AS impact_label_raw,
  COALESCE(
    bsc.metric_date::date,
    NULLIF(trim(both FROM x.j ->> 'metric_date'), '')::date,
    NULLIF(trim(both FROM x.j ->> 'metricDate'), '')::date
  ) AS metric_date,
  COALESCE(
    NULLIF(replace(trim(both FROM x.j ->> 'sort_score'), ',', ''), '')::numeric,
    NULLIF(replace(trim(both FROM x.j ->> 'sortScore'), ',', ''), '')::numeric,
    NULLIF(replace(trim(both FROM x.j ->> 'priority_score'), ',', ''), '')::numeric,
    NULLIF(replace(trim(both FROM x.j ->> 'priorityScore'), ',', ''), '')::numeric,
    0::numeric
  ) AS sort_score,
  COALESCE(
    NULLIF(trim(both FROM x.j ->> 'priority_segment'), ''),
    NULLIF(trim(both FROM x.j ->> 'prioritySegment'), '')
  ) AS priority_segment,
  CASE
    WHEN
      COALESCE(
        NULLIF(trim(both FROM x.j ->> 'rank'), ''),
        NULLIF(trim(both FROM x.j ->> 'Rank'), ''),
        NULLIF(trim(both FROM x.j ->> 'priority_rank'), ''),
        NULLIF(trim(both FROM x.j ->> 'priorityRank'), '')
      ) ~ '^[0-9]+$'
      THEN COALESCE(
        NULLIF(trim(both FROM x.j ->> 'rank'), ''),
        NULLIF(trim(both FROM x.j ->> 'Rank'), ''),
        NULLIF(trim(both FROM x.j ->> 'priority_rank'), ''),
        NULLIF(trim(both FROM x.j ->> 'priorityRank'), '')
      )::integer
    ELSE NULL::integer
  END AS source_rank
FROM joined x
LEFT JOIN public.branches b ON trim(both FROM b.id::text) = trim(both FROM x.branch_id_txt)
LEFT JOIN public.branch_status_current bsc ON trim(both FROM bsc.branch_id::text) = trim(both FROM x.branch_id_txt);

COMMENT ON VIEW public.priorities_engine IS
  'Canonical layer: today_priorities as jsonb + branches + branch_status_current; includes reason_short, source_rank, short_title fallbacks.';

GRANT SELECT ON public.priorities_engine TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2–4) Drop downstream views then rebuild from priorities_engine
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.company_priorities_current;
DROP VIEW IF EXISTS public.branch_priorities_current;
DROP VIEW IF EXISTS public.priorities_ranked;

-- priorities_ranked: per-branch row number; carry all engine columns for mapping
CREATE VIEW public.priorities_ranked AS
SELECT
  e.organization_id,
  e.branch_id,
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
  e.sort_score,
  e.priority_segment,
  e.source_rank,
  ROW_NUMBER() OVER (
    PARTITION BY e.branch_id
    ORDER BY
      e.sort_score DESC NULLS LAST,
      COALESCE(e.source_rank, 2147483647) ASC,
      e.alert_type ASC,
      COALESCE(e.short_title, e.title, '') ASC
  )::integer AS branch_rank
FROM public.priorities_engine e
WHERE e.branch_id IS NOT NULL;

COMMENT ON VIEW public.priorities_ranked IS
  'priorities_engine + branch_rank (sort_score desc); source_rank preserved for display rank COALESCE.';

GRANT SELECT ON public.priorities_ranked TO anon, authenticated;

-- branch_priorities_current: latest metric_date per branch, then top 2; mapped fields
CREATE VIEW public.branch_priorities_current AS
WITH ranked AS (
  SELECT * FROM public.priorities_ranked
),
latest AS (
  SELECT
    r.branch_id,
    MAX(r.metric_date) AS mx
  FROM ranked r
  GROUP BY r.branch_id
),
date_scoped AS (
  SELECT r.*
  FROM ranked r
  INNER JOIN latest l ON r.branch_id = l.branch_id
    AND r.metric_date IS NOT DISTINCT FROM l.mx
),
top2 AS (
  SELECT
    d.*,
    ROW_NUMBER() OVER (
      PARTITION BY d.branch_id
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
      initcap(replace(trim(both FROM t.alert_type), '_'::text, ' '::text))
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
        WHEN COALESCE(t.impact_estimate_thb, t.impact_thb, 0::numeric) > 0::numeric THEN 'at risk'::text
        ELSE NULL::text
      END,
      'at risk'::text
    ) AS impact_label,
    t.metric_date,
    COALESCE(t.impact_estimate_thb, t.impact_thb) AS impact_thb,
    t.short_title,
    t.action_text,
    COALESCE(t.impact_estimate_thb, t.impact_thb) AS impact_estimate_thb
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
  'Latest metric_date per branch, top 2 by sort_score; title/description/impact mapped from priorities_engine.';

GRANT SELECT ON public.branch_priorities_current TO anon, authenticated;

-- company_priorities_current: latest metric_date per organization, top 5; same mapping
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
        d.branch_id::text ASC,
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
      initcap(replace(trim(both FROM o.alert_type), '_'::text, ' '::text))
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
        WHEN COALESCE(o.impact_estimate_thb, o.impact_thb, 0::numeric) > 0::numeric THEN 'at risk'::text
        ELSE NULL::text
      END,
      'at risk'::text
    ) AS impact_label,
    o.metric_date,
    COALESCE(o.impact_estimate_thb, o.impact_thb) AS impact_thb,
    COALESCE(o.impact_estimate_thb, o.impact_thb) AS impact_estimate_thb,
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
  'Latest metric_date per org, top 5; same field mapping as branch_priorities_current.';

GRANT SELECT ON public.company_priorities_current TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5) Drop legacy today_priorities_* (no CASCADE; keep today_priorities)
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.today_priorities_view;
DROP VIEW IF EXISTS public.today_priorities_company_view;
DROP VIEW IF EXISTS public.today_priorities_ranked;
DROP VIEW IF EXISTS public.today_priorities_clean;
DROP VIEW IF EXISTS public.today_branch_priorities;

-- =============================================================================
-- Verification
-- =============================================================================
-- BEFORE (run on old definitions, optional):
--   SELECT
--     count(*) FILTER (WHERE title IS NULL) AS null_title,
--     count(*) FILTER (WHERE description IS NULL OR description = '') AS null_desc,
--     count(*) FILTER (WHERE rank IS NULL) AS null_rank,
--     count(*) FILTER (WHERE impact_label IS NULL) AS null_lbl,
--     count(*) FILTER (WHERE impact_thb IS NULL) AS null_impact
--   FROM public.branch_priorities_current;
--
-- AFTER (expect lower nulls when JSON has action/reason/amounts):
--   SELECT
--     count(*) FILTER (WHERE title IS NULL OR title = '') AS null_title,
--     count(*) FILTER (WHERE description IS NULL OR description = '') AS null_desc,
--     count(*) FILTER (WHERE rank IS NULL) AS null_rank,
--     count(*) FILTER (WHERE impact_label IS NULL OR impact_label = '') AS null_lbl,
--     count(*) FILTER (WHERE impact_thb IS NULL) AS null_impact
--   FROM public.branch_priorities_current;
--
--   SELECT
--     count(*) FILTER (WHERE title IS NULL OR title = '') AS null_title,
--     count(*) FILTER (WHERE description IS NULL OR description = '') AS null_desc,
--     count(*) FILTER (WHERE rank IS NULL) AS null_rank,
--     count(*) FILTER (WHERE impact_label IS NULL OR impact_label = '') AS null_lbl,
--     count(*) FILTER (WHERE impact_thb IS NULL) AS null_impact
--   FROM public.company_priorities_current;
--
-- Row counts:
--   SELECT 'priorities_engine' AS v, count(*) FROM public.priorities_engine
--   UNION ALL SELECT 'priorities_ranked', count(*) FROM public.priorities_ranked
--   UNION ALL SELECT 'branch_priorities_current', count(*) FROM public.branch_priorities_current
--   UNION ALL SELECT 'company_priorities_current', count(*) FROM public.company_priorities_current;
--
-- At most 2 rows per branch (after latest-date filter):
--   SELECT branch_id, count(*) AS n FROM public.branch_priorities_current GROUP BY branch_id HAVING count(*) > 2;
--
-- Dependency check if legacy DROP fails: see previous revision of this file.
