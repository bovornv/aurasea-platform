-- Company Today: profitability signals + branch_business_status
--
-- PostgreSQL: CREATE OR REPLACE VIEW cannot remove/rename columns vs the existing
-- view → ERROR: cannot drop columns from view. Always DROP first (this file does).
--
-- Runbook (Supabase SQL editor):
--   1) Optional: run drop-branch-business-status-for-recreate.sql if you only want
--      an explicit Step 1 before pasting custom SQL.
--   2) Run THIS ENTIRE FILE from line 1 (drops + both CREATE VIEWs + GRANTs).
--   3) VERIFY: SELECT * FROM branch_business_status LIMIT 5;
--
-- Run in this order: (1) drop dependent views (2) branch_performance_signal (3) branch_business_status
--
-- Requires:
--   public.branches (id, organization_id, name, module_type)
--   public.today_summary_clean (latest metrics per branch/day; same shape semantics as former today_summary_clean_safe)
--   public.accommodation_profitability_signal
--   public.fnb_profitability_signal
--
-- Trend columns differ by deployment; we read optional keys via row_to_json so missing
-- columns (e.g. profit_trend) do not fail at CREATE VIEW time.

-- ========== 1) Drop views (dependent first) ==========
DROP VIEW IF EXISTS branch_business_status CASCADE;
DROP VIEW IF EXISTS branch_performance_signal CASCADE;

-- ========== 2) branch_performance_signal — latest row per branch per module ==========
CREATE VIEW branch_performance_signal AS
WITH fnb_cost_30d AS (
  SELECT
    f.branch_id::text AS branch_id,
    (
      SUM(
        COALESCE(f.additional_cost_today, 0)::numeric
        + (COALESCE(f.monthly_fixed_cost, 0)::numeric / 30::numeric)
      )
      /
      NULLIF(SUM(COALESCE(f.total_customers, 0)::numeric), 0)
    )::numeric AS avg_daily_cost
  FROM fnb_daily_metrics f
  WHERE f.metric_date >= (CURRENT_DATE - INTERVAL '30 days')
  GROUP BY f.branch_id::text
)
SELECT *
FROM (
  SELECT DISTINCT ON (t.branch_id)
    t.branch_id::text AS branch_id,
    'accommodation'::text AS branch_type,
    t.metric_date::date AS metric_date,
    NULLIF(
      TRIM(
        COALESCE(
          (sig.j->>'profitability_trend'),
          (sig.j->>'profit_trend'),
          (sig.j->>'profit_margin_trend'),
          (sig.j->>'trend'),
          ''
        )
      ),
      ''
    ) AS profit_margin_trend,
    NULL::numeric AS avg_daily_cost
  FROM accommodation_profitability_signal t
  CROSS JOIN LATERAL (SELECT row_to_json(t)::jsonb AS j) AS sig
  ORDER BY t.branch_id, t.metric_date DESC NULLS LAST
) acc
UNION ALL
SELECT *
FROM (
  SELECT DISTINCT ON (t.branch_id)
    t.branch_id::text AS branch_id,
    'fnb'::text AS branch_type,
    t.metric_date::date AS metric_date,
    NULLIF(
      TRIM(
        COALESCE(
          (sig.j->>'margin_trend'),
          (sig.j->>'margin_direction'),
          (sig.j->>'profitability_trend'),
          (sig.j->>'trend'),
          ''
        )
      ),
      ''
    ) AS profit_margin_trend,
    COALESCE(
      f30.avg_daily_cost,
      NULLIF(TRIM(sig.j->>'avg_daily_cost'), '')::numeric,
      NULLIF(TRIM(sig.j->>'average_daily_cost'), '')::numeric,
      NULLIF(TRIM(sig.j->>'daily_cost'), '')::numeric,
      NULLIF(TRIM(sig.j->>'avg_cost'), '')::numeric,
      NULL::numeric
    ) AS avg_daily_cost
  FROM fnb_profitability_signal t
  CROSS JOIN LATERAL (SELECT row_to_json(t)::jsonb AS j) AS sig
  LEFT JOIN fnb_cost_30d f30 ON f30.branch_id = t.branch_id::text
  ORDER BY t.branch_id, t.metric_date DESC NULLS LAST
) fnb;

