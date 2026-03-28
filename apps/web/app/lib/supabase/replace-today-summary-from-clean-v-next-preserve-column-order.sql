-- Replace public.today_summary with a passthrough to public.today_summary_clean_v_next
-- while preserving the exact column order of the existing today_summary view (avoids PG
-- "cannot change name of view column" / column reorder errors).
--
-- Rules: does not alter today_summary_clean_v_next or any other object; no SELECT *.
-- Prerequisites: public.today_summary and public.today_summary_clean_v_next exist; v_next
-- exposes every column name that today_summary currently has (same names).

DO $body$
DECLARE
  col_list text;
  sql_text text;
BEGIN
  SELECT string_agg(format('s.%I', a.attname), ', ' ORDER BY a.attnum)
  INTO col_list
  FROM pg_catalog.pg_namespace n
  JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid
  JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
  WHERE n.nspname = 'public'
    AND c.relname = 'today_summary'
    AND c.relkind = 'v'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF col_list IS NULL OR col_list = '' THEN
    RAISE EXCEPTION 'public.today_summary not found or has no columns';
  END IF;

  sql_text := format(
    'CREATE OR REPLACE VIEW public.today_summary AS SELECT %s FROM public.today_summary_clean_v_next s',
    col_list
  );

  RAISE NOTICE 'Executing: %', sql_text;
  EXECUTE sql_text;
END;
$body$;

COMMENT ON VIEW public.today_summary IS
  'Passthrough to public.today_summary_clean_v_next; column order frozen to legacy today_summary for OR REPLACE safety.';

-- =============================================================================
-- BEFORE running the DO block: current column order of public.today_summary
-- =============================================================================
-- SELECT a.attnum AS ordinal,
--        a.attname AS column_name,
--        pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type
-- FROM pg_catalog.pg_namespace n
-- JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid
-- JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
-- WHERE n.nspname = 'public'
--   AND c.relname = 'today_summary'
--   AND c.relkind = 'v'
--   AND a.attnum > 0
--   AND NOT a.attisdropped
-- ORDER BY a.attnum;

-- =============================================================================
-- AFTER: verification — no missing / extra columns vs v_next (should return 0 rows)
-- =============================================================================
-- WITH ts AS (
--   SELECT a.attname
--   FROM pg_catalog.pg_namespace n
--   JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid
--   JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
--   WHERE n.nspname = 'public' AND c.relname = 'today_summary' AND c.relkind = 'v'
--     AND a.attnum > 0 AND NOT a.attisdropped
-- ),
-- vn AS (
--   SELECT a.attname
--   FROM pg_catalog.pg_namespace n
--   JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid
--   JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
--   WHERE n.nspname = 'public' AND c.relname = 'today_summary_clean_v_next' AND c.relkind = 'v'
--     AND a.attnum > 0 AND NOT a.attisdropped
-- )
-- SELECT 'only_in_today_summary' AS issue, t.attname AS column_name FROM ts t
-- WHERE NOT EXISTS (SELECT 1 FROM vn v WHERE v.attname = t.attname)
-- UNION ALL
-- SELECT 'only_in_v_next', v.attname FROM vn v
-- WHERE NOT EXISTS (SELECT 1 FROM ts t WHERE t.attname = v.attname);
