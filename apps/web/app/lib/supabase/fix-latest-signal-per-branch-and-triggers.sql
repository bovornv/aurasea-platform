-- =============================================================================
-- Fix: use latest available data per branch (DISTINCT ON + ORDER BY metric_date DESC)
-- instead of filtering on CURRENT_DATE.
--
-- Addresses: FNB branches entering data at 5pm show "no signal detected" before
-- data entry because older view versions filtered on metric_date = CURRENT_DATE.
--
-- Run in Supabase SQL editor (entire file at once).
--
-- Prerequisites:
--   public.fnb_daily_metrics      (branch_id, metric_date, revenue, total_customers,
--                                   additional_cost_today, monthly_fixed_cost)
--   public.accommodation_daily_metrics
--   public.branches
--   public.today_summary
--   public.refresh_branch_status(branch_id text, business_type text)  -- already exists
-- =============================================================================

-- ============================================================================
-- STEP 1: fnb_profitability_signal
--
-- Latest FNB row per branch; no CURRENT_DATE filter.
-- Mirrors accommodation_profitability_signal structure.
-- Provides: margin_trend, daily_cost, cost_per_customer_30d, cost_ratio_30d
-- (consumed by branch_performance_signal FNB arm).
-- ============================================================================

DROP VIEW IF EXISTS public.fnb_profitability_signal CASCADE;

CREATE VIEW public.fnb_profitability_signal AS
WITH latest AS (
  SELECT DISTINCT ON (branch_id)
    branch_id,
    metric_date::date AS metric_date,
    COALESCE(revenue, 0)::numeric AS revenue,
    COALESCE(total_customers, 0)::integer AS total_customers,
    COALESCE(additional_cost_today, 0)::numeric AS additional_cost_today,
    COALESCE(monthly_fixed_cost, 0)::numeric AS monthly_fixed_cost
  FROM public.fnb_daily_metrics
  WHERE branch_id IS NOT NULL
  ORDER BY branch_id, metric_date DESC NULLS LAST
),
agg30 AS (
  SELECT
    d.branch_id,
    SUM(COALESCE(d.additional_cost_today, 0)::numeric) AS variable_cost_30d,
    SUM(COALESCE(d.revenue, 0)::numeric) AS revenue_30d,
    SUM(COALESCE(d.total_customers, 0)::numeric) AS customers_30d,
    MAX(COALESCE(d.monthly_fixed_cost, 0)::numeric) AS monthly_fixed_max_30d
  FROM public.fnb_daily_metrics d
  INNER JOIN latest l ON l.branch_id = d.branch_id
  WHERE d.metric_date::date >= (l.metric_date - INTERVAL '29 days')
    AND d.metric_date::date <= l.metric_date
  GROUP BY d.branch_id
),
prev_row AS (
  SELECT DISTINCT ON (d.branch_id)
    d.branch_id,
    COALESCE(d.revenue, 0)::numeric AS prev_revenue
  FROM public.fnb_daily_metrics d
  INNER JOIN latest l ON l.branch_id = d.branch_id
  WHERE d.metric_date::date < l.metric_date
  ORDER BY d.branch_id, d.metric_date DESC NULLS LAST
),
calc AS (
  SELECT
    l.branch_id,
    l.metric_date,
    l.revenue,
    l.total_customers,
    COALESCE(a.variable_cost_30d, 0)::numeric AS variable_cost_30d,
    COALESCE(a.revenue_30d, 0)::numeric AS revenue_30d,
    COALESCE(a.customers_30d, 0)::numeric AS customers_30d,
    COALESCE(a.monthly_fixed_max_30d, 0)::numeric AS monthly_fixed_max_30d,
    (
      COALESCE(a.variable_cost_30d, 0)::numeric
      + COALESCE(a.monthly_fixed_max_30d, 0)::numeric
    ) / 30.0::numeric AS daily_cost,
    p.prev_revenue
  FROM latest l
  LEFT JOIN agg30 a ON a.branch_id = l.branch_id
  LEFT JOIN prev_row p ON p.branch_id = l.branch_id
)
SELECT
  c.branch_id::text AS branch_id,
  c.metric_date,
  c.revenue,
  c.total_customers,
  c.variable_cost_30d,
  c.monthly_fixed_max_30d,
  c.daily_cost,
  (c.revenue - c.daily_cost)::numeric AS profit,
  CASE
    WHEN c.daily_cost > 0::numeric
      THEN ((c.revenue - c.daily_cost) / c.daily_cost)::numeric
    ELSE NULL::numeric
  END AS profit_margin,
  CASE
    WHEN COALESCE(c.total_customers, 0) > 0
      THEN (c.revenue / NULLIF(c.total_customers::numeric, 0))::numeric
    ELSE NULL::numeric
  END AS avg_ticket,
  -- cost_per_customer_30d and cost_ratio_30d consumed by branch_performance_signal
  (
    (COALESCE(c.variable_cost_30d, 0) + COALESCE(c.monthly_fixed_max_30d, 0))
    / NULLIF(c.customers_30d, 0)
  )::numeric AS cost_per_customer_30d,
  (
    (COALESCE(c.variable_cost_30d, 0) + COALESCE(c.monthly_fixed_max_30d, 0))
    / NULLIF(c.revenue_30d, 0)
  )::numeric AS cost_ratio_30d,
  CASE
    WHEN c.prev_revenue IS NULL THEN NULL::text
    WHEN (c.revenue - c.daily_cost) > (COALESCE(c.prev_revenue, 0) - c.daily_cost) + 0.01
      THEN 'up'::text
    WHEN (c.revenue - c.daily_cost) < (COALESCE(c.prev_revenue, 0) - c.daily_cost) - 0.01
      THEN 'down'::text
    ELSE 'flat'::text
  END AS margin_trend,
  CASE
    WHEN c.daily_cost <= 0::numeric THEN
      'Insufficient cost basis (set additional_cost_today and/or monthly_fixed_cost).'::text
    ELSE
      format(
        'F&B daily cost ฿%s (30d variable + monthly fixed); profit ฿%s; margin vs cost %s%%.',
        round(c.daily_cost, 0)::text,
        round(c.revenue - c.daily_cost, 0)::text,
        CASE
          WHEN c.daily_cost > 0::numeric
            THEN round(((c.revenue - c.daily_cost) / c.daily_cost) * 100.0, 1)::text
          ELSE '—'
        END
      )
  END AS margin_explanation
