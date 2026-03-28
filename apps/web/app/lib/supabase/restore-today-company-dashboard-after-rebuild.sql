-- Recreate public.today_company_dashboard after rebuild-alerts-enriched-engine.sql (STEP 1 drops it).
-- Prerequisites: public.today_priorities_company_view, public.whats_working_today (title + description only),
-- public.opportunities_today, public.watchlist_today, public.company_data_confidence.
-- whats_working JSON: branch_id, metric_date, title, description, sort_score (no highlight_text).
-- watchlist JSON: branch_id, branch_name, metric_date, title, description, sort_score (no warning_text).

DROP VIEW IF EXISTS public.today_company_dashboard CASCADE;

CREATE VIEW public.today_company_dashboard AS
WITH orgs AS (
  SELECT DISTINCT b.organization_id::uuid AS organization_id
  FROM public.branches b
  WHERE b.organization_id IS NOT NULL
)
SELECT
  o.organization_id AS organization_id,
  COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.rank ASC)
      FROM (
        SELECT
          tp.branch_id,
          tp.business_type,
          tp.branch_name,
          tp.alert_type,
          tp.title,
          tp.description,
          tp.sort_score,
          tp.rank,
          tp.impact_label,
          tp.metric_date,
          tp.impact_thb,
          tp.impact_estimate_thb,
          tp.priority_segment
        FROM public.today_priorities_company_view tp
        WHERE tp.organization_id = o.organization_id
        ORDER BY tp.rank ASC
        LIMIT 5
      ) p
    ),
    '[]'::jsonb
  ) AS priorities,
  COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(w) ORDER BY w.sort_score DESC NULLS LAST)
      FROM (
        SELECT
          ww.branch_id,
          ww.metric_date,
          ww.title,
          ww.description,
          ww.sort_score
        FROM public.whats_working_today ww
        WHERE ww.organization_id = o.organization_id
        ORDER BY ww.sort_score DESC NULLS LAST
        LIMIT 3
      ) w
    ),
    '[]'::jsonb
  ) AS whats_working,
  COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(op) ORDER BY op.sort_score DESC NULLS LAST)
      FROM (
        SELECT
          ot.branch_id,
          ot.metric_date,
          ot.title,
          ot.description,
          ot.opportunity_text,
          ot.sort_score
        FROM public.opportunities_today ot
        WHERE ot.organization_id = o.organization_id
        ORDER BY ot.sort_score DESC NULLS LAST
        LIMIT 3
      ) op
    ),
    '[]'::jsonb
  ) AS opportunities,
  COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(wl) ORDER BY wl.sort_score DESC NULLS LAST)
      FROM (
        SELECT
          wt.branch_id,
          wt.branch_name,
          wt.metric_date,
          wt.title,
          wt.description,
          wt.sort_score
        FROM public.watchlist_today wt
        WHERE wt.organization_id = o.organization_id
        ORDER BY wt.sort_score DESC NULLS LAST
        LIMIT 3
      ) wl
    ),
    '[]'::jsonb
  ) AS watchlist,
  (
    SELECT (jsonb_agg(t)->0)
    FROM (
      SELECT to_jsonb(cdc) AS t
      FROM public.company_data_confidence cdc
      WHERE cdc.organization_id = o.organization_id
    ) x
  ) AS confidence
FROM orgs o;

COMMENT ON VIEW public.today_company_dashboard IS
  'Single company Today payload: priorities, whats_working, opportunities, watchlist, confidence (JSON per org).';

GRANT SELECT ON public.today_company_dashboard TO anon, authenticated;
