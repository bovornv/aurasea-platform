-- Migration: Create fnb_financial_impact view for F&B Estimated Financial Impact
-- Source: fnb_daily_metrics. One row per branch (latest by date).
-- Exposed columns: branch_id, metric_date, revenue. Frontend uses select(branch_id, metric_date, revenue).
-- Uses date + total_sales (fnb_daily_metrics). If your table has metric_date/revenue columns, use those instead.

DROP VIEW IF EXISTS fnb_financial_impact CASCADE;

CREATE VIEW fnb_financial_impact AS
SELECT DISTINCT ON (f.branch_id)
  f.branch_id,
  f.date::text AS metric_date,
  COALESCE(f.total_sales, 0)::numeric AS revenue
FROM fnb_daily_metrics f
ORDER BY f.branch_id, f.date DESC NULLS LAST;

-- Grant select to anon and authenticated (required for Supabase API)
GRANT SELECT ON fnb_financial_impact TO anon;
GRANT SELECT ON fnb_financial_impact TO authenticated;

COMMENT ON VIEW fnb_financial_impact IS 'F&B financial impact: one row per branch from fnb_daily_metrics. Frontend selects branch_id, metric_date, revenue.';
