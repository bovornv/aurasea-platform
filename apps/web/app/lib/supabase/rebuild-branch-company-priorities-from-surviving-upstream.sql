-- =============================================================================
-- Rebuild public.branch_priorities_current + public.company_priorities_current
-- =============================================================================
-- Prerequisites: run discover-priorities-upstream.sql and confirm which object exists.
--
-- This script does NOT assume today_priorities, priorities_engine, or priorities_ranked.
--
-- Upstream selection order (first match wins):
--   1) public.alerts_fix_this_first  (preferred — deduped actionable alerts)
--   2) public.alerts_enriched        (deduped per branch+alert_type in this script)
--
-- We do not target public.alerts_today automatically: legacy definitions lack
-- organization_id / recommended_action / alert_category. If your DB only has that
-- shape, run discover-priorities-upstream.sql and extend this DO block, or rebuild
-- alerts_enriched + alerts_fix_this_first from rebuild-alerts-enriched-engine.sql.
--
-- Behavior:
--   branch_priorities_current: latest metric_date per branch (from source), top 2 by sort
--   company_priorities_current: all org branches with priorities (up to 2 rows each), no org-wide cap
--
-- If none of the three exist, the DO block raises an exception — use discovery to find another
-- relation and adapt manually (do not guess here).
-- =============================================================================

