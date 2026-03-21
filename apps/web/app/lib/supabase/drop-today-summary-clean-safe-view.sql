-- Remove legacy PostgREST view (app uses branch_business_status + daily metrics).
--
-- Order:
--   1) Run add-branch-performance-signal-and-business-status.sql (branch_business_status must not depend on this view).
--   2) Run this script.

DROP VIEW IF EXISTS today_summary_clean_safe;