COMMENT ON VIEW branch_performance_signal IS
  'Latest profitability/margin signal per branch; accommodation + fnb UNION. Feeds branch_business_status.';

-- ========== 3) branch_business_status — one row per branch (latest today_summary_clean + signals) ==========
CREATE VIEW branch_business_status AS
SELECT
  b.id AS branch_id,
  b.organization_id,
  COALESCE(b.branch_name, b.name) AS branch_name,
  b.module_type::text AS branch_type,
  l.metric_date,
  l.health_score,
  COALESCE(l.occupancy_rate, 0)::numeric AS occupancy_pct,
  CASE
    WHEN LOWER(COALESCE(b.module_type::text, '')) IN (
      'accommodation', 'hotel', 'hotel_resort', 'rooms', 'hotel_with_cafe'
    )
      THEN COALESCE(l.accommodation_revenue, l.total_revenue, 0)::numeric
    ELSE COALESCE(l.fnb_revenue, l.total_revenue, 0)::numeric
  END AS revenue_thb,
  COALESCE(l.adr, 0)::numeric AS adr,
  COALESCE(l.utilized, 0)::integer AS rooms_sold,
  COALESCE(l.capacity, 0)::integer AS rooms_total,
  COALESCE(l.revpar, 0)::numeric AS revpar,
  COALESCE(l.customers, 0)::numeric AS customers,
  CASE
    WHEN COALESCE(l.customers, 0) > 0
      THEN (
        COALESCE(l.fnb_revenue, l.total_revenue, 0)::numeric / NULLIF(l.customers::numeric, 0)
      )
    ELSE NULL::numeric
  END AS avg_ticket,
  ps_acc.profit_margin_trend AS profitability_trend,
  ps_fnb.profit_margin_trend AS margin_trend,
  ps_fnb.avg_daily_cost,
  NULL::integer AS days_since_update,
  NULL::text AS freshness_status
FROM branches b
INNER JOIN (
  SELECT DISTINCT ON (t.branch_id)
    t.branch_id::text AS branch_id,
    t.metric_date::date AS metric_date,
    COALESCE(t.total_revenue, 0)::numeric AS total_revenue,
    COALESCE(t.accommodation_revenue, t.total_revenue, 0)::numeric AS accommodation_revenue,
    COALESCE(t.fnb_revenue, 0)::numeric AS fnb_revenue,
    COALESCE(t.customers, 0)::numeric AS customers,
    COALESCE(t.capacity, 0)::integer AS capacity,
    COALESCE(t.utilized, 0)::integer AS utilized,
    t.occupancy_rate::numeric AS occupancy_rate,
    CASE
      WHEN COALESCE(t.utilized, 0) > 0
      THEN (COALESCE(t.total_revenue, 0)::numeric / NULLIF(t.utilized::numeric, 0))
      ELSE NULL::numeric
    END AS adr,
    CASE
      WHEN COALESCE(t.capacity, 0) > 0
      THEN (COALESCE(t.total_revenue, 0)::numeric / NULLIF(t.capacity::numeric, 0))
      ELSE NULL::numeric
    END AS revpar,
    CASE
      WHEN t.revenue_delta_day IS NULL THEN 70::numeric
      WHEN t.revenue_delta_day >= 0 THEN 76::numeric
      ELSE 58::numeric
    END AS health_score
  FROM today_summary_clean t
  ORDER BY t.branch_id, t.metric_date DESC NULLS LAST
) l ON l.branch_id = b.id::text
LEFT JOIN branch_performance_signal ps_acc
  ON ps_acc.branch_id = b.id::text AND ps_acc.branch_type = 'accommodation'
LEFT JOIN branch_performance_signal ps_fnb
  ON ps_fnb.branch_id = b.id::text AND ps_fnb.branch_type = 'fnb';

COMMENT ON VIEW branch_business_status IS
  'Latest today_summary_clean per branch + profitability_trend, margin_trend, avg_daily_cost from branch_performance_signal.';

GRANT SELECT ON branch_performance_signal TO anon, authenticated;
GRANT SELECT ON branch_business_status TO anon, authenticated;
