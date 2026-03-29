-- =============================================================================
-- FULL REBUILD: alert views (run this entire script in the SQL editor)
-- =============================================================================
-- Do NOT run bare view names (e.g. only `alerts_today`) — that is invalid SQL.
-- Always use: CREATE OR REPLACE VIEW view_name AS ...
--
-- Prerequisites:
--   - public.today_summary (whats_working_today / opportunities_today / watchlist_today); public.today_summary_clean (STEP 2 alerts_enriched only)
--   - public.branches (id, organization_id, branch_name, module_type; legacy name coalesced in views)
--
-- App/API use branch_business_status + daily tables; Today panels read today_summary; alerts_enriched reads today_summary_clean.
--
-- After running, verify:
--   SELECT * FROM alerts_today LIMIT 5;
-- =============================================================================

-- STEP 1 — Drop dependents first (children → parent). CASCADE cleans legacy dependents.
-- Drops public.today_company_dashboard (depends on whats_working_today). After this script, recreate it via
-- restore-today-company-dashboard-after-rebuild.sql or the today_company_dashboard block in fix-today-priorities-stable-schema.sql.
DROP VIEW IF EXISTS public.today_company_dashboard CASCADE;
DROP VIEW IF EXISTS public.whats_working_today_v_next CASCADE;
DROP VIEW IF EXISTS public.whats_working_today__candidate CASCADE;
DROP VIEW IF EXISTS public.opportunity_alerts CASCADE;
DROP VIEW IF EXISTS opportunities_today CASCADE;
DROP VIEW IF EXISTS public.watchlist_today CASCADE;
DROP VIEW IF EXISTS public.whats_working_today CASCADE;
DROP VIEW IF EXISTS today_branch_priorities CASCADE;
DROP VIEW IF EXISTS today_priorities_view CASCADE;
DROP VIEW IF EXISTS today_priorities_clean CASCADE;
DROP VIEW IF EXISTS today_priorities CASCADE;
DROP VIEW IF EXISTS today_action_plan CASCADE;
DROP VIEW IF EXISTS alerts_fix_this_first CASCADE;
DROP VIEW IF EXISTS branch_alerts_today CASCADE;
DROP VIEW IF EXISTS alerts_critical CASCADE;
DROP VIEW IF EXISTS alerts_top3_revenue_leaks CASCADE;
DROP VIEW IF EXISTS alerts_today CASCADE;
DROP VIEW IF EXISTS alerts_enriched CASCADE;
-- Parity/test wrappers may depend on the RPC; drop before function.
DROP VIEW IF EXISTS public.get_alerts_critical_parity CASCADE;
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

-- STEP 2 — Core engine (join today_summary_clean + branches; priorities/alerts chain — not Today panel sections)
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
    c.organization_id AS organization_id,
    c.branch_id AS branch_id,
    c.branch_name AS branch_name,
    c.alert_type AS alert_type,
    c.action_text AS action_text,
    c.short_title AS short_title,
    c.impact_estimate_thb AS impact_estimate_thb,
    c.impact_label AS impact_label,
    c.reason_short AS reason_short,
    c.sort_score AS sort_score,
    c.rank AS rank,
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

