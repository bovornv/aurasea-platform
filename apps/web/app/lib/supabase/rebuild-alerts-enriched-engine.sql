-- =============================================================================
-- FULL REBUILD: alert views (run this entire script in the SQL editor)
-- =============================================================================
-- Do NOT run bare view names (e.g. only `alerts_today`) — that is invalid SQL.
-- Always use: CREATE OR REPLACE VIEW view_name AS ...
--
-- Prerequisites:
--   - public.today_summary_clean (total_revenue or revenue pipeline; see fix-today-summary-clean / upgrade scripts)
--   - public.branches (id, organization_id, name)
--
-- App/API use branch_business_status + daily tables; alerts engine reads today_summary_clean only.
--
-- After running, verify:
--   SELECT * FROM alerts_today LIMIT 5;
-- =============================================================================

-- STEP 1 — Drop dependents first (children → parent). CASCADE cleans legacy dependents.
DROP VIEW IF EXISTS whats_working_today CASCADE;
DROP VIEW IF EXISTS today_priorities_clean CASCADE;
DROP VIEW IF EXISTS today_priorities CASCADE;
DROP VIEW IF EXISTS today_action_plan CASCADE;
DROP VIEW IF EXISTS alerts_fix_this_first CASCADE;
DROP VIEW IF EXISTS branch_alerts_today CASCADE;
DROP VIEW IF EXISTS alerts_critical CASCADE;
DROP VIEW IF EXISTS alerts_top3_revenue_leaks CASCADE;
DROP VIEW IF EXISTS alerts_today CASCADE;
DROP VIEW IF EXISTS alerts_enriched CASCADE;

-- Optional: remove old pipeline if still present (safe if already gone)
DROP VIEW IF EXISTS alerts_top CASCADE;
DROP VIEW IF EXISTS alerts_ranked CASCADE;
DROP VIEW IF EXISTS alerts_deduplicated CASCADE;
DROP VIEW IF EXISTS alerts_all CASCADE;
DROP VIEW IF EXISTS alerts_revenue_split_filtered CASCADE;
DROP VIEW IF EXISTS alerts_revenue_split CASCADE;
DROP VIEW IF EXISTS alerts_with_actions CASCADE;
DROP VIEW IF EXISTS alerts_opportunities CASCADE;

