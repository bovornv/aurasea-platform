-- =============================================================================
-- Rebuild priorities family from public.today_priorities using JSONB only
-- =============================================================================
-- public.today_priorities column names vary by deployment. This script does NOT
-- reference fixed columns on today_priorities — only:
--   SELECT to_jsonb(tp) FROM public.today_priorities tp
-- Field values are resolved via JSON key lookups (snake_case + camelCase).
--
-- Creates:
--   public.priorities_engine
--   public.priorities_ranked
--   public.branch_priorities_current   (top 2 per branch)
--   public.company_priorities_current  (top 5 per organization)
--
-- Derives:
--   business_type from public.branches (module_type), else json business_type
--   metric_date from public.branch_status_current, else json metric_date
--
-- Then drops (NO CASCADE): today_priorities_view, today_priorities_company_view,
-- today_priorities_ranked, today_priorities_clean, today_branch_priorities.
-- KEEPS public.today_priorities.
--
-- If a DROP fails, run the dependency query at the bottom and remove dependents
-- manually (still without CASCADE on this script's targets).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) priorities_engine
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
    NULLIF(trim(both FROM x.j ->> 'shortTitle'), '')
  ) AS title,
  COALESCE(
    NULLIF(trim(both FROM x.j ->> 'short_title'), ''),
    NULLIF(trim(both FROM x.j ->> 'shortTitle'), ''),
    NULLIF(trim(both FROM x.j ->> 'title'), ''),
    NULLIF(trim(both FROM x.j ->> 'Title'), '')
  ) AS short_title,
  COALESCE(
    NULLIF(trim(both FROM x.j ->> 'description'), ''),
    NULLIF(trim(both FROM x.j ->> 'Description'), ''),
    NULLIF(trim(both FROM x.j ->> 'action_text'), ''),
    NULLIF(trim(both FROM x.j ->> 'actionText'), '')
  ) AS description,
  COALESCE(
    NULLIF(trim(both FROM x.j ->> 'action_text'), ''),
    NULLIF(trim(both FROM x.j ->> 'actionText'), ''),
    NULLIF(trim(both FROM x.j ->> 'description'), ''),
    NULLIF(trim(both FROM x.j ->> 'Description'), '')
  ) AS action_text,
  COALESCE(
    NULLIF(replace(trim(both FROM x.j ->> 'impact_thb'), ',', ''), '')::numeric,
    NULLIF(replace(trim(both FROM x.j ->> 'impactThb'), ',', ''), '')::numeric,
    NULLIF(replace(trim(both FROM x.j ->> 'impact_estimate_thb'), ',', ''), '')::numeric,
    NULLIF(replace(trim(both FROM x.j ->> 'impactEstimateThb'), ',', ''), '')::numeric
  ) AS impact_thb,
  COALESCE(
    NULLIF(replace(trim(both FROM x.j ->> 'impact_estimate_thb'), ',', ''), '')::numeric,
    NULLIF(replace(trim(both FROM x.j ->> 'impactEstimateThb'), ',', ''), '')::numeric,
    NULLIF(replace(trim(both FROM x.j ->> 'impact_thb'), ',', ''), '')::numeric,
    NULLIF(replace(trim(both FROM x.j ->> 'impactThb'), ',', ''), '')::numeric
  ) AS impact_estimate_thb,
  COALESCE(
    NULLIF(trim(both FROM x.j ->> 'impact_label'), ''),
    NULLIF(trim(both FROM x.j ->> 'impactLabel'), ''),
    'at risk'::text
  ) AS impact_label,
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
  ) AS priority_segment
FROM joined x
LEFT JOIN public.branches b ON trim(both FROM b.id::text) = trim(both FROM x.branch_id_txt)
LEFT JOIN public.branch_status_current bsc ON trim(both FROM bsc.branch_id::text) = trim(both FROM x.branch_id_txt);

COMMENT ON VIEW public.priorities_engine IS
  'Normalized from today_priorities via to_jsonb(row) + JSON keys; branches + branch_status_current for business_type and metric_date.';

GRANT SELECT ON public.priorities_engine TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2) priorities_ranked — per-branch ordering (branch_rank)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.priorities_ranked AS
SELECT
  e.organization_id,
  e.branch_id,
  e.branch_name,
  e.business_type,
  e.alert_type,
  e.title,
  e.short_title,
  e.description,
  e.action_text,
  e.impact_thb,
  e.impact_estimate_thb,
  e.impact_label,
  e.metric_date,
  e.sort_score,
  e.priority_segment,
  ROW_NUMBER() OVER (
    PARTITION BY e.branch_id
    ORDER BY
      e.sort_score DESC NULLS LAST,
      e.alert_type ASC,
      COALESCE(e.title, '') ASC
  )::integer AS branch_rank
FROM public.priorities_engine e
WHERE e.branch_id IS NOT NULL;

