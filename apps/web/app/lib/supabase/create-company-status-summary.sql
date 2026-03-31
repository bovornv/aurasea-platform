-- =============================================================================
-- public.company_status_summary — company rollup for Today page
-- =============================================================================
-- Source: public.branch_status_current (latest per branch snapshot)
-- Purpose: provide one rollup row per organization for the company summary strip.
--
-- Notes:
-- - No new tables; view only.
-- - Math fixes:
--   revenue_agg = SUM(branch_status_current.revenue)
--   rooms_sold_agg / rooms_available_agg = SUM for accommodation branches only
--   occupancy_rate_weighted = rooms_sold_agg / rooms_available_agg * 100 (NULL when denom=0)
--   customers_agg = SUM for fnb branches only
--   avg_ticket_weighted = fnb_revenue_sum / customers_agg (NULL when denom=0)
-- - updated_branches_count = branches with metric_date = today in Asia/Bangkok
-- =============================================================================

CREATE OR REPLACE VIEW public.company_status_summary AS
WITH s AS (
  SELECT
    b.organization_id::uuid AS organization_id,
    bsc.branch_id,
    bsc.metric_date::date AS metric_date,
    LOWER(COALESCE(bsc.business_type::text, '')) AS business_type,
    bsc.revenue::numeric AS revenue,
    bsc.rooms_sold::numeric AS rooms_sold,
    bsc.rooms_available::numeric AS rooms_available,
    bsc.customers::numeric AS customers
  FROM public.branch_status_current bsc
  INNER JOIN public.branches b
    ON trim(both FROM b.id::text) = trim(both FROM bsc.branch_id::text)
  WHERE b.organization_id IS NOT NULL
)
SELECT
  organization_id,
  MAX(metric_date) AS metric_date,
  SUM(COALESCE(revenue, 0))::numeric AS revenue_agg,
  COUNT(*)::integer AS branches_count,
  COUNT(*) FILTER (
    WHERE metric_date = (now() AT TIME ZONE 'Asia/Bangkok')::date
  )::integer AS updated_branches_count,

  SUM(CASE WHEN business_type = 'accommodation' THEN COALESCE(rooms_sold, 0) ELSE 0 END)::numeric AS rooms_sold_agg,
  SUM(CASE WHEN business_type = 'accommodation' THEN COALESCE(rooms_available, 0) ELSE 0 END)::numeric AS rooms_available_agg,
  CASE
    WHEN SUM(CASE WHEN business_type = 'accommodation' THEN COALESCE(rooms_available, 0) ELSE 0 END) > 0
    THEN
      SUM(CASE WHEN business_type = 'accommodation' THEN COALESCE(rooms_sold, 0) ELSE 0 END)
      / NULLIF(SUM(CASE WHEN business_type = 'accommodation' THEN COALESCE(rooms_available, 0) ELSE 0 END), 0)
      * 100::numeric
    ELSE NULL::numeric
  END AS occupancy_rate_weighted,

  SUM(CASE WHEN business_type = 'fnb' THEN COALESCE(customers, 0) ELSE 0 END)::numeric AS customers_agg,
  CASE
    WHEN SUM(CASE WHEN business_type = 'fnb' THEN COALESCE(customers, 0) ELSE 0 END) > 0
    THEN
      SUM(CASE WHEN business_type = 'fnb' THEN COALESCE(revenue, 0) ELSE 0 END)
      / NULLIF(SUM(CASE WHEN business_type = 'fnb' THEN COALESCE(customers, 0) ELSE 0 END), 0)
    ELSE NULL::numeric
  END AS avg_ticket_weighted
FROM s
GROUP BY organization_id;

COMMENT ON VIEW public.company_status_summary IS
  'Company Today rollup from branch_status_current: revenue_agg, updated_branches_count/branches_count, rooms/occupancy weighted for accommodation, customers/avg_ticket weighted for fnb.';

GRANT SELECT ON public.company_status_summary TO anon, authenticated;