-- STEP 6d — What’s Working (positive + fallback): up to 3 rows per org
--
-- Sources: public.today_summary, public.branches only.
-- description = exactly 'Branch: {name|id}'; whats_working_text = coaching body; sort_score in ~55–78 (no revenue magnitude).
-- daily_best = one row per (branch_id, metric_date); latest day per branch then top 3 per org.
-- Org fallback rows preserved when no branch-level line exists for that org.
CREATE OR REPLACE VIEW public.whats_working_today AS
WITH base AS (
    SELECT
        (NULLIF(TRIM(BOTH FROM t.branch_id::text), ''))::uuid AS branch_id,
        t.metric_date::date AS metric_date,
        NULLIF(TRIM(j.jb->>'revenue_delta_day'), '')::numeric AS revenue_delta_day,
        NULLIF(TRIM(j.jb->>'occupancy_delta_week'), '')::numeric AS occupancy_delta_week,
        COALESCE(
            b.organization_id::uuid,
            NULLIF(TRIM(j.jb->>'organization_id'), '')::uuid
        ) AS organization_id,
        COALESCE(
            NULLIF(TRIM(BOTH FROM b.branch_name::text), ''),
            NULLIF(TRIM(BOTH FROM b.name::text), ''),
            NULLIF(TRIM(j.jb->>'branch_name'), '')
        ) AS branch_name,
        CASE
            WHEN LOWER(COALESCE(
                b.module_type::text,
                TRIM(j.jb->>'module_type'),
                TRIM(j.jb->>'business_type'),
                ''
            )) IN (
                'accommodation', 'hotel', 'hotel_resort', 'rooms', 'hotel_with_cafe'
            ) THEN 'accommodation'::text
            WHEN LOWER(COALESCE(
                b.module_type::text,
                TRIM(j.jb->>'module_type'),
                TRIM(j.jb->>'business_type'),
                ''
            )) IN (
                'fnb', 'restaurant', 'cafe', 'cafe_restaurant'
            ) THEN 'fnb'::text
            ELSE COALESCE(
                NULLIF(LOWER(TRIM(COALESCE(b.module_type::text, TRIM(j.jb->>'module_type'), ''))), ''),
                'unknown'
            )::text
        END AS branch_type
    FROM public.today_summary t
    CROSS JOIN LATERAL (SELECT row_to_json(t)::jsonb AS jb) j
    LEFT JOIN public.branches b ON trim(both FROM b.id::text) = trim(both FROM t.branch_id::text)
),
branch_days AS (
    SELECT *
    FROM base
    WHERE organization_id IS NOT NULL
),
tight_per_day AS (
    SELECT
        b.organization_id::uuid AS organization_id,
        b.branch_id::uuid AS branch_id,
        b.branch_name::text AS branch_name,
        b.metric_date::date AS metric_date,
        ('F&B revenue up (+' || ROUND(ABS(b.revenue_delta_day))::text || '%)')::text AS title,
        (
            'Branch: '
            || COALESCE(
                NULLIF(TRIM(BOTH FROM b.branch_name::text), ''),
                TRIM(BOTH FROM b.branch_id::text)
            )
        )::text AS description,
        LEAST(
            78::numeric,
            68::numeric
            + (
                (LEAST(ABS(COALESCE(b.revenue_delta_day, 0::numeric)), 100::numeric) - 10::numeric)
                / 90::numeric
                * 10::numeric
            )
        ) AS sort_score,
        (
            'Daily F&B revenue is ahead of recent days — lean into average ticket, conversion, and transaction '
            || 'mix while customer traffic supports the lift.'
        )::text AS whats_working_text
    FROM branch_days b
    WHERE b.branch_type = 'fnb'
      AND b.revenue_delta_day IS NOT NULL
      AND b.revenue_delta_day >= 10::numeric
      AND b.revenue_delta_day <= 100::numeric
    UNION ALL
    SELECT
        b.organization_id::uuid,
        b.branch_id::uuid,
        b.branch_name::text,
        b.metric_date::date,
        ('Accommodation revenue up (+' || ROUND(ABS(b.revenue_delta_day))::text || '%)')::text,
        (
            'Branch: '
            || COALESCE(
                NULLIF(TRIM(BOTH FROM b.branch_name::text), ''),
                TRIM(BOTH FROM b.branch_id::text)
            )
        )::text,
        LEAST(
            78::numeric,
            69::numeric
            + (
                (LEAST(ABS(COALESCE(b.revenue_delta_day, 0::numeric)), 100::numeric) - 10::numeric)
                / 90::numeric
                * 9::numeric
            )
        ),
        (
            'Accommodation revenue is climbing vs recent nights — ADR, RevPAR, and occupancy deserve a quick read '
            || 'to protect booking pace.'
        )::text
    FROM branch_days b
    WHERE b.branch_type = 'accommodation'
      AND b.revenue_delta_day IS NOT NULL
      AND b.revenue_delta_day >= 10::numeric
      AND b.revenue_delta_day <= 100::numeric
    UNION ALL
    SELECT
        b.organization_id::uuid,
        b.branch_id::uuid,
        b.branch_name::text,
        b.metric_date::date,
        ('Occupancy up (+' || ROUND(ABS(b.occupancy_delta_week))::text || '% week-on-week)')::text,
        (
            'Branch: '
            || COALESCE(
                NULLIF(TRIM(BOTH FROM b.branch_name::text), ''),
                TRIM(BOTH FROM b.branch_id::text)
            )
        )::text,
        LEAST(
            77::numeric,
            67::numeric
            + (
                (LEAST(ABS(COALESCE(b.occupancy_delta_week, 0::numeric)), 100::numeric) - 10::numeric)
                / 90::numeric
                * 10::numeric
            )
        ),
        (
            'Week-on-week occupancy is higher — rooms sold and booking pace are reinforcing RevPAR.'
        )::text
    FROM branch_days b
    WHERE b.branch_type = 'accommodation'
      AND b.occupancy_delta_week IS NOT NULL
      AND b.occupancy_delta_week >= 10::numeric
      AND b.occupancy_delta_week <= 100::numeric
    UNION ALL
    SELECT
        b.organization_id::uuid,
        b.branch_id::uuid,
        b.branch_name::text,
        b.metric_date::date,
        ('Revenue up (+' || ROUND(ABS(b.revenue_delta_day))::text || '%)')::text,
        (
            'Branch: '
            || COALESCE(
                NULLIF(TRIM(BOTH FROM b.branch_name::text), ''),
                TRIM(BOTH FROM b.branch_id::text)
            )
        )::text,
        LEAST(
            76::numeric,
            66::numeric
            + (
                (LEAST(ABS(COALESCE(b.revenue_delta_day, 0::numeric)), 100::numeric) - 10::numeric)
                / 90::numeric
                * 10::numeric
            )
        ),
        (
            'Top-line revenue is ahead of recent days — validate demand vs price before expanding cost or staff.'
        )::text
    FROM branch_days b
    WHERE b.branch_type NOT IN ('accommodation', 'fnb')
      AND b.revenue_delta_day IS NOT NULL
      AND b.revenue_delta_day >= 10::numeric
      AND b.revenue_delta_day <= 100::numeric
),
stable_per_day AS (
    SELECT
        b.organization_id::uuid AS organization_id,
        b.branch_id::uuid AS branch_id,
        b.branch_name::text AS branch_name,
        b.metric_date::date AS metric_date,
        (
            CASE b.branch_type
                WHEN 'fnb' THEN 'Steady F&B performance'::text
                WHEN 'accommodation' THEN 'Stable accommodation demand'::text
                ELSE 'Steady operations'::text
            END
        ) AS title,
        (
            'Branch: '
            || COALESCE(
                NULLIF(TRIM(BOTH FROM b.branch_name::text), ''),
                TRIM(BOTH FROM b.branch_id::text)
            )
        )::text AS description,
        57::numeric AS sort_score,
        (
            CASE b.branch_type
                WHEN 'fnb' THEN
                    'F&B revenue, covers, and transactions sit in a normal band — space to nudge average ticket '
                    || 'and conversion without chasing volume discounts.'::text
                WHEN 'accommodation' THEN
                    'Rooms sold, occupancy, and booking pace look steady — ADR and RevPAR are behaving in a '
                    || 'comfortable range.'::text
                ELSE
                    'Core metrics are flat-to-slightly-positive — no sharp upside spike in the window we scan.'::text
            END
        ) AS whats_working_text
    FROM branch_days b
    WHERE NOT EXISTS (
        SELECT 1
        FROM tight_per_day t
        WHERE t.branch_id = b.branch_id
          AND t.metric_date = b.metric_date
    )
),
daily_mixed AS (
    SELECT * FROM tight_per_day
    UNION ALL
    SELECT * FROM stable_per_day
),
daily_best AS (
    SELECT DISTINCT ON (branch_id, metric_date)
        organization_id,
        branch_id,
        branch_name,
        metric_date,
        title,
        description,
        sort_score,
        whats_working_text
    FROM daily_mixed
    ORDER BY
        branch_id,
        metric_date,
        sort_score DESC NULLS LAST,
        title ASC
),
per_branch_latest_meaningful AS (
    SELECT DISTINCT ON (branch_id)
        organization_id,
        branch_id,
        branch_name,
        metric_date,
        title,
        description,
        sort_score,
        whats_working_text
    FROM daily_best
    ORDER BY
        branch_id,
        metric_date DESC NULLS LAST,
        sort_score DESC NULLS LAST
),
org_pool AS (
    SELECT
        b.organization_id,
        MAX(bd.metric_date) AS latest_metric_date,
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
    FROM public.branches b
    LEFT JOIN branch_days bd ON bd.branch_id = b.id::uuid
    WHERE b.organization_id IS NOT NULL
    GROUP BY b.organization_id
),
fallback AS (
    SELECT
        o.organization_id::uuid AS organization_id,
        COALESCE(o.sample_branch_id, NULL::text)::uuid AS branch_id,
        COALESCE(o.sample_branch_name, NULL::text)::text AS branch_name,
        o.latest_metric_date::date AS metric_date,
        'Portfolio steady'::text AS title,
        (
            'Branch: '
            || COALESCE(
                NULLIF(TRIM(BOTH FROM o.sample_branch_name::text), ''),
                TRIM(BOTH FROM o.sample_branch_id::text)
            )
        )::text AS description,
        57::numeric AS sort_score,
        (
            'No branch-level positive spike from summary history yet — operations look calm at the sampled branch.'
        )::text AS whats_working_text
    FROM org_pool o
    WHERE NOT EXISTS (
        SELECT 1
        FROM per_branch_latest_meaningful m
        WHERE m.organization_id = o.organization_id
    )
    UNION ALL
    SELECT
        o.organization_id::uuid,
        COALESCE(o.sample_branch_id, NULL::text)::uuid,
        COALESCE(o.sample_branch_name, NULL::text)::text,
        o.latest_metric_date::date,
        'Org operations calm'::text,
        (
            'Branch: '
            || COALESCE(
                NULLIF(TRIM(BOTH FROM o.sample_branch_name::text), ''),
                TRIM(BOTH FROM o.sample_branch_id::text)
            )
        )::text,
        56::numeric,
        (
            'Org-wide signals from today_summary are quiet — watch individual branches as fresh days land.'
        )::text
    FROM org_pool o
    WHERE NOT EXISTS (
        SELECT 1
        FROM per_branch_latest_meaningful m
        WHERE m.organization_id = o.organization_id
    )
    UNION ALL
    SELECT
        o.organization_id::uuid,
        COALESCE(o.sample_branch_id, NULL::text)::uuid,
        COALESCE(o.sample_branch_name, NULL::text)::text,
        o.latest_metric_date::date,
        'Flat-to-positive trend'::text,
        (
            'Branch: '
            || COALESCE(
                NULLIF(TRIM(BOTH FROM o.sample_branch_name::text), ''),
                TRIM(BOTH FROM o.sample_branch_id::text)
            )
        )::text,
        55::numeric,
        (
            'Trend lines are flat-to-positive at the sampled branch — nothing urgent, nothing overheated.'
        )::text
    FROM org_pool o
    WHERE NOT EXISTS (
        SELECT 1
        FROM per_branch_latest_meaningful m
        WHERE m.organization_id = o.organization_id
    )
),
all_rows AS (
    SELECT * FROM per_branch_latest_meaningful
    UNION ALL
    SELECT * FROM fallback
),
deduped_rows AS (
    SELECT DISTINCT ON (
        a.organization_id,
        lower(trim(COALESCE(a.branch_id::text, ''))),
        COALESCE(a.metric_date::date, '1970-01-01'::date),
        lower(trim(COALESCE(a.title, '')))
    )
        a.organization_id,
        a.branch_id,
        a.branch_name,
        a.metric_date,
        a.title,
        a.description,
        a.sort_score,
        a.whats_working_text
    FROM all_rows a
    WHERE a.organization_id IS NOT NULL
    ORDER BY
        a.organization_id,
        lower(trim(COALESCE(a.branch_id::text, ''))),
        COALESCE(a.metric_date::date, '1970-01-01'::date),
        lower(trim(COALESCE(a.title, ''))),
        a.sort_score DESC NULLS LAST
),
ranked AS (
    SELECT
        d.organization_id,
        d.branch_id,
        d.branch_name,
        d.metric_date,
        d.title,
        d.description,
        d.sort_score,
        d.whats_working_text,
        ROW_NUMBER() OVER (
            PARTITION BY d.organization_id
            ORDER BY d.metric_date DESC NULLS LAST, d.sort_score DESC, d.branch_id::text
        ) AS rn
    FROM deduped_rows d
)
SELECT
    r.organization_id,
    r.branch_id,
    r.branch_name,
    r.metric_date,
    r.title,
    r.description,
    r.sort_score,
    r.whats_working_text
