-- =============================================================================
-- Snapshot priorities pipeline (Phase 1 accommodation + F&B)
-- =============================================================================
-- Rebuilds:
--   public.priorities_engine
--   public.priorities_ranked
--   public.today_priorities
--
-- Sources ONLY (no legacy alerts / today_summary / today_priorities_ranked):
--   public.branch_status_current
--   public.branch_daily_metrics
--   public.branches
--   public.branch_learning_status
--
-- Rules:
--   - Snapshot metric_date = branch_status_current.metric_date (current table row)
--   - Historical comparisons use branch_daily_metrics (latest vs prior row only)
--   - Max 2 rows per branch in today_priorities; priority_bucket = fix_this_first | next_best_move
--
-- Prerequisites: relations above exist; branch_status_current holds one row per branch.
-- If today_priorities exists as a TABLE, rename/drop it before running (this creates a VIEW).
-- =============================================================================

DROP VIEW IF EXISTS public.today_priorities;
DROP VIEW IF EXISTS public.priorities_ranked;
DROP VIEW IF EXISTS public.priorities_engine;

-- -----------------------------------------------------------------------------
-- priorities_engine — one row per triggered signal (before cap)
-- -----------------------------------------------------------------------------
CREATE VIEW public.priorities_engine AS
WITH bdm_ranked AS (
  SELECT
    bdm.branch_id,
    bdm.metric_date::date AS metric_date,
    COALESCE(bdm.revenue, 0::numeric) AS revenue,
    COALESCE(bdm.rooms_sold, 0::numeric) AS rooms_sold,
    COALESCE(bdm.rooms_available, 0::numeric) AS rooms_available,
    COALESCE(bdm.total_customers, bdm.customers, 0::numeric) AS customers,
    COALESCE(bdm.additional_cost_today, 0::numeric) AS additional_cost_today,
    ROW_NUMBER() OVER (
      PARTITION BY bdm.branch_id
      ORDER BY bdm.metric_date::date DESC NULLS LAST, bdm.created_at DESC NULLS LAST
    ) AS rn
  FROM public.branch_daily_metrics bdm
  WHERE bdm.branch_id IS NOT NULL
),
bdm_curr AS (
  SELECT * FROM bdm_ranked WHERE rn = 1
),
bdm_prev AS (
  SELECT * FROM bdm_ranked WHERE rn = 2
),
rev_delta AS (
  SELECT
    c.branch_id,
    c.metric_date AS bdm_latest_date,
    CASE
      WHEN p.revenue IS NULL OR p.revenue = 0::numeric THEN NULL::numeric
      ELSE round(((c.revenue - p.revenue) / p.revenue) * 100::numeric, 1)
    END AS revenue_change_pct_day
  FROM bdm_curr c
  LEFT JOIN bdm_prev p ON p.branch_id = c.branch_id
),
ticket_cmp AS (
  SELECT
    c.branch_id,
    c.metric_date AS bdm_latest_date,
    c.revenue AS cur_rev,
    c.customers AS cur_cust,
    p.revenue AS prev_rev,
    p.customers AS prev_cust,
    CASE
      WHEN p.customers > 0::numeric AND c.customers > 0::numeric
        AND (p.revenue / NULLIF(p.customers, 0::numeric)) > 0::numeric THEN
        (
          (c.revenue / NULLIF(c.customers, 0::numeric))
          - (p.revenue / NULLIF(p.customers, 0::numeric))
        )
        / NULLIF(p.revenue / NULLIF(p.customers, 0::numeric), 0::numeric) * 100::numeric
      ELSE NULL::numeric
    END AS ticket_delta_pct
  FROM bdm_curr c
  INNER JOIN bdm_prev p ON p.branch_id = c.branch_id
),
snap AS (
  SELECT
    b.organization_id AS organization_id,
    trim(both FROM bsc.branch_id::text) AS branch_id,
    COALESCE(
      NULLIF(trim(both FROM bsc.branch_name::text), ''),
      NULLIF(trim(both FROM b.branch_name::text), ''),
      NULLIF(trim(both FROM b.name::text), '')
    ) AS branch_name,
    CASE
      WHEN lower(COALESCE(b.module_type::text, '')) IN (
        'fnb', 'restaurant', 'cafe', 'cafe_restaurant'
      ) THEN 'fnb'::text
      ELSE 'accommodation'::text
    END AS business_type,
    bsc.metric_date::date AS metric_date,
    COALESCE(bsc.revenue, 0::numeric) AS revenue_thb,
    COALESCE(
      bsc.revenue_change_pct_day,
      CASE
        WHEN rd.bdm_latest_date IS NOT NULL
          AND bsc.metric_date IS NOT NULL
          AND rd.bdm_latest_date = bsc.metric_date::date
        THEN rd.revenue_change_pct_day
        WHEN rd.bdm_latest_date IS NOT NULL AND bsc.metric_date IS NULL
        THEN rd.revenue_change_pct_day
        ELSE NULL::numeric
      END
    ) AS revenue_change_pct_day,
    bsc.occupancy_rate,
    bsc.adr,
    bsc.revpar,
    COALESCE(bsc.customers, 0::numeric) AS customers,
    COALESCE(bsc.avg_ticket, 0::numeric) AS avg_ticket,
    COALESCE(bsc.avg_cost, 0::numeric) AS avg_cost,
    NULLIF(trim(both FROM bsc.margin_symbol::text), '') AS margin_symbol
  FROM public.branch_status_current bsc
  INNER JOIN public.branches b ON trim(both FROM b.id::text) = trim(both FROM bsc.branch_id::text)
  LEFT JOIN rev_delta rd ON trim(both FROM rd.branch_id::text) = trim(both FROM bsc.branch_id::text)
  WHERE bsc.branch_id IS NOT NULL
),
acc_rev AS (
  SELECT
    s.organization_id,
    s.branch_id,
    s.branch_name,
    s.business_type,
    s.metric_date,
    'revenue_drop_accommodation'::text AS alert_type,
    'Revenue Drop'::text AS title,
    (
      'Revenue is down versus the prior logged day. Adjust pricing, channel mix, or same-day promotions to recover volume.'
    )::text AS description,
    CASE
      WHEN s.revenue_thb > 0::numeric AND s.revenue_change_pct_day IS NOT NULL THEN
        GREATEST(
          round(s.revenue_thb * LEAST(0.35::numeric, abs(s.revenue_change_pct_day) / 100.0 * 0.45)),
          1000::numeric
        )
      WHEN s.revenue_thb > 0::numeric THEN round(s.revenue_thb * 0.12)
      ELSE 1000::numeric
    END AS impact_thb,
    'at risk'::text AS impact_label,
    (
      COALESCE(abs(COALESCE(s.revenue_change_pct_day, 0::numeric)), 0::numeric) * 10000::numeric
      + COALESCE(s.revenue_thb, 0::numeric) / 1000::numeric
    ) AS sort_score
  FROM snap s
  WHERE s.business_type = 'accommodation'
    AND s.revenue_change_pct_day IS NOT NULL
    AND s.revenue_change_pct_day <= -10::numeric
),
acc_occ AS (
  SELECT
    s.organization_id,
    s.branch_id,
    s.branch_name,
    s.business_type,
    s.metric_date,
    'low_occupancy_accommodation'::text AS alert_type,
    'Low Occupancy'::text AS title,
    (
      'Occupancy is below a healthy level for this snapshot. Use last-minute rates, OTAs, and short-stay offers to lift demand.'
    )::text AS description,
    CASE
      WHEN s.revenue_thb > 0::numeric THEN GREATEST(round(s.revenue_thb * 0.08), 500::numeric)
      ELSE 500::numeric
    END AS impact_thb,
    'at risk'::text AS impact_label,
    (800000::numeric + COALESCE(s.revenue_thb, 0::numeric) / 1000::numeric) AS sort_score
  FROM snap s
  WHERE s.business_type = 'accommodation'
    AND s.occupancy_rate IS NOT NULL
    AND s.occupancy_rate < 60::numeric
),
acc_adr AS (
  SELECT
    s.organization_id,
    s.branch_id,
    s.branch_name,
    s.business_type,
    s.metric_date,
    'adr_under_pressure'::text AS alert_type,
    'ADR under pressure'::text AS title,
    (
      'ADR looks weak relative to RevPAR—often discounting or a budget-heavy room mix. Tighten promotions and rebalance room types.'
    )::text AS description,
    CASE
      WHEN s.revenue_thb > 0::numeric THEN GREATEST(round(s.revenue_thb * 0.04), 500::numeric)
      ELSE 500::numeric
    END AS impact_thb,
    'at risk'::text AS impact_label,
    (600000::numeric + COALESCE(s.revenue_thb, 0::numeric) / 1000::numeric) AS sort_score
  FROM snap s
  WHERE s.business_type = 'accommodation'
    AND s.adr IS NOT NULL
    AND s.revpar IS NOT NULL
    AND s.revpar > s.adr * 0.6::numeric
),
fnb_rev AS (
  SELECT
    s.organization_id,
    s.branch_id,
    s.branch_name,
    s.business_type,
    s.metric_date,
    'revenue_drop_fnb'::text AS alert_type,
    'Revenue Drop'::text AS title,
    (
      'Revenue is down versus the prior logged day. Push bundles, peak-hour focus, and quick-win promos.'
    )::text AS description,
    CASE
      WHEN s.revenue_thb > 0::numeric AND s.revenue_change_pct_day IS NOT NULL THEN
        GREATEST(
          round(s.revenue_thb * LEAST(0.35::numeric, abs(s.revenue_change_pct_day) / 100.0 * 0.45)),
          1000::numeric
        )
      WHEN s.revenue_thb > 0::numeric THEN round(s.revenue_thb * 0.12)
      ELSE 1000::numeric
    END AS impact_thb,
    'at risk'::text AS impact_label,
    (
      COALESCE(abs(COALESCE(s.revenue_change_pct_day, 0::numeric)), 0::numeric) * 10000::numeric
      + COALESCE(s.revenue_thb, 0::numeric) / 1000::numeric
    ) AS sort_score
  FROM snap s
  WHERE s.business_type = 'fnb'
    AND s.revenue_change_pct_day IS NOT NULL
    AND s.revenue_change_pct_day <= -10::numeric
),
fnb_ticket AS (
  SELECT
    s.organization_id,
    s.branch_id,
    s.branch_name,
    s.business_type,
    s.metric_date,
    'fnb_ticket_down_prior_day'::text AS alert_type,
    'F&B ticket down vs prior day'::text AS title,
    (
      'Average ticket fell versus the last logged day. Emphasize add-ons, bundles, and suggestive selling at checkout.'
    )::text AS description,
    CASE
      WHEN s.revenue_thb > 0::numeric AND t.ticket_delta_pct IS NOT NULL THEN
        GREATEST(
          round(s.revenue_thb * LEAST(0.18::numeric, abs(t.ticket_delta_pct) / 100.0 * 0.3)),
          350::numeric
        )
      WHEN s.revenue_thb > 0::numeric THEN GREATEST(round(s.revenue_thb * 0.06), 300::numeric)
      ELSE 350::numeric
    END AS impact_thb,
    'at risk'::text AS impact_label,
    (
      COALESCE(abs(COALESCE(t.ticket_delta_pct, 0::numeric)), 0::numeric) * 8000::numeric
      + COALESCE(s.revenue_thb, 0::numeric) / 1000::numeric
    ) AS sort_score
  FROM snap s
  INNER JOIN ticket_cmp t ON trim(both FROM t.branch_id::text) = trim(both FROM s.branch_id::text)
  WHERE s.business_type = 'fnb'
    AND (
      (s.metric_date IS NOT NULL AND t.bdm_latest_date = s.metric_date::date)
      OR (s.metric_date IS NULL)
    )
    AND t.prev_cust > 0::numeric
    AND t.cur_cust > 0::numeric
    AND t.prev_rev / NULLIF(t.prev_cust, 0::numeric) > 0::numeric
    AND (t.cur_rev / NULLIF(t.cur_cust, 0::numeric))
      < (t.prev_rev / NULLIF(t.prev_cust, 0::numeric)) * 0.90::numeric
),
fnb_margin AS (
  SELECT
    s.organization_id,
    s.branch_id,
    s.branch_name,
    s.business_type,
    s.metric_date,
    'margin_pressure_fnb'::text AS alert_type,
    'Margin pressure'::text AS title,
    (
      'Cost per cover is eating into margin. Review COGS, waste, and promo depth; rebalance menu mix toward higher-margin items.'
    )::text AS description,
    CASE
      WHEN s.revenue_thb > 0::numeric THEN GREATEST(round(s.revenue_thb * 0.07), 500::numeric)
      ELSE 500::numeric
    END AS impact_thb,
    'at risk'::text AS impact_label,
    (550000::numeric + COALESCE(s.revenue_thb, 0::numeric) / 1000::numeric) AS sort_score
  FROM snap s
  WHERE s.business_type = 'fnb'
    AND (
      s.margin_symbol = '▼'::text
      OR (
        s.avg_ticket > 0::numeric
        AND s.avg_cost > 0::numeric
        AND (s.avg_cost / s.avg_ticket) >= 0.80::numeric
      )
    )
)
SELECT * FROM acc_rev
UNION ALL
SELECT * FROM acc_occ
UNION ALL
SELECT * FROM acc_adr
UNION ALL
SELECT * FROM fnb_rev
UNION ALL
SELECT * FROM fnb_ticket
UNION ALL
SELECT * FROM fnb_margin;