-- STEP 2 — Core engine (join today_summary_clean + branches; same metric semantics as safe view)
CREATE OR REPLACE VIEW alerts_enriched AS
WITH ts AS (
    SELECT
        t.branch_id::text AS branch_id,
        t.metric_date::date AS metric_date,
        COALESCE(t.total_revenue, 0)::numeric AS total_revenue,
        COALESCE(t.accommodation_revenue, t.total_revenue, 0)::numeric AS accommodation_revenue,
        COALESCE(t.fnb_revenue, 0)::numeric AS fnb_revenue,
        t.revenue_delta_day::numeric AS revenue_delta_day,
        t.occupancy_delta_week::numeric AS occupancy_delta_week,
        COALESCE(t.customers, 0)::numeric AS customers,
        b.organization_id,
        b.name AS branch_name,
        CASE
            WHEN LOWER(COALESCE(b.module_type::text, '')) IN (
                'accommodation', 'hotel', 'hotel_resort', 'rooms', 'hotel_with_cafe'
            ) THEN 'accommodation'::text
            WHEN LOWER(COALESCE(b.module_type::text, '')) IN (
                'fnb', 'restaurant', 'cafe', 'cafe_restaurant'
            ) THEN 'fnb'::text
            ELSE COALESCE(LOWER(TRIM(b.module_type::text)), 'unknown')
        END AS branch_type
    FROM today_summary_clean t
    LEFT JOIN branches b
        ON b.id::text = t.branch_id::text
),
-- Rule-based problems (same thresholds as legacy alerts_today)
problems AS (
    SELECT
        branch_id,
        organization_id,
        branch_name,
        branch_type,
        CASE
            WHEN branch_type = 'fnb' THEN 'fnb'::text
            WHEN revenue_delta_day IS NOT NULL AND revenue_delta_day <= -10 THEN
                CASE
                    WHEN COALESCE(accommodation_revenue, 0) >= COALESCE(fnb_revenue, 0) THEN 'accommodation'::text
                    ELSE 'fnb'::text
                END
            WHEN branch_type = 'accommodation'
                AND occupancy_delta_week IS NOT NULL
                AND occupancy_delta_week <= -10 THEN 'accommodation'::text
        END AS alert_stream,
        metric_date,
        CASE
            WHEN revenue_delta_day IS NOT NULL AND revenue_delta_day <= -10 THEN 'Revenue Drop'
            WHEN occupancy_delta_week IS NOT NULL AND occupancy_delta_week <= -10 THEN 'Low Occupancy'
        END AS alert_type,
        CASE
            WHEN revenue_delta_day IS NOT NULL AND revenue_delta_day <= -10 THEN
                CASE WHEN revenue_delta_day <= -20 THEN 3 ELSE 2 END
            WHEN occupancy_delta_week IS NOT NULL AND occupancy_delta_week <= -10 THEN
                CASE WHEN occupancy_delta_week <= -15 THEN 3 ELSE 2 END
        END AS severity,
        CASE
            WHEN revenue_delta_day IS NOT NULL AND revenue_delta_day <= -10
                THEN 'Revenue dropped ' || ABS(ROUND(revenue_delta_day::numeric)) || '% vs prior day'
            WHEN occupancy_delta_week IS NOT NULL AND occupancy_delta_week <= -10
                THEN 'Occupancy down ' || ABS(ROUND(occupancy_delta_week::numeric)) || '% vs last week'
        END AS alert_message,
        'Below recent trend'::text AS cause,
        CASE
            WHEN revenue_delta_day IS NOT NULL AND revenue_delta_day <= -10 THEN
                GREATEST(
                    1::numeric,
                    ROUND(
                        COALESCE(total_revenue, 0)::numeric
                        * LEAST(0.25::numeric, ABS(revenue_delta_day) / 100.0 * 0.35::numeric)
                    )
                )
            WHEN occupancy_delta_week IS NOT NULL AND occupancy_delta_week <= -10 THEN
                GREATEST(
                    1::numeric,
                    ROUND(COALESCE(total_revenue, 0)::numeric * 0.06::numeric)
                )
        END AS impact_estimate_thb,
        CASE
            WHEN revenue_delta_day IS NOT NULL AND revenue_delta_day <= -10 AND branch_type = 'fnb' THEN
                'Run same-day promos, meal bundles, or boost walk-in and delivery'
            WHEN revenue_delta_day IS NOT NULL AND revenue_delta_day <= -10 THEN
                'Launch short-term promotion or boost OTA visibility'
            WHEN occupancy_delta_week IS NOT NULL AND occupancy_delta_week <= -10
                THEN 'Adjust pricing or create package deals'
        END AS recommended_action,
        'problem'::text AS alert_category
    FROM ts
    WHERE (revenue_delta_day IS NOT NULL AND revenue_delta_day <= -10)
       OR (
            branch_type = 'accommodation'
            AND occupancy_delta_week IS NOT NULL
            AND occupancy_delta_week <= -10
        )
),
opportunities AS (
    SELECT
        branch_id,
        organization_id,
        branch_name,
        branch_type,
        CASE
            WHEN branch_type = 'fnb' THEN 'fnb'::text
            WHEN COALESCE(accommodation_revenue, 0) >= COALESCE(fnb_revenue, 0) THEN 'accommodation'::text
            ELSE 'fnb'::text
        END AS alert_stream,
        metric_date,
        'High Demand Opportunity'::text AS alert_type,
        1 AS severity,
        'Demand is strong — revenue growing'::text AS alert_message,
        'Above recent trend'::text AS cause,
        GREATEST(
            0::numeric,
            ROUND(COALESCE(total_revenue, 0)::numeric * 0.05::numeric)
        ) AS impact_estimate_thb,
        'Increase prices slightly or upsell premium options'::text AS recommended_action,
        'opportunity'::text AS alert_category
    FROM ts
    WHERE revenue_delta_day IS NOT NULL
      AND revenue_delta_day >= 10
),
revenue_split AS (
    SELECT
        branch_id,
        organization_id,
        branch_name,
        branch_type,
        CASE
            WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL
                AND fnb_revenue < accommodation_revenue * 0.2 THEN 'fnb'::text
            WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL
                AND accommodation_revenue < fnb_revenue * 1.5 THEN 'accommodation'::text
            ELSE NULL
        END AS alert_stream,
        metric_date,
        CASE
            WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL
                AND fnb_revenue < accommodation_revenue * 0.2 THEN 'F&B Underperformance'
            WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL
                AND accommodation_revenue < fnb_revenue * 1.5 THEN 'Low Room Revenue Contribution'
            ELSE NULL
        END AS alert_type,
        CASE
            WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL
                AND fnb_revenue < accommodation_revenue * 0.15 THEN 3
            WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL
                AND fnb_revenue < accommodation_revenue * 0.2 THEN 2
            WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL
                AND accommodation_revenue < fnb_revenue * 1.5 THEN 2
            ELSE 1
        END AS severity,
        CASE
            WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL
                AND fnb_revenue < accommodation_revenue * 0.2
                THEN 'F&B revenue significantly lower than rooms revenue'
            WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL
                AND accommodation_revenue < fnb_revenue * 1.5
                THEN 'Room revenue not maximizing potential vs F&B activity'
            ELSE NULL
        END AS alert_message,
        CASE
            WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL
                AND fnb_revenue < accommodation_revenue * 0.2
                THEN 'Low in-house guest conversion or weak external traffic'
            WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL
                AND accommodation_revenue < fnb_revenue * 1.5
                THEN 'Occupancy or pricing strategy may be suboptimal'
            ELSE NULL
        END AS cause,
        GREATEST(
            1::numeric,
            ROUND(
                COALESCE(total_revenue, accommodation_revenue + fnb_revenue, 0)::numeric * 0.05::numeric
            )
        ) AS impact_estimate_thb,
        CASE
            WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL
                AND fnb_revenue < accommodation_revenue * 0.2
                THEN 'Introduce guest meal bundles or promote breakfast/dinner packages'
            WHEN fnb_revenue IS NOT NULL AND accommodation_revenue IS NOT NULL
                AND accommodation_revenue < fnb_revenue * 1.5
                THEN 'Adjust pricing or promote room packages to increase occupancy'
            ELSE NULL
        END AS recommended_action,
        'structural'::text AS alert_category
    FROM ts
    WHERE fnb_revenue IS NOT NULL
      AND accommodation_revenue IS NOT NULL
)
SELECT
    branch_id,
    organization_id,
    branch_name,
    branch_type,
    alert_stream,
    metric_date,
    alert_type,
    severity,
    alert_message,
    cause,
    impact_estimate_thb,
    recommended_action,
    alert_category
