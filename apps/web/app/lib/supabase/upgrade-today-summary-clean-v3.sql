-- Upgrade today_summary_clean: revenue → total_revenue, add accommodation_revenue, fnb_revenue.
-- Strategy: create v3 → drop dependents → drop old view → rename v3 → recreate dependents.
-- Prerequisite: accommodation_daily_metrics and fnb_daily_metrics must exist.

-- Step 1: Create new version (explicit total_revenue, split revenue). Include NULL deltas for alert views.
CREATE VIEW today_summary_clean_v3 AS
SELECT
    a.branch_id,
    a.metric_date,

    (COALESCE(a.revenue, 0) + COALESCE(f.revenue, 0)) AS total_revenue,
    a.revenue AS accommodation_revenue,
    f.revenue AS fnb_revenue,

    f.total_customers AS customers,
    f.total_customers AS transactions,

    a.rooms_available AS capacity,
    a.rooms_sold AS utilized,

    CASE
        WHEN a.rooms_available > 0
        THEN (a.rooms_sold::numeric / a.rooms_available) * 100
        ELSE NULL
    END AS occupancy_rate,

    NULL::numeric AS adr,
    NULL::numeric AS revpar,

    70 AS health_score,

    NULL::numeric AS revenue_delta_day,
    NULL::numeric AS occupancy_delta_week

FROM accommodation_daily_metrics a
INNER JOIN fnb_daily_metrics f
    ON a.branch_id = f.branch_id
    AND a.metric_date = f.metric_date;

-- Step 2: Drop all views that depend on today_summary_clean (reverse dependency order).
DROP VIEW IF EXISTS alerts_top CASCADE;
DROP VIEW IF EXISTS alerts_ranked CASCADE;
DROP VIEW IF EXISTS alerts_all CASCADE;
DROP VIEW IF EXISTS alerts_revenue_split_filtered CASCADE;
DROP VIEW IF EXISTS alerts_revenue_split CASCADE;
DROP VIEW IF EXISTS alerts_with_actions CASCADE;
DROP VIEW IF EXISTS alerts_today CASCADE;
DROP VIEW IF EXISTS alerts_opportunities CASCADE;
DROP VIEW IF EXISTS accommodation_health_today CASCADE;
DROP VIEW IF EXISTS branch_anomaly_signals CASCADE;
DROP VIEW IF EXISTS today_summary_clean CASCADE;

-- Step 3: Swap v3 to today_summary_clean.
ALTER VIEW today_summary_clean_v3 RENAME TO today_summary_clean;

-- Step 4: Recreate compatibility views (use total_revenue).
CREATE VIEW accommodation_health_today AS
SELECT branch_id, metric_date, health_score
FROM today_summary_clean;

CREATE VIEW branch_anomaly_signals AS
SELECT branch_id, metric_date, total_revenue AS revenue, 0 AS confidence_score
FROM today_summary_clean;

-- Step 5: Recreate alerts pipeline (unchanged logic; today_summary_clean now has total_revenue, revenue_delta_day, occupancy_delta_week).
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
        WHEN fnb_revenue < accommodation_revenue * 0.2 THEN 'F&B Underperformance'
        WHEN accommodation_revenue < fnb_revenue * 1.5 THEN 'Low Room Revenue Contribution'
        ELSE NULL
    END AS alert_type,
    CASE
        WHEN fnb_revenue < accommodation_revenue * 0.15 THEN 3
        WHEN fnb_revenue < accommodation_revenue * 0.2 THEN 2
        WHEN accommodation_revenue < fnb_revenue * 1.5 THEN 2
        ELSE 1
    END AS severity,
    CASE
        WHEN fnb_revenue < accommodation_revenue * 0.2
            THEN 'F&B revenue significantly lower than rooms revenue'
        WHEN accommodation_revenue < fnb_revenue * 1.5
            THEN 'Room revenue not maximizing potential vs F&B activity'
        ELSE NULL
    END AS alert_message,
    CASE
        WHEN fnb_revenue < accommodation_revenue * 0.2
            THEN 'Low in-house guest conversion or weak external traffic'
        WHEN accommodation_revenue < fnb_revenue * 1.5
            THEN 'Occupancy or pricing strategy may be suboptimal'
        ELSE NULL
    END AS cause,
    CASE
        WHEN fnb_revenue < accommodation_revenue * 0.2
            THEN 'Introduce guest meal bundles or promote breakfast/dinner packages'
        WHEN accommodation_revenue < fnb_revenue * 1.5
            THEN 'Adjust pricing or promote room packages to increase occupancy'
        ELSE NULL
    END AS recommendation,
    CASE
        WHEN fnb_revenue < accommodation_revenue * 0.2
            THEN '+5–12% total revenue via F&B uplift'
        WHEN accommodation_revenue < fnb_revenue * 1.5
            THEN '+5–10% room revenue recovery'
        ELSE NULL
    END AS expected_recovery
FROM today_summary_clean
WHERE fnb_revenue IS NOT NULL
  AND accommodation_revenue IS NOT NULL;

CREATE VIEW alerts_revenue_split_filtered AS
SELECT * FROM alerts_revenue_split WHERE alert_type IS NOT NULL;

CREATE VIEW alerts_all AS
SELECT * FROM alerts_with_actions
UNION ALL
SELECT * FROM alerts_opportunities
UNION ALL
SELECT * FROM alerts_revenue_split_filtered;

CREATE VIEW alerts_ranked AS
SELECT
    *,
    ROW_NUMBER() OVER (
        PARTITION BY branch_id
        ORDER BY severity DESC, metric_date DESC
    ) AS rank
FROM alerts_all;

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
GRANT SELECT ON alerts_ranked TO anon, authenticated;
GRANT SELECT ON alerts_top TO anon, authenticated;
