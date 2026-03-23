-- Company Today — Business trends (one row per org with ≥1 day of portfolio daily metrics)
-- GET /rest/v1/company_trends_summary?select=*&organization_id=eq.{uuid}
--
-- Logic mirrors app getCompanyPortfolioTrendSnapshot: last 7 distinct metric dates vs prior 7,
-- portfolio = sum across branches (acc ∪ fnb by date).

DROP VIEW IF EXISTS public.company_trends_summary CASCADE;

CREATE VIEW public.company_trends_summary AS
WITH org_branches AS (
  SELECT
    b.organization_id,
    TRIM(BOTH FROM b.id::text) AS bid
  FROM public.branches b
  WHERE b.organization_id IS NOT NULL
),
acc_branch_day AS (
  SELECT
    ob.organization_id,
    a.metric_date::date AS d,
    COALESCE(a.revenue, 0)::numeric AS accom_rev,
    CASE
      WHEN COALESCE(a.rooms_available, 0) > 0
        THEN (COALESCE(a.rooms_sold, 0)::numeric / NULLIF(a.rooms_available, 0)::numeric) * 100::numeric
      ELSE NULL::numeric
    END AS occ_branch_pct
  FROM public.accommodation_daily_metrics a
  INNER JOIN org_branches ob ON TRIM(BOTH FROM a.branch_id::text) = ob.bid
  WHERE a.metric_date >= (CURRENT_DATE - INTERVAL '45 days')
),
acc_day AS (
  SELECT
    organization_id,
    d,
    SUM(accom_rev) AS accom_rev,
    AVG(occ_branch_pct) FILTER (WHERE occ_branch_pct IS NOT NULL) AS day_occ_avg
  FROM acc_branch_day
  GROUP BY organization_id, d
),
fnb_day AS (
  SELECT
    ob.organization_id,
    f.metric_date::date AS d,
    SUM(COALESCE(f.revenue, 0))::numeric AS fnb_rev,
    SUM(COALESCE(f.total_customers, 0))::numeric AS fnb_cust
  FROM public.fnb_daily_metrics f
  INNER JOIN org_branches ob ON TRIM(BOTH FROM f.branch_id::text) = ob.bid
  WHERE f.metric_date >= (CURRENT_DATE - INTERVAL '45 days')
  GROUP BY ob.organization_id, f.metric_date::date
),
merged AS (
  SELECT
    COALESCE(a.organization_id, f.organization_id) AS organization_id,
    COALESCE(a.d, f.d) AS d,
    COALESCE(a.accom_rev, 0)::numeric + COALESCE(f.fnb_rev, 0)::numeric AS total_rev,
    COALESCE(a.accom_rev, 0)::numeric AS accom_rev,
    COALESCE(f.fnb_rev, 0)::numeric AS fnb_rev,
    a.day_occ_avg,
    COALESCE(f.fnb_cust, 0)::numeric AS cust
  FROM acc_day a
  FULL OUTER JOIN fnb_day f
    ON a.organization_id = f.organization_id
    AND a.d = f.d
),
ranked AS (
  SELECT
    organization_id,
    d,
    ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY d DESC) AS rn
  FROM (SELECT DISTINCT organization_id, d FROM merged) x
),
cur_slice AS (
  SELECT organization_id, d
  FROM ranked
  WHERE rn <= 7
),
prior_slice AS (
  SELECT organization_id, d
  FROM ranked
  WHERE rn BETWEEN 8 AND 14
),
cur_metrics AS (
  SELECT
    c.organization_id,
    SUM(m.total_rev) AS rev7,
    SUM(m.accom_rev) AS accom7,
    SUM(m.fnb_rev) AS fnb7,
    AVG(m.day_occ_avg) FILTER (WHERE m.day_occ_avg IS NOT NULL) AS occ_avg_7d,
    SUM(m.cust) AS cust7,
    COUNT(DISTINCT c.d) AS cur_days
  FROM cur_slice c
  INNER JOIN merged m ON m.organization_id = c.organization_id AND m.d = c.d
  GROUP BY c.organization_id
),
prior_metrics AS (
  SELECT
    p.organization_id,
    SUM(m.total_rev) AS rev_prior7,
    SUM(m.accom_rev) AS accom_prior7,
    SUM(m.fnb_rev) AS fnb_prior7,
    COUNT(DISTINCT p.d) AS prior_days
  FROM prior_slice p
  INNER JOIN merged m ON m.organization_id = p.organization_id AND m.d = p.d
  GROUP BY p.organization_id
  HAVING COUNT(DISTINCT p.d) = 7
),
ww AS (
  SELECT
    m.organization_id,
    SUM(
      CASE WHEN EXTRACT(ISODOW FROM m.d) IN (6::numeric, 7::numeric) THEN m.total_rev ELSE 0::numeric END
    ) AS wknd_rev,
    COUNT(*) FILTER (WHERE EXTRACT(ISODOW FROM m.d) IN (6::numeric, 7::numeric))::int AS wknd_n,
    SUM(
      CASE
        WHEN EXTRACT(ISODOW FROM m.d) >= 1::numeric AND EXTRACT(ISODOW FROM m.d) <= 5::numeric THEN m.total_rev
        ELSE 0::numeric
      END
    ) AS wd_rev,
    COUNT(*) FILTER (
      WHERE EXTRACT(ISODOW FROM m.d) >= 1::numeric AND EXTRACT(ISODOW FROM m.d) <= 5::numeric
    )::int AS wd_n
  FROM merged m
  INNER JOIN ranked r ON r.organization_id = m.organization_id AND r.d = m.d AND r.rn <= 7
  GROUP BY m.organization_id
)
SELECT
  c.organization_id,
  (c.rev7 > 0::numeric AND c.cur_days >= 1) AS is_ready,
  CASE
    WHEN pm.rev_prior7 IS NOT NULL AND pm.rev_prior7 > 0::numeric
      THEN ROUND(((c.rev7 - pm.rev_prior7) / pm.rev_prior7) * 100::numeric, 2)
    ELSE NULL::numeric
  END AS revenue_pct_vs_prior_week,
  CASE
    WHEN c.rev7 <= 0::numeric OR c.cur_days < 1 THEN NULL::text
    WHEN pm.organization_id IS NULL THEN NULL::text
    WHEN pm.rev_prior7 IS NULL OR pm.rev_prior7 <= 0::numeric THEN NULL::text
    WHEN (c.rev7 - pm.rev_prior7) > 0::numeric
      AND (c.accom7 - pm.accom_prior7) > (c.fnb7 - pm.fnb_prior7)
      AND (c.accom7 - pm.accom_prior7) > 0::numeric
      THEN 'Accommodation (rooms) revenue led vs last week.'::text
    WHEN (c.rev7 - pm.rev_prior7) > 0::numeric
      AND (c.fnb7 - pm.fnb_prior7) > (c.accom7 - pm.accom_prior7)
      AND (c.fnb7 - pm.fnb_prior7) > 0::numeric
      THEN 'F&B revenue led vs last week.'::text
    WHEN (c.rev7 - pm.rev_prior7) > 0::numeric
      THEN 'Broad-based revenue growth vs last week.'::text
    WHEN (c.rev7 - pm.rev_prior7) < 0::numeric
      THEN 'Revenue softer vs last week across tracked branches.'::text
    ELSE NULL::text
  END AS drivers_text,
  CASE
    WHEN c.occ_avg_7d IS NOT NULL THEN ROUND(c.occ_avg_7d, 1)
    ELSE NULL::numeric
  END AS occupancy_pct,
  CASE
    WHEN c.cust7 > 0::numeric THEN ROUND(c.cust7, 0)
    ELSE NULL::numeric
  END AS customers_total,
  CASE
    WHEN c.accom7 + c.fnb7 > 0::numeric
      THEN ROUND((c.accom7 / NULLIF(c.accom7 + c.fnb7, 0::numeric)) * 100::numeric, 0)
    ELSE NULL::numeric
  END AS mix_rooms_pct,
  CASE
    WHEN c.accom7 + c.fnb7 > 0::numeric
      THEN ROUND((c.fnb7 / NULLIF(c.accom7 + c.fnb7, 0::numeric)) * 100::numeric, 0)
    ELSE NULL::numeric
  END AS mix_fnb_pct,
  CASE
    WHEN ww.wknd_n >= 1 AND ww.wd_n >= 1
      AND (ww.wknd_rev / NULLIF(ww.wknd_n, 0)::numeric)
        > (ww.wd_rev / NULLIF(ww.wd_n, 0)::numeric) * 1.12::numeric
      THEN 'Weekend stronger than weekdays'::text
    WHEN ww.wknd_n >= 1 AND ww.wd_n >= 1
      AND (ww.wd_rev / NULLIF(ww.wd_n, 0)::numeric)
        > (ww.wknd_rev / NULLIF(ww.wknd_n, 0)::numeric) * 1.12::numeric
      THEN 'Weekdays stronger than weekends'::text
    ELSE NULL::text
  END AS trend_line
FROM cur_metrics c
LEFT JOIN prior_metrics pm ON pm.organization_id = c.organization_id
LEFT JOIN ww ON ww.organization_id = c.organization_id;

COMMENT ON VIEW public.company_trends_summary IS
  'Portfolio WoW trends; filter organization_id=eq.{uuid}; is_ready + revenue_pct + snapshot + optional trend_line.';

GRANT SELECT ON public.company_trends_summary TO anon, authenticated;
