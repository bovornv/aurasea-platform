-- Alerts pipeline: problems (alerts_today) + actions + opportunities → alerts_top (max 3 per branch).
-- Prerequisite: today_summary_clean must exist (revenue_delta_day, occupancy_delta_week).
-- DROP first so column names can change (PostgreSQL REPLACE cannot rename columns).
DROP VIEW IF EXISTS alerts_top CASCADE;
DROP VIEW IF EXISTS alerts_ranked CASCADE;
DROP VIEW IF EXISTS alerts_all CASCADE;
DROP VIEW IF EXISTS alerts_with_actions CASCADE;
DROP VIEW IF EXISTS alerts_today CASCADE;
DROP VIEW IF EXISTS alerts_opportunities CASCADE;

-- Step 1: Problems only (rule-based)
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

-- Step 2: Add recommendations and expected recovery
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

-- Step 3: Opportunity alerts (revenue growing)
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

-- Step 4: Combine (problems first via union order)
CREATE VIEW alerts_all AS
SELECT * FROM alerts_with_actions
UNION ALL
SELECT * FROM alerts_opportunities;

-- Step 5: Rank by severity desc, then metric_date desc (max 3 per branch)
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
GRANT SELECT ON alerts_today TO anon, authenticated;
GRANT SELECT ON alerts_with_actions TO anon, authenticated;
GRANT SELECT ON alerts_opportunities TO anon, authenticated;
GRANT SELECT ON alerts_all TO anon, authenticated;
GRANT SELECT ON alerts_ranked TO anon, authenticated;
GRANT SELECT ON alerts_top TO anon, authenticated;
