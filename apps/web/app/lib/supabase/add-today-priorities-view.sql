-- today_priorities — Company Today "Today's Priorities" (one section; no duplication)
-- GET /rest/v1/today_priorities?select=*&order=sort_score.desc&limit=5&organization_id=eq.{uuid}
-- Source: alerts_fix_this_first only.
DROP VIEW IF EXISTS today_action_plan CASCADE;
DROP VIEW IF EXISTS today_priorities CASCADE;

CREATE VIEW today_priorities AS
SELECT
  f.organization_id,
  f.branch_id,
  f.branch_name,
  f.alert_type,
  COALESCE(NULLIF(TRIM(BOTH FROM f.recommended_action), ''), ''::text) AS action_text,
  (
    CASE
      WHEN NULLIF(TRIM(BOTH FROM f.recommended_action), '') IS NULL THEN
        NULLIF(TRIM(BOTH FROM REPLACE(COALESCE(f.alert_type, ''::text), '_'::text, ' '::text)), ''::text)
      WHEN LENGTH(TRIM(BOTH FROM f.recommended_action)) <= 100 THEN
        TRIM(BOTH FROM f.recommended_action)
      ELSE
        LEFT(TRIM(BOTH FROM f.recommended_action), 97) || '...'::text
    END
  ) AS action_short,
  COALESCE(f.impact_estimate_thb, 0::numeric) AS impact,
  f.priority_score AS sort_score
FROM alerts_fix_this_first f;

COMMENT ON VIEW today_priorities IS
  'Company Today: priorities; order by sort_score DESC.';

GRANT SELECT ON today_priorities TO anon, authenticated;