COMMENT ON VIEW public.priorities_engine IS
  'Phase-1 priority signals from branch_status_current + branch_daily_metrics deltas; no legacy alerts.';

GRANT SELECT ON public.priorities_engine TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- priorities_ranked — deterministic rank within branch for same metric_date
-- -----------------------------------------------------------------------------
CREATE VIEW public.priorities_ranked AS
SELECT
  e.organization_id,
  e.branch_id,
  e.branch_name,
  e.business_type,
  e.metric_date,
  e.alert_type,
  e.title,
  e.description,
  e.impact_thb,
  e.impact_label,
  e.sort_score,
  ROW_NUMBER() OVER (
    PARTITION BY e.branch_id, e.metric_date
    ORDER BY
      e.sort_score DESC NULLS LAST,
      e.alert_type ASC
  )::integer AS rank
FROM public.priorities_engine e;

COMMENT ON VIEW public.priorities_ranked IS
  'Engine rows with per-branch, per-snapshot-date rank (sort_score desc).';

GRANT SELECT ON public.priorities_ranked TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- today_priorities — snapshot feed, max 2 per branch, UI-ready
-- -----------------------------------------------------------------------------
CREATE VIEW public.today_priorities AS
SELECT
  v.organization_id,
  v.branch_id,
  v.branch_name,
  v.business_type,
  v.metric_date,
  v.alert_type,
  v.title,
  v.description,
  v.impact_thb,
  v.impact_label,
  v.sort_score,
  v.rank,
  v.priority_bucket,
  v.priority_bucket AS priority_segment,
  v.learning_days,
  v.learning_last_day
