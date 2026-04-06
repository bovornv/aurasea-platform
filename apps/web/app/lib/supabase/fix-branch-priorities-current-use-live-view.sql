-- =============================================================================
-- Fix branch_priorities_current: use live today_priorities_ranked view
-- =============================================================================
-- Self-contained script. Creates today_priorities_ranked (and related views)
-- then rebuilds branch_priorities_current / company_priorities_current to read
-- from it in real time. Safe to rerun.
--
-- Root cause: branch_priorities_current previously read from priorities_engine
-- which reads today_priorities (a PHYSICAL TABLE). That table is only updated by
-- manual backfill scripts. When new daily metrics are added, the table is stale —
-- causing Revenue Drop alerts to persist even when revenue is actually up.
--
-- Fix: rebuild the entire priorities view stack from today_priorities_ranked,
-- which is a live view over today_summary (joins accommodation_daily_metrics and
-- fnb_daily_metrics in real time).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Step 1: Drop old priority views so we can rebuild cleanly
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.company_priorities_current CASCADE;
DROP VIEW IF EXISTS public.branch_priorities_current CASCADE;
DROP VIEW IF EXISTS public.today_priorities_company_view CASCADE;
DROP VIEW IF EXISTS public.today_priorities_view CASCADE;
DROP VIEW IF EXISTS public.today_priorities_ranked CASCADE;
DROP VIEW IF EXISTS public.today_branch_priorities CASCADE;
DROP VIEW IF EXISTS public.today_priorities_clean CASCADE;
DROP VIEW IF EXISTS public.today_priorities CASCADE;

-- -----------------------------------------------------------------------------
-- Step 2: Create today_priorities_ranked (live view over today_summary)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  src text;
BEGIN
  IF to_regclass('public.today_summary') IS NOT NULL THEN
    src := 'public.today_summary';
  ELSE
    src := NULL;
  END IF;

  IF src IS NULL THEN
    EXECUTE $empty$
CREATE VIEW public.today_priorities_ranked AS
SELECT *
FROM (
  VALUES (
    NULL::uuid, NULL::uuid, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text,
    NULL::numeric, NULL::integer, NULL::text, NULL::date, NULL::numeric
  )
) AS v(
  organization_id, branch_id, branch_name, business_type,
  alert_type, title, description,
  sort_score, rank, impact_label, metric_date, impact_thb
)
WHERE false
$empty$;
    RAISE NOTICE 'today_priorities_ranked: today_summary missing (empty view).';
  ELSE
    EXECUTE $ts$
