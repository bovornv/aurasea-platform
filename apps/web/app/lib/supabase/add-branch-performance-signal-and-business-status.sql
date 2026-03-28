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
--   public.today_summary (latest metrics per branch/day for branch_business_status join)
--   public.accommodation_profitability_signal (run add-accommodation-profitability-signal-view.sql if missing)
--   public.fnb_profitability_signal
--   public.fnb_daily_metrics: metric_date, additional_cost_today (nullable), monthly_fixed_cost (nullable, per row in table — use MAX over 30d, not SUM);
--     revenue (if your table only has total_sales, replace d.revenue below with d.total_sales);
--     total_customers (if you only have customers, replace d.total_customers with d.customers below). No branches join for fixed cost.
--
-- Trend columns differ by deployment; we read optional keys via row_to_json so missing
-- columns (e.g. profit_trend) do not fail at CREATE VIEW time.

-- ========== 1) Drop views (dependent first) ==========
DROP VIEW IF EXISTS branch_business_status CASCADE;
DROP VIEW IF EXISTS branch_performance_signal CASCADE;

-- ========== 2) branch_performance_signal — latest row per branch per module ==========
CREATE VIEW branch_performance_signal AS
WITH fnb_latest AS (
  SELECT DISTINCT ON (f.branch_id)
    f.branch_id,
    f.metric_date::date AS metric_date
  FROM public.fnb_daily_metrics f
  WHERE f.branch_id IS NOT NULL
  ORDER BY f.branch_id, f.metric_date DESC NULLS LAST
),
fnb_agg30 AS (
  SELECT
    d.branch_id::text AS branch_id,
    SUM(COALESCE(d.additional_cost_today, 0)::numeric) AS variable_cost_30d,
    SUM(COALESCE(d.revenue, 0::numeric)) AS revenue_30d,
    SUM(COALESCE(d.total_customers, 0::numeric)) AS customers_30d,
    MAX(COALESCE(d.monthly_fixed_cost, 0::numeric)) AS monthly_fixed_max_30d
  FROM public.fnb_daily_metrics d
  INNER JOIN fnb_latest l ON l.branch_id = d.branch_id
  WHERE d.metric_date::date >= (l.metric_date - INTERVAL '29 days')
    AND d.metric_date::date <= l.metric_date
  GROUP BY d.branch_id
),
fnb_cost_30d AS (
  SELECT
    a.branch_id,
    (COALESCE(a.variable_cost_30d, 0::numeric) + COALESCE(a.monthly_fixed_max_30d, 0::numeric))::numeric AS total_cost_30d,
    (
      (COALESCE(a.variable_cost_30d, 0::numeric) + COALESCE(a.monthly_fixed_max_30d, 0::numeric)) / 30.0::numeric
    )::numeric AS daily_cost,
    (
      (COALESCE(a.variable_cost_30d, 0::numeric) + COALESCE(a.monthly_fixed_max_30d, 0::numeric))
      / NULLIF(COALESCE(a.customers_30d, 0::numeric), 0)
    )::numeric AS cost_per_customer_30d,
    (
      (COALESCE(a.variable_cost_30d, 0::numeric) + COALESCE(a.monthly_fixed_max_30d, 0::numeric))
      / NULLIF(COALESCE(a.revenue_30d, 0::numeric), 0)
    )::numeric AS cost_ratio_30d
  FROM fnb_agg30 a
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
          NULLIF(TRIM(COALESCE(t.profitability_trend::text, '')), ''),
          (sig.j->>'profitability_trend'),
          (sig.j->>'profit_trend'),
          (sig.j->>'profit_margin_trend'),
          (sig.j->>'trend'),
          ''
        )
      ),
      ''
    ) AS profit_margin_trend,
    COALESCE(
      t.daily_cost,
      NULLIF(TRIM((sig.j->>'daily_cost')), '')::numeric,
      NULLIF(TRIM((sig.j->>'avg_daily_cost')), '')::numeric,
      NULL::numeric
    ) AS avg_daily_cost,
    NULL::numeric AS fnb_cost_per_customer_30d,
    NULL::numeric AS fnb_cost_to_revenue_30d
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
      f30.daily_cost,
      NULLIF(TRIM(sig.j->>'avg_daily_cost'), '')::numeric,
      NULLIF(TRIM(sig.j->>'average_daily_cost'), '')::numeric,
      NULLIF(TRIM(sig.j->>'daily_cost'), '')::numeric,
      NULLIF(TRIM(sig.j->>'avg_cost'), '')::numeric,
      NULL::numeric
    ) AS avg_daily_cost,
    f30.cost_per_customer_30d AS fnb_cost_per_customer_30d,
    f30.cost_ratio_30d AS fnb_cost_to_revenue_30d
  FROM fnb_profitability_signal t
  CROSS JOIN LATERAL (SELECT row_to_json(t)::jsonb AS j) AS sig
  LEFT JOIN fnb_cost_30d f30 ON f30.branch_id = t.branch_id::text
  ORDER BY t.branch_id, t.metric_date DESC NULLS LAST
) fnb;

