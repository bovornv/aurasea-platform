-- Company-level Business Trends: full history, one winning row per
-- (organization_id, business_type, metric_date) from public.business_trends_today.
-- Top row = highest sort_score (tie-break: branch_id).
--
-- Prerequisites: public.business_trends_today

DROP VIEW IF EXISTS public.company_business_trends_today CASCADE;

CREATE VIEW public.company_business_trends_today AS
SELECT
  organization_id,
  branch_id,
  branch_name,
  business_type,
  metric_date,
  trend_text,
  read_text,
  meaning_text,
  sort_score
FROM (
  SELECT
    b.organization_id,
    b.branch_id,
    b.branch_name,
    b.business_type,
    b.metric_date,
    b.trend_text,
    b.read_text,
    b.meaning_text,
    b.sort_score,
    ROW_NUMBER() OVER (
      PARTITION BY b.organization_id, b.business_type, b.metric_date
      ORDER BY b.sort_score DESC NULLS LAST, b.branch_id ASC
    ) AS rn
  FROM public.business_trends_today b
) ranked
WHERE ranked.rn = 1;

COMMENT ON VIEW public.company_business_trends_today IS
  'One row per (organization_id, business_type, metric_date): top sort_score from business_trends_today; full daily history.';

GRANT SELECT ON public.company_business_trends_today TO anon, authenticated;

-- =============================================================================
-- 2) Verification: accommodation + fnb history (sample)
-- =============================================================================
-- SELECT business_type, COUNT(*) AS rows, MIN(metric_date) AS first_date, MAX(metric_date) AS last_date
-- FROM public.company_business_trends_today
-- GROUP BY business_type
-- ORDER BY business_type;
--
-- SELECT organization_id, business_type, metric_date, branch_name, sort_score, LEFT(trend_text, 60) AS trend_snip
-- FROM public.company_business_trends_today
-- WHERE business_type IN ('accommodation', 'fnb')
-- ORDER BY metric_date DESC, business_type
-- LIMIT 30;

-- =============================================================================
-- 3) Missing (org, business_type, metric_date) vs business_trends_today
-- =============================================================================
-- Expected: 0 rows (every distinct group in the base table appears in the view).
-- WITH expected AS (
--   SELECT DISTINCT organization_id, business_type, metric_date
--   FROM public.business_trends_today
-- ),
-- got AS (
--   SELECT organization_id, business_type, metric_date
--   FROM public.company_business_trends_today
-- )
-- SELECT e.*
-- FROM expected e
-- LEFT JOIN got g
--   ON g.organization_id = e.organization_id
--  AND g.business_type = e.business_type
--  AND g.metric_date = e.metric_date
-- WHERE g.organization_id IS NULL;
--
-- Row-count parity:
-- SELECT
--   (SELECT COUNT(*) FROM (
--     SELECT DISTINCT organization_id, business_type, metric_date FROM public.business_trends_today
--   ) s) AS distinct_groups_in_base,
--   (SELECT COUNT(*) FROM public.company_business_trends_today) AS rows_in_view;
