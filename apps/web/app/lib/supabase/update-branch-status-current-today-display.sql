-- =============================================================================
-- public.branch_status_current — Today-page display backfill
-- =============================================================================
-- Goals:
--  1) Add revenue_change_pct_day numeric (1-day % change vs previous available day)
--  2) Normalize profitability_symbol + margin_symbol to symbol/sign only (▲/▼/—)
--
-- Backfill rule (revenue_change_pct_day):
--  - source: public.branch_daily_metrics
--  - IMPORTANT: branch_daily_metrics can have MULTIPLE rows per (branch_id, metric_date)
--    (accommodation ∪ F&B). Row-numbering raw rows pairs the wrong rows (same-day streams
--    or wrong order) and can invert / distort day-over-day % (e.g. +50% instead of -50%).
--  - Fix: SUM(revenue) per (branch_id, metric_date), then take the two latest DISTINCT dates.
--  - revenue_change_pct_day = ((today_revenue - previous_day_revenue) / previous_day_revenue) * 100
--    rounded to 1 decimal; if previous_day_revenue is NULL or 0, NULL.
--
-- Safe to rerun.
-- =============================================================================

ALTER TABLE public.branch_status_current
  ADD COLUMN IF NOT EXISTS revenue_change_pct_day NUMERIC;

WITH per_day AS (
  SELECT
    trim(both FROM bdm.branch_id::text) AS branch_id,
    bdm.metric_date::date AS metric_date,
    SUM(COALESCE(bdm.revenue, 0)::numeric) AS revenue_day
  FROM public.branch_daily_metrics bdm
  WHERE bdm.branch_id IS NOT NULL
  GROUP BY trim(both FROM bdm.branch_id::text), bdm.metric_date::date
),
ranked_days AS (
  SELECT
    branch_id,
    metric_date,
    revenue_day,
    ROW_NUMBER() OVER (
      PARTITION BY branch_id
      ORDER BY metric_date DESC
    ) AS rn
  FROM per_day
),
latest AS (
  SELECT branch_id, metric_date, revenue_day
  FROM ranked_days
  WHERE rn = 1
),
prev AS (
  SELECT branch_id, metric_date, revenue_day
  FROM ranked_days
  WHERE rn = 2
),
calc AS (
  SELECT
    l.branch_id,
    l.metric_date AS latest_metric_date,
    l.revenue_day AS latest_revenue,
    p.metric_date AS prev_metric_date,
    p.revenue_day AS prev_revenue,
    CASE
      WHEN p.revenue_day IS NULL OR p.revenue_day = 0 THEN NULL::numeric
      ELSE ROUND(
        ((l.revenue_day - p.revenue_day) / p.revenue_day) * 100::numeric,
        1
      )
    END AS revenue_change_pct_day
  FROM latest l
  LEFT JOIN prev p ON p.branch_id = l.branch_id
)
UPDATE public.branch_status_current bsc
SET revenue_change_pct_day = c.revenue_change_pct_day
FROM calc c
WHERE trim(both FROM bsc.branch_id::text) = c.branch_id;

-- -----------------------------------------------------------------------------
-- Symbol normalization (store sign only)
-- -----------------------------------------------------------------------------
-- profitability_symbol:
--  ▲ if profitability > 0
--  ▼ if profitability < 0
--  — if profitability is null or 0
--
-- margin_symbol:
--  ▲ if margin > 0
--  ▼ if margin < 0
--  — if margin is null or 0
--
-- Handles profitability/margin stored as numeric OR text (casts when possible).
-- -----------------------------------------------------------------------------

UPDATE public.branch_status_current
SET
  profitability_symbol = CASE
    WHEN NULLIF(TRIM(COALESCE(profitability::text, '')), '') IS NULL THEN '—'::text
    WHEN (NULLIF(TRIM(profitability::text), '')::numeric) > 0 THEN '▲'::text
    WHEN (NULLIF(TRIM(profitability::text), '')::numeric) < 0 THEN '▼'::text
    ELSE '—'::text
  END,
  margin_symbol = CASE
    WHEN NULLIF(TRIM(COALESCE(margin::text, '')), '') IS NULL THEN '—'::text
    WHEN (NULLIF(TRIM(margin::text), '')::numeric) > 0 THEN '▲'::text
    WHEN (NULLIF(TRIM(margin::text), '')::numeric) < 0 THEN '▼'::text
    ELSE '—'::text
  END;

-- -----------------------------------------------------------------------------
-- Verification queries (run manually)
-- -----------------------------------------------------------------------------
-- 1) Column exists:
--    SELECT column_name, data_type
--    FROM information_schema.columns
--    WHERE table_schema='public'
--      AND table_name='branch_status_current'
--      AND column_name IN ('revenue_change_pct_day','profitability_symbol','margin_symbol')
--    ORDER BY column_name;
--
-- 2) Spot check computed values:
--    SELECT
--      branch_id,
--      metric_date,
--      revenue,
--      revenue_change_pct_day,
--      profitability,
--      profitability_symbol,
--      margin,
--      margin_symbol
--    FROM public.branch_status_current
--    ORDER BY metric_date DESC NULLS LAST
--    LIMIT 50;
--
-- 3) Rows missing pct (expected when <2 days of revenue history):
--    SELECT COUNT(*) AS missing_pct_rows
--    FROM public.branch_status_current
--    WHERE revenue_change_pct_day IS NULL;
--
-- 4) Reconcile vs branch_daily_metrics (expected % for latest vs prior calendar day):
--    WITH per_day AS (
--      SELECT trim(both FROM branch_id::text) AS branch_id, metric_date::date AS metric_date,
--             SUM(COALESCE(revenue,0)::numeric) AS revenue_day
--      FROM public.branch_daily_metrics GROUP BY 1, 2
--    ),
--    ranked_days AS (
--      SELECT branch_id, metric_date, revenue_day,
--             ROW_NUMBER() OVER (PARTITION BY branch_id ORDER BY metric_date DESC) AS rn
--      FROM per_day
--    )
--    SELECT l.branch_id, l.revenue_day AS today_rev, p.revenue_day AS prev_rev,
--           ROUND(((l.revenue_day - p.revenue_day) / NULLIF(p.revenue_day, 0)) * 100, 1) AS expected_pct
--    FROM ranked_days l
--    LEFT JOIN ranked_days p ON p.branch_id = l.branch_id AND p.rn = 2
--    WHERE l.rn = 1;
--    -- Then: SELECT branch_id, revenue_change_pct_day FROM branch_status_current; values should match expected_pct.
--
-- 5) Expected examples (when latest/prev revenues are as stated):
--    Crystal Resort: 38824 vs 44753 → revenue_change_pct_day = -13.2
--    Crystal Cafe:   4000 vs 8100  → revenue_change_pct_day = -50.6

