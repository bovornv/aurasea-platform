-- =============================================================================
-- FULL REBUILD: alert views (run this entire script in the SQL editor)
-- =============================================================================
-- Do NOT run bare view names (e.g. only `alerts_today`) — that is invalid SQL.
-- Always use: CREATE OR REPLACE VIEW view_name AS ...
--
-- Prerequisites:
--   - public.today_summary_clean (total_revenue or revenue pipeline; see fix-today-summary-clean / upgrade scripts)
--   - public.branches (id, organization_id, branch_name, module_type; legacy name coalesced in views)
--
-- App/API use branch_business_status + daily tables; alerts engine reads today_summary_clean only.
--
-- After running, verify:
--   SELECT * FROM alerts_today LIMIT 5;
-- =============================================================================

-- STEP 1 — Drop dependents first (children → parent). CASCADE cleans legacy dependents.
DROP VIEW IF EXISTS opportunities_today CASCADE;
DROP VIEW IF EXISTS watchlist_today CASCADE;
DROP VIEW IF EXISTS whats_working_today CASCADE;
DROP VIEW IF EXISTS today_branch_priorities CASCADE;
DROP VIEW IF EXISTS today_priorities_clean CASCADE;
DROP VIEW IF EXISTS today_priorities CASCADE;
DROP VIEW IF EXISTS today_action_plan CASCADE;
DROP VIEW IF EXISTS alerts_fix_this_first CASCADE;
DROP VIEW IF EXISTS branch_alerts_today CASCADE;
DROP VIEW IF EXISTS alerts_critical CASCADE;
DROP VIEW IF EXISTS alerts_top3_revenue_leaks CASCADE;
DROP VIEW IF EXISTS alerts_today CASCADE;
DROP VIEW IF EXISTS alerts_enriched CASCADE;
DROP FUNCTION IF EXISTS public.get_alerts_critical(text[]);

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
        COALESCE(
            NULLIF(TRIM(j.jb->>'total_revenue'), '')::numeric,
            NULLIF(TRIM(j.jb->>'revenue'), '')::numeric,
            NULLIF(TRIM(j.jb->>'total_revenue_thb'), '')::numeric,
            NULLIF(TRIM(j.jb->>'revenue_thb'), '')::numeric,
            0::numeric
        ) AS total_revenue,
        COALESCE(
            NULLIF(TRIM(j.jb->>'accommodation_revenue'), '')::numeric,
            NULLIF(TRIM(j.jb->>'accommodation_revenue_thb'), '')::numeric,
            NULL::numeric
        ) AS accommodation_revenue,
        COALESCE(
            NULLIF(TRIM(j.jb->>'fnb_revenue'), '')::numeric,
            NULLIF(TRIM(j.jb->>'fnb_revenue_thb'), '')::numeric,
            NULL::numeric
        ) AS fnb_revenue,
        NULLIF(TRIM(j.jb->>'revenue_delta_day'), '')::numeric AS revenue_delta_day,
        NULLIF(TRIM(j.jb->>'occupancy_delta_week'), '')::numeric AS occupancy_delta_week,
        COALESCE(
            NULLIF(TRIM(j.jb->>'customers'), '')::numeric,
            NULLIF(TRIM(j.jb->>'total_customers'), '')::numeric,
            0::numeric
        ) AS customers,
        b.organization_id,
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
    FROM today_summary_clean t
    CROSS JOIN LATERAL (SELECT row_to_json(t)::jsonb AS jb) j
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