DO $rebuild$
BEGIN
  -- Drop API views first (no CASCADE)
  DROP VIEW IF EXISTS public.company_priorities_current;
  DROP VIEW IF EXISTS public.branch_priorities_current;

  IF to_regclass('public.alerts_fix_this_first') IS NOT NULL THEN
    CREATE VIEW public.branch_priorities_current AS
    WITH src AS (
      SELECT
        COALESCE(f.organization_id, b.organization_id) AS organization_id,
        CASE
          WHEN trim(both FROM f.branch_id::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            trim(both FROM f.branch_id::text)::uuid
          ELSE NULL::uuid
        END AS branch_id,
        trim(both FROM f.branch_id::text) AS branch_id_text,
        COALESCE(
          NULLIF(trim(both FROM f.branch_name), ''),
          NULLIF(trim(both FROM b.branch_name::text), ''),
          NULLIF(trim(both FROM b.name::text), '')
        ) AS branch_name,
        CASE
          WHEN lower(COALESCE(f.alert_stream, '')) = 'fnb' THEN 'fnb'::text
          WHEN lower(COALESCE(f.alert_stream, '')) = 'accommodation' THEN 'accommodation'::text
          WHEN lower(COALESCE(f.branch_type, '')) IN ('fnb', 'restaurant', 'cafe', 'cafe_restaurant') THEN 'fnb'::text
          ELSE 'accommodation'::text
        END AS business_type,
        COALESCE(NULLIF(trim(both FROM f.alert_type), ''), 'priority'::text) AS alert_type,
        (
          COALESCE(
            NULLIF(
              initcap(replace(trim(both FROM COALESCE(f.alert_type, 'priority')), '_'::text, ' '::text)),
              ''
            ),
            'Priority'::text
          )
          || CASE
               WHEN NULLIF(trim(both FROM COALESCE(f.branch_name, b.branch_name::text, b.name::text, '')::text), '') IS NOT NULL THEN
                 ' — '::text || trim(both FROM COALESCE(f.branch_name, b.branch_name::text, b.name::text))
               ELSE ''::text
             END
        ) AS title,
        NULLIF(
          trim(
            both
            FROM
              CASE
                WHEN NULLIF(trim(both FROM f.cause), '') IS NOT NULL
                AND NULLIF(trim(both FROM f.recommended_action), '') IS NOT NULL THEN
                  trim(both FROM f.cause) || '. '::text || trim(both FROM f.recommended_action)
                WHEN NULLIF(trim(both FROM f.cause), '') IS NOT NULL THEN
                  trim(both FROM f.cause)
                WHEN NULLIF(trim(both FROM f.recommended_action), '') IS NOT NULL THEN
                  trim(both FROM f.recommended_action)
                ELSE ''::text
              END
          ),
          ''
        ) AS description,
        COALESCE(f.priority_score, 0::numeric) AS sort_score,
        f.metric_date::date AS metric_date,
        COALESCE(f.impact_estimate_thb, 0::numeric) AS impact_thb,
        COALESCE(f.impact_estimate_thb, 0::numeric) AS impact_estimate_thb,
        COALESCE(
          NULLIF(trim(both FROM f.recommended_action), ''),
          'Review action plan'::text
        ) AS action_text,
        initcap(replace(trim(both FROM COALESCE(f.alert_type, 'priority')), '_'::text, ' '::text)) AS short_title,
        CASE
          WHEN lower(COALESCE(f.alert_type, '')) LIKE '%opportunity%'
            OR lower(COALESCE(f.alert_stream, '')) LIKE '%opportunity%' THEN 'opportunity'::text
          ELSE 'at risk'::text
        END AS impact_label
      FROM public.alerts_fix_this_first f
      LEFT JOIN public.branches b ON trim(both FROM b.id::text) = trim(both FROM f.branch_id::text)
      WHERE f.branch_id IS NOT NULL
        AND trim(both FROM f.branch_id::text) <> ''
    ),
    latest AS (
      SELECT
        s.branch_id_text,
        MAX(s.metric_date) AS mx
      FROM src s
      GROUP BY s.branch_id_text
    ),
    scoped AS (
      SELECT s.*
      FROM src s
      INNER JOIN latest l ON s.branch_id_text = l.branch_id_text
        AND s.metric_date IS NOT DISTINCT FROM l.mx
    ),
    ranked AS (
      SELECT
        s.*,
        ROW_NUMBER() OVER (
          PARTITION BY s.branch_id_text
          ORDER BY
            s.sort_score DESC NULLS LAST,
            s.alert_type ASC
        )::integer AS rank
      FROM scoped s
    )
    SELECT
      r.organization_id,
      r.branch_id,
      r.branch_name,
      r.business_type,
      r.alert_type,
      r.title,
      r.description,
      r.sort_score,
      r.rank,
      r.impact_label,
      r.metric_date,
      r.impact_thb,
      r.short_title,
      r.action_text,
      r.impact_estimate_thb
    FROM ranked r
    WHERE r.rank <= 2
      AND r.branch_id IS NOT NULL;

    RAISE NOTICE 'branch_priorities_current: upstream = public.alerts_fix_this_first';

  ELSIF to_regclass('public.alerts_enriched') IS NOT NULL THEN
    CREATE VIEW public.branch_priorities_current AS
    WITH dedup AS (
      SELECT DISTINCT ON (trim(both FROM e.branch_id::text), e.alert_type)
        e.organization_id,
        trim(both FROM e.branch_id::text) AS branch_id_text,
        CASE
          WHEN trim(both FROM e.branch_id::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            trim(both FROM e.branch_id::text)::uuid
          ELSE NULL::uuid
        END AS branch_id,
        e.branch_name,
        e.metric_date::date AS metric_date,
        e.alert_type,
        e.cause,
        e.recommended_action,
        e.impact_estimate_thb,
        e.severity,
        e.alert_stream,
        e.branch_type,
        COALESCE(e.severity, 0)::numeric * 1000000::numeric + COALESCE(e.impact_estimate_thb, 0::numeric) AS sort_score
      FROM public.alerts_enriched e
      WHERE trim(both FROM e.branch_id::text) <> ''
        AND (
          e.alert_category IN ('problem', 'structural')
          OR COALESCE(e.severity, 0) >= 3
        )
      ORDER BY
        trim(both FROM e.branch_id::text),
        e.alert_type,
        e.severity DESC NULLS LAST,
        e.impact_estimate_thb DESC NULLS LAST,
        e.metric_date DESC NULLS LAST
    ),
    src AS (
      SELECT
        d.organization_id,
        d.branch_id,
        d.branch_id_text,
        COALESCE(
          NULLIF(trim(both FROM d.branch_name), ''),
          NULLIF(trim(both FROM b.branch_name::text), ''),
          NULLIF(trim(both FROM b.name::text), '')
        ) AS branch_name,
        CASE
          WHEN lower(COALESCE(d.alert_stream, '')) = 'fnb' THEN 'fnb'::text
          WHEN lower(COALESCE(d.alert_stream, '')) = 'accommodation' THEN 'accommodation'::text
          WHEN lower(COALESCE(d.branch_type, '')) IN ('fnb', 'restaurant', 'cafe', 'cafe_restaurant') THEN 'fnb'::text
          ELSE 'accommodation'::text
        END AS business_type,
        COALESCE(NULLIF(trim(both FROM d.alert_type), ''), 'priority'::text) AS alert_type,
        (
          COALESCE(
            NULLIF(
              initcap(replace(trim(both FROM COALESCE(d.alert_type, 'priority')), '_'::text, ' '::text)),
              ''
            ),
            'Priority'::text
          )
          || CASE
               WHEN NULLIF(trim(both FROM COALESCE(d.branch_name, b.branch_name::text, b.name::text, '')::text), '') IS NOT NULL THEN
                 ' — '::text || trim(both FROM COALESCE(d.branch_name, b.branch_name::text, b.name::text))
               ELSE ''::text
             END
        ) AS title,
        NULLIF(
          trim(
            both
            FROM
              CASE
                WHEN NULLIF(trim(both FROM d.cause), '') IS NOT NULL
                AND NULLIF(trim(both FROM d.recommended_action), '') IS NOT NULL THEN
                  trim(both FROM d.cause) || '. '::text || trim(both FROM d.recommended_action)
                WHEN NULLIF(trim(both FROM d.cause), '') IS NOT NULL THEN
                  trim(both FROM d.cause)
                WHEN NULLIF(trim(both FROM d.recommended_action), '') IS NOT NULL THEN
                  trim(both FROM d.recommended_action)
                ELSE ''::text
              END
          ),
          ''
        ) AS description,
        d.sort_score,
        d.metric_date,
        COALESCE(d.impact_estimate_thb, 0::numeric) AS impact_thb,
        COALESCE(d.impact_estimate_thb, 0::numeric) AS impact_estimate_thb,
        COALESCE(
          NULLIF(trim(both FROM d.recommended_action), ''),
          'Review action plan'::text
        ) AS action_text,
        initcap(replace(trim(both FROM COALESCE(d.alert_type, 'priority')), '_'::text, ' '::text)) AS short_title,
        CASE
          WHEN lower(COALESCE(d.alert_type, '')) LIKE '%opportunity%'
            OR lower(COALESCE(d.alert_stream, '')) LIKE '%opportunity%' THEN 'opportunity'::text
          ELSE 'at risk'::text
        END AS impact_label
      FROM dedup d
      LEFT JOIN public.branches b ON trim(both FROM b.id::text) = d.branch_id_text
      WHERE d.branch_id IS NOT NULL
    ),
    latest AS (
      SELECT
        s.branch_id_text,
        MAX(s.metric_date) AS mx
      FROM src s
      GROUP BY s.branch_id_text
    ),
    scoped AS (
      SELECT s.*
      FROM src s
      INNER JOIN latest l ON s.branch_id_text = l.branch_id_text
        AND s.metric_date IS NOT DISTINCT FROM l.mx
    ),
    ranked AS (
      SELECT
        s.*,
        ROW_NUMBER() OVER (
          PARTITION BY s.branch_id_text
          ORDER BY
            s.sort_score DESC NULLS LAST,
            s.alert_type ASC
        )::integer AS rank
      FROM scoped s
    )
    SELECT
      r.organization_id,
      r.branch_id,
      r.branch_name,
      r.business_type,
      r.alert_type,
      r.title,
      r.description,
      r.sort_score,
      r.rank,
      r.impact_label,
      r.metric_date,
      r.impact_thb,
      r.short_title,
      r.action_text,
      r.impact_estimate_thb
    FROM ranked r
    WHERE r.rank <= 2;

    RAISE NOTICE 'branch_priorities_current: upstream = public.alerts_enriched';

  ELSE
    RAISE EXCEPTION
      'No surviving upstream among public.alerts_fix_this_first, public.alerts_enriched. Run discover-priorities-upstream.sql; restore alerts pipeline from rebuild-alerts-enriched-engine.sql if needed.';
  END IF;

  CREATE VIEW public.company_priorities_current AS
  SELECT
    c.organization_id,
    c.branch_id,
    c.branch_name,
    c.business_type,
    c.alert_type,
    c.title,
    c.description,
    c.sort_score,
    c.rank,
    c.impact_label,
    c.metric_date,
    c.impact_thb,
    c.impact_estimate_thb,
    c.short_title,
    c.action_text,
    CASE
      WHEN c.rank = 1 THEN 'fix_first'::text
      WHEN c.rank = 2 THEN 'next_moves'::text
      ELSE 'more'::text
    END AS priority_segment
  FROM public.branch_priorities_current c
  WHERE c.organization_id IS NOT NULL;

  RAISE NOTICE 'company_priorities_current: derived from public.branch_priorities_current (all branches, up to 2 rows each)';

  EXECUTE 'COMMENT ON VIEW public.branch_priorities_current IS '
    || quote_literal(
      'Today branch priorities; upstream chosen at rebuild (alerts_fix_this_first or alerts_enriched). See rebuild-branch-company-priorities-from-surviving-upstream.sql.'
    );
  EXECUTE 'COMMENT ON VIEW public.company_priorities_current IS '
    || quote_literal(
      'Today company priorities; from branch_priorities_current; all branches with rows, up to 2 per branch.'
    );

  GRANT SELECT ON public.branch_priorities_current TO anon, authenticated;
  GRANT SELECT ON public.company_priorities_current TO anon, authenticated;

END
$rebuild$;

-- =============================================================================
-- Verification
-- =============================================================================
-- SELECT COUNT(*) FROM public.branch_priorities_current;
-- SELECT COUNT(*) FROM public.company_priorities_current;
--
-- At most 2 rows per branch (branch view):
--   SELECT branch_id, count(*) FROM public.branch_priorities_current GROUP BY branch_id HAVING count(*) > 2;
--
-- Per-org branch coverage (compare to branches table):
--   SELECT b.organization_id, count(DISTINCT b.id) AS branches_in_org,
--          count(DISTINCT c.branch_id) AS branches_with_priorities
--   FROM public.branches b
--   LEFT JOIN public.company_priorities_current c
--     ON c.organization_id = b.organization_id AND c.branch_id = b.id
--   WHERE b.organization_id IS NOT NULL
--   GROUP BY b.organization_id;