FROM problems
WHERE alert_type IS NOT NULL
  AND alert_stream IS NOT NULL
UNION ALL
SELECT
    branch_id,
    organization_id,
    branch_name,
    branch_type,
    alert_stream,
    metric_date,
    alert_type,
    severity,
    alert_message,
    cause,
    impact_estimate_thb,
    recommended_action,
    alert_category
FROM opportunities
UNION ALL
SELECT
    branch_id,
    organization_id,
    branch_name,
    branch_type,
    alert_stream,
    metric_date,
    alert_type,
    severity,
    alert_message,
    cause,
    impact_estimate_thb,
    recommended_action,
    alert_category
FROM revenue_split
WHERE alert_type IS NOT NULL
  AND recommended_action IS NOT NULL
  AND alert_stream IS NOT NULL;

-- STEP 3 — Passthrough (full enriched set for daily summary / generic consumers)
CREATE OR REPLACE VIEW alerts_today AS
SELECT * FROM alerts_enriched;

-- STEP 3b — branch_alerts_today: same as alerts_today (stable /rest/v1/branch_alerts_today; no current_date filter)
CREATE OR REPLACE VIEW branch_alerts_today AS
SELECT * FROM alerts_today;

COMMENT ON VIEW branch_alerts_today IS
    'Branch Today alerts; filter branch_id in API. Latest metric_date per row from pipeline, not restricted to today().';