CREATE VIEW public.today_priorities_ranked AS
WITH latest_day AS (
  SELECT
    trim(both FROM base.branch_id::text) AS bid,
    MAX(base.metric_date::date) AS d
  FROM public.today_summary base
  WHERE base.branch_id IS NOT NULL
  GROUP BY trim(both FROM base.branch_id::text)
),
base AS (
  SELECT
    base.branch_id::uuid AS branch_id,
    base.metric_date::date AS metric_date,
    jb.jb AS j,
    COALESCE(b.organization_id::uuid, NULLIF(TRIM(BOTH FROM jb.jb->>'organization_id'), '')::uuid) AS organization_id,
    COALESCE(NULLIF(TRIM(BOTH FROM b.branch_name), ''), NULLIF(TRIM(BOTH FROM b.name), ''), NULLIF(TRIM(BOTH FROM jb.jb->>'branch_name'), '')) AS branch_name,
    CASE
      WHEN LOWER(COALESCE(b.module_type::text, '')) IN ('fnb','restaurant','cafe','cafe_restaurant') THEN 'fnb'::text
      ELSE 'accommodation'::text
    END AS business_type
  FROM public.today_summary base
  INNER JOIN latest_day ld ON trim(both FROM base.branch_id::text) = ld.bid AND base.metric_date::date = ld.d
  CROSS JOIN LATERAL (SELECT to_jsonb(base) AS jb) jb
  LEFT JOIN public.branches b ON trim(both FROM b.id::text) = trim(both FROM base.branch_id::text)
  WHERE base.branch_id IS NOT NULL
),
signals AS (
  SELECT
    s.organization_id AS organization_id,
    s.branch_id AS branch_id,
    s.branch_name AS branch_name,
    s.metric_date AS metric_date,
    s.business_type AS business_type,
    COALESCE(NULLIF(TRIM(BOTH FROM s.j->>'revenue_delta_day'), '')::numeric, NULL::numeric) AS revenue_delta_day,
    COALESCE(NULLIF(TRIM(BOTH FROM s.j->>'occupancy_delta_week'), '')::numeric, NULL::numeric) AS occupancy_delta_week,
    COALESCE(
      NULLIF(TRIM(BOTH FROM s.j->>'occupancy_rate'), '')::numeric,
      CASE
        WHEN NULLIF(TRIM(BOTH FROM s.j->>'capacity'), '')::numeric > 0::numeric
          AND NULLIF(TRIM(BOTH FROM s.j->>'utilized'), '')::numeric IS NOT NULL THEN
          (NULLIF(TRIM(BOTH FROM s.j->>'utilized'), '')::numeric
            / NULLIF(TRIM(BOTH FROM s.j->>'capacity'), '')::numeric) * 100::numeric
        WHEN NULLIF(TRIM(BOTH FROM s.j->>'rooms_available'), '')::numeric > 0::numeric
          AND NULLIF(TRIM(BOTH FROM s.j->>'rooms_sold'), '')::numeric IS NOT NULL THEN
          (NULLIF(TRIM(BOTH FROM s.j->>'rooms_sold'), '')::numeric
            / NULLIF(TRIM(BOTH FROM s.j->>'rooms_available'), '')::numeric) * 100::numeric
        ELSE NULL::numeric
      END
    ) AS occupancy_rate,
    COALESCE(NULLIF(TRIM(BOTH FROM s.j->>'adr'), '')::numeric, NULL::numeric) AS adr,
    COALESCE(NULLIF(TRIM(BOTH FROM s.j->>'revpar'), '')::numeric, NULL::numeric) AS revpar,
    COALESCE(
      NULLIF(TRIM(BOTH FROM s.j->>'customers'), '')::numeric,
      NULLIF(TRIM(BOTH FROM s.j->>'total_customers'), '')::numeric,
      NULL::numeric
    ) AS customers,
    COALESCE(
      NULLIF(TRIM(BOTH FROM s.j->>'total_revenue'), '')::numeric,
      NULLIF(TRIM(BOTH FROM s.j->>'revenue'), '')::numeric,
      NULLIF(TRIM(BOTH FROM s.j->>'accommodation_revenue'), '')::numeric,
      NULLIF(TRIM(BOTH FROM s.j->>'total_revenue_thb'), '')::numeric,
      NULLIF(TRIM(BOTH FROM s.j->>'revenue_thb'), '')::numeric,
      0::numeric
    ) AS revenue_thb
  FROM base s
),
fnb_latest AS (
  SELECT DISTINCT ON (d.branch_id)
    d.branch_id AS branch_id,
    d.metric_date::date AS as_of_date
  FROM public.fnb_daily_metrics d
  WHERE d.branch_id IS NOT NULL
  ORDER BY d.branch_id, d.metric_date DESC NULLS LAST
),
fnb_day_curr AS (
  SELECT
    d.branch_id AS branch_id,
    d.metric_date::date AS metric_date,
    COALESCE(d.revenue, 0::numeric) AS revenue,
    COALESCE(d.total_customers, 0::numeric) AS customers
  FROM public.fnb_daily_metrics d
  INNER JOIN fnb_latest fl ON fl.branch_id = d.branch_id
    AND d.metric_date::date = fl.as_of_date
),
fnb_day_prev AS (
  SELECT DISTINCT ON (d.branch_id)
    d.branch_id AS branch_id,
    d.metric_date::date AS metric_date,
    COALESCE(d.revenue, 0::numeric) AS revenue,
    COALESCE(d.total_customers, 0::numeric) AS customers
  FROM public.fnb_daily_metrics d
  INNER JOIN fnb_latest fl ON fl.branch_id = d.branch_id
  WHERE d.metric_date::date < fl.as_of_date
  ORDER BY d.branch_id, d.metric_date DESC NULLS LAST
),
cost_agg_curr AS (
  SELECT
    cost.branch_id::text AS branch_id,
    SUM(COALESCE(cost.additional_cost_today, 0::numeric)) AS variable_cost_30d,
    MAX(COALESCE(cost.monthly_fixed_cost, 0::numeric)) AS monthly_fixed_max_30d,
    SUM(COALESCE(cost.revenue, 0::numeric)) AS revenue_30d
  FROM public.fnb_daily_metrics cost
  INNER JOIN fnb_latest fl ON fl.branch_id = cost.branch_id
  WHERE cost.metric_date::date >= (fl.as_of_date - INTERVAL '29 days')
    AND cost.metric_date::date <= fl.as_of_date
  GROUP BY cost.branch_id
),
cost_agg_prev AS (
  SELECT
    cost.branch_id::text AS branch_id,
    SUM(COALESCE(cost.additional_cost_today, 0::numeric)) AS variable_cost_30d,
    MAX(COALESCE(cost.monthly_fixed_cost, 0::numeric)) AS monthly_fixed_max_30d,
    SUM(COALESCE(cost.revenue, 0::numeric)) AS revenue_30d
  FROM public.fnb_daily_metrics cost
  INNER JOIN fnb_latest fl ON fl.branch_id = cost.branch_id
  WHERE cost.metric_date::date >= (fl.as_of_date - INTERVAL '59 days')
    AND cost.metric_date::date <= (fl.as_of_date - INTERVAL '30 days')
  GROUP BY cost.branch_id
),
cost_ratio_pair AS (
  SELECT
    c.branch_id AS branch_id,
    (COALESCE(c.variable_cost_30d, 0::numeric) + COALESCE(c.monthly_fixed_max_30d, 0::numeric))
      / NULLIF(COALESCE(c.revenue_30d, 0::numeric), 0) AS ratio_curr,
    (COALESCE(p.variable_cost_30d, 0::numeric) + COALESCE(p.monthly_fixed_max_30d, 0::numeric))
      / NULLIF(COALESCE(p.revenue_30d, 0::numeric), 0) AS ratio_prev
  FROM cost_agg_curr c
  LEFT JOIN cost_agg_prev p ON p.branch_id = c.branch_id
),
fnb_raw_delta AS (
  SELECT
    br.organization_id::uuid AS organization_id,
    cur.branch_id::uuid AS branch_id,
    COALESCE(NULLIF(TRIM(BOTH FROM br.branch_name), ''), NULLIF(TRIM(BOTH FROM br.name), '')) AS branch_name,
    cur.metric_date AS metric_date,
    'F&B customers down vs prior day'::text AS alert_type_raw,
    CASE
      WHEN prev.customers > 0::numeric THEN
        ((cur.customers - prev.customers) / prev.customers) * 100::numeric
      ELSE NULL::numeric
    END AS delta_pct,
    cur.revenue AS revenue_thb,
    'fnb'::text AS business_type
  FROM fnb_day_curr cur
  INNER JOIN fnb_day_prev prev ON prev.branch_id = cur.branch_id
  INNER JOIN public.branches br ON trim(BOTH FROM br.id::text) = trim(BOTH FROM cur.branch_id::text)
  WHERE LOWER(COALESCE(br.module_type::text, '')) IN ('fnb', 'restaurant', 'cafe', 'cafe_restaurant')
    AND prev.customers >= 5::numeric
    AND cur.customers < prev.customers * 0.85::numeric
  UNION ALL
  SELECT
    br.organization_id::uuid,
    cur.branch_id::uuid,
    COALESCE(NULLIF(TRIM(BOTH FROM br.branch_name), ''), NULLIF(TRIM(BOTH FROM br.name), '')),
    cur.metric_date,
    'F&B ticket down vs prior day'::text,
    CASE
      WHEN prev.customers > 0::numeric AND prev.revenue > 0::numeric AND cur.customers > 0::numeric
        AND (prev.revenue / prev.customers) > 0::numeric THEN
        (
          (cur.revenue / NULLIF(cur.customers, 0::numeric))
          - (prev.revenue / NULLIF(prev.customers, 0::numeric))
        )
        / NULLIF(prev.revenue / NULLIF(prev.customers, 0::numeric), 0::numeric) * 100::numeric
      ELSE NULL::numeric
    END,
    cur.revenue,
    'fnb'::text
  FROM fnb_day_curr cur
  INNER JOIN fnb_day_prev prev ON prev.branch_id = cur.branch_id
  INNER JOIN public.branches br ON trim(BOTH FROM br.id::text) = trim(BOTH FROM cur.branch_id::text)
  WHERE LOWER(COALESCE(br.module_type::text, '')) IN ('fnb', 'restaurant', 'cafe', 'cafe_restaurant')
    AND prev.customers > 0::numeric AND cur.customers > 0::numeric
    AND prev.revenue / prev.customers > 0::numeric
    AND (cur.revenue / cur.customers) < (prev.revenue / prev.customers) * 0.90::numeric
  UNION ALL
  SELECT
    br.organization_id::uuid,
    cur.branch_id::uuid,
    COALESCE(NULLIF(TRIM(BOTH FROM br.branch_name), ''), NULLIF(TRIM(BOTH FROM br.name), '')),
    cur.metric_date,
    'F&B cost ratio worsening (30d)'::text,
    (cr.ratio_curr - cr.ratio_prev) * 100::numeric,
    cur.revenue,
    'fnb'::text
  FROM fnb_day_curr cur
  INNER JOIN public.branches br ON trim(BOTH FROM br.id::text) = trim(BOTH FROM cur.branch_id::text)
  INNER JOIN cost_ratio_pair cr ON cr.branch_id = trim(BOTH FROM cur.branch_id::text)
  WHERE LOWER(COALESCE(br.module_type::text, '')) IN ('fnb', 'restaurant', 'cafe', 'cafe_restaurant')
    AND cr.ratio_curr IS NOT NULL AND cr.ratio_prev IS NOT NULL
    AND cr.ratio_prev > 0::numeric
    AND (cr.ratio_curr - cr.ratio_prev) >= 0.05::numeric
),
raw AS (
  SELECT
    s.organization_id,
    s.branch_id,
    s.branch_name,
    s.metric_date,
    'Revenue Drop'::text AS alert_type_raw,
    s.revenue_delta_day AS delta_pct,
    s.revenue_thb AS revenue_thb,
    s.business_type AS business_type
  FROM signals s
  WHERE s.revenue_delta_day IS NOT NULL AND s.revenue_delta_day <= -10
  UNION ALL
  SELECT
    s.organization_id,
    s.branch_id,
    s.branch_name,
    s.metric_date,
    'Low Occupancy'::text AS alert_type_raw,
    s.occupancy_delta_week AS delta_pct,
    s.revenue_thb AS revenue_thb,
    s.business_type AS business_type
  FROM signals s
  WHERE s.business_type = 'accommodation'
    AND s.occupancy_delta_week IS NOT NULL
    AND s.occupancy_delta_week <= -10
  UNION ALL
  SELECT
    s.organization_id,
    s.branch_id,
    s.branch_name,
    s.metric_date,
    'Occupancy low (level)'::text AS alert_type_raw,
    NULL::numeric AS delta_pct,
    s.revenue_thb AS revenue_thb,
    s.business_type AS business_type
  FROM signals s
  WHERE s.business_type = 'accommodation'
    AND s.occupancy_rate IS NOT NULL
    AND s.occupancy_rate < 60
  UNION ALL
  SELECT
    s.organization_id,
    s.branch_id,
    s.branch_name,
    s.metric_date,
    'ADR under pressure'::text AS alert_type_raw,
    NULL::numeric AS delta_pct,
    s.revenue_thb AS revenue_thb,
    s.business_type AS business_type
  FROM signals s
  WHERE s.business_type = 'accommodation'
    AND s.adr IS NOT NULL
    AND s.revpar IS NOT NULL
    AND s.revpar > s.adr * 0.6
  UNION ALL
  SELECT
    s.organization_id,
    s.branch_id,
    s.branch_name,
    s.metric_date,
    'Customer traffic low (level)'::text AS alert_type_raw,
    NULL::numeric AS delta_pct,
    s.revenue_thb AS revenue_thb,
    s.business_type AS business_type
  FROM signals s
  WHERE s.business_type = 'fnb'
    AND s.customers IS NOT NULL
    AND s.customers < 20
  UNION ALL
  SELECT
    fr.organization_id,
    fr.branch_id,
    fr.branch_name,
    fr.metric_date,
    fr.alert_type_raw,
    fr.delta_pct,
    fr.revenue_thb,
    fr.business_type
  FROM fnb_raw_delta fr
),
enriched AS (
  SELECT
    r.organization_id,
    r.branch_id AS branch_id,
    r.branch_name,
    r.alert_type_raw AS alert_type,
    (
      CASE
        WHEN r.alert_type_raw IN ('Low Occupancy'::text, 'Occupancy low (level)'::text) THEN 'occupancy'::text
        WHEN r.alert_type_raw = 'Revenue Drop'::text THEN 'revenue_drop'::text
        WHEN r.alert_type_raw = 'ADR under pressure'::text THEN 'adr_pressure'::text
        WHEN r.alert_type_raw = 'Customer traffic low (level)'::text THEN 'fnb_traffic'::text
        WHEN r.alert_type_raw = 'F&B customers down vs prior day'::text THEN 'fnb_customers_momentum'::text
        WHEN r.alert_type_raw = 'F&B ticket down vs prior day'::text THEN 'fnb_ticket_momentum'::text
        WHEN r.alert_type_raw = 'F&B cost ratio worsening (30d)'::text THEN 'fnb_cost_ratio_momentum'::text
        ELSE regexp_replace(lower(r.alert_type_raw), '[[:space:]]+'::text, '_'::text, 'g'::text)
      END
    ) AS problem_type,
    (
      CASE
        WHEN NULLIF(TRIM(BOTH FROM r.branch_name), '') IS NOT NULL THEN
          (
            CASE r.alert_type_raw
              WHEN 'Revenue Drop'::text THEN 'Revenue down vs yesterday'::text
              WHEN 'Low Occupancy'::text THEN 'Occupancy down vs last week'::text
              WHEN 'Occupancy low (level)'::text THEN 'Occupancy below target'::text
              WHEN 'ADR under pressure'::text THEN 'ADR under pressure'::text
              WHEN 'Customer traffic low (level)'::text THEN 'Covers below target'::text
              WHEN 'F&B customers down vs prior day'::text THEN 'Covers down vs prior day'::text
              WHEN 'F&B ticket down vs prior day'::text THEN 'Average ticket down vs prior day'::text
              WHEN 'F&B cost ratio worsening (30d)'::text THEN 'Cost ratio up (trailing 30d)'::text
              ELSE TRIM(BOTH FROM REPLACE(r.alert_type_raw, '_'::text, ' '::text))
            END
          )
          || ' — '::text
          || TRIM(BOTH FROM r.branch_name)
        ELSE (
          CASE r.alert_type_raw
            WHEN 'Revenue Drop'::text THEN 'Revenue down vs yesterday'::text
            WHEN 'Low Occupancy'::text THEN 'Occupancy down vs last week'::text
            WHEN 'Occupancy low (level)'::text THEN 'Occupancy below target'::text
            WHEN 'ADR under pressure'::text THEN 'ADR under pressure'::text
            WHEN 'Customer traffic low (level)'::text THEN 'Covers below target'::text
            WHEN 'F&B customers down vs prior day'::text THEN 'Covers down vs prior day'::text
            WHEN 'F&B ticket down vs prior day'::text THEN 'Average ticket down vs prior day'::text
            WHEN 'F&B cost ratio worsening (30d)'::text THEN 'Cost ratio up (trailing 30d)'::text
            ELSE NULLIF(TRIM(BOTH FROM REPLACE(r.alert_type_raw, '_'::text, ' '::text)), ''::text)
          END
        )
      END
    ) AS title_base,
    (
      CASE
        WHEN r.alert_type_raw = 'Revenue Drop' THEN
          'Revenue fell compared with yesterday. Adjust pricing, channel mix, or same-day promotions to close the gap.'::text
        WHEN r.alert_type_raw = 'Low Occupancy' THEN
          'Occupancy slipped versus last week. Tighten rate fences, refresh packages, and release held inventory where it helps.'::text
        WHEN r.alert_type_raw = 'Occupancy low (level)' THEN
          'Today''s occupancy is below a healthy level. Use last-minute rates, OTAs, and short-stay offers to lift demand.'::text
        WHEN r.alert_type_raw = 'ADR under pressure' THEN
          'ADR is weak relative to RevPAR—often heavy discounting or a budget-heavy room mix. Tighten promotions and rebalance room types.'::text
        WHEN r.alert_type_raw = 'Customer traffic low (level)' THEN
          'Covers are low today. Align hours, local promos, and menu highlights with expected traffic.'::text
        WHEN r.alert_type_raw = 'F&B customers down vs prior day' THEN
          'Guest count dropped versus the prior day. Look at traffic sources, staffing, and whether opening hours match demand.'::text
        WHEN r.alert_type_raw = 'F&B ticket down vs prior day' THEN
          'Average ticket fell versus the prior day. Push bundles, add-ons, and suggestive selling at checkout.'::text
        WHEN r.alert_type_raw = 'F&B cost ratio worsening (30d)' THEN
          'Cost as a share of revenue rose versus the prior 30-day window. Cut waste, renegotiate COGS, and align fixed costs with volume.'::text
        ELSE 'This signal needs a focused response—watch the trend and adjust pricing, mix, or cost levers over the next few days.'::text
      END
    ) AS description,
    (
      CASE
        WHEN r.alert_type_raw = 'Revenue Drop'::text
          AND COALESCE(r.revenue_thb, 0::numeric) > 0::numeric
          AND r.delta_pct IS NOT NULL THEN
          GREATEST(
            round(r.revenue_thb * LEAST(0.35::numeric, abs(r.delta_pct) / 100.0 * 0.45)),
            1000::numeric
          )
        WHEN r.alert_type_raw IN ('Low Occupancy'::text, 'Occupancy low (level)'::text)
          AND COALESCE(r.revenue_thb, 0::numeric) > 0::numeric THEN
          GREATEST(round(r.revenue_thb * 0.08), 500::numeric)
        WHEN r.alert_type_raw = 'ADR under pressure'::text
          AND COALESCE(r.revenue_thb, 0::numeric) > 0::numeric THEN
          GREATEST(round(r.revenue_thb * 0.04), 500::numeric)
        WHEN r.alert_type_raw = 'Customer traffic low (level)'::text
          AND COALESCE(r.revenue_thb, 0::numeric) > 0::numeric THEN
          GREATEST(round(r.revenue_thb * 0.06), 300::numeric)
        WHEN r.alert_type_raw = 'F&B customers down vs prior day'::text
          AND COALESCE(r.revenue_thb, 0::numeric) > 0::numeric
          AND r.delta_pct IS NOT NULL THEN
          GREATEST(round(r.revenue_thb * LEAST(0.2::numeric, abs(r.delta_pct) / 100.0 * 0.35)), 400::numeric)
        WHEN r.alert_type_raw = 'F&B ticket down vs prior day'::text
          AND COALESCE(r.revenue_thb, 0::numeric) > 0::numeric
          AND r.delta_pct IS NOT NULL THEN
          GREATEST(round(r.revenue_thb * LEAST(0.18::numeric, abs(r.delta_pct) / 100.0 * 0.3)), 350::numeric)
        WHEN r.alert_type_raw = 'F&B cost ratio worsening (30d)'::text
          AND COALESCE(r.revenue_thb, 0::numeric) > 0::numeric THEN
          GREATEST(round(r.revenue_thb * 0.07), 500::numeric)
        WHEN COALESCE(r.revenue_thb, 0::numeric) > 0::numeric THEN
          GREATEST(round(r.revenue_thb * 0.03), 300::numeric)
        ELSE NULL::numeric
      END
    ) AS impact_thb,
    'at risk'::text AS impact_label,
    (
      COALESCE(
        CASE
          WHEN r.delta_pct IS NOT NULL THEN abs(r.delta_pct) * 100::numeric
          ELSE NULL::numeric
        END,
        2000::numeric
      )
      + COALESCE(r.revenue_thb, 0)::numeric / 1000000::numeric
      + ((abs(hashtext(COALESCE(r.branch_id::text, '') || r.alert_type_raw)))::numeric % 1000000::numeric)
        / 1000000000::numeric
    ) AS sort_score,
    r.business_type,
    r.metric_date
  FROM raw r
),
dedup AS (
  SELECT
    e.*,
    ROW_NUMBER() OVER (
      PARTITION BY e.branch_id, e.problem_type
      ORDER BY e.impact_thb DESC NULLS LAST, e.sort_score DESC NULLS LAST, e.alert_type
    ) AS dedup_rn
  FROM enriched e
),
picked AS (
  SELECT * FROM dedup WHERE dedup_rn = 1
)
SELECT
  COALESCE(p.organization_id, b.organization_id) AS organization_id,
  p.branch_id AS branch_id,
  p.branch_name AS branch_name,
  p.business_type AS business_type,
  p.alert_type AS alert_type,
  trim(
    BOTH
    FROM
      p.title_base
      || CASE
           WHEN p.impact_thb IS NOT NULL THEN
             ' (฿'::text || trim(BOTH FROM to_char(round(p.impact_thb), 'FM999,999,999,999'::text)) || ')'::text
           ELSE ''::text
         END
  ) AS title,
  p.description AS description,
  (COALESCE(p.impact_thb, 0::numeric) * 1000000000000::numeric + p.sort_score) AS sort_score,
  ROW_NUMBER() OVER (
    PARTITION BY p.branch_id, p.business_type
    ORDER BY COALESCE(p.impact_thb, 0::numeric) DESC, p.sort_score DESC NULLS LAST, p.alert_type
  )::integer AS rank,
  p.impact_label AS impact_label,
  p.metric_date AS metric_date,
  p.impact_thb AS impact_thb
