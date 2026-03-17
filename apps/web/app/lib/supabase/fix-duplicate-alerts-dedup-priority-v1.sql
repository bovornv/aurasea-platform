-- fix_duplicate_alerts_dedup_priority_v1
-- Show only one alert per alert_type; problems first, opportunities second; max 3.

DROP VIEW IF EXISTS alerts_top CASCADE;
DROP VIEW IF EXISTS alerts_ranked CASCADE;
DROP VIEW IF EXISTS alerts_deduplicated CASCADE;
DROP VIEW IF EXISTS alerts_all CASCADE;

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

GRANT SELECT ON alerts_all TO anon, authenticated;
GRANT SELECT ON alerts_deduplicated TO anon, authenticated;
GRANT SELECT ON alerts_ranked TO anon, authenticated;
GRANT SELECT ON alerts_top TO anon, authenticated;
