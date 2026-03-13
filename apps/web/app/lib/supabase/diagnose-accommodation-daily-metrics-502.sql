-- ============================================================
-- DIAGNOSE 502 on /rest/v1/accommodation_daily_metrics
-- Run in Supabase SQL Editor. Inspect output for causes.
-- ============================================================

-- 1. Object type: TABLE vs VIEW
SELECT
  c.relname AS name,
  CASE c.relkind
    WHEN 'r' THEN 'table'
    WHEN 'v' THEN 'view'
    WHEN 'm' THEN 'materialized view'
    ELSE c.relkind::text
  END AS object_type
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'accommodation_daily_metrics';

-- 2. Columns on accommodation_daily_metrics (detect missing/wrong columns)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'accommodation_daily_metrics'
ORDER BY ordinal_position;

-- 3. Views that depend on accommodation_daily_metrics (may reference invalid columns)
SELECT DISTINCT
  dependent_ns.nspname AS dependent_schema,
  dependent_view.relname AS dependent_view
FROM pg_depend
JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid
JOIN pg_class as dependent_view ON pg_rewrite.ev_class = dependent_view.oid
JOIN pg_class as source_table ON pg_depend.refobjid = source_table.oid
JOIN pg_namespace dependent_ns ON dependent_ns.oid = dependent_view.relnamespace
JOIN pg_namespace source_ns ON source_ns.oid = source_table.relnamespace
WHERE source_ns.nspname = 'public'
  AND source_table.relname = 'accommodation_daily_metrics'
  AND dependent_view.relkind = 'v';

-- 4. Triggers on accommodation_daily_metrics (recursion or errors)
SELECT tgname AS trigger_name, tgenabled AS enabled
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'accommodation_daily_metrics'
  AND NOT tgisinternal;

-- 5. RLS on accommodation_daily_metrics
SELECT relname, relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'accommodation_daily_metrics';

-- 6. Policies on accommodation_daily_metrics (policies that reference broken views can 502)
SELECT policyname, cmd, qual::text AS using_expr
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'accommodation_daily_metrics';

-- 7. Check accommodation_anomaly_signals view definition (uses total_revenue_thb?)
SELECT pg_get_viewdef('accommodation_anomaly_signals'::regclass, true);