FROM picked p
LEFT JOIN public.branches b ON trim(both FROM b.id::text) = trim(both FROM p.branch_id::text)
$ts$;
    RAISE NOTICE 'today_priorities_ranked: using source today_summary';
  END IF;
END $$;

COMMENT ON VIEW public.today_priorities_ranked IS
  'Live priorities from today_summary + fnb_daily_metrics deltas; dedup (branch_id, problem_type). No stale physical table dependency.';

GRANT SELECT ON public.today_priorities_ranked TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- Step 3: Recreate today_priorities_view and today_priorities_company_view
-- -----------------------------------------------------------------------------
CREATE VIEW public.today_priorities_view AS
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
  r.impact_thb,
  r.impact_thb AS impact_estimate_thb
FROM public.today_priorities_ranked r;

COMMENT ON VIEW public.today_priorities_view IS
  'Single priorities API view; filter branch_id, order=sort_score.desc, limit=4.';

GRANT SELECT ON public.today_priorities_view TO anon, authenticated;

CREATE VIEW public.today_priorities_company_view AS
SELECT
  c.organization_id,
  c.branch_id,
  c.branch_name,
  c.business_type,
  c.alert_type,
  c.title,
  c.description,
  c.sort_score,
  c.org_rank AS rank,
  c.impact_label,
  c.metric_date,
  c.impact_thb,
  c.impact_thb AS impact_estimate_thb,
  CASE
    WHEN c.org_rank = 1 THEN 'fix_first'::text
    WHEN c.org_rank BETWEEN 2 AND 4 THEN 'next_moves'::text
    ELSE 'more'::text
  END AS priority_segment
FROM (
  SELECT
    r.*,
    ROW_NUMBER() OVER (
      PARTITION BY r.organization_id
      ORDER BY r.sort_score DESC NULLS LAST, r.branch_id::text, r.alert_type
    )::integer AS org_rank
  FROM public.today_priorities_ranked r
  WHERE r.organization_id IS NOT NULL
) c
WHERE c.org_rank <= 5;

COMMENT ON VIEW public.today_priorities_company_view IS
  'Company Today: cross-branch top 5 per org by sort_score.';

GRANT SELECT ON public.today_priorities_company_view TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- Step 4: Rebuild branch_priorities_current from the live ranked view
-- -----------------------------------------------------------------------------
CREATE VIEW public.branch_priorities_current AS
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
  'Live priorities: top 2 per branch from today_priorities_ranked (real time). No stale physical table dependency.';

GRANT SELECT ON public.branch_priorities_current TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- Step 5: Rebuild company_priorities_current from the live ranked view
-- -----------------------------------------------------------------------------
CREATE VIEW public.company_priorities_current AS
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
