-- =============================================================================
-- company_status_current + today_company_dashboard (NO CASCADE on drops)
-- =============================================================================
-- Prerequisites: public.today_summary, public.daily_metrics, public.branches,
--   public.branch_performance_drivers_accommodation, public.branch_performance_drivers_fnb
--   (run add-branch-performance-drivers-views.sql if those views are missing).
--
-- Drop order: dependents first (today_company_dashboard), then company_status_current.
-- Recreate: company_status_current → today_company_dashboard.
--
-- company_status_current: latest metric_date per branch (DISTINCT ON branch_id).
-- Sources: public.today_summary (spine), public.daily_metrics, optional driver views,
--          public.branches for org/name/type.
--
-- Exposes canonical names + legacy aliases (revenue_thb, occupancy_pct, …) for REST.
-- =============================================================================

DROP VIEW IF EXISTS public.today_company_dashboard;
DROP VIEW IF EXISTS public.company_status_current;

CREATE VIEW public.company_status_current AS
WITH j AS (
  SELECT DISTINCT ON (trim(both FROM t.branch_id::text))
    t.branch_id,
    t.metric_date::date AS metric_date,
    row_to_json(t)::jsonb AS jb,
    br.organization_id,
    COALESCE(NULLIF(TRIM(BOTH FROM br.branch_name::text), ''), NULLIF(TRIM(BOTH FROM br.name::text), ''))::text
      AS branch_name,
    CASE
      WHEN LOWER(COALESCE(br.module_type::text, '')) IN (
        'fnb', 'restaurant', 'cafe', 'cafe_restaurant'
      ) THEN 'fnb'::text
      ELSE 'accommodation'::text
    END AS business_type
  FROM public.today_summary t
  INNER JOIN public.branches br ON trim(both FROM br.id::text) = trim(both FROM t.branch_id::text)
  WHERE br.organization_id IS NOT NULL
  ORDER BY trim(both FROM t.branch_id::text), t.metric_date DESC NULLS LAST
),
x AS (
  SELECT
    j.organization_id,
    j.branch_id::uuid AS branch_id,
    j.branch_name,
    j.business_type,
    j.metric_date,
    j.jb,
    dm.revenue AS dm_revenue,
    dm.customers AS dm_customers,
    dm.avg_ticket AS dm_avg_ticket,
    dm.additional_cost_today AS dm_additional_cost,
    dm.cost AS dm_cost,
    dm.adr AS dm_adr,
    pa.occupancy_rate AS pa_occ,
    pa.revpar AS pa_revpar,
    pa.adr AS pa_adr,
    pa.rooms_sold AS pa_rooms_sold,
    pa.rooms_available AS pa_rooms_avail,
    pf.avg_ticket AS pf_avg_ticket
  FROM j
  LEFT JOIN public.daily_metrics dm
    ON trim(both FROM dm.branch_id::text) = trim(both FROM j.branch_id::text)
    AND dm.metric_date::date = j.metric_date
  LEFT JOIN public.branch_performance_drivers_accommodation pa
    ON j.business_type = 'accommodation'::text
    AND trim(both FROM pa.branch_id::text) = trim(both FROM j.branch_id::text)
    AND pa.metric_date::date = j.metric_date
  LEFT JOIN public.branch_performance_drivers_fnb pf
    ON j.business_type = 'fnb'::text
    AND trim(both FROM pf.branch_id::text) = trim(both FROM j.branch_id::text)
    AND pf.metric_date::date = j.metric_date
),
c AS (
  SELECT
    x.*,
    COALESCE(
      x.dm_revenue,
      CASE
        WHEN x.business_type = 'fnb'::text THEN NULLIF(TRIM(x.jb ->> 'fnb_revenue'), '')::numeric
        ELSE NULLIF(TRIM(x.jb ->> 'accommodation_revenue'), '')::numeric
      END,
      NULLIF(TRIM(x.jb ->> 'revenue'), '')::numeric,
      NULLIF(TRIM(x.jb ->> 'total_revenue'), '')::numeric,
      NULLIF(TRIM(x.jb ->> 'total_revenue_thb'), '')::numeric
    ) AS revenue_val,
    NULLIF(TRIM(x.jb ->> 'revenue_delta_day'), '')::numeric AS revenue_delta_day_val,
    NULLIF(TRIM(x.jb ->> 'revenue_yesterday'), '')::numeric AS revenue_yesterday_val,
    COALESCE(
      NULLIF(TRIM(x.jb ->> 'health_score'), '')::numeric,
      CASE
        WHEN (x.jb ->> 'revenue_delta_day') IS NULL OR btrim(COALESCE(x.jb ->> 'revenue_delta_day', '')) = '' THEN 70::numeric
        WHEN NULLIF(TRIM(x.jb ->> 'revenue_delta_day'), '')::numeric >= 0 THEN 76::numeric
        ELSE 58::numeric
      END
    ) AS health_score_val,
    COALESCE(
      x.pa_occ,
      NULLIF(TRIM(x.jb ->> 'occupancy_rate'), '')::numeric,
      NULLIF(TRIM(x.jb ->> 'occupancy_pct'), '')::numeric,
      CASE
        WHEN NULLIF(TRIM(COALESCE(x.jb ->> 'rooms_available', x.jb ->> 'capacity', '')), '')::numeric > 0::numeric
        THEN (
          COALESCE(
            NULLIF(TRIM(COALESCE(x.jb ->> 'utilized', x.jb ->> 'rooms_sold', '')), '')::numeric,
            0::numeric
          )
          / NULLIF(TRIM(COALESCE(x.jb ->> 'rooms_available', x.jb ->> 'capacity', '')), '')::numeric
        ) * 100::numeric
        ELSE NULL::numeric
      END
    ) AS occupancy_rate_val,
    NULLIF(TRIM(x.jb ->> 'occupancy_delta_week'), '')::numeric AS occupancy_delta_week_val,
    COALESCE(
      NULLIF(TRIM(x.jb ->> 'rooms_sold'), '')::numeric,
      NULLIF(TRIM(x.jb ->> 'utilized'), '')::numeric,
      x.pa_rooms_sold::numeric
    ) AS utilized_val,
    COALESCE(
      NULLIF(TRIM(x.jb ->> 'rooms_available'), '')::numeric,
      NULLIF(TRIM(x.jb ->> 'capacity'), '')::numeric,
      x.pa_rooms_avail::numeric
    ) AS capacity_val,
    COALESCE(
      x.pa_adr,
      NULLIF(TRIM(x.jb ->> 'adr'), '')::numeric,
      x.dm_adr,
      CASE
        WHEN COALESCE(
          NULLIF(TRIM(x.jb ->> 'utilized'), '')::numeric,
          NULLIF(TRIM(x.jb ->> 'rooms_sold'), '')::numeric,
          0::numeric
        ) > 0::numeric
        THEN
          COALESCE(
            NULLIF(TRIM(x.jb ->> 'total_revenue'), '')::numeric,
            NULLIF(TRIM(x.jb ->> 'revenue'), '')::numeric,
            0::numeric
          )
          / NULLIF(
            COALESCE(
              NULLIF(TRIM(x.jb ->> 'utilized'), '')::numeric,
              NULLIF(TRIM(x.jb ->> 'rooms_sold'), '')::numeric,
              0::numeric
            ),
            0::numeric
          )
        ELSE NULL::numeric
      END
    ) AS adr_val,
    COALESCE(
      x.pa_revpar,
      NULLIF(TRIM(x.jb ->> 'revpar'), '')::numeric,
      CASE
        WHEN NULLIF(TRIM(COALESCE(x.jb ->> 'rooms_available', x.jb ->> 'capacity', '')), '')::numeric > 0::numeric
        THEN
          COALESCE(
            NULLIF(TRIM(x.jb ->> 'total_revenue'), '')::numeric,
            NULLIF(TRIM(x.jb ->> 'revenue'), '')::numeric,
            0::numeric
          )
          / NULLIF(TRIM(COALESCE(x.jb ->> 'rooms_available', x.jb ->> 'capacity', '')), '')::numeric
        ELSE NULL::numeric
      END
    ) AS revpar_val,
    COALESCE(
      NULLIF(TRIM(x.jb ->> 'customers'), '')::numeric,
      NULLIF(TRIM(x.jb ->> 'total_customers'), '')::numeric,
      x.dm_customers::numeric
    ) AS customers_val,
    COALESCE(
      NULLIF(TRIM(x.jb ->> 'transactions'), '')::numeric,
      NULLIF(TRIM(x.jb ->> 'customers'), '')::numeric,
      NULLIF(TRIM(x.jb ->> 'total_customers'), '')::numeric,
      x.dm_customers::numeric
    ) AS transactions_val,
    COALESCE(
      NULLIF(TRIM(x.jb ->> 'avg_ticket'), '')::numeric,
      x.pf_avg_ticket,
      x.dm_avg_ticket,
      CASE
        WHEN COALESCE(x.dm_customers, 0) > 0 AND x.dm_revenue IS NOT NULL
          THEN x.dm_revenue::numeric / NULLIF(x.dm_customers::numeric, 0)
        ELSE NULL::numeric
      END
    ) AS avg_ticket_val,
    COALESCE(x.dm_additional_cost, x.dm_cost) AS avg_cost_val,
    CASE
      WHEN x.business_type = 'fnb'::text THEN NULL::text
      WHEN NULLIF(
        TRIM(
          COALESCE(
            x.jb ->> 'profitability_trend',
            x.jb ->> 'profit_trend',
            x.jb ->> 'profit_margin_trend',
            ''
          )
        ),
        ''
      ) IS NULL THEN NULL::text
      WHEN LOWER(
        TRIM(
          COALESCE(
            x.jb ->> 'profitability_trend',
            x.jb ->> 'profit_trend',
            x.jb ->> 'profit_margin_trend',
            ''
          )
        )
      ) = ANY (ARRAY['up', 'rising', 'positive', 'improving', 'higher', 'gain', '↑']::text[]) THEN '↑'::text
      WHEN LOWER(
        TRIM(
          COALESCE(
            x.jb ->> 'profitability_trend',
            x.jb ->> 'profit_trend',
            x.jb ->> 'profit_margin_trend',
            ''
          )
        )
      ) = ANY (ARRAY['down', 'falling', 'negative', 'declining', 'lower', 'loss', '↓']::text[]) THEN '↓'::text
      WHEN LOWER(
        TRIM(
          COALESCE(
            x.jb ->> 'profitability_trend',
            x.jb ->> 'profit_trend',
            x.jb ->> 'profit_margin_trend',
            ''
          )
        )
      ) = ANY (
        ARRAY[
          'flat', 'neutral', 'stable', 'unchanged', 'steady', 'sideways', '→', 'hold', 'same'
        ]::text[]
      ) THEN '→'::text
      ELSE LEFT(
        TRIM(
          COALESCE(
            x.jb ->> 'profitability_trend',
            x.jb ->> 'profit_trend',
            x.jb ->> 'profit_margin_trend',
            ''
          )
        ),
        8
      )
    END AS profitability_symbol_val,
    CASE
      WHEN x.business_type <> 'fnb'::text THEN NULL::text
      WHEN NULLIF(TRIM(COALESCE(x.jb ->> 'margin_trend', x.jb ->> 'margin_direction', '')), '') IS NULL
        THEN NULL::text
      WHEN LOWER(TRIM(COALESCE(x.jb ->> 'margin_trend', x.jb ->> 'margin_direction', ''))) = ANY (
        ARRAY['up', 'rising', 'positive', 'improving', 'higher', 'gain', '↑']::text[]
      ) THEN '↑'::text
      WHEN LOWER(TRIM(COALESCE(x.jb ->> 'margin_trend', x.jb ->> 'margin_direction', ''))) = ANY (
        ARRAY['down', 'falling', 'negative', 'declining', 'lower', 'loss', '↓']::text[]
      ) THEN '↓'::text
      WHEN LOWER(TRIM(COALESCE(x.jb ->> 'margin_trend', x.jb ->> 'margin_direction', ''))) = ANY (
        ARRAY[
          'flat', 'neutral', 'stable', 'unchanged', 'steady', 'sideways', '→', 'hold', 'same'
        ]::text[]
      ) THEN '→'::text
      ELSE LEFT(TRIM(COALESCE(x.jb ->> 'margin_trend', x.jb ->> 'margin_direction', '')), 8)
    END AS margin_symbol_val
  FROM x
)
SELECT
  c.organization_id::uuid AS organization_id,
  c.branch_id,
  c.branch_name,
  c.business_type,
  c.metric_date,
  c.revenue_val AS revenue,
  c.revenue_val AS revenue_thb,
  c.revenue_delta_day_val AS revenue_delta_day,
  c.revenue_yesterday_val AS revenue_yesterday,
  c.health_score_val AS health_score,
  CASE WHEN c.business_type = 'fnb'::text THEN NULL::numeric ELSE c.occupancy_rate_val END AS occupancy_rate,
  c.occupancy_delta_week_val AS occupancy_delta_week,
  CASE WHEN c.business_type = 'fnb'::text THEN NULL::numeric ELSE c.occupancy_rate_val END AS occupancy_pct,
  CASE WHEN c.business_type = 'fnb'::text THEN NULL::numeric ELSE c.utilized_val END AS utilized,
  CASE WHEN c.business_type = 'fnb'::text THEN NULL::numeric ELSE c.capacity_val END AS capacity,
  CASE WHEN c.business_type = 'fnb'::text THEN NULL::numeric ELSE c.adr_val END AS adr,
  CASE WHEN c.business_type = 'fnb'::text THEN NULL::numeric ELSE c.adr_val END AS adr_thb,
  CASE WHEN c.business_type = 'fnb'::text THEN NULL::numeric ELSE c.revpar_val END AS revpar,
  CASE WHEN c.business_type = 'fnb'::text THEN NULL::numeric ELSE c.revpar_val END AS revpar_thb,
  CASE WHEN c.business_type = 'fnb'::text THEN c.customers_val ELSE NULL::numeric END AS customers,
  CASE WHEN c.business_type = 'fnb'::text THEN c.transactions_val ELSE NULL::numeric END AS transactions,
  CASE WHEN c.business_type = 'fnb'::text THEN c.avg_ticket_val ELSE NULL::numeric END AS avg_ticket,
  CASE WHEN c.business_type = 'fnb'::text THEN c.avg_ticket_val ELSE NULL::numeric END AS avg_ticket_thb,
  CASE WHEN c.business_type = 'fnb'::text THEN c.avg_cost_val ELSE NULL::numeric END AS avg_cost,
  CASE WHEN c.business_type = 'fnb'::text THEN c.avg_cost_val ELSE NULL::numeric END AS avg_cost_thb,
  CASE WHEN c.business_type = 'fnb'::text THEN c.margin_symbol_val ELSE NULL::text END AS margin,
  CASE WHEN c.business_type = 'fnb'::text THEN c.margin_symbol_val ELSE NULL::text END AS margin_symbol,
  CASE WHEN c.business_type = 'fnb'::text THEN NULL::text ELSE c.profitability_symbol_val END AS profitability,
  CASE WHEN c.business_type = 'fnb'::text THEN NULL::text ELSE c.profitability_symbol_val END AS profitability_symbol
