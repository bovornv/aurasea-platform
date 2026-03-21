-- Company Today: profitability signals + branch_business_status
-- Run in this order: (1) drop dependent views (2) branch_performance_signal (3) branch_business_status
--
-- Requires:
--   public.branches (id, organization_id, name, module_type)
--   public.today_summary_clean_safe (latest metrics per branch/day; app queries this, not today_summary_clean)
--   public.accommodation_profitability_signal
--   public.fnb_profitability_signal
--
-- Adjust column names in the CTEs below if your signal views use different names.

-- ========== 1) Drop views (dependent first) ==========
DROP VIEW IF EXISTS branch_business_status CASCADE;
DROP VIEW IF EXISTS branch_performance_signal CASCADE;

-- ========== 2) branch_performance_signal — latest row per branch per module ==========
CREATE VIEW branch_performance_signal AS
SELECT *
FROM (
  SELECT DISTINCT ON (branch_id)
    branch_id::text AS branch_id,
    'accommodation'::text AS branch_type,
    metric_date::date AS metric_date,
    NULLIF(
      TRIM(
        COALESCE(
          profitability_trend::text,
          profit_trend::text,
          profit_margin_trend::text,
          trend::text,
          ''
        )
      ),
      ''
    ) AS profit_margin_trend,
    NULL::numeric AS avg_daily_cost
  FROM accommodation_profitability_signal
  ORDER BY branch_id, metric_date DESC NULLS LAST
) acc
UNION ALL
SELECT *
FROM (
  SELECT DISTINCT ON (branch_id)
    branch_id::text AS branch_id,
    'fnb'::text AS branch_type,
    metric_date::date AS metric_date,
    NULLIF(
      TRIM(
        COALESCE(
          margin_trend::text,
          margin_direction::text,
          profitability_trend::text,
          trend::text,
          ''
        )
      ),
      ''
    ) AS profit_margin_trend,
    avg_daily_cost::numeric AS avg_daily_cost
  FROM fnb_profitability_signal
  ORDER BY branch_id, metric_date DESC NULLS LAST
) fnb;

COMMENT ON VIEW branch_performance_signal IS
  'Latest profitability/margin signal per branch; accommodation + fnb UNION. Feeds branch_business_status.';

-- ========== 3) branch_business_status — one row per branch (latest today_summary_clean_safe + signals) ==========
CREATE VIEW branch_business_status AS
SELECT
  b.id AS branch_id,
  b.organization_id,
  b.name AS branch_name,
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
  SELECT DISTINCT ON (branch_id)
    branch_id,
    metric_date,
    total_revenue,
    accommodation_revenue,
    fnb_revenue,
    customers,
    capacity,
    utilized,
    occupancy_rate,
    adr,
    revpar,
    health_score
  FROM today_summary_clean_safe
  ORDER BY branch_id, metric_date DESC NULLS LAST
) l ON l.branch_id = b.id
LEFT JOIN branch_performance_signal ps_acc
  ON ps_acc.branch_id = b.id::text AND ps_acc.branch_type = 'accommodation'
LEFT JOIN branch_performance_signal ps_fnb
  ON ps_fnb.branch_id = b.id::text AND ps_fnb.branch_type = 'fnb';

COMMENT ON VIEW branch_business_status IS
  'Company Latest business status: latest today_summary_clean_safe per branch + profitability_trend, margin_trend, avg_daily_cost from branch_performance_signal.';

GRANT SELECT ON branch_performance_signal TO anon, authenticated;
GRANT SELECT ON branch_business_status TO anon, authenticated;