-- STEP 4b — RPC wrapper for critical alerts retrieval by branch_ids
CREATE OR REPLACE FUNCTION public.get_alerts_critical(branch_ids text[] DEFAULT NULL)
RETURNS TABLE (
    branch_id text,
    organization_id uuid,
    branch_name text,
    metric_date date,
    alert_type text,
    severity integer,
    alert_message text,
    cause text,
    impact_estimate_thb numeric,
    action text,
    recommended_action text,
    alert_category text
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        a.branch_id,
        a.organization_id,
        a.branch_name,
        a.metric_date,
        a.alert_type,
        a.severity,
        a.alert_message,
        a.cause,
        a.impact_estimate_thb,
        a.action,
        a.recommended_action,
        a.alert_category
    FROM public.alerts_critical a
    WHERE COALESCE(array_length(branch_ids, 1), 0) = 0
       OR a.branch_id = ANY(branch_ids)
    ORDER BY a.impact_estimate_thb DESC, a.severity DESC, a.metric_date DESC;
$$;

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

-- STEP 6c — Today’s Priorities (clean UI)
-- Must DROP + CREATE: PostgreSQL does not allow removing/changing columns with CREATE OR REPLACE VIEW.
DROP VIEW IF EXISTS today_priorities_clean CASCADE;
CREATE VIEW today_priorities_clean AS
SELECT
    ranked.organization_id,
    ranked.branch_id,
    ranked.branch_name,
    ranked.alert_type,
    ranked.action_text,
    ranked.short_title,
    ranked.impact_estimate_thb,
    ranked.impact_label,
    ranked.reason_short,
    ranked.sort_score,
    ranked.rank,
    ranked.business_type
FROM (
    SELECT
        COALESCE(f.organization_id, b.organization_id) AS organization_id,
        f.branch_id,
        (
            CASE
                WHEN LOWER(COALESCE(f.alert_stream, '')) = 'fnb' THEN 'fnb'::text
                WHEN LOWER(COALESCE(f.alert_stream, '')) = 'accommodation' THEN 'accommodation'::text
                WHEN LOWER(COALESCE(f.branch_type, '')) IN ('fnb', 'restaurant', 'cafe', 'cafe_restaurant') THEN 'fnb'::text
                ELSE 'accommodation'::text
            END
        ) AS business_type,
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
        f.priority_score AS sort_score,
        ROW_NUMBER() OVER (
            PARTITION BY COALESCE(f.organization_id, b.organization_id)
            ORDER BY f.priority_score DESC NULLS LAST, f.branch_id::text, COALESCE(f.alert_type, ''::text)
        )::integer AS rank
    FROM alerts_fix_this_first f
    LEFT JOIN branches b ON b.id::text = TRIM(BOTH FROM f.branch_id::text)
) ranked
WHERE ranked.organization_id IS NOT NULL;

COMMENT ON VIEW today_priorities_clean IS
    'organization_id, rank (1=top); filter org, order rank.asc, limit 3; branch in short_title.';

CREATE VIEW today_priorities_view AS
SELECT
    c.organization_id,
    c.branch_id,
    c.branch_name,
    c.alert_type,
    c.action_text,
    c.short_title,
    c.impact_estimate_thb,
    c.impact_label,
    c.reason_short,
    c.sort_score,
    c.rank,
    (
        CASE
            WHEN COALESCE(NULLIF(TRIM(BOTH FROM c.branch_name), ''), NULLIF(TRIM(BOTH FROM b.branch_name), ''), NULLIF(TRIM(BOTH FROM b.name), ''), '') ILIKE '%cafe%' THEN 'fnb'::text
            ELSE 'accommodation'::text
        END
    ) AS business_type
FROM today_priorities_clean c
LEFT JOIN branches b ON b.id::text = TRIM(BOTH FROM c.branch_id::text);

COMMENT ON VIEW today_priorities_view IS
    'Schema-stable priorities view: existing columns order + business_type at end.';

-- STEP 6c.1 — Branch Today: Today's Priorities (single list, top 3 by rank)
DROP VIEW IF EXISTS today_branch_priorities CASCADE;
CREATE VIEW today_branch_priorities AS
SELECT
    f.branch_id::text AS branch_id,
    (
        CASE
            WHEN LOWER(COALESCE(f.alert_stream, '')) = 'fnb' THEN 'fnb'::text
            WHEN LOWER(COALESCE(f.alert_stream, '')) = 'accommodation' THEN 'accommodation'::text
            WHEN LOWER(COALESCE(f.branch_type, '')) IN ('fnb', 'restaurant', 'cafe', 'cafe_restaurant') THEN 'fnb'::text
            ELSE 'accommodation'::text
        END
    ) AS business_type,
    f.metric_date::date AS metric_date,
    (
        CASE
            WHEN NULLIF(TRIM(BOTH FROM REPLACE(COALESCE(f.alert_type, ''::text), '_'::text, ' '::text)), '') IS NULL
                THEN 'Priority'::text
            ELSE TRIM(BOTH FROM REPLACE(COALESCE(f.alert_type, ''::text), '_'::text, ' '::text))
        END
    ) AS short_title,
    COALESCE(NULLIF(TRIM(BOTH FROM f.recommended_action), ''), 'Review action plan'::text) AS action_text,
    COALESCE(f.impact_estimate_thb, 0::numeric) AS impact_estimate_thb,
    (
        CASE
            WHEN LOWER(COALESCE(f.alert_type, ''::text)) LIKE '%opportunity%'
                OR LOWER(COALESCE(f.alert_stream, ''::text)) LIKE '%opportunity%'
            THEN 'opportunity'::text
            ELSE 'at risk'::text
        END
    ) AS impact_label,
    f.priority_score AS sort_score,
    ROW_NUMBER() OVER (
        PARTITION BY f.branch_id
        ORDER BY f.priority_score DESC NULLS LAST, f.metric_date DESC NULLS LAST, COALESCE(f.alert_type, ''::text)
    )::integer AS rank
FROM alerts_fix_this_first f
WHERE f.branch_id IS NOT NULL;

COMMENT ON VIEW today_branch_priorities IS
    'Branch Today core priorities from alerts_fix_this_first; GET by branch_id + business_type order=rank.asc&limit=3.';

-- Grants (adjust roles if you do not use anon)
GRANT SELECT ON alerts_enriched TO anon, authenticated;
GRANT SELECT ON alerts_today TO anon, authenticated;
GRANT SELECT ON branch_alerts_today TO anon, authenticated;
GRANT SELECT ON alerts_critical TO anon, authenticated;
GRANT SELECT ON alerts_top3_revenue_leaks TO anon, authenticated;
GRANT SELECT ON alerts_fix_this_first TO anon, authenticated;
GRANT SELECT ON today_priorities TO anon, authenticated;
GRANT SELECT ON today_priorities_clean TO anon, authenticated;
GRANT SELECT ON today_priorities_view TO anon, authenticated;
GRANT SELECT ON today_branch_priorities TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_alerts_critical(text[]) TO anon, authenticated;

-- STEP 6d — What’s Working (positive + fallback): always 1-3 rows per org
CREATE OR REPLACE VIEW whats_working_today AS
WITH base AS (
    SELECT
        t.branch_id::text AS branch_id,
        t.metric_date::date AS metric_date,
        COALESCE(
            NULLIF(TRIM(j.jb->>'total_revenue'), '')::numeric,
            NULLIF(TRIM(j.jb->>'revenue'), '')::numeric,
            NULLIF(TRIM(j.jb->>'total_revenue_thb'), '')::numeric,
            NULLIF(TRIM(j.jb->>'revenue_thb'), '')::numeric,
            0::numeric
        ) AS total_revenue,
        NULLIF(TRIM(j.jb->>'revenue_delta_day'), '')::numeric AS revenue_delta_day,
        NULLIF(TRIM(j.jb->>'occupancy_delta_week'), '')::numeric AS occupancy_delta_week,
        b.organization_id,
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
    FROM today_summary_clean t
    CROSS JOIN LATERAL (SELECT row_to_json(t)::jsonb AS jb) j
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
        l.organization_id::uuid AS organization_id,
        l.branch_id::text AS branch_id,
        l.branch_name::text AS branch_name,
        l.metric_date::date AS metric_date,
        ('Customer traffic up (+' || ROUND(ABS(l.revenue_delta_day))::text || '%) (' || l.branch_name || ')')::text AS highlight_text,
        (COALESCE(l.revenue_delta_day, 0) * 1000::numeric + COALESCE(l.total_revenue, 0))::numeric AS sort_score
    FROM latest l
    WHERE l.branch_type = 'fnb'
      AND l.organization_id IS NOT NULL
      AND l.revenue_delta_day IS NOT NULL
      AND l.revenue_delta_day >= 10
    UNION ALL
    SELECT
        l.organization_id::uuid,
        l.branch_id::text,
        l.branch_name::text,
        l.metric_date::date,
        ('Revenue trending up (+' || ROUND(ABS(l.revenue_delta_day))::text || '%) (' || l.branch_name || ')')::text,
        (COALESCE(l.revenue_delta_day, 0) * 1000::numeric + COALESCE(l.total_revenue, 0))::numeric
    FROM latest l
    WHERE l.branch_type = 'accommodation'
      AND l.organization_id IS NOT NULL
      AND l.revenue_delta_day IS NOT NULL
      AND l.revenue_delta_day >= 10
    UNION ALL
    SELECT
        l.organization_id::uuid,
        l.branch_id::text,
        l.branch_name::text,
        l.metric_date::date,
        ('Occupancy improving (+' || ROUND(ABS(l.occupancy_delta_week))::text || '%) (' || l.branch_name || ')')::text,
        (COALESCE(l.occupancy_delta_week, 0) * 800::numeric + COALESCE(l.total_revenue, 0))::numeric
    FROM latest l
    WHERE l.branch_type = 'accommodation'
      AND l.organization_id IS NOT NULL
      AND l.occupancy_delta_week IS NOT NULL
      AND l.occupancy_delta_week >= 10
),
org_pool AS (
    SELECT
        b.organization_id,
        MAX(l.metric_date) AS latest_metric_date,
        (
            ARRAY_AGG(
                COALESCE(
                    NULLIF(TRIM(BOTH FROM b.branch_name), ''),
                    NULLIF(TRIM(BOTH FROM b.name), ''),
                    TRIM(BOTH FROM b.id::text)
                )
                ORDER BY b.sort_order NULLS LAST, COALESCE(b.branch_name, b.name)
            )
        )[1] AS sample_branch_name,
        (
            ARRAY_AGG(TRIM(BOTH FROM b.id::text) ORDER BY b.sort_order NULLS LAST, COALESCE(b.branch_name, b.name))
        )[1] AS sample_branch_id
    FROM branches b
    LEFT JOIN latest l ON l.branch_id = TRIM(BOTH FROM b.id::text)
    WHERE b.organization_id IS NOT NULL
    GROUP BY b.organization_id
),
has_positive AS (
    SELECT DISTINCT s.organization_id
    FROM signals s
    WHERE s.organization_id IS NOT NULL
),
fallback AS (
    SELECT
        o.organization_id::uuid AS organization_id,
        COALESCE(o.sample_branch_id, NULL::text)::text AS branch_id,
        COALESCE(o.sample_branch_name, NULL::text)::text AS branch_name,
        o.latest_metric_date::date AS metric_date,
        'No major operational risks detected'::text AS highlight_text,
        300::numeric AS sort_score
    FROM org_pool o
    LEFT JOIN has_positive hp ON hp.organization_id = o.organization_id
    WHERE hp.organization_id IS NULL

    UNION ALL

    SELECT
        o.organization_id::uuid,
        COALESCE(o.sample_branch_id, NULL::text)::text,
        COALESCE(o.sample_branch_name, NULL::text)::text,
        o.latest_metric_date::date,
        'Performance stable across branches'::text,
        200::numeric
    FROM org_pool o
    LEFT JOIN has_positive hp ON hp.organization_id = o.organization_id
    WHERE hp.organization_id IS NULL

    UNION ALL

    SELECT
        o.organization_id::uuid,
        COALESCE(o.sample_branch_id, NULL::text)::text,
        COALESCE(o.sample_branch_name, NULL::text)::text,
        o.latest_metric_date::date,
        (COALESCE(o.sample_branch_name, 'Branch') || ' traffic stable')::text,
        100::numeric
    FROM org_pool o
    LEFT JOIN has_positive hp ON hp.organization_id = o.organization_id
    WHERE hp.organization_id IS NULL
),
all_rows AS (
    SELECT * FROM signals
    UNION ALL
    SELECT * FROM fallback
),
deduped_rows AS (
    SELECT DISTINCT ON (
        lower(trim(COALESCE(a.branch_id::text, ''))),
        COALESCE(a.metric_date::date, '1970-01-01'::date),
        lower(trim(COALESCE(a.highlight_text, '')))
    )
        a.organization_id,
        a.branch_id,
        a.branch_name,
        a.metric_date,
        a.highlight_text,
        a.sort_score
    FROM all_rows a
    WHERE a.organization_id IS NOT NULL
    ORDER BY
        lower(trim(COALESCE(a.branch_id::text, ''))),
        COALESCE(a.metric_date::date, '1970-01-01'::date),
        lower(trim(COALESCE(a.highlight_text, ''))),
        a.sort_score DESC NULLS LAST
),
ranked AS (
    SELECT
        d.organization_id,
        d.branch_id,
        d.branch_name,
        d.metric_date,
        d.highlight_text,
        d.sort_score,
        ROW_NUMBER() OVER (
            PARTITION BY d.organization_id
            ORDER BY d.sort_score DESC, d.metric_date DESC NULLS LAST
        ) AS rn
    FROM deduped_rows d
)
SELECT
    r.organization_id,
    r.branch_id,
    r.branch_name,
    r.metric_date,
    r.highlight_text,
    r.sort_score
FROM ranked r
WHERE r.rn <= 3;

COMMENT ON VIEW whats_working_today IS
    'Positive signals + fallback insights; always 1-3 rows per org; GET order=sort_score.desc&limit=3';

GRANT SELECT ON whats_working_today TO anon, authenticated;

-- STEP 6e — Opportunities (advisor-style lines from opportunity alerts)
CREATE OR REPLACE VIEW opportunities_today AS
WITH base AS (
    SELECT
        e.organization_id,
        e.branch_id::text AS branch_id,
        e.branch_name,
        e.branch_type,
        e.metric_date::date AS metric_date,
        COALESCE(e.impact_estimate_thb, 0)::numeric AS impact_estimate_thb,
        e.recommended_action
    FROM alerts_enriched e
    WHERE e.alert_category = 'opportunity'
),
enriched AS (
    SELECT
        COALESCE(b.organization_id, base.organization_id) AS organization_id,
        base.branch_id,
        COALESCE(
            NULLIF(TRIM(BOTH FROM base.branch_name), ''),
            NULLIF(TRIM(BOTH FROM b.branch_name), ''),
            NULLIF(TRIM(BOTH FROM b.name), ''),
            base.branch_id
        ) AS branch_name,
        base.branch_type,
        base.metric_date,
        base.impact_estimate_thb,
        base.recommended_action
    FROM base
    LEFT JOIN branches b ON b.id::text = TRIM(BOTH FROM base.branch_id::text)
),
latest AS (
    SELECT DISTINCT ON (branch_id)
        organization_id,
        branch_id,
        branch_name,
        branch_type,
        metric_date,
        impact_estimate_thb,
        recommended_action
    FROM enriched
    WHERE organization_id IS NOT NULL
    ORDER BY branch_id, metric_date DESC NULLS LAST
),
final AS (
    SELECT
        l.organization_id,
        l.branch_id,
        l.branch_name,
        l.metric_date,
        (
            CASE
                WHEN l.branch_type = 'accommodation'
                    AND EXTRACT(ISODOW FROM l.metric_date::timestamp) >= 5 THEN
                    'Strong weekend pattern → add package (' || l.branch_name || ')'
                WHEN l.branch_type = 'fnb' THEN
                    'Customer traffic rising → increase avg ticket (' || l.branch_name || ')'
                ELSE
                    'High demand detected → raise price slightly (' || l.branch_name || ')'
            END
        ) AS opportunity_text,
        (l.impact_estimate_thb * 100::numeric + EXTRACT(EPOCH FROM l.metric_date::timestamp)::numeric) AS sort_score
    FROM latest l
)
SELECT
    f.organization_id,
    f.branch_id,
    f.branch_name,
    f.metric_date,
    f.opportunity_text,
    f.sort_score
FROM final f;

COMMENT ON VIEW opportunities_today IS
    'Opportunity alerts; latest per branch; GET order=sort_score.desc&limit=3';

GRANT SELECT ON opportunities_today TO anon, authenticated;

-- STEP 6f — Watchlist (early warning, non-urgent downward trends)
CREATE OR REPLACE VIEW watchlist_today AS
WITH base AS (
    SELECT
        t.branch_id::text AS branch_id,
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
        b.organization_id,
        COALESCE(b.branch_name, b.name) AS branch_name
    FROM today_summary_clean t
    CROSS JOIN LATERAL (SELECT row_to_json(t)::jsonb AS jb) j
    LEFT JOIN branches b ON b.id::text = TRIM(BOTH FROM t.branch_id::text)
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
                COALESCE(
                    NULLIF(TRIM(BOTH FROM b.branch_name), ''),
                    NULLIF(TRIM(BOTH FROM b.name), ''),
                    TRIM(BOTH FROM b.id::text)
                )
                ORDER BY b.sort_order NULLS LAST, COALESCE(b.branch_name, b.name)
            )
        )[1] AS sample_branch_name,
        (
            ARRAY_AGG(TRIM(BOTH FROM b.id::text) ORDER BY b.sort_order NULLS LAST, COALESCE(b.branch_name, b.name))
        )[1] AS sample_branch_id
    FROM branches b
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

