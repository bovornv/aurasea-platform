-- =============================================================================
-- Discovery: surviving relations for priorities / alerts / recommendations
-- =============================================================================
-- Run in Supabase SQL editor or psql BEFORE rebuilding branch/company views.
-- Pick the highest-priority candidate that exists and has rows + sensible columns.
-- =============================================================================

-- 1) List public tables/views whose name matches patterns
SELECT
  c.relkind AS kind,
  CASE c.relkind
    WHEN 'r' THEN 'table'
    WHEN 'v' THEN 'view'
    WHEN 'm' THEN 'materialized view'
    ELSE c.relkind::text
  END AS relkind_label,
  n.nspname AS schema_name,
  c.relname AS object_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'v', 'm')
  AND (
    c.relname ILIKE '%priorit%'
    OR c.relname ILIKE '%alert%'
    OR c.relname ILIKE '%recommend%'
    OR c.relname ILIKE '%opportunit%'
    OR c.relname ILIKE '%fix_this%'
  )
ORDER BY
  CASE c.relkind WHEN 'r' THEN 0 WHEN 'v' THEN 1 ELSE 2 END,
  c.relname;

-- 2) Quick existence check for common AuraSea upstream names (edit list as needed)
SELECT
  c.candidate,
  to_regclass('public.' || c.candidate) IS NOT NULL AS exists
FROM unnest(ARRAY[
  'alerts_fix_this_first',
  'alerts_enriched',
  'alerts_today',
  'branch_alerts_today',
  'today_priorities',
  'today_priorities_clean',
  'today_branch_priorities',
  'opportunities_today',
  'priorities_engine',
  'priorities_ranked'
]) AS c(candidate)
ORDER BY c.candidate;

-- 3) Inspect columns for ONE chosen relation (replace the name)
-- SELECT column_name, data_type, udt_name
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'alerts_fix_this_first'
-- ORDER BY ordinal_position;
