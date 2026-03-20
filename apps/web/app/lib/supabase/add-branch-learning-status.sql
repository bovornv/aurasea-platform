-- Learning indicator: distinct calendar days with any daily metrics (accommodation ∪ F&B).
-- App: getBranchLearningPhase() → branch_learning_status (fallback: branch_learning_phase).
--
-- Logic: COUNT(DISTINCT metric_date) over UNION of both tables (not MAX of per-stream counts).

CREATE OR REPLACE VIEW branch_learning_status AS
SELECT
  u.branch_id,
  COUNT(DISTINCT u.metric_date)::integer AS learning_days,
  MIN(u.metric_date)::date AS first_day,
  MAX(u.metric_date)::date AS last_day
FROM (
  SELECT branch_id, metric_date::date AS metric_date
  FROM public.accommodation_daily_metrics
  UNION
  SELECT branch_id, metric_date::date AS metric_date
  FROM public.fnb_daily_metrics
) u
GROUP BY u.branch_id;

COMMENT ON VIEW branch_learning_status IS
  'learning_days = distinct metric_date across accommodation_daily_metrics ∪ fnb_daily_metrics';

GRANT SELECT ON branch_learning_status TO anon, authenticated;

-- Debug (per branch): should match learning_days for that branch_id
-- SELECT COUNT(*) FROM (
--   SELECT DISTINCT metric_date FROM public.accommodation_daily_metrics WHERE branch_id = 'YOUR_BRANCH_ID'
--   UNION
--   SELECT DISTINCT metric_date FROM public.fnb_daily_metrics WHERE branch_id = 'YOUR_BRANCH_ID'
-- ) d;