FROM calc c;

COMMENT ON VIEW public.fnb_profitability_signal IS
  'Latest FNB row per branch (DISTINCT ON branch_id, metric_date DESC): daily_cost=(sum additional 30d+monthly_fixed)/30; margin_trend vs prior day; cost_per_customer_30d and cost_ratio_30d for branch_performance_signal.';

GRANT SELECT ON public.fnb_profitability_signal TO anon, authenticated;

-- ============================================================================
-- STEP 2: branch_performance_signal  (re-apply; drops dependents via CASCADE)
--
-- DISTINCT ON per branch per module type; no CURRENT_DATE filter.
-- ============================================================================

DROP VIEW IF EXISTS public.branch_business_status CASCADE;
DROP VIEW IF EXISTS public.branch_performance_signal CASCADE;

CREATE VIEW public.branch_performance_signal AS
WITH fnb_latest AS (
  SELECT DISTINCT ON (f.branch_id)
    f.branch_id,
    f.metric_date::date AS metric_date
  FROM public.fnb_daily_metrics f
  WHERE f.branch_id IS NOT NULL
  ORDER BY f.branch_id, f.metric_date DESC NULLS LAST
),
fnb_agg30 AS (
  SELECT
    d.branch_id::text AS branch_id,
    SUM(COALESCE(d.additional_cost_today, 0)::numeric) AS variable_cost_30d,
    SUM(COALESCE(d.revenue, 0::numeric)) AS revenue_30d,
    SUM(COALESCE(d.total_customers, 0::numeric)) AS customers_30d,
    MAX(COALESCE(d.monthly_fixed_cost, 0::numeric)) AS monthly_fixed_max_30d
  FROM public.fnb_daily_metrics d
  INNER JOIN fnb_latest l ON l.branch_id = d.branch_id
  WHERE d.metric_date::date >= (l.metric_date - INTERVAL '29 days')
    AND d.metric_date::date <= l.metric_date
  GROUP BY d.branch_id
),
fnb_cost_30d AS (
  SELECT
    a.branch_id,
    (COALESCE(a.variable_cost_30d, 0::numeric) + COALESCE(a.monthly_fixed_max_30d, 0::numeric))::numeric AS total_cost_30d,
    (
      (COALESCE(a.variable_cost_30d, 0::numeric) + COALESCE(a.monthly_fixed_max_30d, 0::numeric)) / 30.0::numeric
    )::numeric AS daily_cost,
    (
      (COALESCE(a.variable_cost_30d, 0::numeric) + COALESCE(a.monthly_fixed_max_30d, 0::numeric))
      / NULLIF(COALESCE(a.customers_30d, 0::numeric), 0)
    )::numeric AS cost_per_customer_30d,
    (
      (COALESCE(a.variable_cost_30d, 0::numeric) + COALESCE(a.monthly_fixed_max_30d, 0::numeric))
      / NULLIF(COALESCE(a.revenue_30d, 0::numeric), 0)
    )::numeric AS cost_ratio_30d
  FROM fnb_agg30 a
)
SELECT *
FROM (
  SELECT DISTINCT ON (t.branch_id)
    t.branch_id::text AS branch_id,
    'accommodation'::text AS branch_type,
    t.metric_date::date AS metric_date,
    NULLIF(
      TRIM(
        COALESCE(
          NULLIF(TRIM(COALESCE(t.profitability_trend::text, '')), ''),
          (sig.j->>'profitability_trend'),
          (sig.j->>'profit_trend'),
          (sig.j->>'profit_margin_trend'),
          (sig.j->>'trend'),
          ''
        )
      ),
      ''
    ) AS profit_margin_trend,
    COALESCE(
      t.daily_cost,
      NULLIF(TRIM((sig.j->>'daily_cost')), '')::numeric,
      NULLIF(TRIM((sig.j->>'avg_daily_cost')), '')::numeric,
      NULL::numeric
    ) AS avg_daily_cost,
    NULL::numeric AS fnb_cost_per_customer_30d,
    NULL::numeric AS fnb_cost_to_revenue_30d
  FROM public.accommodation_profitability_signal t
  CROSS JOIN LATERAL (SELECT row_to_json(t)::jsonb AS j) AS sig
  ORDER BY t.branch_id, t.metric_date DESC NULLS LAST
) acc
UNION ALL
SELECT *
FROM (
  SELECT DISTINCT ON (t.branch_id)
    t.branch_id::text AS branch_id,
    'fnb'::text AS branch_type,
    t.metric_date::date AS metric_date,
    NULLIF(
      TRIM(
        COALESCE(
          (sig.j->>'margin_trend'),
          (sig.j->>'margin_direction'),
          (sig.j->>'profitability_trend'),
          (sig.j->>'trend'),
          ''
        )
      ),
      ''
    ) AS profit_margin_trend,
    COALESCE(
      f30.daily_cost,
      NULLIF(TRIM(sig.j->>'avg_daily_cost'), '')::numeric,
      NULLIF(TRIM(sig.j->>'average_daily_cost'), '')::numeric,
      NULLIF(TRIM(sig.j->>'daily_cost'), '')::numeric,
      NULLIF(TRIM(sig.j->>'avg_cost'), '')::numeric,
      NULL::numeric
    ) AS avg_daily_cost,
    f30.cost_per_customer_30d AS fnb_cost_per_customer_30d,
    f30.cost_ratio_30d AS fnb_cost_to_revenue_30d
  FROM public.fnb_profitability_signal t
  CROSS JOIN LATERAL (SELECT row_to_json(t)::jsonb AS j) AS sig
  LEFT JOIN fnb_cost_30d f30 ON f30.branch_id = t.branch_id::text
  ORDER BY t.branch_id, t.metric_date DESC NULLS LAST
) fnb;