FROM c;

COMMENT ON VIEW public.company_status_current IS
  'Latest branch-day snapshot: today_summary + daily_metrics + optional performance driver views; one row per branch; canonical + legacy column names.';

GRANT SELECT ON public.company_status_current TO anon, authenticated;

CREATE VIEW public.today_company_dashboard AS
WITH orgs AS (
  SELECT DISTINCT c.organization_id::uuid AS organization_id
  FROM public.company_status_current c
  UNION
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
          ww.sort_score,
          ww.whats_working_text
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
        LIMIT 30
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
          wt.sort_score,
          wt.watchlist_text
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
  'Company Today JSON payload per org; panel views + company_data_confidence. company_status_current is the REST source for latest branch metrics.';

GRANT SELECT ON public.today_company_dashboard TO anon, authenticated;

-- =============================================================================
-- Verification (run manually)
-- =============================================================================
-- One row per branch:
--   SELECT branch_id, COUNT(*) FROM public.company_status_current GROUP BY 1 HAVING COUNT(*) > 1;
--
-- Required columns exist:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'company_status_current'
--   ORDER BY ordinal_position;
--
-- Sample values:
--   SELECT branch_name, business_type, metric_date, revenue, revenue_delta_day, health_score,
--          occupancy_rate, utilized, capacity, customers, avg_ticket, avg_cost, profitability_symbol, margin_symbol
--   FROM public.company_status_current LIMIT 10;
--
-- today_company_dashboard:
--   SELECT organization_id, jsonb_array_length(priorities), jsonb_array_length(whats_working)
--   FROM public.today_company_dashboard LIMIT 5;
-- =============================================================================
