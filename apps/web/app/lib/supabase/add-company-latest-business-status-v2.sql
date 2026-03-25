-- =============================================================================
-- Company Today — single source for "Latest business status" table
-- =============================================================================
-- Depends on: public.branch_business_status (add-branch-performance-signal-and-business-status.sql)
-- PostgREST: GET /rest/v1/company_latest_business_status_v2?organization_id=eq.{uuid}
--            Optional: &branch_id=in.(uuid1,uuid2)
-- =============================================================================

CREATE OR REPLACE VIEW public.company_latest_business_status_v2 AS
SELECT
  b.organization_id,
  b.branch_id::uuid AS branch_id,
  b.branch_name,
  CASE
    WHEN LOWER(COALESCE(b.branch_type, ''::text)) IN (
      'fnb'::text, 'restaurant'::text, 'cafe'::text, 'cafe_restaurant'::text
    ) THEN 'fnb'::text
    ELSE 'accommodation'::text
  END AS business_type,
  b.metric_date::date AS metric_date,
  b.health_score,
  b.revenue_thb,
  CASE
    WHEN LOWER(COALESCE(b.branch_type, ''::text)) IN (
      'fnb'::text, 'restaurant'::text, 'cafe'::text, 'cafe_restaurant'::text
    ) THEN NULL::numeric
    ELSE b.occupancy_pct
  END AS occupancy_pct,
  CASE
    WHEN LOWER(COALESCE(b.branch_type, ''::text)) IN (
      'fnb'::text, 'restaurant'::text, 'cafe'::text, 'cafe_restaurant'::text
    ) THEN NULL::numeric
    ELSE b.adr
  END AS adr_thb,
  CASE
    WHEN LOWER(COALESCE(b.branch_type, ''::text)) IN (
      'fnb'::text, 'restaurant'::text, 'cafe'::text, 'cafe_restaurant'::text
    ) THEN NULL::numeric
    ELSE b.revpar
  END AS revpar_thb,
  CASE
    WHEN LOWER(COALESCE(b.branch_type, ''::text)) IN (
      'fnb'::text, 'restaurant'::text, 'cafe'::text, 'cafe_restaurant'::text
    ) THEN NULL::text
    WHEN b.profitability_trend IS NULL OR TRIM(b.profitability_trend::text) = ''::text THEN NULL::text
    WHEN LOWER(TRIM(b.profitability_trend::text)) = ANY (
      ARRAY['up'::text, 'rising'::text, 'positive'::text, '↑'::text, 'improving'::text]
    ) THEN 'Up'::text
    WHEN LOWER(TRIM(b.profitability_trend::text)) = ANY (
      ARRAY['down'::text, 'falling'::text, 'negative'::text, '↓'::text, 'declining'::text]
    ) THEN 'Down'::text
    WHEN LOWER(TRIM(b.profitability_trend::text)) = ANY (
      ARRAY['flat'::text, 'stable'::text, 'neutral'::text, '→'::text, 'unchanged'::text]
    ) THEN 'Flat'::text
    ELSE TRIM(b.profitability_trend::text)
  END AS profitability_label,
  CASE
    WHEN LOWER(COALESCE(b.branch_type, ''::text)) IN (
      'fnb'::text, 'restaurant'::text, 'cafe'::text, 'cafe_restaurant'::text
    ) THEN b.customers
    ELSE NULL::numeric
  END AS customers,
  CASE
    WHEN LOWER(COALESCE(b.branch_type, ''::text)) IN (
      'fnb'::text, 'restaurant'::text, 'cafe'::text, 'cafe_restaurant'::text
    ) THEN b.avg_ticket
    ELSE NULL::numeric
  END AS avg_ticket_thb,
  CASE
    WHEN LOWER(COALESCE(b.branch_type, ''::text)) IN (
      'fnb'::text, 'restaurant'::text, 'cafe'::text, 'cafe_restaurant'::text
    ) THEN b.avg_daily_cost
    ELSE NULL::numeric
  END AS avg_cost_thb,
  CASE
    WHEN LOWER(COALESCE(b.branch_type, ''::text)) IN (
      'fnb'::text, 'restaurant'::text, 'cafe'::text, 'cafe_restaurant'::text
    )
    AND b.fnb_cost_to_revenue_30d IS NOT NULL
    AND b.fnb_cost_to_revenue_30d >= 0::numeric
    AND b.fnb_cost_to_revenue_30d <= 2::numeric
    THEN round((1::numeric - b.fnb_cost_to_revenue_30d) * 100::numeric, 2)
    ELSE NULL::numeric
  END AS margin_pct
FROM public.branch_business_status b
WHERE b.organization_id IS NOT NULL;

COMMENT ON VIEW public.company_latest_business_status_v2 IS
  'Company Today Latest business status: one row per branch from branch_business_status with typed columns for accommodation vs F&B.';

GRANT SELECT ON public.company_latest_business_status_v2 TO anon, authenticated;