COMMENT ON VIEW public.branch_performance_signal IS
  'Latest profitability/margin signal per branch; accommodation + fnb UNION. No CURRENT_DATE filter: uses DISTINCT ON branch_id ORDER BY metric_date DESC. F&B avg_daily_cost = (SUM(additional_cost_today over 30d ending latest metric_date) + MAX(monthly_fixed_cost)) / 30.';

GRANT SELECT ON public.branch_performance_signal TO anon, authenticated;

-- ============================================================================
-- STEP 3: branch_intelligence
--
-- One row per branch: latest available snapshot regardless of whether
-- today's data has been entered yet.  Uses DISTINCT ON (branch_id)
-- ORDER BY metric_date DESC so pre-5pm FNB branches surface yesterday's signal.
-- ============================================================================

DROP VIEW IF EXISTS public.branch_intelligence CASCADE;

CREATE VIEW public.branch_intelligence AS
SELECT DISTINCT ON (ts.branch_id)
  ts.branch_id::text                                          AS branch_id,
  br.organization_id::uuid                                   AS organization_id,
  COALESCE(NULLIF(TRIM(br.branch_name::text), ''),
           NULLIF(TRIM(br.name::text),        ''))::text     AS branch_name,
  CASE
    WHEN LOWER(COALESCE(br.module_type::text, '')) IN (
      'fnb', 'restaurant', 'cafe', 'cafe_restaurant'
    ) THEN 'fnb'::text
    ELSE 'accommodation'::text
  END                                                        AS business_type,
  ts.metric_date::date                                       AS metric_date,
  ts.total_revenue                                           AS total_revenue,
  ts.accommodation_revenue,
  ts.fnb_revenue,
  ts.customers,
  ts.rooms_sold,
  ts.rooms_available,
  ts.occupancy_rate,
  ts.adr,
  ts.revpar,
  ts.avg_ticket,
  ts.revenue_delta_day,
  ts.occupancy_delta_week,
  ts.health_score,
  ps.profit_margin_trend,
  ps.avg_daily_cost,
  ps.fnb_cost_per_customer_30d,
  ps.fnb_cost_to_revenue_30d
