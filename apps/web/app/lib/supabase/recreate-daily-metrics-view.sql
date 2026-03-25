-- =============================================================================
-- Recreate public.daily_metrics as a UNION view (fixes PostgREST 502 / broken view)
-- =============================================================================
-- Prerequisites:
--   - branches.id should be UUID (or TEXT storing valid UUID strings for ::uuid cast)
--   - public.accommodation_daily_metrics and public.fnb_daily_metrics exist
--
-- BEFORE RUNNING:
--   1) Verify: SELECT * FROM daily_metrics LIMIT 5;
--   2) If daily_metrics is a legacy TABLE, this script renames it to
--      daily_metrics_legacy (data preserved) then creates the view.
--      Migrate legacy rows into accommodation_daily_metrics / fnb_daily_metrics if needed.
--
-- After run:
--   - Test: GET /rest/v1/daily_metrics?select=*&limit=1
--   - Re-apply RLS on daily_metrics if you use view policies (see rbac-schema.sql).
-- =============================================================================

-- Remove existing object by kind (DROP VIEW on a TABLE raises 42809).
DO $prep_daily_metrics$
DECLARE
  k "char";
BEGIN
  SELECT c.relkind
  INTO k
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'daily_metrics';

  IF k IS NULL THEN
    RETURN;
  END IF;

  IF k IN ('r', 'p') THEN
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'daily_metrics_legacy'
    ) THEN
      RAISE EXCEPTION
        'public.daily_metrics is a TABLE but public.daily_metrics_legacy already exists. Rename or drop daily_metrics_legacy, then re-run.';
    END IF;
    ALTER TABLE public.daily_metrics RENAME TO daily_metrics_legacy;
    RAISE NOTICE 'Renamed legacy TABLE public.daily_metrics → public.daily_metrics_legacy (data preserved).';
  ELSIF k = 'v' THEN
    EXECUTE 'DROP VIEW public.daily_metrics CASCADE';
  ELSIF k = 'm' THEN
    EXECUTE 'DROP MATERIALIZED VIEW public.daily_metrics CASCADE';
  ELSE
    RAISE EXCEPTION
      'public.daily_metrics exists with unexpected relkind % — drop or rename it manually, then re-run.',
      k;
  END IF;
END
$prep_daily_metrics$;

DO $$
DECLARE
  acc_rev_sql text;
  acc_add_cost text := 'NULL::numeric';
  acc_staff text := 'NULL::integer';
  acc_mfc text := 'NULL::numeric';
  acc_rooms_sold text := 'NULL::integer';
  acc_rooms_avail text := 'NULL::integer';
  fnb_rev_sql text;
  fnb_metric_date_sql text;
  fnb_add_cost text := 'NULL::numeric';
  fnb_staff text := 'NULL::integer';
  fnb_mfc text := 'NULL::numeric';
  fnb_top3 text := 'NULL::numeric';
  fnb_promo text := 'NULL::numeric';
  fnb_avg_ticket text := 'NULL::numeric';
  fnb_customers text := 'f.total_customers';
  acc_adr_sql text;
  ddl text;