-- STEP 4 — Critical: severity >= 3, dedupe (branch_id, alert_type), best severity then impact, top 5 per branch
CREATE OR REPLACE VIEW alerts_critical AS
SELECT
    branch_id,
    organization_id,
    branch_name,
    metric_date,
    alert_type,
    severity,
    alert_message,
    cause,
    impact_estimate_thb,
    recommended_action AS action,
    recommended_action,
    alert_category
FROM (
    SELECT
        e.*,
        ROW_NUMBER() OVER (
            PARTITION BY e.branch_id, e.alert_type
            ORDER BY e.severity DESC, e.impact_estimate_thb DESC, e.metric_date DESC
        ) AS dedupe_rn,
        ROW_NUMBER() OVER (
            PARTITION BY e.branch_id
            ORDER BY e.impact_estimate_thb DESC, e.severity DESC, e.metric_date DESC
        ) AS branch_rank
    FROM alerts_enriched e
    WHERE e.severity >= 3
) x
WHERE dedupe_rn = 1
  AND branch_rank <= 5;

-- STEP 5 — Top revenue leaks: non-opportunity, dedupe (branch_id, alert_type), top 3 per branch by impact
CREATE OR REPLACE VIEW alerts_top3_revenue_leaks AS
SELECT
    branch_id,
    organization_id,
    branch_name,
    metric_date,
    alert_type,
    severity,
    alert_message,
    cause,
    impact_estimate_thb,
    recommended_action,
    leak_rank AS rank
FROM (
    SELECT
        d.branch_id,
        d.organization_id,
        d.branch_name,
        d.metric_date,
        d.alert_type,
        d.severity,
        d.alert_message,
        d.cause,
        d.impact_estimate_thb,
        d.recommended_action,
        ROW_NUMBER() OVER (
            PARTITION BY d.branch_id
            ORDER BY d.impact_estimate_thb DESC, d.severity DESC, d.metric_date DESC
        ) AS leak_rank
    FROM (
        SELECT
            e.branch_id,
            e.organization_id,
            e.branch_name,
            e.metric_date,
            e.alert_type,
            e.severity,
            e.alert_message,
            e.cause,
            e.impact_estimate_thb,
            e.recommended_action,
            ROW_NUMBER() OVER (
                PARTITION BY e.branch_id, e.alert_type
                ORDER BY e.impact_estimate_thb DESC, e.severity DESC, e.metric_date DESC
            ) AS dedupe_rn
        FROM alerts_enriched e
        WHERE e.alert_category IN ('problem', 'structural')
    ) d
    WHERE d.dedupe_rn = 1
) ranked
WHERE leak_rank <= 3;

-- STEP 6 — Fix This First: company Today priority list (deduped per branch+alert_type, sorted by priority_score)
CREATE OR REPLACE VIEW alerts_fix_this_first AS
SELECT
    x.branch_id,
    x.organization_id,
    x.branch_name,
    x.branch_type,
    x.alert_stream,
    x.metric_date,
    x.alert_type,
    x.severity,
    x.impact_estimate_thb,
    x.cause,
    x.recommended_action,
    (
        COALESCE(x.severity, 0)::numeric * 1000000::numeric
        + COALESCE(x.impact_estimate_thb, 0)::numeric
    ) AS priority_score
FROM (
    SELECT DISTINCT ON (e.branch_id, e.alert_type)
        e.branch_id,
        e.organization_id,
        e.branch_name,
        e.branch_type,
        e.alert_stream,
        e.metric_date,
        e.alert_type,
        e.severity,
        e.impact_estimate_thb,
        e.cause,
        e.recommended_action
    FROM alerts_enriched e
    WHERE
        e.alert_category IN ('problem', 'structural')
        OR COALESCE(e.severity, 0) >= 3
    ORDER BY
        e.branch_id,
        e.alert_type,
        e.severity DESC NULLS LAST,
        e.impact_estimate_thb DESC NULLS LAST,
        e.metric_date DESC NULLS LAST
) x;

COMMENT ON VIEW alerts_fix_this_first IS
    'Company Today: deduped actionable alerts; order by priority_score DESC for PostgREST.';

