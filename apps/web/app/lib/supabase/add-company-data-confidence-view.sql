-- Company Today — data coverage / confidence (one row per organization)
-- GET /rest/v1/company_data_confidence?select=*&organization_id=eq.{uuid}
--
-- data_days = LEAST(30, MIN across branches of GREATEST(acc distinct days, fnb distinct days) in rolling 30d)
-- Matches app: useIntelligenceStageOrganization (min branch coverage) + cap 30.
-- confidence_level: <7 Low, <=20 Medium, else High (same breakpoints as branch Learning strip)

DROP VIEW IF EXISTS public.company_data_confidence CASCADE;

CREATE VIEW public.company_data_confidence AS
WITH acc AS (
  SELECT
    TRIM(BOTH FROM branch_id::text) AS bid,
    COUNT(DISTINCT metric_date)::int AS d
  FROM public.accommodation_daily_metrics
  WHERE metric_date >= (CURRENT_DATE - INTERVAL '30 days')
  GROUP BY 1
),
fnb AS (
  SELECT
    TRIM(BOTH FROM branch_id::text) AS bid,
    COUNT(DISTINCT metric_date)::int AS d
  FROM public.fnb_daily_metrics
  WHERE metric_date >= (CURRENT_DATE - INTERVAL '30 days')
  GROUP BY 1
),
branch_cov AS (
  SELECT
    b.organization_id,
    TRIM(BOTH FROM b.id::text) AS bid,
    GREATEST(COALESCE(acc.d, 0), COALESCE(fnb.d, 0))::int AS coverage_days
  FROM public.branches b
  LEFT JOIN acc ON acc.bid = TRIM(BOTH FROM b.id::text)
  LEFT JOIN fnb ON fnb.bid = TRIM(BOTH FROM b.id::text)
  WHERE b.organization_id IS NOT NULL
),
org_agg AS (
  SELECT
    organization_id,
    MIN(coverage_days)::int AS data_days_raw
  FROM branch_cov
  GROUP BY organization_id
)
SELECT
  organization_id,
  LEAST(30, GREATEST(0, data_days_raw))::int AS data_days,
  30 AS max_days,
  CASE
    WHEN data_days_raw < 7 THEN 'Low'
    WHEN data_days_raw <= 20 THEN 'Medium'
    ELSE 'High'
  END AS confidence_level
FROM org_agg;

COMMENT ON VIEW public.company_data_confidence IS
  'Org-level data coverage (min branch / 30d); REST filter organization_id=eq.{uuid}.';

GRANT SELECT ON public.company_data_confidence TO anon, authenticated;

-- SELECT * FROM public.company_data_confidence LIMIT 5;