COMMENT ON VIEW branch_performance_signal IS
  'Latest profitability/margin signal per branch; accommodation + fnb UNION. F&B avg_daily_cost = (SUM(additional_cost_today over 30d ending latest metric_date) + MAX(monthly_fixed_cost in window)) / 30 from fnb_daily_metrics only; also cost_per_customer_30d and cost_to_revenue_30d.';

-- ========== 3) branch_business_status — one row per branch (latest today_summary + signals) ==========
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
  ps_fnb.fnb_cost_per_customer_30d,
  ps_fnb.fnb_cost_to_revenue_30d,
  NULL::integer AS days_since_update,
  NULL::text AS freshness_status
FROM branches b
INNER JOIN (
  SELECT DISTINCT ON (t.branch_id)
    t.branch_id::text AS branch_id,
    t.metric_date::date AS metric_date,
    COALESCE(
      NULLIF(TRIM(jrow.jb->>'total_revenue'), '')::numeric,
      NULLIF(TRIM(jrow.jb->>'revenue'), '')::numeric,
      NULLIF(TRIM(jrow.jb->>'total_revenue_thb'), '')::numeric,
      0
    ) AS total_revenue,
    COALESCE(
      NULLIF(TRIM(jrow.jb->>'accommodation_revenue'), '')::numeric,
      NULLIF(TRIM(jrow.jb->>'accommodation_revenue_thb'), '')::numeric,
      0
    ) AS accommodation_revenue,
    COALESCE(
      NULLIF(TRIM(jrow.jb->>'fnb_revenue'), '')::numeric,
      NULLIF(TRIM(jrow.jb->>'fnb_revenue_thb'), '')::numeric,
      0
    ) AS fnb_revenue,
    COALESCE(
      NULLIF(TRIM(jrow.jb->>'customers'), '')::numeric,
      NULLIF(TRIM(jrow.jb->>'total_customers'), '')::numeric,
      0
    ) AS customers,
    COALESCE(
      NULLIF(TRIM(jrow.jb->>'capacity'), '')::numeric::integer,
      NULLIF(TRIM(jrow.jb->>'rooms_available'), '')::numeric::integer,
      0
    ) AS capacity,
    COALESCE(
      NULLIF(TRIM(jrow.jb->>'utilized'), '')::numeric::integer,
      NULLIF(TRIM(jrow.jb->>'rooms_sold'), '')::numeric::integer,
      0
    ) AS utilized,
    COALESCE(
      NULLIF(TRIM(jrow.jb->>'occupancy_rate'), '')::numeric,
      CASE
        WHEN COALESCE(
          NULLIF(TRIM(jrow.jb->>'capacity'), '')::numeric,
          NULLIF(TRIM(jrow.jb->>'rooms_available'), '')::numeric,
          0
        ) > 0
        THEN (
          COALESCE(
            NULLIF(TRIM(jrow.jb->>'utilized'), '')::numeric,
            NULLIF(TRIM(jrow.jb->>'rooms_sold'), '')::numeric,
            0
          )
          / NULLIF(
              COALESCE(
                NULLIF(TRIM(jrow.jb->>'capacity'), '')::numeric,
                NULLIF(TRIM(jrow.jb->>'rooms_available'), '')::numeric,
                0
              ),
              0
            )
        ) * 100
        ELSE NULL::numeric
      END
    ) AS occupancy_rate,
    COALESCE(
      NULLIF(TRIM(jrow.jb->>'adr'), '')::numeric,
      CASE
        WHEN COALESCE(
          NULLIF(TRIM(jrow.jb->>'utilized'), '')::numeric,
          NULLIF(TRIM(jrow.jb->>'rooms_sold'), '')::numeric,
          0
        ) > 0
        THEN
          COALESCE(
            NULLIF(TRIM(jrow.jb->>'total_revenue'), '')::numeric,
            NULLIF(TRIM(jrow.jb->>'revenue'), '')::numeric,
            0
          )
          / NULLIF(
              COALESCE(
                NULLIF(TRIM(jrow.jb->>'utilized'), '')::numeric,
                NULLIF(TRIM(jrow.jb->>'rooms_sold'), '')::numeric,
                0
              ),
              0
            )
        ELSE NULL::numeric
      END
    ) AS adr,
    COALESCE(
      NULLIF(TRIM(jrow.jb->>'revpar'), '')::numeric,
      CASE
        WHEN COALESCE(
          NULLIF(TRIM(jrow.jb->>'capacity'), '')::numeric,
          NULLIF(TRIM(jrow.jb->>'rooms_available'), '')::numeric,
          0
        ) > 0
        THEN
          COALESCE(
            NULLIF(TRIM(jrow.jb->>'total_revenue'), '')::numeric,
            NULLIF(TRIM(jrow.jb->>'revenue'), '')::numeric,
            0
          )
          / NULLIF(
              COALESCE(
                NULLIF(TRIM(jrow.jb->>'capacity'), '')::numeric,
                NULLIF(TRIM(jrow.jb->>'rooms_available'), '')::numeric,
                0
              ),
              0
            )
        ELSE NULL::numeric
      END
    ) AS revpar,
    COALESCE(
      NULLIF(TRIM(jrow.jb->>'health_score'), '')::numeric,
      CASE
        WHEN (jrow.jb->>'revenue_delta_day') IS NULL OR btrim(COALESCE(jrow.jb->>'revenue_delta_day', '')) = ''
          THEN 70::numeric
        WHEN NULLIF(TRIM(jrow.jb->>'revenue_delta_day'), '')::numeric >= 0 THEN 76::numeric
        ELSE 58::numeric
      END
    ) AS health_score
  FROM today_summary t
  CROSS JOIN LATERAL (SELECT row_to_json(t)::jsonb AS jb) AS jrow
  ORDER BY t.branch_id, t.metric_date DESC NULLS LAST
) l ON l.branch_id = b.id::text
LEFT JOIN branch_performance_signal ps_acc
  ON ps_acc.branch_id = b.id::text AND ps_acc.branch_type = 'accommodation'
LEFT JOIN branch_performance_signal ps_fnb
  ON ps_fnb.branch_id = b.id::text AND ps_fnb.branch_type = 'fnb';

COMMENT ON VIEW branch_business_status IS
  'Latest today_summary per branch + profitability_trend, margin_trend, avg_daily_cost, fnb cost-per-customer and cost/revenue ratio (F&B) from branch_performance_signal.';

GRANT SELECT ON branch_performance_signal TO anon, authenticated;
GRANT SELECT ON branch_business_status TO anon, authenticated;
