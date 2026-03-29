-- DEPRECATED — historical. Canonical object: public.today_summary (add-today-summary-view.sql).
-- Fix: Alerts empty for F&B-only (or accommodation-only) branches.
-- 1) today_summary_clean used INNER JOIN → only branches with BOTH streams got rows.
-- 2) revenue_delta_day was NULL → delta-based alerts never fired.
-- This migration: FULL OUTER JOIN so single-stream branches get rows; compute revenue_delta_day with LAG.

-- Step 1: Drop dependents then today_summary_clean.
DROP VIEW IF EXISTS alerts_top CASCADE;
DROP VIEW IF EXISTS alerts_ranked CASCADE;
DROP VIEW IF EXISTS alerts_deduplicated CASCADE;
DROP VIEW IF EXISTS alerts_all CASCADE;
DROP VIEW IF EXISTS alerts_revenue_split_filtered CASCADE;
DROP VIEW IF EXISTS alerts_revenue_split CASCADE;
DROP VIEW IF EXISTS alerts_with_actions CASCADE;
DROP VIEW IF EXISTS alerts_today CASCADE;
DROP VIEW IF EXISTS alerts_opportunities CASCADE;
DROP VIEW IF EXISTS accommodation_health_today CASCADE;
DROP VIEW IF EXISTS branch_anomaly_signals CASCADE;
DROP VIEW IF EXISTS today_summary_clean CASCADE;

-- Step 2: Recreate today_summary_clean with FULL OUTER JOIN and computed revenue_delta_day.
CREATE VIEW today_summary_clean AS
WITH base AS (
    SELECT
        COALESCE(a.branch_id, f.branch_id) AS branch_id,
        COALESCE(a.metric_date, f.metric_date) AS metric_date,
        (COALESCE(a.revenue, 0) + COALESCE(f.revenue, 0)) AS total_revenue,
        a.revenue AS accommodation_revenue,
        f.revenue AS fnb_revenue,
        f.total_customers AS customers,
        f.total_customers AS transactions,
        a.rooms_available AS capacity,
        a.rooms_sold AS utilized,
        CASE
            WHEN COALESCE(a.rooms_available, 0) > 0
            THEN (a.rooms_sold::numeric / a.rooms_available) * 100
            ELSE NULL
        END AS occupancy_rate,
        70 AS health_score
    FROM accommodation_daily_metrics a
    FULL OUTER JOIN fnb_daily_metrics f
        ON a.branch_id = f.branch_id
        AND a.metric_date = f.metric_date
),
with_prev AS (
    SELECT
        *,
        LAG(total_revenue) OVER (PARTITION BY branch_id ORDER BY metric_date) AS prev_revenue
    FROM base
)
SELECT
    branch_id,
    metric_date,
    total_revenue,
    accommodation_revenue,
    fnb_revenue,
    customers,
    transactions,
    capacity,
    utilized,
    occupancy_rate,
    NULL::numeric AS adr,
    NULL::numeric AS revpar,
    health_score,
    CASE
        WHEN prev_revenue IS NOT NULL AND prev_revenue > 0
        THEN ((total_revenue - prev_revenue) / prev_revenue) * 100
        ELSE NULL
    END AS revenue_delta_day,
    NULL::numeric AS occupancy_delta_week
FROM with_prev;

-- Step 3: Recreate compatibility views.
CREATE VIEW accommodation_health_today AS
SELECT branch_id, metric_date, health_score FROM today_summary_clean;

CREATE VIEW branch_anomaly_signals AS
SELECT branch_id, metric_date, total_revenue AS revenue, 0 AS confidence_score
FROM today_summary_clean;

-- Step 4: Recreate alerts pipeline.
CREATE VIEW alerts_today AS
SELECT
    branch_id,
    metric_date,
    CASE
        WHEN revenue_delta_day <= -10 THEN 'Revenue Drop'
        WHEN occupancy_delta_week <= -10 THEN 'Low Occupancy'
        WHEN COALESCE(customers_delta_day, 0) <= -10 THEN 'Customer Drop'
    END AS alert_type,
    CASE
        WHEN revenue_delta_day <= -20 THEN 3
        WHEN revenue_delta_day <= -10 THEN 2
        WHEN occupancy_delta_week <= -15 THEN 3
        WHEN occupancy_delta_week <= -10 THEN 2
        ELSE 1
    END AS severity,
    CASE
        WHEN revenue_delta_day <= -10
            THEN 'Revenue dropped ' || ABS(ROUND(revenue_delta_day::numeric)) || '% yesterday'
        WHEN occupancy_delta_week <= -10
            THEN 'Occupancy down ' || ABS(ROUND(occupancy_delta_week::numeric)) || '% vs last week'
        WHEN COALESCE(customers_delta_day, 0) <= -10
            THEN 'Customer traffic down ' || ABS(ROUND(COALESCE(customers_delta_day, 0)::numeric)) || '%'
    END AS alert_message,
    'Below recent trend' AS cause
FROM (
    SELECT branch_id, metric_date, revenue_delta_day, occupancy_delta_week,
           NULL::numeric AS customers_delta_day
    FROM today_summary_clean
) t
WHERE revenue_delta_day <= -10
   OR occupancy_delta_week <= -10
   OR COALESCE(customers_delta_day, 0) <= -10;

