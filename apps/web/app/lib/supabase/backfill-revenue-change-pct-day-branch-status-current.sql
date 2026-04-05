-- =============================================================================
-- Backfill only: branch_status_current.revenue_change_pct_day
-- =============================================================================
-- Run when you already applied update-branch-status-current-today-display.sql once
-- but need to refresh % after fixing logic, or after new daily metrics rows land.
--
-- Formula (same as update-branch-status-current-today-display.sql):
--   SUM revenue per (branch_id, metric_date) from branch_daily_metrics,
--   then compare latest vs immediately prior calendar day:
--   ((today_sum - prev_sum) / prev_sum) * 100, round 1 decimal; NULL if prev null/0.
--
-- Safe to rerun.
-- =============================================================================

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