COMMENT ON VIEW public.priorities_ranked IS
  'Row numbers per branch_id by sort_score DESC; filter branch_rank <= 2 for branch_priorities_current.';

GRANT SELECT ON public.priorities_ranked TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3) branch_priorities_current — top 2 per branch (API: rank column)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.branch_priorities_current AS
SELECT
  pr.organization_id,
  pr.branch_id,
  pr.branch_name,
  pr.business_type,
  pr.alert_type,
  pr.title,
  pr.description,
  pr.sort_score,
  pr.branch_rank AS rank,
  pr.impact_label,
  pr.metric_date,
  COALESCE(pr.impact_thb, pr.impact_estimate_thb) AS impact_thb,
  pr.short_title,
  pr.action_text,
  pr.impact_estimate_thb
FROM public.priorities_ranked pr
WHERE pr.branch_rank <= 2;

COMMENT ON VIEW public.branch_priorities_current IS
  'Top 2 priorities per branch from priorities_ranked; rank = branch_rank.';

GRANT SELECT ON public.branch_priorities_current TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4) company_priorities_current — top 5 per organization
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.company_priorities_current AS
WITH org_scoped AS (
  SELECT
    pr.*,
    ROW_NUMBER() OVER (
      PARTITION BY pr.organization_id
      ORDER BY
        pr.sort_score DESC NULLS LAST,
        pr.branch_id::text ASC,
        pr.alert_type ASC,
        COALESCE(pr.title, '') ASC
    )::integer AS org_rank
  FROM public.priorities_ranked pr
  WHERE pr.organization_id IS NOT NULL
)
SELECT
  o.organization_id,
  o.branch_id,
  o.branch_name,
  o.business_type,
  o.alert_type,
  o.title,
  o.description,
  o.sort_score,
  o.org_rank AS rank,
  o.impact_label,
  o.metric_date,
  COALESCE(o.impact_thb, o.impact_estimate_thb) AS impact_thb,
  COALESCE(o.impact_estimate_thb, o.impact_thb) AS impact_estimate_thb,
  o.short_title,
  o.action_text,
  CASE
    WHEN o.org_rank = 1 THEN 'fix_first'::text
    WHEN o.org_rank BETWEEN 2 AND 4 THEN 'next_moves'::text
    ELSE 'more'::text
  END AS priority_segment
FROM org_scoped o
WHERE o.org_rank <= 5;

COMMENT ON VIEW public.company_priorities_current IS
  'Top 5 org-wide priorities from priorities_ranked; rank = org_rank; priority_segment for UI.';

GRANT SELECT ON public.company_priorities_current TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5) Drop legacy today_priorities_* views (no CASCADE; keep today_priorities)
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.today_priorities_view;
DROP VIEW IF EXISTS public.today_priorities_company_view;
DROP VIEW IF EXISTS public.today_priorities_ranked;
DROP VIEW IF EXISTS public.today_priorities_clean;
DROP VIEW IF EXISTS public.today_branch_priorities;

-- =============================================================================
-- Verification
-- =============================================================================
-- Row counts:
--   SELECT 'today_priorities' AS src, count(*) FROM public.today_priorities
--   UNION ALL SELECT 'priorities_engine', count(*) FROM public.priorities_engine
--   UNION ALL SELECT 'priorities_ranked', count(*) FROM public.priorities_ranked
--   UNION ALL SELECT 'branch_priorities_current', count(*) FROM public.branch_priorities_current
--   UNION ALL SELECT 'company_priorities_current', count(*) FROM public.company_priorities_current;
--
-- Top 2 per branch:
--   SELECT branch_id, count(*) FROM public.branch_priorities_current GROUP BY branch_id HAVING count(*) > 2;
--   (expect 0 rows)
--
-- Dependencies that block DROP (run before re-running drops if needed):
--   SELECT DISTINCT dependent_ns.nspname || '.' || dependent_view.relname AS dependent_view
--   FROM pg_depend d
--   JOIN pg_rewrite r ON d.objid = r.oid
--   JOIN pg_class dependent_view ON r.ev_class = dependent_view.oid
--   JOIN pg_namespace dependent_ns ON dependent_view.relnamespace = dependent_ns.oid
--   JOIN pg_class source ON d.refobjid = source.oid
--   JOIN pg_namespace source_ns ON source.relnamespace = source_ns.oid
--   WHERE source_ns.nspname = 'public'
--     AND source.relname IN (
--       'today_priorities_view',
--       'today_priorities_company_view',
--       'today_priorities_ranked',
--       'today_priorities_clean',
--       'today_branch_priorities'
--     )
--     AND dependent_view.relname <> source.relname;
--
-- Note: ::numeric casts on empty/non-numeric json strings can invalidate the view
-- definition at SELECT time (not at CREATE time). Keep today_priorities numeric
-- fields numeric or blank, or wrap ingestion to sanitize.
