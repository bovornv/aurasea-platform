-- Company Today — early warning watchlist (non-urgent downward trends)
-- GET /rest/v1/watchlist_today?select=*&organization_id=eq.{uuid}&order=sort_score.desc&limit=3
-- Requires: public.today_summary_clean, public.branches
--
-- Rules:
-- - revenue decreasing 3 days: total_revenue(t) < t-1 < t-2
-- - customers decreasing 3 days: customers(t) < t-1 < t-2
-- - rooms sold decreasing 3 days: utilized(t) < t-1 < t-2
-- - fallback rows when no signals so UI never empty

DROP VIEW IF EXISTS public.watchlist_today CASCADE;

CREATE VIEW public.watchlist_today AS
WITH base AS (
  SELECT
    t.branch_id::text AS branch_id,
    t.metric_date::date AS metric_date,
    COALESCE(t.total_revenue, 0)::numeric AS total_revenue,
    t.customers::numeric AS customers,
    t.utilized::numeric AS rooms_sold,
    b.organization_id,
    b.name AS branch_name
  FROM public.today_summary_clean t
  LEFT JOIN public.branches b ON b.id::text = TRIM(BOTH FROM t.branch_id::text)
  WHERE b.organization_id IS NOT NULL
),
trend AS (
  SELECT
    b.*,
    LAG(b.total_revenue, 1) OVER (PARTITION BY b.branch_id ORDER BY b.metric_date) AS rev_l1,
    LAG(b.total_revenue, 2) OVER (PARTITION BY b.branch_id ORDER BY b.metric_date) AS rev_l2,
    LAG(b.customers, 1) OVER (PARTITION BY b.branch_id ORDER BY b.metric_date) AS cust_l1,
    LAG(b.customers, 2) OVER (PARTITION BY b.branch_id ORDER BY b.metric_date) AS cust_l2,
    LAG(b.rooms_sold, 1) OVER (PARTITION BY b.branch_id ORDER BY b.metric_date) AS room_l1,
    LAG(b.rooms_sold, 2) OVER (PARTITION BY b.branch_id ORDER BY b.metric_date) AS room_l2
  FROM base b
),
latest AS (
  SELECT DISTINCT ON (branch_id)
    organization_id,
    branch_id,
    branch_name,
    metric_date,
    total_revenue,
    customers,
    rooms_sold,
    rev_l1,
    rev_l2,
    cust_l1,
    cust_l2,
    room_l1,
    room_l2
  FROM trend
  ORDER BY branch_id, metric_date DESC NULLS LAST
),
signals AS (
  SELECT
    l.organization_id::uuid AS organization_id,
    l.branch_id::text AS branch_id,
    l.branch_name::text AS branch_name,
    l.metric_date::date AS metric_date,
    (l.branch_name || ' revenue trending down (3 days)')::text AS warning_text,
    (120::numeric + COALESCE(l.total_revenue, 0) / 1000::numeric)::numeric AS sort_score
  FROM latest l
  WHERE l.rev_l1 IS NOT NULL
    AND l.rev_l2 IS NOT NULL
    AND l.total_revenue < l.rev_l1
    AND l.rev_l1 < l.rev_l2

  UNION ALL

  SELECT
    l.organization_id::uuid,
    l.branch_id::text,
    l.branch_name::text,
    l.metric_date::date,
    ('Customer traffic softening (' || l.branch_name || ')')::text,
    110::numeric
  FROM latest l
  WHERE l.cust_l1 IS NOT NULL
    AND l.cust_l2 IS NOT NULL
    AND l.customers IS NOT NULL
    AND l.customers < l.cust_l1
    AND l.cust_l1 < l.cust_l2

  UNION ALL

  SELECT
    l.organization_id::uuid,
    l.branch_id::text,
    l.branch_name::text,
    l.metric_date::date,
    (l.branch_name || ' rooms sold softening (3 days)')::text,
    100::numeric
  FROM latest l
  WHERE l.room_l1 IS NOT NULL
    AND l.room_l2 IS NOT NULL
    AND l.rooms_sold IS NOT NULL
    AND l.rooms_sold < l.room_l1
    AND l.room_l1 < l.room_l2
),
org_pool AS (
  SELECT
    b.organization_id,
    (
      ARRAY_AGG(
        COALESCE(NULLIF(TRIM(BOTH FROM b.name), ''), TRIM(BOTH FROM b.id::text))
        ORDER BY b.sort_order NULLS LAST, b.name
      )
    )[1] AS sample_branch_name,
    (
      ARRAY_AGG(TRIM(BOTH FROM b.id::text) ORDER BY b.sort_order NULLS LAST, b.name)
    )[1] AS sample_branch_id
  FROM public.branches b
  WHERE b.organization_id IS NOT NULL
  GROUP BY b.organization_id
),
has_signal AS (
  SELECT DISTINCT s.organization_id
  FROM signals s
),
fallback AS (
  SELECT
    o.organization_id::uuid AS organization_id,
    o.sample_branch_id::text AS branch_id,
    o.sample_branch_name::text AS branch_name,
    NULL::date AS metric_date,
    'No early warning signals detected'::text AS warning_text,
    30::numeric AS sort_score
  FROM org_pool o
  LEFT JOIN has_signal hs ON hs.organization_id = o.organization_id
  WHERE hs.organization_id IS NULL
),
all_rows AS (
  SELECT * FROM signals
  UNION ALL
  SELECT * FROM fallback
),
ranked AS (
  SELECT
    a.organization_id,
    a.branch_id,
    a.branch_name,
    a.metric_date,
    a.warning_text,
    a.sort_score,
    ROW_NUMBER() OVER (
      PARTITION BY a.organization_id
      ORDER BY a.sort_score DESC, a.metric_date DESC NULLS LAST
    ) AS rn
  FROM all_rows a
  WHERE a.organization_id IS NOT NULL
)
SELECT
  r.organization_id,
  r.branch_id,
  r.branch_name,
  r.metric_date,
  r.warning_text,
  r.sort_score
FROM ranked r
WHERE r.rn <= 3;

COMMENT ON VIEW public.watchlist_today IS
  'Early warning trends (3-day softening via lag) with fallback row when none; max 3 rows per org.';

GRANT SELECT ON public.watchlist_today TO anon, authenticated;

-- Verify:
-- SELECT * FROM public.watchlist_today WHERE organization_id = '...' ORDER BY sort_score DESC LIMIT 3;