CREATE VIEW alerts_with_actions AS
SELECT
    *,
    CASE
        WHEN alert_type = 'Revenue Drop' THEN 'Launch short-term promotion or boost OTA visibility'
        WHEN alert_type = 'Low Occupancy' THEN 'Adjust pricing or create package deals'
        WHEN alert_type = 'Customer Drop' THEN 'Introduce bundle offers or targeted promotions'
        ELSE NULL
    END AS recommendation,
    CASE
        WHEN alert_type = 'Revenue Drop' THEN '+5–10% revenue recovery'
        WHEN alert_type = 'Low Occupancy' THEN '+5–8% occupancy recovery'
        WHEN alert_type = 'Customer Drop' THEN '+5–10% traffic recovery'
        ELSE NULL
    END AS expected_recovery
FROM alerts_today;

CREATE VIEW alerts_opportunities AS
SELECT
    branch_id,
    metric_date,
    'High Demand Opportunity' AS alert_type,
    1 AS severity,
    'Demand is strong — revenue growing' AS alert_message,
    'Above recent trend' AS cause,
    'Increase prices slightly or upsell premium options' AS recommendation,
    '+5–12% revenue upside' AS expected_recovery
FROM today_summary_clean
WHERE revenue_delta_day >= 10;

CREATE VIEW alerts_revenue_split AS
SELECT
    branch_id,
    metric_date,
    CASE
        WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL AND fnb_revenue < accommodation_revenue * 0.2 THEN 'F&B Underperformance'
        WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL AND accommodation_revenue < fnb_revenue * 1.5 THEN 'Low Room Revenue Contribution'
        ELSE NULL
    END AS alert_type,
    CASE
        WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL AND fnb_revenue < accommodation_revenue * 0.15 THEN 3
        WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL AND fnb_revenue < accommodation_revenue * 0.2 THEN 2
        WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL AND accommodation_revenue < fnb_revenue * 1.5 THEN 2
        ELSE 1
    END AS severity,
    CASE
        WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL AND fnb_revenue < accommodation_revenue * 0.2
            THEN 'F&B revenue significantly lower than rooms revenue'
        WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL AND accommodation_revenue < fnb_revenue * 1.5
            THEN 'Room revenue not maximizing potential vs F&B activity'
        ELSE NULL
    END AS alert_message,
    CASE
        WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL AND fnb_revenue < accommodation_revenue * 0.2
            THEN 'Low in-house guest conversion or weak external traffic'
        WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL AND accommodation_revenue < fnb_revenue * 1.5
            THEN 'Occupancy or pricing strategy may be suboptimal'
        ELSE NULL
    END AS cause,
    CASE
        WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL AND fnb_revenue < accommodation_revenue * 0.2
            THEN 'Introduce guest meal bundles or promote breakfast/dinner packages'
        WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL AND accommodation_revenue < fnb_revenue * 1.5
            THEN 'Adjust pricing or promote room packages to increase occupancy'
        ELSE NULL
    END AS recommendation,
    CASE
        WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL AND fnb_revenue < accommodation_revenue * 0.2
            THEN '+5–12% total revenue via F&B uplift'
        WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL AND accommodation_revenue < fnb_revenue * 1.5
            THEN '+5–10% room revenue recovery'
        ELSE NULL
    END AS expected_recovery
FROM today_summary_clean
WHERE fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL;

CREATE VIEW alerts_revenue_split_filtered AS
SELECT * FROM alerts_revenue_split WHERE alert_type IS NOT NULL;

CREATE VIEW alerts_all AS
SELECT *, 'problem'::text AS alert_category FROM alerts_with_actions
UNION ALL
SELECT *, 'opportunity'::text AS alert_category FROM alerts_opportunities
UNION ALL
SELECT *, 'problem'::text AS alert_category FROM alerts_revenue_split_filtered;

CREATE VIEW alerts_deduplicated AS
SELECT branch_id, metric_date, alert_type, severity, alert_message, cause, recommendation, expected_recovery, alert_category
FROM (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY branch_id, alert_type
            ORDER BY severity DESC, metric_date DESC
        ) AS rn
    FROM alerts_all
) t
WHERE rn = 1;

CREATE VIEW alerts_ranked AS
SELECT
    *,
    ROW_NUMBER() OVER (
        PARTITION BY branch_id
        ORDER BY
            CASE WHEN alert_category = 'problem' THEN 1 ELSE 2 END,
            severity DESC,
            metric_date DESC
    ) AS rank
FROM alerts_deduplicated;

CREATE VIEW alerts_top AS
SELECT * FROM alerts_ranked WHERE rank <= 3;

-- Grants
GRANT SELECT ON today_summary_clean TO anon, authenticated;
GRANT SELECT ON accommodation_health_today TO anon, authenticated;
GRANT SELECT ON branch_anomaly_signals TO anon, authenticated;
GRANT SELECT ON alerts_today TO anon, authenticated;
GRANT SELECT ON alerts_with_actions TO anon, authenticated;
GRANT SELECT ON alerts_opportunities TO anon, authenticated;
GRANT SELECT ON alerts_revenue_split TO anon, authenticated;
GRANT SELECT ON alerts_revenue_split_filtered TO anon, authenticated;
GRANT SELECT ON alerts_all TO anon, authenticated;
GRANT SELECT ON alerts_deduplicated TO anon, authenticated;
GRANT SELECT ON alerts_ranked TO anon, authenticated;
GRANT SELECT ON alerts_top TO anon, authenticated;