FROM public.today_summary ts
INNER JOIN public.branches br
  ON TRIM(br.id::text) = TRIM(ts.branch_id::text)
LEFT JOIN public.branch_performance_signal ps
  ON ps.branch_id = ts.branch_id::text
  AND ps.branch_type = CASE
    WHEN LOWER(COALESCE(br.module_type::text, '')) IN (
      'fnb', 'restaurant', 'cafe', 'cafe_restaurant'
    ) THEN 'fnb'
    ELSE 'accommodation'
  END
WHERE br.organization_id IS NOT NULL
ORDER BY ts.branch_id, ts.metric_date DESC NULLS LAST;

COMMENT ON VIEW public.branch_intelligence IS
  'Latest available snapshot per branch: DISTINCT ON branch_id ORDER BY metric_date DESC. No CURRENT_DATE filter — FNB branches show yesterday data before 5pm entry. Combines today_summary metrics with branch_performance_signal trends.';

GRANT SELECT ON public.branch_intelligence TO anon, authenticated;

-- ============================================================================
-- STEP 4: Triggers — call refresh_branch_status after INSERT or UPDATE
--
-- refresh_branch_status(branch_id text, business_type text) already exists.
-- Two dedicated trigger functions (one per table) avoid TG_ARGV and any
-- function-lookup ambiguity.
-- ============================================================================

-- Trigger function for fnb_daily_metrics
CREATE OR REPLACE FUNCTION public.trg_fn_fnb_refresh_branch_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_branch_status(NEW.branch_id::text, 'fnb');
  RETURN NEW;
END;
$$;

-- Trigger function for accommodation_daily_metrics
CREATE OR REPLACE FUNCTION public.trg_fn_accommodation_refresh_branch_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_branch_status(NEW.branch_id::text, 'accommodation');
  RETURN NEW;
END;
$$;

-- fnb_daily_metrics trigger
DROP TRIGGER IF EXISTS trg_fnb_refresh_branch_status ON public.fnb_daily_metrics;

CREATE TRIGGER trg_fnb_refresh_branch_status
  AFTER INSERT OR UPDATE ON public.fnb_daily_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_fnb_refresh_branch_status();

-- accommodation_daily_metrics trigger
DROP TRIGGER IF EXISTS trg_accommodation_refresh_branch_status ON public.accommodation_daily_metrics;

CREATE TRIGGER trg_accommodation_refresh_branch_status
  AFTER INSERT OR UPDATE ON public.accommodation_daily_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_accommodation_refresh_branch_status();

-- ============================================================================
-- Verification (run manually after applying this file)
-- ============================================================================
-- Confirm FNB branch returns a row even before today's data is entered:
--   SELECT branch_id, metric_date, margin_trend, daily_cost
--   FROM public.fnb_profitability_signal
--   WHERE branch_id = '4dca5378-68a7-4eef-94f0-7572852a7744';
--
-- Confirm branch_performance_signal has FNB row:
--   SELECT branch_id, branch_type, metric_date, profit_margin_trend, avg_daily_cost
--   FROM public.branch_performance_signal
--   WHERE branch_id = '4dca5378-68a7-4eef-94f0-7572852a7744';
--
-- Confirm branch_intelligence has latest row (not null even pre-5pm):
--   SELECT branch_id, business_type, metric_date, total_revenue, profit_margin_trend
--   FROM public.branch_intelligence
--   WHERE branch_id = '4dca5378-68a7-4eef-94f0-7572852a7744';
--
-- Confirm triggers exist:
--   SELECT tgname, tgrelid::regclass, tgenabled
--   FROM pg_trigger
--   WHERE tgname IN (
--     'trg_fnb_refresh_branch_status',
--     'trg_accommodation_refresh_branch_status'
--   );
-- ============================================================================
