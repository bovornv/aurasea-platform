-- =============================================================================
-- public.branch_priorities_current — branch Today "Today's Priorities" (API)
-- =============================================================================
-- In-repo there is no separate priorities_engine or priorities_ranked relation.
-- Canonical priorities are built in fix-today-priorities-stable-schema.sql as
-- public.today_priorities_ranked (sources: public.today_summary latest day per branch,
-- plus F&B signals from public.fnb_daily_metrics / cost windows).
--
-- This view exposes only rows for each branch's latest metric_date (snapshot),
-- so PostgREST clients see the current priority set without stale dates.
--
-- Fields (from today_priorities_ranked): organization_id, branch_id, branch_name,
-- business_type, alert_type, title, description, sort_score, rank, impact_label,
-- metric_date, impact_thb
--
-- Title/description copy is defined in today_priorities_ranked (enriched CTE).
-- =============================================================================

CREATE OR REPLACE VIEW public.branch_priorities_current AS
WITH latest AS (
  SELECT
    trim(both FROM r.branch_id::text) AS bid,
    MAX(r.metric_date::date) AS d
  FROM public.today_priorities_ranked r
  WHERE r.branch_id IS NOT NULL
  GROUP BY trim(both FROM r.branch_id::text)
)
SELECT
  r.organization_id,
  r.branch_id,
  r.branch_name,
  r.business_type,
  r.alert_type,
  r.title,
  r.description,
  r.sort_score,
  r.rank,
  r.impact_label,
  r.metric_date,
  r.impact_thb
FROM public.today_priorities_ranked r
INNER JOIN latest l
  ON trim(both FROM r.branch_id::text) = l.bid
  AND r.metric_date::date = l.d;

COMMENT ON VIEW public.branch_priorities_current IS
  'Latest metric_date per branch from today_priorities_ranked; same columns. Used by branch Today priorities API.';

GRANT SELECT ON public.branch_priorities_current TO anon, authenticated;

-- Verify:
-- SELECT branch_id, metric_date, alert_type, rank, left(title, 40) FROM public.branch_priorities_current ORDER BY branch_id, rank;
