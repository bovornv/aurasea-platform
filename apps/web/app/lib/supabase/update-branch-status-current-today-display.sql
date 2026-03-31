-- =============================================================================
-- public.branch_status_current — Today-page display backfill
-- =============================================================================
-- Goals:
--  1) Add revenue_change_pct_day numeric (1-day % change vs previous available day)
--  2) Normalize profitability_symbol + margin_symbol to symbol/sign only (▲/▼/—)
--
-- Backfill rule (revenue_change_pct_day):
--  - source: public.branch_daily_metrics
--  - latest row per branch vs previous available row per branch (by metric_date desc)
--  - ((latest - prev) / prev) * 100, round( , 1)
--  - if prev is NULL or 0, store NULL
--
-- Safe to rerun.
-- =============================================================================

ALTER TABLE public.branch_status_current
  ADD COLUMN IF NOT EXISTS revenue_change_pct_day NUMERIC;

WITH ranked AS (
  SELECT
    bdm.branch_id,
    bdm.metric_date::date AS metric_date,
    bdm.revenue::numeric AS revenue,
    ROW_NUMBER() OVER (
      PARTITION BY bdm.branch_id
      ORDER BY bdm.metric_date::date DESC, bdm.created_at DESC NULLS LAST
    ) AS rn
  FROM public.branch_daily_metrics bdm
),
latest AS (
  SELECT branch_id, metric_date, revenue
  FROM ranked
  WHERE rn = 1
),
prev AS (
  SELECT branch_id, metric_date, revenue
  FROM ranked
  WHERE rn = 2
),
calc AS (
  SELECT
    l.branch_id,
    l.metric_date AS latest_metric_date,
    l.revenue AS latest_revenue,
    p.metric_date AS prev_metric_date,
    p.revenue AS prev_revenue,
    CASE
      WHEN p.revenue IS NULL OR p.revenue = 0 THEN NULL::numeric
      ELSE ROUND(((l.revenue - p.revenue) / p.revenue) * 100::numeric, 1)
    END AS revenue_change_pct_day
  FROM latest l
  LEFT JOIN prev p ON p.branch_id = l.branch_id
)
UPDATE public.branch_status_current bsc
SET revenue_change_pct_day = c.revenue_change_pct_day
FROM calc c
WHERE bsc.branch_id = c.branch_id;

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

