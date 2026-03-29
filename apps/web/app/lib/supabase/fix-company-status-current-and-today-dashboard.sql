-- Restore public.company_status_current (DROP + CREATE) and public.today_company_dashboard.
-- Fixes CREATE OR REPLACE when column order/types drift (42P16 rename errors).
-- company_status_current: latest today_summary row per branch + branches.organization_id / branch_name.
-- today_company_dashboard: same panel JSON contract as restore-today-company-dashboard-after-rebuild.sql.

DROP VIEW IF EXISTS public.today_company_dashboard CASCADE;
DROP VIEW IF EXISTS public.company_status_current CASCADE;

CREATE VIEW public.company_status_current AS
WITH j AS (
    SELECT
        t.branch_id,
        t.metric_date::date AS metric_date,
        row_to_json(t)::jsonb AS jb
    FROM public.today_summary t
    INNER JOIN public.branches br ON trim(both FROM br.id::text) = trim(both FROM t.branch_id::text)
    WHERE br.organization_id IS NOT NULL
),
x AS (
    SELECT
        br.organization_id::uuid AS organization_id,
        j.branch_id::uuid AS branch_id,
        COALESCE(NULLIF(TRIM(BOTH FROM br.branch_name::text), ''), NULLIF(TRIM(BOTH FROM br.name::text), ''))::text
            AS branch_name,
        CASE
            WHEN LOWER(COALESCE(br.module_type::text, TRIM(j.jb->>'module_type'), '')) IN (
                'fnb', 'restaurant', 'cafe', 'cafe_restaurant'
            ) THEN 'fnb'::text
            ELSE 'accommodation'::text
        END AS business_type,
        j.metric_date,
        COALESCE(
            NULLIF(TRIM(j.jb->>'health_score'), '')::numeric,
            CASE
                WHEN (j.jb->>'revenue_delta_day') IS NULL
                    OR btrim(COALESCE(j.jb->>'revenue_delta_day', '')) = ''
                THEN 70::numeric
                WHEN NULLIF(TRIM(j.jb->>'revenue_delta_day'), '')::numeric >= 0 THEN 76::numeric
                ELSE 58::numeric
            END
        ) AS health_score,
        COALESCE(
            NULLIF(TRIM(j.jb->>'total_revenue'), '')::numeric,
            NULLIF(TRIM(j.jb->>'revenue'), '')::numeric,
            NULLIF(TRIM(j.jb->>'total_revenue_thb'), '')::numeric,
            NULLIF(TRIM(j.jb->>'revenue_thb'), '')::numeric
        ) AS revenue_thb,
        COALESCE(
            NULLIF(TRIM(j.jb->>'occupancy_rate'), '')::numeric,
            NULLIF(TRIM(j.jb->>'occupancy_pct'), '')::numeric,
            CASE
                WHEN NULLIF(TRIM(COALESCE(j.jb->>'rooms_available', j.jb->>'capacity', '')), '')::numeric > 0::numeric
                THEN (
                    COALESCE(
                        NULLIF(TRIM(COALESCE(j.jb->>'utilized', j.jb->>'rooms_sold', '')), '')::numeric,
                        0::numeric
                    )
                    / NULLIF(TRIM(COALESCE(j.jb->>'rooms_available', j.jb->>'capacity', '')), '')::numeric
                ) * 100::numeric
                ELSE NULL::numeric
            END
        ) AS occupancy_pct,
        COALESCE(
            NULLIF(TRIM(j.jb->>'adr'), '')::numeric,
            CASE
                WHEN COALESCE(
                    NULLIF(TRIM(j.jb->>'utilized'), '')::numeric,
                    NULLIF(TRIM(j.jb->>'rooms_sold'), '')::numeric,
                    0::numeric
                ) > 0::numeric
                THEN
                    COALESCE(
                        NULLIF(TRIM(j.jb->>'total_revenue'), '')::numeric,
                        NULLIF(TRIM(j.jb->>'revenue'), '')::numeric,
                        0::numeric
                    )
                    / NULLIF(
                        COALESCE(
                            NULLIF(TRIM(j.jb->>'utilized'), '')::numeric,
                            NULLIF(TRIM(j.jb->>'rooms_sold'), '')::numeric,
                            0::numeric
                        ),
                        0::numeric
                    )
                ELSE NULL::numeric
            END
        ) AS adr_thb,
        COALESCE(
            NULLIF(TRIM(j.jb->>'revpar'), '')::numeric,
            CASE
                WHEN NULLIF(TRIM(COALESCE(j.jb->>'rooms_available', j.jb->>'capacity', '')), '')::numeric > 0::numeric
                THEN
                    COALESCE(
                        NULLIF(TRIM(j.jb->>'total_revenue'), '')::numeric,
                        NULLIF(TRIM(j.jb->>'revenue'), '')::numeric,
                        0::numeric
                    )
                    / NULLIF(
                        TRIM(COALESCE(j.jb->>'rooms_available', j.jb->>'capacity', ''))::numeric,
                        0::numeric
                    )
                ELSE NULL::numeric
            END
        ) AS revpar_thb,
        CASE
            WHEN LOWER(COALESCE(br.module_type::text, TRIM(j.jb->>'module_type'), '')) IN (
                'fnb', 'restaurant', 'cafe', 'cafe_restaurant'
            ) THEN NULL::text
            WHEN NULLIF(TRIM(COALESCE(
                j.jb->>'profitability_trend',
                j.jb->>'profit_trend',
                j.jb->>'profit_margin_trend',
                ''
            )), '') IS NULL THEN NULL::text
            WHEN LOWER(TRIM(COALESCE(
                j.jb->>'profitability_trend',
                j.jb->>'profit_trend',
                j.jb->>'profit_margin_trend',
                ''
            ))) = ANY (
                ARRAY['up', 'rising', 'positive', 'improving', 'higher', 'gain', '↑']::text[]
            ) THEN '↑'::text
            WHEN LOWER(TRIM(COALESCE(
                j.jb->>'profitability_trend',
                j.jb->>'profit_trend',
                j.jb->>'profit_margin_trend',
                ''
            ))) = ANY (
                ARRAY['down', 'falling', 'negative', 'declining', 'lower', 'loss', '↓']::text[]
            ) THEN '↓'::text
            WHEN LOWER(TRIM(COALESCE(
                j.jb->>'profitability_trend',
                j.jb->>'profit_trend',
                j.jb->>'profit_margin_trend',
                ''
            ))) = ANY (
                ARRAY[
                    'flat', 'neutral', 'stable', 'unchanged', 'steady', 'sideways', '→', 'hold', 'same'
                ]::text[]
            ) THEN '→'::text
            ELSE LEFT(TRIM(COALESCE(
                j.jb->>'profitability_trend',
                j.jb->>'profit_trend',
                j.jb->>'profit_margin_trend',
                ''
            )), 8)
        END AS profitability_symbol,
        COALESCE(
            NULLIF(TRIM(j.jb->>'customers'), '')::numeric,
            NULLIF(TRIM(j.jb->>'total_customers'), '')::numeric
        ) AS customers,
        COALESCE(NULLIF(TRIM(j.jb->>'avg_ticket'), '')::numeric, NULL::numeric) AS avg_ticket_thb,
        COALESCE(
            NULLIF(TRIM(j.jb->>'avg_daily_cost'), '')::numeric,
            NULLIF(TRIM(j.jb->>'additional_cost_today'), '')::numeric
        ) AS avg_cost_thb,
        CASE
            WHEN LOWER(COALESCE(br.module_type::text, TRIM(j.jb->>'module_type'), '')) NOT IN (
                'fnb', 'restaurant', 'cafe', 'cafe_restaurant'
            ) THEN NULL::text
            WHEN NULLIF(TRIM(COALESCE(j.jb->>'margin_trend', j.jb->>'margin_direction', '')), '') IS NULL
            THEN NULL::text
            WHEN LOWER(TRIM(COALESCE(j.jb->>'margin_trend', j.jb->>'margin_direction', ''))) = ANY (
                ARRAY['up', 'rising', 'positive', 'improving', 'higher', 'gain', '↑']::text[]
            ) THEN '↑'::text
            WHEN LOWER(TRIM(COALESCE(j.jb->>'margin_trend', j.jb->>'margin_direction', ''))) = ANY (
                ARRAY['down', 'falling', 'negative', 'declining', 'lower', 'loss', '↓']::text[]
            ) THEN '↓'::text
            WHEN LOWER(TRIM(COALESCE(j.jb->>'margin_trend', j.jb->>'margin_direction', ''))) = ANY (
                ARRAY[
                    'flat', 'neutral', 'stable', 'unchanged', 'steady', 'sideways', '→', 'hold', 'same'
                ]::text[]
            ) THEN '→'::text
            ELSE LEFT(TRIM(COALESCE(j.jb->>'margin_trend', j.jb->>'margin_direction', '')), 8)
        END AS margin_symbol
    FROM j
    INNER JOIN public.branches br ON trim(both FROM br.id::text) = trim(both FROM j.branch_id::text)
)
SELECT DISTINCT ON (x.branch_id)
    x.organization_id,
    x.branch_id,
    x.branch_name,
    x.business_type,
    x.metric_date,
    x.health_score,
    x.revenue_thb,
    CASE
        WHEN x.business_type = 'fnb' THEN NULL::numeric
        ELSE x.occupancy_pct
    END AS occupancy_pct,
    CASE
        WHEN x.business_type = 'fnb' THEN NULL::numeric
        ELSE x.adr_thb
    END AS adr_thb,
    CASE
        WHEN x.business_type = 'fnb' THEN NULL::numeric
        ELSE x.revpar_thb
    END AS revpar_thb,
    CASE
        WHEN x.business_type = 'fnb' THEN NULL::text
        ELSE x.profitability_symbol
    END AS profitability_symbol,
    CASE
        WHEN x.business_type = 'fnb' THEN x.customers
        ELSE NULL::numeric
    END AS customers,
    CASE
        WHEN x.business_type = 'fnb' THEN x.avg_ticket_thb
        ELSE NULL::numeric
    END AS avg_ticket_thb,
    CASE
        WHEN x.business_type = 'fnb' THEN x.avg_cost_thb
        ELSE NULL::numeric
    END AS avg_cost_thb,
    CASE
        WHEN x.business_type = 'fnb' THEN x.margin_symbol
        ELSE NULL::text
    END AS margin_symbol
FROM x
ORDER BY x.branch_id, x.metric_date DESC NULLS LAST;

COMMENT ON VIEW public.company_status_current IS
    'Latest public.today_summary row per branch (join public.branches); columns aligned with company_status_current REST contract.';

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
    'Company Today payload JSON per org; depends on panel views + company_data_confidence. company_status_current is separate REST source.';

GRANT SELECT ON public.today_company_dashboard TO anon, authenticated;
