-- =============================================================================
-- Rebuild public.business_trends_today from public.daily_metrics (+ branches)
-- =============================================================================
-- Source of truth: unified daily_metrics view (accommodation ∪ F&B), aligned with
-- branch-date history the app writes. Replaces today_summary-based gaps for F&B dates.
--
-- Prerequisites:
--   - public.business_trends_today (table)
--   - public.daily_metrics (view)
--   - public.branches (organization_id NOT NULL for included rows)
--
-- Safe to re-run: INSERT ... ON CONFLICT DO UPDATE; then DELETE orphans.
-- After this, run: rebuild-company-business-trends-today-view.sql (if view was dropped)
-- =============================================================================

COMMENT ON TABLE public.business_trends_today IS
  'Per-branch daily trend; built from public.daily_metrics 7d trailing context + branches; PK (branch_id, metric_date).';

WITH
dm AS (
  SELECT
    b.id AS branch_id,
    d.metric_date::date AS metric_date,
    b.organization_id,
    b.module_type AS branch_module_type,
    COALESCE(
      NULLIF(TRIM(BOTH FROM b.branch_name::text), ''),
      NULLIF(TRIM(BOTH FROM b.name::text), '')
    ) AS branch_name,
    COALESCE(d.revenue, 0::numeric) AS revenue_thb,
    d.rooms_sold,
    d.rooms_available,
    d.adr,
    d.customers,
    d.avg_ticket
  FROM public.daily_metrics d
  INNER JOIN public.branches b
    ON trim(both FROM b.id::text) = trim(both FROM d.branch_id::text)
  WHERE b.organization_id IS NOT NULL
),
facts AS (
  SELECT DISTINCT ON (dm.branch_id, dm.metric_date)
    dm.organization_id,
    dm.branch_id,
    dm.branch_name,
    dm.metric_date,
    CASE
      WHEN LOWER(COALESCE(dm.branch_module_type::text, '')) = ANY (
        ARRAY[
          'accommodation'::text, 'hotel'::text, 'hotel_resort'::text, 'rooms'::text, 'hotel_with_cafe'::text
        ]
      ) THEN 'accommodation'::text
      WHEN LOWER(COALESCE(dm.branch_module_type::text, '')) = ANY (
        ARRAY['fnb'::text, 'restaurant'::text, 'cafe'::text, 'cafe_restaurant'::text]
      ) THEN 'fnb'::text
      WHEN COALESCE(dm.rooms_available, 0) > 0 THEN 'accommodation'::text
      WHEN COALESCE(dm.customers, 0) > 0 THEN 'fnb'::text
      ELSE 'unknown'::text
    END AS business_type,
    CASE
      WHEN COALESCE(dm.rooms_available, 0) > 0 THEN
        (COALESCE(dm.rooms_sold, 0)::numeric / NULLIF(dm.rooms_available::numeric, 0)) * 100::numeric
      ELSE NULL::numeric
    END AS occ_pct,
    dm.adr AS adr_thb,
    CASE
      WHEN COALESCE(dm.rooms_available, 0) > 0 THEN
        dm.revenue_thb / NULLIF(dm.rooms_available::numeric, 0)
      ELSE NULL::numeric
    END AS revpar_thb,
    dm.customers::numeric AS customers,
    COALESCE(
      dm.avg_ticket,
      CASE
        WHEN COALESCE(dm.customers, 0) > 0 THEN dm.revenue_thb / NULLIF(dm.customers::numeric, 0)
        ELSE NULL::numeric
      END
    ) AS avg_ticket_thb
  FROM dm
  ORDER BY dm.branch_id, dm.metric_date
),
prior AS (
  SELECT
    f.organization_id,
    f.branch_id,
    f.branch_name,
    f.business_type,
    f.metric_date,
    f.occ_pct,
    f.adr_thb,
    f.revpar_thb,
    f.customers,
    f.avg_ticket_thb,
    COALESCE(pa.prior_n, 0) AS prior_n,
    pa.prior_occ_avg,
    pa.prior_adr_avg,
    pa.prior_cust_avg,
    pa.prior_ticket_avg
  FROM facts f
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::integer AS prior_n,
      AVG(f2.occ_pct) AS prior_occ_avg,
      AVG(f2.adr_thb) AS prior_adr_avg,
      AVG(f2.customers) AS prior_cust_avg,
      AVG(f2.avg_ticket_thb) AS prior_ticket_avg
    FROM facts f2
    WHERE f2.branch_id = f.branch_id
      AND f2.metric_date >= f.metric_date - INTERVAL '7 days'
      AND f2.metric_date < f.metric_date
  ) pa ON true
),
classified AS (
  SELECT
    pf.organization_id,
    pf.branch_id,
    pf.branch_name,
    pf.business_type,
    pf.metric_date,
    CASE
      WHEN pf.prior_n < 3 OR pf.business_type = 'unknown'::text THEN 'FB'::text
      WHEN pf.business_type = 'accommodation'::text
        AND (pf.occ_pct IS NULL OR pf.prior_occ_avg IS NULL)
        THEN 'FB'::text
      WHEN pf.business_type = 'fnb'::text
        AND (
          pf.customers IS NULL
          OR pf.prior_cust_avg IS NULL
          OR pf.prior_cust_avg <= 0::numeric
          OR pf.avg_ticket_thb IS NULL
          OR pf.prior_ticket_avg IS NULL
          OR pf.prior_ticket_avg <= 0::numeric
        )
        THEN 'FB'::text
      WHEN pf.business_type = 'accommodation'::text THEN
        CASE
          WHEN (pf.occ_pct - pf.prior_occ_avg) > 1.5::numeric
            AND (
              pf.prior_adr_avg IS NULL
              OR pf.prior_adr_avg <= 0::numeric
              OR pf.adr_thb IS NULL
              OR ((pf.adr_thb - pf.prior_adr_avg) / pf.prior_adr_avg) > 0.02::numeric
            )
            THEN 'A2'::text
          WHEN (pf.occ_pct - pf.prior_occ_avg) > 1.5::numeric
            AND (
              pf.prior_adr_avg IS NULL
              OR pf.prior_adr_avg <= 0::numeric
              OR pf.adr_thb IS NULL
              OR (
                ((pf.adr_thb - pf.prior_adr_avg) / pf.prior_adr_avg) >= -0.03::numeric
                AND ((pf.adr_thb - pf.prior_adr_avg) / pf.prior_adr_avg) <= 0.02::numeric
              )
            )
            THEN 'A1'::text
          WHEN (pf.occ_pct - pf.prior_occ_avg) < -1.5::numeric
            AND NOT (
              pf.prior_adr_avg IS NOT NULL
              AND pf.prior_adr_avg > 0::numeric
              AND pf.adr_thb IS NOT NULL
              AND ((pf.adr_thb - pf.prior_adr_avg) / pf.prior_adr_avg) > 0.04::numeric
            )
            THEN 'A3'::text
          WHEN abs(pf.occ_pct - pf.prior_occ_avg) <= 1.5::numeric
            AND (
              pf.prior_adr_avg IS NULL
              OR pf.prior_adr_avg <= 0::numeric
              OR pf.adr_thb IS NULL
              OR abs((pf.adr_thb - pf.prior_adr_avg) / pf.prior_adr_avg) <= 0.03::numeric
            )
            THEN 'A4'::text
          ELSE 'A4'::text
        END
      WHEN pf.business_type = 'fnb'::text THEN
        CASE
          WHEN ((pf.customers - pf.prior_cust_avg) / NULLIF(pf.prior_cust_avg, 0::numeric)) > 0.05::numeric
            AND abs(
              (pf.avg_ticket_thb - pf.prior_ticket_avg) / NULLIF(pf.prior_ticket_avg, 0::numeric)
            ) <= 0.04::numeric
            THEN 'F1'::text
          WHEN abs((pf.customers - pf.prior_cust_avg) / NULLIF(pf.prior_cust_avg, 0::numeric)) <= 0.05::numeric
            AND ((pf.avg_ticket_thb - pf.prior_ticket_avg) / NULLIF(pf.prior_ticket_avg, 0::numeric))
              > 0.03::numeric
            THEN 'F2'::text
          WHEN ((pf.customers - pf.prior_cust_avg) / NULLIF(pf.prior_cust_avg, 0::numeric)) < -0.05::numeric
            AND NOT (
              ((pf.avg_ticket_thb - pf.prior_ticket_avg) / NULLIF(pf.prior_ticket_avg, 0::numeric)) > 0.06::numeric
            )
            THEN 'F3'::text
          ELSE 'F4'::text
        END
      ELSE 'FB'::text
    END AS template_key
  FROM prior pf
),
labeled AS (
  SELECT
    c.organization_id,
    c.branch_id,
    c.branch_name,
    c.business_type,
    c.metric_date,
    c.template_key,
    v.trend_text,
    v.read_text,
    v.meaning_text,
    v.sort_score
  FROM classified c
  INNER JOIN (
    VALUES
      (
        'A1'::text,
        'Demand is strengthening this week.'::text,
        'Occupancy is running above the recent week average while ADR is holding near trend.'::text,
        'Maintain pricing discipline and use the current demand window to protect RevPAR.'::text,
        72::numeric
      ),
      (
        'A2'::text,
        'Performance is improving on both demand and pricing.'::text,
        'Occupancy is above trend and ADR is also running above the recent week average.'::text,
        'Protect yield and lean into higher-value room mix rather than discounting for volume.'::text,
        78::numeric
      ),
      (
        'A3'::text,
        'Recent demand has softened.'::text,
        'Occupancy is below the recent week average and pricing has not offset the slowdown.'::text,
        'Watch near-term pace closely and use targeted offers instead of broad discounting.'::text,
        55::numeric
      ),
      (
        'A4'::text,
        'Performance is stable versus the recent week.'::text,
        'Occupancy and ADR are both moving close to recent averages.'::text,
        'Keep distribution and pricing disciplined while monitoring the next demand signal.'::text,
        62::numeric
      ),
      (
        'F1'::text,
        'Traffic is strengthening this week.'::text,
        'Customer counts are above the recent week average while average ticket is holding near trend.'::text,
        'Focus on conversion, bundles, and add-ons while demand is strong.'::text,
        72::numeric
      ),
      (
        'F2'::text,
        'Spend per visit is improving.'::text,
        'Average ticket is above the recent week average even though traffic is steady.'::text,
        'Lean into premium mix, combo design, and suggestive selling.'::text,
        74::numeric
      ),
      (
        'F3'::text,
        'Recent demand has softened.'::text,
        'Traffic is below the recent week average and ticket growth is not fully offsetting it.'::text,
        'Protect service quality and use focused offers to recover traffic without eroding margin.'::text,
        55::numeric
      ),
      (
        'F4'::text,
        'Performance is stable versus the recent week.'::text,
        'Traffic and average ticket are both moving close to recent averages.'::text,
        'Use this period to tighten execution and watch for the next conversion opportunity.'::text,
        62::numeric
      ),
      (
        'FB'::text,
        'Still learning this branch.'::text,
        'There is not enough consistent history yet to separate signal from noise.'::text,
        'Keep entering daily data; clearer trend guidance will unlock as more days accumulate.'::text,
        48::numeric
      )
  ) AS v(template_key, trend_text, read_text, meaning_text, sort_score)
    ON v.template_key = c.template_key
)
INSERT INTO public.business_trends_today (
  organization_id,
  branch_id,
  branch_name,
  business_type,
  metric_date,
  template_key,
  trend_text,
  read_text,
  meaning_text,
  sort_score,
  created_at,
  updated_at
)
SELECT
  l.organization_id,
  l.branch_id,
  COALESCE(NULLIF(TRIM(BOTH FROM l.branch_name::text), ''), l.branch_id::text) AS branch_name,
  l.business_type,
  l.metric_date,
  l.template_key,
  l.trend_text,
  l.read_text,
  l.meaning_text,
  l.sort_score,
  now(),
  now()
