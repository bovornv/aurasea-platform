-- =============================================================================
-- public.company_learning_status — company-level learning/freshness aggregate
-- =============================================================================
-- Source: public.branch_learning_status (real columns only)
--   - branch_id, branch_name, learning_days, first_day, last_day
--
-- Relationship:
--   - organization_id comes from public.branches join on branch_id
--   - last_day (company freshness) = MIN(branch_learning_status.last_day) across org branches
--   - learning_days (company maturity) = MIN(branch_learning_status.learning_days) across org branches
--   - max_* columns included for range/diagnostics
-- =============================================================================

CREATE OR REPLACE VIEW public.company_learning_status AS
SELECT
  b.organization_id::uuid AS organization_id,
  MIN(bls.last_day::date) AS last_day,
  MAX(bls.last_day::date) AS max_last_day,
  MIN(bls.learning_days)::integer AS learning_days,
  MAX(bls.learning_days)::integer AS max_learning_days,
  COUNT(*)::integer AS branches_count
FROM public.branch_learning_status bls
INNER JOIN public.branches b
  ON trim(both FROM b.id::text) = trim(both FROM bls.branch_id::text)
WHERE b.organization_id IS NOT NULL
GROUP BY b.organization_id;

COMMENT ON VIEW public.company_learning_status IS
  'Company-level aggregate from branch_learning_status: conservative learning_days=min across branches; freshness=min last_day; includes max_* and branches_count.';

GRANT SELECT ON public.company_learning_status TO anon, authenticated;

