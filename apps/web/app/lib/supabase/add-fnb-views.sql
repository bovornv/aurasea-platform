-- F&B views used by the web app: fnb_operating_status, fnb_alerts_today. Financial impact: fnb_daily_metrics (branch_id, metric_date, revenue).
-- Requires fnb_daily_metrics with: metric_date, revenue, total_customers.

-- 1) fnb_latest_metrics: one row per branch, latest metric_date (used as fallback when fnb_operating_status is empty)
DROP VIEW IF EXISTS fnb_latest_metrics;
CREATE VIEW fnb_latest_metrics AS
SELECT DISTINCT ON (branch_id)
  branch_id,
  metric_date,
  revenue AS total_revenue_thb,
  total_customers,
  NULL::numeric AS health_score,
  NULL::numeric AS confidence_score
FROM fnb_daily_metrics
ORDER BY branch_id, metric_date DESC NULLS LAST;

-- 2) fnb_operating_status: one row per branch for Operating Status page
DROP VIEW IF EXISTS fnb_operating_status;
CREATE VIEW fnb_operating_status AS
WITH latest AS (
  SELECT DISTINCT ON (branch_id)
    branch_id,
    metric_date,
    revenue AS revenue,
    total_customers,
    (CASE WHEN total_customers > 0 THEN (revenue / total_customers) ELSE NULL END) AS avg_ticket
  FROM fnb_daily_metrics
  ORDER BY branch_id, metric_date DESC NULLS LAST
),
coverage AS (
  SELECT branch_id, COUNT(DISTINCT metric_date) AS data_days
  FROM fnb_daily_metrics
  GROUP BY branch_id
)
SELECT
  l.branch_id,
  l.metric_date,
  NULL::numeric AS health_score,
  l.revenue AS todays_revenue,
  l.total_customers,
  'normal'::text AS early_signal,
  LEAST(1.0, (c.data_days::numeric / 30.0)) AS confidence,
  COALESCE(c.data_days, 0) AS data_days,
  30 AS required_days,
  l.avg_ticket
FROM latest l
LEFT JOIN coverage c ON c.branch_id = l.branch_id;

-- 3) fnb_alerts_today: alerts for F&B Alerts page (no rows until you have an alert source)
-- Expected columns: branch_id, metric_date, alert_name, alert_message, recommendation, confidence, estimated_revenue_impact
-- Placeholder: empty result set with correct shape. Replace with real alert logic when available.
DROP VIEW IF EXISTS fnb_alerts_today;
CREATE VIEW fnb_alerts_today AS
SELECT
  b.id AS branch_id,
  CURRENT_DATE AS metric_date,
  NULL::text AS alert_name,
  NULL::text AS alert_message,
  NULL::text AS recommendation,
  NULL::numeric AS confidence,
  NULL::numeric AS estimated_revenue_impact
FROM branches b
WHERE 1 = 0;

-- 4) F&B Estimated Financial Impact: app reads from fnb_daily_metrics (branch_id, metric_date, revenue), not fnb_financial_impact.