-- STEP 6b — Today’s Priorities: single owner-facing feed (replaces fix-this-first + action plan UIs)
CREATE OR REPLACE VIEW today_priorities AS
SELECT
    f.organization_id,
    f.branch_id,
    f.branch_name,
    f.alert_type,
    COALESCE(NULLIF(TRIM(BOTH FROM f.recommended_action), ''), ''::text) AS action_text,
    (
        CASE
            WHEN NULLIF(TRIM(BOTH FROM f.recommended_action), '') IS NULL THEN
                NULLIF(TRIM(BOTH FROM REPLACE(COALESCE(f.alert_type, ''::text), '_'::text, ' '::text)), ''::text)
            WHEN LENGTH(TRIM(BOTH FROM f.recommended_action)) <= 100 THEN
                TRIM(BOTH FROM f.recommended_action)
            ELSE
                LEFT(TRIM(BOTH FROM f.recommended_action), 97) || '...'::text
        END
    ) AS action_short,
    COALESCE(f.impact_estimate_thb, 0::numeric) AS impact,
    f.priority_score AS sort_score
FROM alerts_fix_this_first f;

COMMENT ON VIEW today_priorities IS
    'Company Today: priorities from alerts_fix_this_first; GET order=sort_score.desc&limit=5';

-- STEP 6c — Today’s Priorities (clean UI): summary line + cards; no truncation on text columns
CREATE OR REPLACE VIEW today_priorities_clean AS
SELECT
    COALESCE(f.organization_id, b.organization_id) AS organization_id,
    f.branch_id,
    f.branch_name,
    f.alert_type,
    COALESCE(NULLIF(TRIM(BOTH FROM f.recommended_action), ''), ''::text) AS action_text,
    (
        CASE
            WHEN NULLIF(TRIM(BOTH FROM COALESCE(f.branch_name, ''::text)), '') IS NULL THEN
                TRIM(BOTH FROM REPLACE(COALESCE(f.alert_type, ''::text), '_'::text, ' '::text))
            ELSE
                TRIM(BOTH FROM REPLACE(COALESCE(f.alert_type, ''::text), '_'::text, ' '::text))
                || ' — '::text
                || TRIM(BOTH FROM f.branch_name)
        END
    ) AS short_title,
    COALESCE(f.impact_estimate_thb, 0::numeric) AS impact_estimate_thb,
    (
        CASE
            WHEN LOWER(COALESCE(f.alert_type, ''::text)) LIKE '%opportunity%'
                OR LOWER(COALESCE(f.alert_stream, ''::text)) LIKE '%opportunity%'
            THEN 'opportunity'::text
            ELSE 'at risk'::text
        END
    ) AS impact_label,
    COALESCE(NULLIF(TRIM(BOTH FROM f.cause), ''), ''::text) AS reason_short,
    f.priority_score AS sort_score
FROM alerts_fix_this_first f
LEFT JOIN branches b ON b.id::text = TRIM(BOTH FROM f.branch_id::text);

COMMENT ON VIEW today_priorities_clean IS
    'organization_id + sort_score for PostgREST; sort_score = priority_score; org from branch if null on alert.';

-- Grants (adjust roles if you do not use anon)
GRANT SELECT ON alerts_enriched TO anon, authenticated;
GRANT SELECT ON alerts_today TO anon, authenticated;
GRANT SELECT ON branch_alerts_today TO anon, authenticated;
GRANT SELECT ON alerts_critical TO anon, authenticated;
GRANT SELECT ON alerts_top3_revenue_leaks TO anon, authenticated;
GRANT SELECT ON alerts_fix_this_first TO anon, authenticated;
GRANT SELECT ON today_priorities TO anon, authenticated;
GRANT SELECT ON today_priorities_clean TO anon, authenticated;