FROM (
  SELECT
    r.organization_id,
    r.branch_id,
    r.branch_name,
    r.business_type,
    r.metric_date,
    r.alert_type,
    r.title,
    r.description,
    r.impact_thb,
    r.impact_label,
    r.sort_score,
    r.rank,
    CASE
      WHEN r.rank = 1 THEN 'fix_this_first'::text
      WHEN r.rank = 2 THEN 'next_best_move'::text
      ELSE 'next_best_move'::text
    END AS priority_bucket,
    bls.learning_days,
    bls.last_day::date AS learning_last_day
  FROM public.priorities_ranked r
  LEFT JOIN public.branch_learning_status bls
    ON trim(both FROM bls.branch_id::text) = trim(both FROM r.branch_id::text)
  WHERE r.rank <= 2
) v;

COMMENT ON VIEW public.today_priorities IS
  'Snapshot-only priorities (branch_status_current date); max 2 per branch; learning context from branch_learning_status.';

GRANT SELECT ON public.today_priorities TO anon, authenticated;

-- =============================================================================
-- Verification
-- =============================================================================
-- Row counts:
--   SELECT 'priorities_engine', count(*) FROM public.priorities_engine
--   UNION ALL SELECT 'priorities_ranked', count(*) FROM public.priorities_ranked
--   UNION ALL SELECT 'today_priorities', count(*) FROM public.today_priorities;
--
-- Max 2 per branch:
--   SELECT branch_id, count(*) AS n FROM public.today_priorities GROUP BY branch_id HAVING count(*) > 2;
--
-- Non-empty when signals exist:
--   SELECT count(*) FROM public.today_priorities;
--
-- Sample:
--   SELECT branch_id, title, rank, priority_bucket, impact_thb, metric_date
--   FROM public.today_priorities
--   ORDER BY organization_id, branch_id, rank
--   LIMIT 20;
--
-- Signals fire only when branch_status_current exists for the branch (inner join branches).
-- Revenue / ticket deltas from branch_daily_metrics require latest BDM row date to match
-- branch_status_current.metric_date (when set), so the feed stays aligned to the snapshot day.
--
-- If today_priorities is empty but you expect rows: check branch_status_current rows,
-- module_type on branches (accommodation vs fnb), and that BDM has >=2 days for revenue/ticket deltas.
