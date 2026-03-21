-- alerts_fix_this_first — Company Today “Fix This First” (PostgREST)
-- Requires: public.alerts_enriched (run rebuild-alerts-enriched-engine.sql first).
-- Optional incremental: safe to re-run (CREATE OR REPLACE).

CREATE OR REPLACE VIEW alerts_fix_this_first AS
SELECT
    x.branch_id,
    x.organization_id,
    x.branch_name,
    x.branch_type,
    x.metric_date,
    x.alert_type,
    x.severity,
    x.impact_estimate_thb,
    x.cause,
    x.recommended_action,
    (
        COALESCE(x.severity, 0)::numeric * 1000000::numeric
        + COALESCE(x.impact_estimate_thb, 0)::numeric
    ) AS priority_score
FROM (
    SELECT DISTINCT ON (e.branch_id, e.alert_type)
        e.branch_id,
        e.organization_id,
        e.branch_name,
        e.branch_type,
        e.metric_date,
        e.alert_type,
        e.severity,
        e.impact_estimate_thb,
        e.cause,
        e.recommended_action
    FROM alerts_enriched e
    WHERE
        e.alert_category IN ('problem', 'structural')
        OR COALESCE(e.severity, 0) >= 3
    ORDER BY
        e.branch_id,
        e.alert_type,
        e.severity DESC NULLS LAST,
        e.impact_estimate_thb DESC NULLS LAST,
        e.metric_date DESC NULLS LAST
) x;

COMMENT ON VIEW alerts_fix_this_first IS
    'Company Today: deduped actionable alerts; order by priority_score DESC.';

GRANT SELECT ON alerts_fix_this_first TO anon, authenticated;