-- STEP 6d — What’s Working (positive signals): WITH base → latest → signals → final
CREATE OR REPLACE VIEW whats_working_today AS
WITH base AS (
    SELECT
        t.branch_id::text AS branch_id,
        t.metric_date::date AS metric_date,
        COALESCE(t.total_revenue, 0)::numeric AS total_revenue,
        t.revenue_delta_day::numeric AS revenue_delta_day,
        t.occupancy_delta_week::numeric AS occupancy_delta_week,
        b.organization_id,
        b.name AS branch_name,
        CASE
            WHEN LOWER(COALESCE(b.module_type::text, '')) IN (
                'accommodation', 'hotel', 'hotel_resort', 'rooms', 'hotel_with_cafe'
            ) THEN 'accommodation'::text
            WHEN LOWER(COALESCE(b.module_type::text, '')) IN (
                'fnb', 'restaurant', 'cafe', 'cafe_restaurant'
            ) THEN 'fnb'::text
            ELSE COALESCE(LOWER(TRIM(b.module_type::text)), 'unknown')
        END AS branch_type
    FROM today_summary_clean t
    LEFT JOIN branches b ON b.id::text = TRIM(BOTH FROM t.branch_id::text)
),
latest AS (
    SELECT DISTINCT ON (branch_id)
        branch_id,
        metric_date,
        total_revenue,
        revenue_delta_day,
        occupancy_delta_week,
        organization_id,
        branch_name,
        branch_type
    FROM base
    ORDER BY branch_id, metric_date DESC NULLS LAST
),
signals AS (
    SELECT
        l.organization_id,
        l.branch_id,
        l.branch_name,
        l.metric_date,
        'Customer traffic up (+' || ROUND(ABS(l.revenue_delta_day))::text || '%) (' || l.branch_name || ')' AS highlight_text,
        (COALESCE(l.revenue_delta_day, 0) * 1000::numeric + COALESCE(l.total_revenue, 0)) AS sort_score
    FROM latest l
    WHERE l.branch_type = 'fnb'
      AND l.organization_id IS NOT NULL
      AND l.revenue_delta_day IS NOT NULL
      AND l.revenue_delta_day >= 10
    UNION ALL
    SELECT
        l.organization_id,
        l.branch_id,
        l.branch_name,
        l.metric_date,
        'Revenue trending up (+' || ROUND(ABS(l.revenue_delta_day))::text || '%) (' || l.branch_name || ')',
        (COALESCE(l.revenue_delta_day, 0) * 1000::numeric + COALESCE(l.total_revenue, 0))
    FROM latest l
    WHERE l.branch_type = 'accommodation'
      AND l.organization_id IS NOT NULL
      AND l.revenue_delta_day IS NOT NULL
      AND l.revenue_delta_day >= 10
    UNION ALL
    SELECT
        l.organization_id,
        l.branch_id,
        l.branch_name,
        l.metric_date,
        'Occupancy improving (+' || ROUND(ABS(l.occupancy_delta_week))::text || '%) (' || l.branch_name || ')',
        (COALESCE(l.occupancy_delta_week, 0) * 800::numeric + COALESCE(l.total_revenue, 0))
    FROM latest l
    WHERE l.branch_type = 'accommodation'
      AND l.organization_id IS NOT NULL
      AND l.occupancy_delta_week IS NOT NULL
      AND l.occupancy_delta_week >= 10
)
SELECT
    s.organization_id,
    s.branch_id,
    s.branch_name,
    s.metric_date,
    s.highlight_text,
    s.sort_score
FROM signals s;

COMMENT ON VIEW whats_working_today IS
    'Latest row per branch → positive signals; GET order=sort_score.desc&limit=3';

GRANT SELECT ON whats_working_today TO anon, authenticated;

-- STEP 7 — Verify (run these as separate statements after the script succeeds)
-- SELECT * FROM alerts_today LIMIT 5;
-- SELECT * FROM branch_alerts_today WHERE branch_id = 'your-branch-id' LIMIT 5;
-- SELECT * FROM alerts_enriched LIMIT 10;
-- SELECT * FROM alerts_critical LIMIT 5;
-- SELECT * FROM alerts_top3_revenue_leaks LIMIT 5;
-- SELECT * FROM alerts_fix_this_first ORDER BY priority_score DESC LIMIT 5;
-- SELECT * FROM today_priorities ORDER BY sort_score DESC LIMIT 5;
-- SELECT * FROM today_priorities_clean ORDER BY sort_score DESC LIMIT 3;
-- SELECT * FROM whats_working_today ORDER BY sort_score DESC LIMIT 3;
