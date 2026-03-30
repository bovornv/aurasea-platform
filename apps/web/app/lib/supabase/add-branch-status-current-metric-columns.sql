-- =============================================================================
-- public.branch_status_current — Today-page metric columns (Accommodation + F&B)
-- =============================================================================
-- Adds nullable columns for display/KPI parity with company_status_current-style
-- semantics. Does not remove or rename existing columns.
--
-- Backfill: a separate job (UPSERT from company_status_current, signals, or ETL)
-- must populate these; new columns default to NULL until then.
-- =============================================================================

ALTER TABLE public.branch_status_current
  ADD COLUMN IF NOT EXISTS health_score NUMERIC,
  ADD COLUMN IF NOT EXISTS occupancy_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS revpar NUMERIC,
  ADD COLUMN IF NOT EXISTS profitability TEXT,
  ADD COLUMN IF NOT EXISTS profitability_symbol TEXT,
  ADD COLUMN IF NOT EXISTS avg_cost NUMERIC,
  ADD COLUMN IF NOT EXISTS margin TEXT,
  ADD COLUMN IF NOT EXISTS margin_symbol TEXT;

-- -----------------------------------------------------------------------------
-- Verification: all listed columns exist on public.branch_status_current
-- -----------------------------------------------------------------------------
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'branch_status_current'
--   AND column_name IN (
--     'health_score', 'occupancy_rate', 'revpar', 'profitability',
--     'profitability_symbol', 'avg_cost', 'margin', 'margin_symbol'
--   )
-- ORDER BY column_name;
-- Expect: 8 rows (skip any that already existed before this script — IF NOT EXISTS
-- does not error, but the row still appears in information_schema).
