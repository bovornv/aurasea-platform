-- =============================================================================
-- Company Today — Latest business status v3 (symbol-based)
-- =============================================================================
-- Source of truth for company "Latest business status" table.
-- Health is taken directly from branch_business_status.health_score.
-- =============================================================================

DROP VIEW IF EXISTS public.company_latest_business_status_v2 CASCADE;

CREATE OR REPLACE VIEW public.company_latest_business_status_v3 AS
SELECT
  b.organization_id,
  b.branch_id::uuid AS branch_id,
  b.branch_name,
  CASE
    WHEN LOWER(COALESCE(b.branch_type, '')) IN ('fnb', 'restaurant', 'cafe', 'cafe_restaurant') THEN 'fnb'::text
    ELSE 'accommodation'::text
  END AS business_type,
  b.metric_date::date AS metric_date,
  b.health_score,
  b.revenue_thb,
  CASE
    WHEN LOWER(COALESCE(b.branch_type, '')) IN ('fnb', 'restaurant', 'cafe', 'cafe_restaurant') THEN NULL::numeric
    ELSE b.occupancy_pct
  END AS occupancy_pct,
  CASE
    WHEN LOWER(COALESCE(b.branch_type, '')) IN ('fnb', 'restaurant', 'cafe', 'cafe_restaurant') THEN NULL::numeric
    ELSE b.adr
  END AS adr_thb,
  CASE
    WHEN LOWER(COALESCE(b.branch_type, '')) IN ('fnb', 'restaurant', 'cafe', 'cafe_restaurant') THEN NULL::numeric
    ELSE b.revpar
  END AS revpar_thb,
  CASE
    WHEN LOWER(COALESCE(b.branch_type, '')) IN ('fnb', 'restaurant', 'cafe', 'cafe_restaurant') THEN NULL::text
    WHEN b.profitability_trend IS NULL OR TRIM(b.profitability_trend::text) = '' THEN NULL::text
    WHEN LOWER(TRIM(b.profitability_trend::text)) = ANY (ARRAY['up','rising','positive','improving','higher','gain','↑']) THEN '↑'::text
    WHEN LOWER(TRIM(b.profitability_trend::text)) = ANY (ARRAY['down','falling','negative','declining','lower','loss','↓']) THEN '↓'::text
    WHEN LOWER(TRIM(b.profitability_trend::text)) = ANY (ARRAY['flat','neutral','stable','unchanged','steady','sideways','→','hold','same']) THEN '→'::text
    ELSE TRIM(b.profitability_trend::text)
  END AS profitability_symbol,
  CASE
    WHEN LOWER(COALESCE(b.branch_type, '')) IN ('fnb', 'restaurant', 'cafe', 'cafe_restaurant') THEN b.customers
    ELSE NULL::numeric
  END AS customers,
  CASE
    WHEN LOWER(COALESCE(b.branch_type, '')) IN ('fnb', 'restaurant', 'cafe', 'cafe_restaurant') THEN b.avg_ticket
    ELSE NULL::numeric
  END AS avg_ticket_thb,
  CASE
    WHEN LOWER(COALESCE(b.branch_type, '')) IN ('fnb', 'restaurant', 'cafe', 'cafe_restaurant') THEN b.avg_daily_cost
    ELSE NULL::numeric
  END AS avg_cost_thb,
  CASE
    WHEN LOWER(COALESCE(b.branch_type, '')) NOT IN ('fnb', 'restaurant', 'cafe', 'cafe_restaurant') THEN NULL::text
    WHEN b.margin_trend IS NULL OR TRIM(b.margin_trend::text) = '' THEN NULL::text
    WHEN LOWER(TRIM(b.margin_trend::text)) = ANY (ARRAY['up','rising','positive','improving','higher','gain','↑']) THEN '↑'::text
    WHEN LOWER(TRIM(b.margin_trend::text)) = ANY (ARRAY['down','falling','negative','declining','lower','loss','↓']) THEN '↓'::text
    WHEN LOWER(TRIM(b.margin_trend::text)) = ANY (ARRAY['flat','neutral','stable','unchanged','steady','sideways','→','hold','same']) THEN '→'::text
    ELSE TRIM(b.margin_trend::text)
  END AS margin_symbol
FROM public.branch_business_status b
WHERE b.organization_id IS NOT NULL;

COMMENT ON VIEW public.company_latest_business_status_v3 IS
  'Company latest business status v3. Health from branch_business_status.health_score, with profitability_symbol and margin_symbol.';

GRANT SELECT ON public.company_latest_business_status_v3 TO anon, authenticated;
