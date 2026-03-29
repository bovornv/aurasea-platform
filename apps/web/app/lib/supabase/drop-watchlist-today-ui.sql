-- Remove public.watchlist_today_ui only. Application uses public.watchlist_today.
-- Safe whether the object is a view, materialized view, or table.

DO $drop$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'watchlist_today_ui'
      AND c.relkind = 'v'
  ) THEN
    EXECUTE 'DROP VIEW public.watchlist_today_ui CASCADE';
  ELSIF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'watchlist_today_ui'
      AND c.relkind = 'm'
  ) THEN
    EXECUTE 'DROP MATERIALIZED VIEW public.watchlist_today_ui CASCADE';
  ELSIF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'watchlist_today_ui'
      AND c.relkind = 'r'
  ) THEN
    EXECUTE 'DROP TABLE public.watchlist_today_ui CASCADE';
  END IF;
END
$drop$;
