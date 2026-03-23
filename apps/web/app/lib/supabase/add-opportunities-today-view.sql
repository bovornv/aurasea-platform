-- Company Today — proactive opportunities (from alerts_enriched opportunity rows)
-- GET /rest/v1/opportunities_today?select=*&organization_id=eq.{uuid}&order=sort_score.desc&limit=3
-- Requires: public.alerts_enriched, public.branches
DROP VIEW IF EXISTS public.opportunities_today CASCADE;

CREATE VIEW public.opportunities_today AS
WITH base AS (
  SELECT
    e.organization_id,
    e.branch_id::text AS branch_id,
    e.branch_name,
    e.branch_type,
    e.metric_date::date AS metric_date,
    COALESCE(e.impact_estimate_thb, 0)::numeric AS impact_estimate_thb,
    e.recommended_action
  FROM public.alerts_enriched e
  WHERE e.alert_category = 'opportunity'
),
enriched AS (
  SELECT
    COALESCE(b.organization_id, base.organization_id) AS organization_id,
    base.branch_id,
    COALESCE(NULLIF(TRIM(BOTH FROM base.branch_name), ''), b.name, base.branch_id) AS branch_name,
    base.branch_type,
    base.metric_date,
    base.impact_estimate_thb,
    base.recommended_action
  FROM base
  LEFT JOIN public.branches b ON b.id::text = TRIM(BOTH FROM base.branch_id::text)
),
latest AS (
  SELECT DISTINCT ON (branch_id)
    organization_id,
    branch_id,
    branch_name,
    branch_type,
    metric_date,
    impact_estimate_thb,
    recommended_action
  FROM enriched
  WHERE organization_id IS NOT NULL
  ORDER BY branch_id, metric_date DESC NULLS LAST
),
final AS (
  SELECT
    l.organization_id,
    l.branch_id,
    l.branch_name,
    l.metric_date,
    (
      CASE
        WHEN l.branch_type = 'accommodation'
          AND EXTRACT(ISODOW FROM l.metric_date::timestamp) >= 5 THEN
          'Strong weekend pattern → add package (' || l.branch_name || ')'
        WHEN l.branch_type = 'fnb' THEN
          'Customer traffic rising → increase avg ticket (' || l.branch_name || ')'
        ELSE
          'High demand detected → raise price slightly (' || l.branch_name || ')'
      END
    ) AS opportunity_text,
    (l.impact_estimate_thb * 100::numeric + EXTRACT(EPOCH FROM l.metric_date::timestamp)::numeric) AS sort_score
  FROM latest l
)
SELECT
  f.organization_id,
  f.branch_id,
  f.branch_name,
  f.metric_date,
  f.opportunity_text,
  f.sort_score
FROM final f;

COMMENT ON VIEW public.opportunities_today IS
  'Opportunity-category alerts; latest per branch; order by sort_score DESC.';

GRANT SELECT ON public.opportunities_today TO anon, authenticated;