BEGIN
  IF to_regclass('public.accommodation_daily_metrics') IS NULL THEN
    RAISE EXCEPTION 'Missing table public.accommodation_daily_metrics';
  END IF;
  IF to_regclass('public.fnb_daily_metrics') IS NULL THEN
    RAISE EXCEPTION 'Missing table public.fnb_daily_metrics';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accommodation_daily_metrics' AND column_name = 'revenue'
  ) THEN
    acc_rev_sql := 'COALESCE(a.revenue, 0)::numeric';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accommodation_daily_metrics' AND column_name = 'total_revenue_thb'
  ) THEN
    acc_rev_sql := 'COALESCE(a.total_revenue_thb, 0)::numeric';
  ELSE
    RAISE EXCEPTION 'accommodation_daily_metrics needs column revenue or total_revenue_thb';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accommodation_daily_metrics' AND column_name = 'additional_cost_today'
  ) THEN
    acc_add_cost := 'a.additional_cost_today';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accommodation_daily_metrics' AND column_name = 'staff_count'
  ) THEN
    acc_staff := 'a.staff_count';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accommodation_daily_metrics' AND column_name = 'monthly_fixed_cost'
  ) THEN
    acc_mfc := 'a.monthly_fixed_cost';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accommodation_daily_metrics' AND column_name = 'rooms_sold'
  ) THEN
    acc_rooms_sold := 'a.rooms_sold';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accommodation_daily_metrics' AND column_name = 'rooms_available'
  ) THEN
    acc_rooms_avail := 'a.rooms_available';
  END IF;

  acc_adr_sql := format(
    'CASE WHEN COALESCE(%1$s, 0) > 0 THEN (%2$s) / NULLIF((%1$s)::numeric, 0) ELSE NULL::numeric END',
    acc_rooms_sold,
    acc_rev_sql
  );

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fnb_daily_metrics' AND column_name = 'revenue'
  ) THEN
    fnb_rev_sql := 'COALESCE(f.revenue, 0)::numeric';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fnb_daily_metrics' AND column_name = 'total_sales'
  ) THEN
    fnb_rev_sql := 'COALESCE(f.total_sales, 0)::numeric';
  ELSE
    RAISE EXCEPTION 'fnb_daily_metrics needs column revenue or total_sales';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fnb_daily_metrics' AND column_name = 'metric_date'
  ) THEN
    fnb_metric_date_sql := 'f.metric_date::date';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fnb_daily_metrics' AND column_name = 'date'
  ) THEN
    fnb_metric_date_sql := 'f.date::date';
  ELSE
    RAISE EXCEPTION 'fnb_daily_metrics needs metric_date or date';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fnb_daily_metrics' AND column_name = 'additional_cost_today'
  ) THEN
    fnb_add_cost := 'f.additional_cost_today';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fnb_daily_metrics' AND column_name = 'staff_count'
  ) THEN
    fnb_staff := 'f.staff_count';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fnb_daily_metrics' AND column_name = 'monthly_fixed_cost'
  ) THEN
    fnb_mfc := 'f.monthly_fixed_cost';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fnb_daily_metrics' AND column_name = 'top3_menu_revenue'
  ) THEN
    fnb_top3 := 'f.top3_menu_revenue';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fnb_daily_metrics' AND column_name = 'promo_spend'
  ) THEN
    fnb_promo := 'f.promo_spend';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fnb_daily_metrics' AND column_name = 'avg_ticket'
  ) THEN
    fnb_avg_ticket := 'f.avg_ticket';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fnb_daily_metrics' AND column_name = 'total_customers'
  ) THEN
    fnb_customers := 'f.total_customers';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fnb_daily_metrics' AND column_name = 'customers'
  ) THEN
    fnb_customers := 'f.customers';
  ELSE
    fnb_customers := 'NULL::integer';
  END IF;

  ddl := format(
    $v$
CREATE VIEW public.daily_metrics AS
SELECT
  a.id,
  a.branch_id::uuid AS branch_id,
  a.metric_date::date AS metric_date,
  %1$s AS revenue,
  NULL::numeric AS cost,
  COALESCE(%10$s, 0)::numeric AS additional_cost_today,
  NULL::numeric AS cash_balance,
  %11$s AS rooms_sold,
  %12$s AS rooms_available,
  %16$s AS adr,
  %13$s AS staff_count,
  %14$s AS monthly_fixed_cost,
  NULL::integer AS customers,
  NULL::numeric AS avg_ticket,
  NULL::numeric AS top3_menu_revenue,
  NULL::integer AS fnb_staff,
  NULL::numeric AS promo_spend,
  a.created_at
FROM public.accommodation_daily_metrics a
UNION ALL
SELECT
  f.id,
  f.branch_id::uuid AS branch_id,
  %2$s AS metric_date,
  %3$s AS revenue,
  NULL::numeric AS cost,
  COALESCE(%4$s, 0)::numeric AS additional_cost_today,
  NULL::numeric AS cash_balance,
  NULL::integer AS rooms_sold,
  NULL::integer AS rooms_available,
  NULL::numeric AS adr,
  %5$s AS staff_count,
  %6$s AS monthly_fixed_cost,
  %15$s AS customers,
  %7$s AS avg_ticket,
  %8$s AS top3_menu_revenue,
  NULL::integer AS fnb_staff,
  %9$s AS promo_spend,
  f.created_at
FROM public.fnb_daily_metrics f
$v$,
    acc_rev_sql,
    fnb_metric_date_sql,
    fnb_rev_sql,
    fnb_add_cost,
    fnb_staff,
    fnb_mfc,
    fnb_avg_ticket,
    fnb_top3,
    fnb_promo,
    acc_add_cost,
    acc_rooms_sold,
    acc_rooms_avail,
    acc_staff,
    acc_mfc,
    fnb_customers,
    acc_adr_sql
  );

  EXECUTE ddl;
END $$;

COMMENT ON VIEW public.daily_metrics IS
  'Unified read model: accommodation_daily_metrics ∪ fnb_daily_metrics; branch_id is uuid. App writes go to split tables.';

DO $x$
BEGIN
  ALTER VIEW public.daily_metrics SET (security_invoker = true);
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'ALTER VIEW security_invoker skipped: %', SQLERRM;
END
$x$;

GRANT SELECT ON public.daily_metrics TO anon, authenticated;

-- If RLS policies on daily_metrics were dropped by CASCADE, re-apply from rbac-schema.sql.
-- If branches.id is TEXT, policies comparing to branch_id may need: b.id = daily_metrics.branch_id::text

-- Verify (run separately):
-- SELECT * FROM public.daily_metrics LIMIT 5;
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'daily_metrics' AND column_name = 'branch_id';
