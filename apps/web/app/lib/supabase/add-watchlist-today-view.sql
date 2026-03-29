-- Company Today — early warning watchlist (non-urgent downward trends)
-- Canonical body: rebuild-alerts-enriched-engine.sql STEP 6f.
-- One row per (branch_id, metric_date); full history from public.today_summary.
-- Contract: organization_id, branch_id, branch_name, metric_date, title, description, sort_score, watchlist_text.
-- description is exactly "Branch: {branch_name}".
-- DROP + CREATE: avoids CREATE OR REPLACE errors when column set/order changes vs existing DB.

DROP VIEW IF EXISTS public.watchlist_today CASCADE;

CREATE VIEW public.watchlist_today AS
WITH base AS (
  SELECT
    t.branch_id::uuid AS branch_id,
    t.metric_date::date AS metric_date,
    COALESCE(
      NULLIF(TRIM(j.jb->>'total_revenue'), '')::numeric,
      NULLIF(TRIM(j.jb->>'revenue'), '')::numeric,
      NULLIF(TRIM(j.jb->>'total_revenue_thb'), '')::numeric,
      NULLIF(TRIM(j.jb->>'revenue_thb'), '')::numeric,
      0::numeric
    ) AS total_revenue,
    COALESCE(
      NULLIF(TRIM(j.jb->>'customers'), '')::numeric,
      NULLIF(TRIM(j.jb->>'total_customers'), '')::numeric,
      0::numeric
    ) AS customers,
    COALESCE(
      NULLIF(TRIM(j.jb->>'utilized'), '')::numeric,
      NULLIF(TRIM(j.jb->>'rooms_sold'), '')::numeric,
      0::numeric
    ) AS rooms_sold,
    b.organization_id::uuid AS organization_id,
    COALESCE(b.branch_name, b.name) AS branch_name,
    CASE
      WHEN LOWER(COALESCE(b.module_type::text, '')) IN (
        'accommodation', 'hotel', 'hotel_resort', 'rooms', 'hotel_with_cafe'
      ) THEN 'accommodation'::text
      WHEN LOWER(COALESCE(b.module_type::text, '')) IN (
        'fnb', 'restaurant', 'cafe', 'cafe_restaurant'
      ) THEN 'fnb'::text
      ELSE COALESCE(LOWER(TRIM(b.module_type::text)), 'unknown')
    END AS branch_type
  FROM public.today_summary t
  CROSS JOIN LATERAL (SELECT row_to_json(t)::jsonb AS jb) j
  LEFT JOIN public.branches b ON b.id::text = TRIM(BOTH FROM t.branch_id::text)
  WHERE b.organization_id IS NOT NULL
),
trend_lags AS (
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
trend AS (
  SELECT
    x.*,
    LEAST(
      GREATEST(
        CASE
          WHEN x.rev_l1 IS NOT NULL
            AND x.rev_l2 IS NOT NULL
            AND x.total_revenue < x.rev_l1
            AND x.rev_l1 < x.rev_l2
          THEN
            (x.rev_l2 - x.total_revenue)
            / NULLIF(GREATEST(ABS(x.rev_l2), ABS(x.rev_l1), ABS(x.total_revenue), 1::numeric), 0::numeric)
          ELSE 0::numeric
        END,
        0::numeric
      ),
      1::numeric
    ) AS rev_drop_depth,
    LEAST(
      GREATEST(
        CASE
          WHEN x.room_l1 IS NOT NULL
            AND x.room_l2 IS NOT NULL
            AND x.rooms_sold IS NOT NULL
            AND x.rooms_sold < x.room_l1
            AND x.room_l1 < x.room_l2
          THEN
            (x.room_l2 - x.rooms_sold)
            / NULLIF(
              GREATEST(ABS(x.room_l2), ABS(x.room_l1), ABS(x.rooms_sold), 1::numeric),
              0::numeric
            )
          ELSE 0::numeric
        END,
        0::numeric
      ),
      1::numeric
    ) AS room_drop_depth,
    LEAST(
      GREATEST(
        CASE
          WHEN x.cust_l1 IS NOT NULL
            AND x.cust_l2 IS NOT NULL
            AND x.customers IS NOT NULL
            AND x.customers < x.cust_l1
            AND x.cust_l1 < x.cust_l2
          THEN
            (x.cust_l2 - x.customers)
            / NULLIF(
              GREATEST(ABS(x.cust_l2), ABS(x.cust_l1), ABS(x.customers), 1::numeric),
              0::numeric
            )
          ELSE 0::numeric
        END,
        0::numeric
      ),
      1::numeric
    ) AS cust_drop_depth
  FROM trend_lags x
),
signals AS (
  SELECT
    l.organization_id::uuid AS organization_id,
    l.branch_id::uuid AS branch_id,
    l.branch_name::text AS branch_name,
    l.metric_date::date AS metric_date,
    'Accommodation revenue softening'::text AS title,
    ('Branch: ' || COALESCE(NULLIF(TRIM(BOTH FROM l.branch_name::text), ''), TRIM(BOTH FROM l.branch_id::text)))::text AS description,
    (58::numeric + l.rev_drop_depth * 19::numeric)::numeric AS sort_score,
    'Accommodation revenue slipped three days straight — revisit ADR, RevPAR, and occupancy levers.'::text AS watchlist_text
  FROM trend l
  WHERE l.branch_type = 'accommodation'
    AND l.rev_l1 IS NOT NULL
    AND l.rev_l2 IS NOT NULL
    AND l.total_revenue < l.rev_l1
    AND l.rev_l1 < l.rev_l2

  UNION ALL

  SELECT
    l.organization_id::uuid,
    l.branch_id::uuid,
    l.branch_name::text,
    l.metric_date::date,
    'F&B revenue softening'::text AS title,
    ('Branch: ' || COALESCE(NULLIF(TRIM(BOTH FROM l.branch_name::text), ''), TRIM(BOTH FROM l.branch_id::text)))::text AS description,
    (58::numeric + l.rev_drop_depth * 19::numeric)::numeric AS sort_score,
    'F&B revenue is down three running days — scan tickets, covers, and mix before discounting.'::text AS watchlist_text
  FROM trend l
  WHERE l.branch_type = 'fnb'
    AND l.rev_l1 IS NOT NULL
    AND l.rev_l2 IS NOT NULL
    AND l.total_revenue < l.rev_l1
    AND l.rev_l1 < l.rev_l2

  UNION ALL

  SELECT
    l.organization_id::uuid,
    l.branch_id::uuid,
    l.branch_name::text,
    l.metric_date::date,
    'Revenue softening'::text AS title,
    ('Branch: ' || COALESCE(NULLIF(TRIM(BOTH FROM l.branch_name::text), ''), TRIM(BOTH FROM l.branch_id::text)))::text AS description,
    (58::numeric + l.rev_drop_depth * 19::numeric)::numeric AS sort_score,
    'Revenue has eased three consecutive days — confirm whether demand, price, or mix moved.'::text AS watchlist_text
  FROM trend l
  WHERE l.branch_type NOT IN ('accommodation', 'fnb')
    AND l.rev_l1 IS NOT NULL
    AND l.rev_l2 IS NOT NULL
    AND l.total_revenue < l.rev_l1
    AND l.rev_l1 < l.rev_l2

  UNION ALL

  SELECT
    l.organization_id::uuid,
    l.branch_id::uuid,
    l.branch_name::text,
    l.metric_date::date,
    'Rooms sold softening'::text AS title,
    ('Branch: ' || COALESCE(NULLIF(TRIM(BOTH FROM l.branch_name::text), ''), TRIM(BOTH FROM l.branch_id::text)))::text AS description,
    (52::numeric + l.room_drop_depth * 18::numeric)::numeric AS sort_score,
    'Sold rooms fell three days in a row — expect occupancy drag unless pickup or group pace improves.'::text AS watchlist_text
  FROM trend l
  WHERE l.branch_type = 'accommodation'
    AND l.room_l1 IS NOT NULL
    AND l.room_l2 IS NOT NULL
    AND l.rooms_sold IS NOT NULL
    AND l.rooms_sold < l.room_l1
    AND l.room_l1 < l.room_l2

  UNION ALL

  SELECT
    l.organization_id::uuid,
    l.branch_id::uuid,
    l.branch_name::text,
    l.metric_date::date,
    'Customer traffic softening'::text AS title,
    ('Branch: ' || COALESCE(NULLIF(TRIM(BOTH FROM l.branch_name::text), ''), TRIM(BOTH FROM l.branch_id::text)))::text AS description,
    (56::numeric + l.cust_drop_depth * 14::numeric)::numeric AS sort_score,
    'Covers or transactions cooled three straight days — traffic is softening ahead of revenue.'::text AS watchlist_text
  FROM trend l
  WHERE l.branch_type = 'fnb'
    AND l.cust_l1 IS NOT NULL
    AND l.cust_l2 IS NOT NULL
    AND l.customers IS NOT NULL
    AND l.customers < l.cust_l1
    AND l.cust_l1 < l.cust_l2
),
best_signal AS (
  SELECT DISTINCT ON (s.branch_id, s.metric_date)
    s.organization_id,
    s.branch_id,
    s.branch_name,
    s.metric_date,
    s.title,
    s.description,
    s.sort_score,
    s.watchlist_text
  FROM signals s
  ORDER BY s.branch_id, s.metric_date, s.sort_score DESC NULLS LAST, s.title ASC
),
branch_dates AS (
  SELECT DISTINCT
    bd.organization_id,
    bd.branch_id,
    bd.branch_name,
    bd.branch_type,
    bd.metric_date
  FROM base bd
  WHERE bd.organization_id IS NOT NULL
),
fallback AS (
  SELECT
    d.organization_id,
    d.branch_id,
    d.branch_name,
    d.metric_date,
    'No early warning signals detected'::text AS title,
    ('Branch: ' || COALESCE(NULLIF(TRIM(BOTH FROM d.branch_name::text), ''), TRIM(BOTH FROM d.branch_id::text)))::text AS description,
    30::numeric AS sort_score,
    (
      CASE
        WHEN d.branch_type = 'accommodation' THEN
          'No three-day slide in rooms, occupancy, or accommodation revenue vs recent days.'::text
        WHEN d.branch_type = 'fnb' THEN
          'No three-day slide in customers, transactions, or F&B revenue vs recent days.'::text
        ELSE
          'No sustained three-day downturn in tracked revenue and volumes.'::text
      END
    ) AS watchlist_text
  FROM branch_dates d
  WHERE NOT EXISTS (
    SELECT 1
    FROM best_signal bs
    WHERE bs.branch_id = d.branch_id
      AND bs.metric_date IS NOT DISTINCT FROM d.metric_date
  )
)
SELECT
  bs.organization_id,
  bs.branch_id,
  bs.branch_name,
  bs.metric_date,
  bs.title,
  bs.description,
  bs.sort_score,
  bs.watchlist_text
FROM best_signal bs
UNION ALL
SELECT
  f.organization_id,
  f.branch_id,
  f.branch_name,
  f.metric_date,
  f.title,
  f.description,
  f.sort_score,
  f.watchlist_text
FROM fallback f;

COMMENT ON VIEW public.watchlist_today IS
  'Early warning via lag(1,2): one row per (branch_id, metric_date); module_type-aware titles; description = Branch: name; sort_score from relative 3-day depth bands.';

GRANT SELECT ON public.watchlist_today TO anon, authenticated;
