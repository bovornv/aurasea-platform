-- =============================================================================
-- Rebuild public.company_business_trends_today (depends on business_trends_today)
-- =============================================================================
-- Up to 2 rows per organization: top accommodation on latest acc date, top F&B on
-- latest fnb date. Re-run after rebuilding public.business_trends_today.
--
-- Prerequisites: public.business_trends_today
-- =============================================================================

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
      PARTITION BY b.organization_id, b.business_type
      ORDER BY b.sort_score DESC NULLS LAST, b.branch_name ASC NULLS LAST
    ) AS rn
  FROM public.business_trends_today b
  INNER JOIN (
    SELECT
      organization_id,
      business_type,
      MAX(metric_date) AS max_metric_date
    FROM public.business_trends_today
    WHERE business_type IN ('accommodation'::text, 'fnb'::text)
    GROUP BY organization_id, business_type
  ) ld
    ON ld.organization_id = b.organization_id
   AND ld.business_type = b.business_type
   AND ld.max_metric_date = b.metric_date
  WHERE b.business_type IN ('accommodation'::text, 'fnb'::text)
) ranked
WHERE ranked.rn = 1;

COMMENT ON VIEW public.company_business_trends_today IS
  'Up to 2 rows per org: top accommodation on latest acc date, top fnb on latest fnb date (business_trends_today).';

GRANT SELECT ON public.company_business_trends_today TO anon, authenticated;

-- =============================================================================
-- Verification
-- =============================================================================
-- Company-level acc + fnb (expect ≤ 2 rows per organization_id):
--   SELECT organization_id, business_type, metric_date, branch_name, sort_score, LEFT(trend_text, 50)
--   FROM public.company_business_trends_today
--   ORDER BY organization_id, business_type;
--
--   SELECT organization_id, COUNT(*) FROM public.company_business_trends_today GROUP BY 1 HAVING COUNT(*) > 2;