COMMENT ON VIEW watchlist_today IS
    'Early warning trends via lag(1,2): revenue/customers/rooms softening; fallback when none; limit 3.';

GRANT SELECT ON watchlist_today TO anon, authenticated;

-- STEP 7 — Verify (run these as separate statements after the script succeeds)
-- SELECT * FROM alerts_today LIMIT 5;
-- SELECT * FROM branch_alerts_today WHERE branch_id = 'your-branch-id' LIMIT 5;
-- SELECT * FROM alerts_enriched LIMIT 10;
-- SELECT * FROM alerts_critical LIMIT 5;
-- SELECT * FROM alerts_top3_revenue_leaks LIMIT 5;
-- SELECT * FROM alerts_fix_this_first ORDER BY priority_score DESC LIMIT 5;
-- SELECT * FROM today_priorities ORDER BY sort_score DESC LIMIT 5;
-- SELECT * FROM today_priorities_clean WHERE organization_id = '...' ORDER BY rank ASC LIMIT 3;
-- SELECT * FROM today_branch_priorities WHERE branch_id = '...' ORDER BY rank ASC LIMIT 3;
-- SELECT * FROM whats_working_today ORDER BY sort_score DESC LIMIT 3;
-- SELECT * FROM opportunities_today ORDER BY sort_score DESC LIMIT 3;
-- SELECT * FROM watchlist_today WHERE organization_id = '...' ORDER BY sort_score DESC LIMIT 3;
