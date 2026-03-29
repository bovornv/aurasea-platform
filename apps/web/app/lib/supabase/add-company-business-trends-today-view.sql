-- Company-level Business Trends: up to 2 rows per organization from public.business_trends_today
-- (accommodation + fnb). Latest metric_date is computed per (organization_id, business_type), not org-wide.
-- On that date, top row by sort_score desc, then branch_name asc.
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
-- At most 2 rows per organization:
--   SELECT organization_id, COUNT(*) AS n
--   FROM public.company_business_trends_today
--   GROUP BY organization_id
--   HAVING COUNT(*) > 2;
--
-- View metric_date matches per-type max in base:
--   SELECT v.organization_id, v.business_type, v.metric_date AS view_date, m.max_d
--   FROM public.company_business_trends_today v
--   JOIN (
--     SELECT organization_id, business_type, MAX(metric_date) AS max_d
--     FROM public.business_trends_today
--     WHERE business_type IN ('accommodation', 'fnb')
--     GROUP BY organization_id, business_type
--   ) m ON m.organization_id = v.organization_id AND m.business_type = v.business_type
--   WHERE v.metric_date <> m.max_d;
--   -- expect 0 rows
--
-- Snapshot per org (acc + fnb side by side):
--   SELECT organization_id, business_type, metric_date, branch_name, sort_score, LEFT(trend_text, 50)
--   FROM public.company_business_trends_today
--   ORDER BY organization_id, business_type;
