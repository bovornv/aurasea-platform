-- =============================================================================
-- Fix branch intelligence views WITHOUT breaking schema
-- - Keeps exact existing column order and names for target views
-- - Updates logic only (no DROP VIEW)
-- - Avoids recursion (source SQL never references target views)
--
-- Target views:
--   1) public.whats_working_branch
--   2) public.branch_business_trends
--   3) public.watchlist_branch
-- =============================================================================

DO $$
DECLARE
  has_whats_working_branch boolean := to_regclass('public.whats_working_branch') IS NOT NULL;
  has_branch_business_trends boolean := to_regclass('public.branch_business_trends') IS NOT NULL;
  has_watchlist_branch boolean := to_regclass('public.watchlist_branch') IS NOT NULL;
BEGIN
  -- Helper: preserve existing schema (column names/order/types), replace logic only.
  CREATE OR REPLACE FUNCTION pg_temp.refresh_view_preserve_schema(
    p_view_name text,
    p_source_sql text
  )
  RETURNS void
  LANGUAGE plpgsql
  AS $f$
  DECLARE
    tgt regclass;
    tgt_schema text;
    tgt_name text;
    src_temp text;
    src_cols text[];
    select_list text;
    create_sql text;
  BEGIN
    tgt := to_regclass(p_view_name);
    IF tgt IS NULL THEN
      RETURN;
    END IF;

    SELECT n.nspname, c.relname
    INTO tgt_schema, tgt_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.oid = tgt;

    src_temp := format('pg_temp._src_%s', replace(tgt_name, '.', '_'));

    EXECUTE format('DROP VIEW IF EXISTS %s', src_temp);
    EXECUTE format('CREATE TEMP VIEW %s AS %s', src_temp, p_source_sql);

    SELECT COALESCE(array_agg(a.attname ORDER BY a.attnum), ARRAY[]::text[])
    INTO src_cols
    FROM pg_attribute a
    WHERE a.attrelid = to_regclass(src_temp)
      AND a.attnum > 0
      AND NOT a.attisdropped;

    SELECT string_agg(
      CASE
        WHEN a.attname = ANY(src_cols)
          THEN format('s.%I::%s AS %I', a.attname, format_type(a.atttypid, a.atttypmod), a.attname)
        ELSE format('NULL::%s AS %I', format_type(a.atttypid, a.atttypmod), a.attname)
      END,
      E',\n  ' ORDER BY a.attnum
    )
    INTO select_list
    FROM pg_attribute a
    WHERE a.attrelid = tgt
      AND a.attnum > 0
      AND NOT a.attisdropped;

    create_sql := format(
      'CREATE OR REPLACE VIEW %I.%I AS WITH s AS (%s) SELECT %s FROM s',
      tgt_schema, tgt_name, p_source_sql, select_list
    );

    EXECUTE create_sql;
    EXECUTE format('DROP VIEW IF EXISTS %s', src_temp);
  END
  $f$;

  -- 1) whats_working_branch: strictly branch-level insights (no cross-branch language).
  IF has_whats_working_branch THEN
    PERFORM pg_temp.refresh_view_preserve_schema(
      'public.whats_working_branch',
      $sql$
      WITH daily AS (
        SELECT
          t.branch_id::text AS branch_id,
          t.metric_date::date AS metric_date,
          COALESCE(t.total_revenue, 0)::numeric AS total_revenue,
          LAG(COALESCE(t.total_revenue, 0)::numeric, 1) OVER (PARTITION BY t.branch_id ORDER BY t.metric_date) AS rev_l1
        FROM public.today_summary_clean t
      ),
      latest AS (
        SELECT DISTINCT ON (d.branch_id)
          d.branch_id,
          d.metric_date,
          d.total_revenue,
          d.rev_l1
        FROM daily d
        ORDER BY d.branch_id, d.metric_date DESC NULLS LAST
      ),
      src AS (
        SELECT
          b.organization_id,
          b.id::text AS branch_id,
          b.name::text AS branch_name,
          l.metric_date::date AS metric_date,
          CASE
            WHEN l.total_revenue > COALESCE(l.rev_l1, 0) AND l.total_revenue > 0
              THEN (COALESCE(NULLIF(TRIM(BOTH FROM b.name), ''), b.id::text) || ' revenue improving over the last few days')::text
            WHEN l.total_revenue > 0
              THEN (COALESCE(NULLIF(TRIM(BOTH FROM b.name), ''), b.id::text) || ' maintaining stable customer activity')::text
            ELSE (COALESCE(NULLIF(TRIM(BOTH FROM b.name), ''), b.id::text) || ' operating normally — no major issues detected')::text
          END AS insight_text,
          CASE
            WHEN l.total_revenue > COALESCE(l.rev_l1, 0) AND l.total_revenue > 0 THEN 120::numeric
            WHEN l.total_revenue > 0 THEN 80::numeric
            ELSE 50::numeric
          END AS sort_score
        FROM public.branches b
        LEFT JOIN latest l ON l.branch_id = b.id::text
      ),
      fallback AS (
        SELECT
          b.organization_id,
          b.id::text AS branch_id,
          b.name::text AS branch_name,
          NULL::date AS metric_date,
          (COALESCE(NULLIF(TRIM(BOTH FROM b.name), ''), b.id::text) || ' operating normally — no major issues detected')::text AS insight_text,
          1::numeric AS sort_score
        FROM public.branches b
        WHERE NOT EXISTS (
          SELECT 1
          FROM src s
          WHERE s.branch_id = b.id::text
        )
      )
      SELECT * FROM src
      UNION ALL
      SELECT * FROM fallback
      $sql$
    );
  END IF;

  -- 2) branch_business_trends: 7d vs prior 7d summary, with stable fallback.
  IF has_branch_business_trends THEN
    PERFORM pg_temp.refresh_view_preserve_schema(
      'public.branch_business_trends',
      $sql$
      WITH ranked AS (
        SELECT
          t.branch_id::text AS branch_id,
          t.metric_date::date AS metric_date,
          COALESCE(t.total_revenue, 0)::numeric AS total_revenue,
          ROW_NUMBER() OVER (PARTITION BY t.branch_id ORDER BY t.metric_date DESC NULLS LAST) AS rn
        FROM public.today_summary_clean t
      ),
      agg AS (
        SELECT
          r.branch_id,
          MAX(r.metric_date) AS metric_date,
          SUM(r.total_revenue) FILTER (WHERE r.rn <= 7) AS revenue_7d,
          SUM(r.total_revenue) FILTER (WHERE r.rn BETWEEN 8 AND 14) AS revenue_prev_7d
        FROM ranked r
        GROUP BY r.branch_id
      ),
      enriched AS (
        SELECT
          b.organization_id,
          b.id::text AS branch_id,
          b.name::text AS branch_name,
          a.metric_date,
          CASE
            WHEN COALESCE(a.revenue_7d, 0) <= 0 THEN 'Performance is stable — more data needed'
            WHEN COALESCE(a.revenue_prev_7d, 0) <= 0 THEN 'Early data, trend forming'
            WHEN a.revenue_7d > a.revenue_prev_7d * 1.03 THEN 'Revenue is improving'
            WHEN a.revenue_7d < a.revenue_prev_7d * 0.97 THEN 'Revenue is declining'
            ELSE 'Revenue is stable'
          END::text AS insight_text,
          COALESCE(a.revenue_7d, 0)::numeric AS sort_score
        FROM public.branches b
        LEFT JOIN agg a ON a.branch_id = b.id::text
      )
      SELECT * FROM enriched
      $sql$
    );
  END IF;

  -- 3) watchlist_branch: non-urgent warnings, with non-empty fallback per branch.
  IF has_watchlist_branch THEN
    PERFORM pg_temp.refresh_view_preserve_schema(
      'public.watchlist_branch',
      $sql$
      WITH src AS (
        SELECT
          w.organization_id,
          w.branch_id::text AS branch_id,
          w.branch_name::text AS branch_name,
          w.metric_date::date AS metric_date,
          COALESCE(NULLIF(TRIM(BOTH FROM w.warning_text), ''), 'No early warning signals detected')::text AS insight_text,
          COALESCE(w.sort_score, 0)::numeric AS sort_score
        FROM public.watchlist_today w
      ),
      fallback AS (
        SELECT
          b.organization_id,
          b.id::text AS branch_id,
          b.name::text AS branch_name,
          NULL::date AS metric_date,
          'No early warning signals detected'::text AS insight_text,
          1::numeric AS sort_score
        FROM public.branches b
        WHERE NOT EXISTS (
          SELECT 1
          FROM src s
          WHERE s.branch_id = b.id::text
        )
      )
      SELECT * FROM src
      UNION ALL
      SELECT * FROM fallback
      $sql$
    );
  END IF;
END
$$;