FROM ranked r
WHERE r.rn <= 3;

COMMENT ON VIEW public.whats_working_today IS
    'today_summary + branches: type-aware title; Branch: label; whats_working_text; sort_score 55–78; best per branch+date; top 3 per org.';

GRANT SELECT ON public.whats_working_today TO anon, authenticated;

-- Legacy aliases whats_working_today__candidate / whats_working_today_v_next: not recreated here.
-- Drop with: apps/web/app/lib/supabase/drop-whats-working-alias-views.sql

-- STEP 6e — Opportunities (metrics-only; no priority/problem fallbacks; one row per branch)
-- Contract: title = business-type-aware headline; description = exactly 'Branch: {name|id}';
-- opportunity_text = coaching detail (no duplicate of description). sort_score = explicit priority.
CREATE OR REPLACE VIEW opportunities_today AS
WITH base AS (
    SELECT
        t.branch_id::uuid AS branch_id,
        t.metric_date::date AS metric_date,
        j.jb AS j,
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
    FROM today_summary t
    CROSS JOIN LATERAL (SELECT row_to_json(t)::jsonb AS jb) j
    LEFT JOIN branches b ON b.id::text = TRIM(BOTH FROM t.branch_id::text)
    WHERE b.organization_id IS NOT NULL
),
latest AS (
    SELECT DISTINCT ON (branch_id)
        organization_id,
        branch_id,
        branch_name,
        branch_type,
        metric_date,
        COALESCE(NULLIF(TRIM(j->>'revenue_delta_day'), '')::numeric, NULL::numeric) AS revenue_delta_day,
        COALESCE(
            NULLIF(TRIM(j->>'total_revenue'), '')::numeric,
            NULLIF(TRIM(j->>'revenue'), '')::numeric,
            NULLIF(TRIM(j->>'total_revenue_thb'), '')::numeric,
            NULLIF(TRIM(j->>'revenue_thb'), '')::numeric,
            0::numeric
        ) AS revenue_thb,
        COALESCE(
            NULLIF(TRIM(j->>'occupancy_rate'), '')::numeric,
            CASE
                WHEN NULLIF(TRIM(COALESCE(j->>'rooms_available', j->>'capacity', '')), '')::numeric > 0::numeric
                THEN (
                    COALESCE(
                        NULLIF(TRIM(COALESCE(j->>'utilized', j->>'rooms_sold', '')), '')::numeric,
                        0::numeric
                    )
                    / NULLIF(TRIM(COALESCE(j->>'rooms_available', j->>'capacity', '')), '')::numeric
                ) * 100::numeric
                ELSE NULL::numeric
            END
        ) AS occ_pct,
        COALESCE(NULLIF(TRIM(j->>'occupancy_delta_week'), '')::numeric, NULL::numeric) AS occupancy_delta_week
    FROM base
    ORDER BY branch_id, metric_date DESC NULLS LAST
),
signals AS (
    SELECT
        l.organization_id,
        l.branch_id,
        l.branch_name,
        l.metric_date,
        (
            CASE
                WHEN l.branch_type = 'accommodation'
                    AND EXTRACT(ISODOW FROM l.metric_date::timestamp) >= 5 THEN
                    'Add a weekend package'::text
                WHEN l.branch_type = 'accommodation' THEN
                    'Accelerate room revenue'::text
                WHEN l.branch_type = 'fnb' THEN
                    'Increase average ticket'::text
                ELSE
                    'Tune demand and pricing mix'::text
            END
        ) AS title,
        (
            'Branch: '
            || COALESCE(
                NULLIF(TRIM(BOTH FROM l.branch_name::text), ''),
                TRIM(BOTH FROM l.branch_id::text)
            )
        )::text AS description,
        (
            CASE
                WHEN l.branch_type = 'accommodation'
                    AND EXTRACT(ISODOW FROM l.metric_date::timestamp) >= 5 THEN
                    'Strong weekend demand — add a fenced package or rate ladder to capture upside without broad discounting.'::text
                WHEN l.branch_type = 'fnb' THEN
                    'Customer traffic is rising — use bundles, add-ons, and suggestive selling to lift average ticket.'::text
                ELSE
                    'Demand looks healthy — test a small price or mix uplift while monitoring conversion.'::text
            END
        ) AS opportunity_text,
        (
            150::numeric
            + COALESCE(l.revenue_thb, 0)::numeric / 2000::numeric
            + ((abs(hashtext(COALESCE(l.branch_id::text, '') || COALESCE(l.branch_name, ''))))::numeric % 1000000::numeric) / 1000000000::numeric
        ) AS sort_score
    FROM latest l
    WHERE l.revenue_delta_day IS NOT NULL
      AND l.revenue_delta_day >= 10

    UNION ALL

    SELECT
        l.organization_id,
        l.branch_id,
        l.branch_name,
        l.metric_date,
        'Capture rising occupancy'::text AS title,
        (
            'Branch: '
            || COALESCE(
                NULLIF(TRIM(BOTH FROM l.branch_name::text), ''),
                TRIM(BOTH FROM l.branch_id::text)
            )
        )::text AS description,
        (
            'Week-on-week occupancy is improving — prioritize ADR and package upsells plus in-house F&B conversion while demand builds.'
        )::text AS opportunity_text,
        (
            145::numeric
            + LEAST(COALESCE(l.occupancy_delta_week, 0::numeric), 25::numeric) * 1.5::numeric
            + COALESCE(l.revenue_thb, 0)::numeric / 2500::numeric
        ) AS sort_score
    FROM latest l
    WHERE l.branch_type = 'accommodation'
      AND l.occupancy_delta_week IS NOT NULL
      AND l.occupancy_delta_week >= 5::numeric

    UNION ALL

    SELECT
        l.organization_id,
        l.branch_id,
        l.branch_name,
        l.metric_date,
        'Lift ADR on strong occupancy'::text AS title,
        (
            'Branch: '
            || COALESCE(
                NULLIF(TRIM(BOTH FROM l.branch_name::text), ''),
                TRIM(BOTH FROM l.branch_id::text)
            )
        )::text AS description,
        (
            'Occupancy is elevated — protect rate integrity, promote premium room types, and attach F&B experiences to lift RevPAR.'
        )::text AS opportunity_text,
        (
            138::numeric
            + COALESCE(l.occ_pct, 0::numeric) / 4::numeric
            + COALESCE(l.revenue_thb, 0)::numeric / 3000::numeric
        ) AS sort_score
    FROM latest l
    WHERE l.branch_type = 'accommodation'
      AND l.occ_pct IS NOT NULL
      AND l.occ_pct >= 68::numeric
      AND (l.revenue_delta_day IS NULL OR l.revenue_delta_day < 10::numeric)

    UNION ALL

    SELECT
        l.organization_id,
        l.branch_id,
        l.branch_name,
        l.metric_date,
        'Package weekend room + F&B'::text AS title,
        (
            'Branch: '
            || COALESCE(
                NULLIF(TRIM(BOTH FROM l.branch_name::text), ''),
                TRIM(BOTH FROM l.branch_id::text)
            )
        )::text AS description,
        (
            'Weekend nights show healthy occupancy — package premium room with F&B to capture willingness-to-pay.'
        )::text AS opportunity_text,
        (
            132::numeric
            + COALESCE(l.occ_pct, 0::numeric) / 5::numeric
        ) AS sort_score
    FROM latest l
    WHERE l.branch_type = 'accommodation'
      AND EXTRACT(ISODOW FROM l.metric_date::timestamp) >= 5
      AND l.occ_pct IS NOT NULL
      AND l.occ_pct >= 52::numeric
      AND (l.revenue_delta_day IS NULL OR l.revenue_delta_day < 10::numeric)
),
best_per_branch AS (
    SELECT DISTINCT ON (s.branch_id)
        s.organization_id,
        s.branch_id,
        s.branch_name,
        s.metric_date,
        s.title,
        s.description,
        s.opportunity_text,
        s.sort_score
    FROM signals s
    ORDER BY s.branch_id, s.sort_score DESC NULLS LAST, s.metric_date DESC NULLS LAST
)
SELECT
    b.organization_id,
    b.branch_id,
    b.branch_name,
    b.metric_date,
    b.title,
    b.description,
    b.opportunity_text,
    b.sort_score
