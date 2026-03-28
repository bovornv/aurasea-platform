-- =============================================================================
-- Today's Priorities: single-source architecture
-- =============================================================================
-- API sources:
--   public.today_priorities_view         → branch: SELECT * FROM public.today_priorities_ranked (rank = per branch+business_type)
--   public.today_priorities_company_view → org: top 5 across all branches; rank = ROW_NUMBER() PARTITION BY organization_id ORDER BY sort_score DESC
--   (F&B signals live inside today_priorities_ranked; no separate today_priorities_fnb.)
--
-- Legacy views removed to avoid duplication/confusion:
--   today_priorities, today_priorities_clean, today_branch_priorities (and any old today_priorities_view)
--
-- Source: today_summary_clean (+ branches) for shared deltas; F&B change signals also use fnb_daily_metrics
-- (revenue/customer/ticket vs prior day, 30d cost ratio vs prior 30d). All join columns are alias-qualified.
-- If there are no triggered insights, the view returns 0 rows and the UI shows empty state
-- (no hardcoded/generic suggestions).
--
-- Output: title (impact inline), description, sort_score, rank, impact_thb, impact_label, metric_date.
-- Dedup: one row per (branch_id, problem_type), strongest by impact_thb desc.
--
-- Branch: GET /rest/v1/today_priorities_view?branch_id=eq.{uuid}&business_type=eq.{type}
--        &order=sort_score.desc&limit=4
-- Company: GET /rest/v1/today_priorities_company_view?organization_id=eq.{uuid}&order=rank.asc&limit=5
-- =============================================================================

DROP VIEW IF EXISTS public.today_priorities_company_view CASCADE;
DROP VIEW IF EXISTS public.today_priorities_view CASCADE;
DROP VIEW IF EXISTS public.today_priorities_ranked CASCADE;
DROP VIEW IF EXISTS public.today_branch_priorities CASCADE;
DROP VIEW IF EXISTS public.today_priorities_clean CASCADE;
DROP VIEW IF EXISTS public.today_priorities CASCADE;

DO $$
DECLARE
  src text;
BEGIN
  IF to_regclass('public.today_summary_clean') IS NOT NULL THEN
    src := 'public.today_summary_clean';
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
    RAISE NOTICE 'today_priorities_ranked: today_summary_clean missing (empty view).';
  ELSE
    EXECUTE $ts$
CREATE VIEW public.today_priorities_ranked AS
WITH latest_day AS (
  SELECT
    trim(both FROM base.branch_id::text) AS bid,
    MAX(base.metric_date::date) AS d
  FROM public.today_summary_clean base
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
  FROM public.today_summary_clean base
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
          TRIM(BOTH FROM REPLACE(r.alert_type_raw, '_'::text, ' '::text))
          || ' — '::text
          || TRIM(BOTH FROM r.branch_name)
        ELSE NULLIF(TRIM(BOTH FROM REPLACE(r.alert_type_raw, '_'::text, ' '::text)), ''::text)
      END
    ) AS title_base,
    (
      CASE
        WHEN r.alert_type_raw = 'Revenue Drop' THEN
          'Revenue is down vs yesterday. Check pricing, channel mix, and packages; log context in Enter Data.'::text
        WHEN r.alert_type_raw = 'Low Occupancy' THEN
          'Occupancy is down vs last week. Review rate fences, packages, and availability; validate in Trends.'::text
        WHEN r.alert_type_raw = 'Occupancy low (level)' THEN
          'Occupancy level is low today. Consider OTA boosts, last-minute packages, and pricing fences.'::text
        WHEN r.alert_type_raw = 'ADR under pressure' THEN
          'ADR looks soft vs RevPAR signal. Review discounting, room mix, and channel leakage.'::text
        WHEN r.alert_type_raw = 'Customer traffic low (level)' THEN
          'Customer count is low today. Review promos, operating hours, and top-sellers; validate in Trends.'::text
        WHEN r.alert_type_raw = 'F&B customers down vs prior day' THEN
          'Covers dropped vs your last logged day. Review traffic drivers, hours, and local demand; validate in Trends.'::text
        WHEN r.alert_type_raw = 'F&B ticket down vs prior day' THEN
          'Average ticket fell vs prior day. Review mix, upsell, and promo depth; log context in Enter Data.'::text
        WHEN r.alert_type_raw = 'F&B cost ratio worsening (30d)' THEN
          'Trailing 30d cost/revenue rose vs the prior 30d window. Review COGS, waste, and fixed cost inputs in Enter Data.'::text
        ELSE 'Review today signals in Trends and log context in Enter Data.'::text
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
    RAISE NOTICE 'today_priorities_ranked: using source today_summary_clean';
  END IF;
END $$;

COMMENT ON VIEW public.today_priorities_ranked IS
  'Priorities from today_summary_clean + F&B fnb_daily_metrics deltas; dedup (branch_id, problem_type). F&B cost ratio = (SUM additional_cost_today + MAX monthly_fixed_cost) / SUM revenue per 30d window vs prior 30d.';

GRANT SELECT ON public.today_priorities_ranked TO anon, authenticated;

CREATE VIEW public.today_priorities_view AS
SELECT
  r.organization_id AS organization_id,
  r.branch_id AS branch_id,
  r.branch_name AS branch_name,
  r.business_type AS business_type,
  r.alert_type AS alert_type,
  r.title AS title,
  r.description AS description,
  r.sort_score AS sort_score,
  r.rank AS rank,
  r.impact_label AS impact_label,
  r.metric_date AS metric_date,
  r.impact_thb AS impact_thb,
  r.impact_thb AS impact_estimate_thb
FROM public.today_priorities_ranked r;

COMMENT ON VIEW public.today_priorities_view IS
  'Single priorities API view; filter branch_id, order=sort_score.desc, limit=4 for first + next moves.';

GRANT SELECT ON public.today_priorities_view TO anon, authenticated;

CREATE VIEW public.today_priorities_company_view AS
SELECT
  c.organization_id AS organization_id,
  c.branch_id AS branch_id,
  c.branch_name AS branch_name,
  c.business_type AS business_type,
  c.alert_type AS alert_type,
  c.title AS title,
  c.description AS description,
  c.sort_score AS sort_score,
  c.org_rank AS rank,
  c.impact_label AS impact_label,
  c.metric_date AS metric_date,
  c.impact_thb AS impact_thb,
  c.impact_thb AS impact_estimate_thb,
  CASE
    WHEN c.org_rank = 1 THEN 'fix_first'::text
    WHEN c.org_rank BETWEEN 2 AND 4 THEN 'next_moves'::text
    ELSE 'more'::text
  END AS priority_segment
FROM (
  SELECT
    r.organization_id,
    r.branch_id,
    r.branch_name,
    r.business_type,
    r.alert_type,
    r.title,
    r.description,
    r.sort_score,
    r.impact_label,
    r.metric_date,
    r.impact_thb,
    ROW_NUMBER() OVER (
      PARTITION BY r.organization_id
      ORDER BY r.sort_score DESC NULLS LAST, r.branch_id::text, r.alert_type
    )::integer AS org_rank
  FROM public.today_priorities_ranked r
  WHERE r.organization_id IS NOT NULL
) c
WHERE c.org_rank <= 5;

COMMENT ON VIEW public.today_priorities_company_view IS
  'Company Today: cross-branch top 5 per org by sort_score; rank 1 = fix first, 2–4 = next moves, 5 = more.';

GRANT SELECT ON public.today_priorities_company_view TO anon, authenticated;

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
