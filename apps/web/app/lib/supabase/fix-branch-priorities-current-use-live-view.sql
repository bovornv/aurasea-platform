-- =============================================================================
-- Fix branch_priorities_current: use live today_priorities_ranked view
-- =============================================================================
-- Root cause: branch_priorities_current previously read from priorities_engine
-- which reads today_priorities (a PHYSICAL TABLE). That table is only updated by
-- manual backfill scripts. When new daily metrics are added, the table is stale —
-- causing Revenue Drop alerts to persist even when revenue is actually up.
--
-- Fix: rebuild branch_priorities_current (and company_priorities_current) to read
-- directly from today_priorities_ranked, which is a live view over today_summary
-- (which in turn joins accommodation_daily_metrics and fnb_daily_metrics in real time).
--
-- today_priorities_ranked is defined in fix-today-priorities-stable-schema.sql.
-- Run that script first if today_priorities_ranked does not exist in your deployment.
--
-- Safe to rerun.
-- =============================================================================

-- Verify source view exists
DO $$
BEGIN
  IF to_regclass('public.today_priorities_ranked') IS NULL THEN
    RAISE EXCEPTION
      'public.today_priorities_ranked does not exist. Run fix-today-priorities-stable-schema.sql first.';
  END IF;
END $$;

-- Rebuild branch_priorities_current directly from the live ranked view.
CREATE OR REPLACE VIEW public.branch_priorities_current AS
WITH latest AS (
  SELECT
    trim(both FROM r.branch_id::text) AS bid,
    MAX(r.metric_date) AS mx
  FROM public.today_priorities_ranked r
  WHERE r.branch_id IS NOT NULL
  GROUP BY trim(both FROM r.branch_id::text)
),
date_scoped AS (
  SELECT r.*
  FROM public.today_priorities_ranked r
  INNER JOIN latest l
    ON trim(both FROM r.branch_id::text) = l.bid
    AND r.metric_date IS NOT DISTINCT FROM l.mx
),
top2 AS (
  SELECT
    d.*,
    ROW_NUMBER() OVER (
      PARTITION BY trim(both FROM d.branch_id::text)
      ORDER BY d.sort_score DESC NULLS LAST, d.rank ASC NULLS LAST
    )::integer AS pick_rn
  FROM date_scoped d
)
SELECT
  t.organization_id,
  t.branch_id,
  t.branch_name,
  t.business_type,
  t.alert_type,
  t.title,
  t.description,
  t.sort_score,
  t.rank,
  t.impact_label,
  t.metric_date,
  t.impact_thb,
  t.title AS short_title,
  t.description AS action_text,
  t.impact_thb AS impact_estimate_thb
FROM top2 t
WHERE t.pick_rn <= 2;

COMMENT ON VIEW public.branch_priorities_current IS
  'Live priorities: top 2 per branch from today_priorities_ranked (reads today_summary in real time). No stale physical table dependency.';

GRANT SELECT ON public.branch_priorities_current TO anon, authenticated;

-- Rebuild company_priorities_current similarly from today_priorities_ranked.
CREATE OR REPLACE VIEW public.company_priorities_current AS
WITH org_latest AS (
  SELECT
    r.organization_id,
    MAX(r.metric_date) AS mx
  FROM public.today_priorities_ranked r
  WHERE r.organization_id IS NOT NULL
  GROUP BY r.organization_id
),
date_scoped AS (
  SELECT r.*
  FROM public.today_priorities_ranked r
  INNER JOIN org_latest ol
    ON r.organization_id = ol.organization_id
    AND r.metric_date IS NOT DISTINCT FROM ol.mx
),
org_pick AS (
  SELECT
    d.*,
    ROW_NUMBER() OVER (
      PARTITION BY d.organization_id
      ORDER BY d.sort_score DESC NULLS LAST, d.rank ASC NULLS LAST, d.branch_id::text ASC
    )::integer AS org_rank
  FROM date_scoped d
  WHERE d.organization_id IS NOT NULL
)
SELECT
  o.organization_id,
  o.branch_id,
  o.branch_name,
  o.business_type,
  o.alert_type,
  o.title,
  o.description,
  o.sort_score,
  o.org_rank AS rank,
  o.impact_label,
  o.metric_date,
  o.impact_thb,
  o.impact_thb AS impact_estimate_thb,
  o.title AS short_title,
  o.description AS action_text,
  CASE
    WHEN o.org_rank = 1 THEN 'fix_first'::text
    WHEN o.org_rank BETWEEN 2 AND 4 THEN 'next_moves'::text
    ELSE 'more'::text
  END AS priority_segment
FROM org_pick o
WHERE o.org_rank <= 5;

COMMENT ON VIEW public.company_priorities_current IS
  'Live company priorities: top 5 per org from today_priorities_ranked (real time). No stale physical table dependency.';

GRANT SELECT ON public.company_priorities_current TO anon, authenticated;

-- =============================================================================
-- Verification (run manually after applying):
-- =============================================================================
-- 1) Row counts:
--    SELECT count(*) FROM public.branch_priorities_current;
--    SELECT count(*) FROM public.company_priorities_current;
--
-- 2) Spot-check: no Revenue Drop where delta is positive:
--    SELECT branch_name, alert_type, title, impact_thb, metric_date
--    FROM public.branch_priorities_current
--    WHERE alert_type ILIKE '%drop%'
--    ORDER BY metric_date DESC;
--
-- 3) No ฿0 at risk on negative alerts:
--    SELECT branch_name, alert_type, impact_thb
--    FROM public.branch_priorities_current
--    WHERE alert_type ILIKE ANY(ARRAY['%drop%','%low%','%pressure%','%worsening%'])
--      AND COALESCE(impact_thb, 0) = 0;
--    -- Expect 0 rows.
