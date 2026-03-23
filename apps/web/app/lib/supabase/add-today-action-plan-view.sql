-- today_action_plan — Company Today "Today's Action Plan"
-- GET /rest/v1/today_action_plan?select=*&order=sort_score.desc&limit=5&organization_id=eq.{uuid}
-- Source: alerts_fix_this_first only (no alerts_priority_ranking).
DROP VIEW IF EXISTS today_action_plan CASCADE;

CREATE VIEW today_action_plan AS
SELECT
  f.organization_id,
  f.branch_id,
  f.branch_name,
  f.alert_type AS action_title,
  COALESCE(f.recommended_action, ''::text) AS action_text,
  COALESCE(f.cause, ''::text) AS reason,
  COALESCE(f.impact_estimate_thb, 0::numeric) AS impact,
  f.priority_score AS sort_score
FROM alerts_fix_this_first f;

COMMENT ON VIEW today_action_plan IS
  'Company Today: action plan from alerts_fix_this_first; order by sort_score DESC.';

GRANT SELECT ON today_action_plan TO anon, authenticated;
