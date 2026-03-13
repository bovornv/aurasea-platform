-- Fix branch_intelligence_engine view: branch_daily_metrics does not have rooms_sold or rooms_available.
-- Read revenue from branch_daily_metrics; read rooms_sold and rooms_available from accommodation_daily_metrics.
-- Join on branch_id and metric_date.

DROP VIEW IF EXISTS branch_intelligence_engine;

CREATE VIEW branch_intelligence_engine AS
SELECT
  b.branch_id,
  b.metric_date,
  b.revenue,
  a.rooms_sold,
  a.rooms_available
FROM branch_daily_metrics b
LEFT JOIN accommodation_daily_metrics a
  ON b.branch_id = a.branch_id
  AND b.metric_date = a.metric_date;