FROM labeled l
ON CONFLICT (branch_id, metric_date) DO UPDATE SET
  organization_id = EXCLUDED.organization_id,
  branch_name = EXCLUDED.branch_name,
  business_type = EXCLUDED.business_type,
  template_key = EXCLUDED.template_key,
  trend_text = EXCLUDED.trend_text,
  read_text = EXCLUDED.read_text,
  meaning_text = EXCLUDED.meaning_text,
  sort_score = EXCLUDED.sort_score,
  updated_at = now();

-- Remove rows with no matching daily_metrics row (stale after source shrinks)
DELETE FROM public.business_trends_today b
WHERE NOT EXISTS (
  SELECT 1
  FROM public.daily_metrics d
  INNER JOIN public.branches br ON trim(both FROM br.id::text) = trim(both FROM d.branch_id::text)
  WHERE br.organization_id IS NOT NULL
    AND trim(both FROM b.branch_id::text) = trim(both FROM d.branch_id::text)
    AND b.metric_date = d.metric_date::date
);

-- =============================================================================
-- Verification (examples)
-- =============================================================================
-- Mar 29 branch coverage vs daily_metrics:
--   SELECT d.branch_id, d.metric_date, b.branch_name,
--          (SELECT COUNT(*) FROM public.business_trends_today t
--           WHERE t.branch_id::text = trim(d.branch_id::text) AND t.metric_date = d.metric_date::date) AS in_trends
--   FROM public.daily_metrics d
--   JOIN public.branches b ON trim(b.id::text) = trim(d.branch_id::text)
--   WHERE d.metric_date = DATE '2026-03-29' AND b.organization_id IS NOT NULL;
--
-- Missing (branch, date) pairs vs daily_metrics:
--   SELECT d.branch_id, d.metric_date
--   FROM public.daily_metrics d
--   INNER JOIN public.branches br ON trim(br.id::text) = trim(d.branch_id::text)
--   WHERE br.organization_id IS NOT NULL
--   EXCEPT
--   SELECT t.branch_id, t.metric_date FROM public.business_trends_today t;
--
-- Crystal Cafe on 2026-03-29 (replace name filter as needed):
--   SELECT * FROM public.business_trends_today
--   WHERE metric_date = DATE '2026-03-29' AND branch_name ILIKE '%crystal%cafe%';
--
-- After rebuilding company_business_trends_today view — company acc + fnb rows:
--   SELECT organization_id, business_type, metric_date, branch_name, sort_score, LEFT(trend_text, 60)
--   FROM public.company_business_trends_today
--   ORDER BY organization_id, business_type;