FROM best_per_branch b;

COMMENT ON VIEW opportunities_today IS
    'One row per branch (best sort_score, then latest metric_date); title type-aware; description = Branch: {name}; opportunity_text = coaching detail.';

GRANT SELECT ON opportunities_today TO anon, authenticated;

-- STEP 6f — Watchlist (early warning, non-urgent downward trends)
-- One row per (branch_id, metric_date): best signal that day, else fallback for that date.
-- Signals from full trend on public.today_summary; module_type-aware titles; description = Branch: {name}.
CREATE OR REPLACE VIEW public.watchlist_today AS
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
    LEFT JOIN branches b ON b.id::text = TRIM(BOTH FROM t.branch_id::text)
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
                        / NULLIF(
                            GREATEST(ABS(x.rev_l2), ABS(x.rev_l1), ABS(x.total_revenue), 1::numeric),
                            0::numeric
                        )
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
        (
            'Branch: '
            || COALESCE(NULLIF(TRIM(BOTH FROM l.branch_name::text), ''), TRIM(BOTH FROM l.branch_id::text))
        )::text AS description,
        (58::numeric + l.rev_drop_depth * 19::numeric)::numeric AS sort_score,
        'Accommodation revenue slipped three days straight — revisit ADR, RevPAR, and occupancy levers.'::text
            AS watchlist_text
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
        (
            'Branch: '
            || COALESCE(NULLIF(TRIM(BOTH FROM l.branch_name::text), ''), TRIM(BOTH FROM l.branch_id::text))
        )::text AS description,
        (58::numeric + l.rev_drop_depth * 19::numeric)::numeric AS sort_score,
        'F&B revenue is down three running days — scan tickets, covers, and mix before discounting.'::text
            AS watchlist_text
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
        (
            'Branch: '
            || COALESCE(NULLIF(TRIM(BOTH FROM l.branch_name::text), ''), TRIM(BOTH FROM l.branch_id::text))
        )::text AS description,
        (58::numeric + l.rev_drop_depth * 19::numeric)::numeric AS sort_score,
        'Revenue has eased three consecutive days — confirm whether demand, price, or mix moved.'::text
            AS watchlist_text
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
        (
            'Branch: '
            || COALESCE(NULLIF(TRIM(BOTH FROM l.branch_name::text), ''), TRIM(BOTH FROM l.branch_id::text))
        )::text AS description,
        (52::numeric + l.room_drop_depth * 18::numeric)::numeric AS sort_score,
        'Sold rooms fell three days in a row — expect occupancy drag unless pickup or group pace improves.'::text
            AS watchlist_text
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
        (
            'Branch: '
            || COALESCE(NULLIF(TRIM(BOTH FROM l.branch_name::text), ''), TRIM(BOTH FROM l.branch_id::text))
        )::text AS description,
        (56::numeric + l.cust_drop_depth * 14::numeric)::numeric AS sort_score,
        'Covers or transactions cooled three straight days — traffic is softening ahead of revenue.'::text
            AS watchlist_text
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
        (
            'Branch: '
            || COALESCE(NULLIF(TRIM(BOTH FROM d.branch_name::text), ''), TRIM(BOTH FROM d.branch_id::text))
        )::text AS description,
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
-- SELECT * FROM public.whats_working_today ORDER BY sort_score DESC LIMIT 3;
-- SELECT * FROM opportunities_today WHERE organization_id = '...' ORDER BY branch_name;
-- SELECT * FROM watchlist_today WHERE organization_id = '...' ORDER BY branch_name;
