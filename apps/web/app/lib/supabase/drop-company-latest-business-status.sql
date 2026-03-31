-- =============================================================================
-- Drop legacy company_latest_business_status (do not use anymore)
-- =============================================================================
-- Required by app: Company Today "Latest business status" now reads from:
--   public.branch_status_current (filtered by organization_id + business_type).
--
-- Safe to rerun. Does not use CASCADE.
-- =============================================================================

DROP VIEW IF EXISTS public.company_latest_business_status;

