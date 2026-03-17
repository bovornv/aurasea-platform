-- Migration: Create today_summary view for reliable delta values on Today page
-- Uses DATE-BASED joins (not lag()) so revenue_delta_day and occupancy_delta_week
-- are correct when at least 2 days (revenue) or 8 days (occupancy) exist.
--
-- Builds from accommodation_daily_metrics + fnb_daily_metrics (no dependency on daily_metrics).
-- Accommodation: metric_date, revenue (or total_revenue_thb), rooms_sold, rooms_available.
-- F&B: metric_date or date, revenue or total_sales, total_customers.

DROP VIEW IF EXISTS today_summary CASCADE;

CREATE VIEW today_summary AS
WITH base AS (
  -- Accommodation: metric_date, revenue, rooms_sold, rooms_available (if you have total_revenue_thb instead of revenue, use that)
  SELECT
    branch_id,
    metric_date::date AS metric_date,
    COALESCE(revenue, 0)::numeric AS revenue,
    rooms_sold,
    rooms_available,
    NULL::integer AS customers
  FROM accommodation_daily_metrics
  UNION ALL
  -- F&B: metric_date (or date if column exists), revenue or total_sales, total_customers
  SELECT
    branch_id,
    (metric_date)::date AS metric_date,
    COALESCE(revenue, total_sales, 0)::numeric AS revenue,
    NULL::integer AS rooms_sold,
    NULL::integer AS rooms_available,
    total_customers AS customers
  FROM fnb_daily_metrics
)
SELECT
  d.branch_id,
  d.metric_date,
  d.revenue,
  d.customers,
  d.rooms_sold,
  d.rooms_available,

  -- Occupancy (accommodation; null for F&B)
  CASE
    WHEN COALESCE(d.rooms_available, 0) > 0 THEN (d.rooms_sold::decimal / d.rooms_available) * 100
    ELSE NULL
  END AS occupancy_rate,

  -- ADR
  CASE
    WHEN COALESCE(d.rooms_sold, 0) > 0 THEN d.revenue / d.rooms_sold
    ELSE NULL
  END AS adr,

  -- RevPAR
  CASE
    WHEN COALESCE(d.rooms_available, 0) > 0 THEN d.revenue / d.rooms_available
    ELSE NULL
  END AS revpar,

  -- Avg Ticket (F&B)
  CASE
    WHEN COALESCE(d.customers, 0) > 0 THEN d.revenue / d.customers
    ELSE NULL
  END AS avg_ticket,

  -- Previous day (exact date join)
  p.revenue AS revenue_yesterday,

  -- Last week same weekday (exact date join)
  w.rooms_sold AS utilized_last_week,
  w.rooms_available AS capacity_last_week,

  -- Revenue delta vs yesterday (% change); null if no yesterday or p.revenue = 0
  CASE
    WHEN p.revenue IS NOT NULL AND p.revenue > 0 THEN (d.revenue - p.revenue) / p.revenue * 100
    ELSE NULL
  END AS revenue_delta_day,

  -- Occupancy delta vs same weekday last week (% change); null if no last week or w capacity 0
  CASE
    WHEN w.rooms_available IS NOT NULL AND w.rooms_available > 0
         AND w.rooms_sold IS NOT NULL
         AND (w.rooms_sold::decimal / w.rooms_available) > 0
         AND d.rooms_available IS NOT NULL AND d.rooms_available > 0
         AND d.rooms_sold IS NOT NULL
    THEN (
      (d.rooms_sold::decimal / d.rooms_available) - (w.rooms_sold::decimal / w.rooms_available)
    ) / (w.rooms_sold::decimal / w.rooms_available) * 100
    ELSE NULL
  END AS occupancy_delta_week,

  -- Placeholder health (can be replaced by real health from branch_kpi_metrics)
  CASE
    WHEN p.revenue IS NOT NULL AND d.revenue > p.revenue THEN 80
    ELSE 60
  END AS health_score

FROM base d
LEFT JOIN base p
  ON d.branch_id = p.branch_id
  AND p.metric_date = d.metric_date - INTERVAL '1 day'
LEFT JOIN base w
  ON d.branch_id = w.branch_id
  AND w.metric_date = d.metric_date - INTERVAL '7 days';

GRANT SELECT ON today_summary TO anon;
GRANT SELECT ON today_summary TO authenticated;

COMMENT ON VIEW today_summary IS 'Latest performance with date-based joins: revenue_delta_day (vs yesterday), occupancy_delta_week (vs same weekday last week). Built from accommodation_daily_metrics + fnb_daily_metrics.';
