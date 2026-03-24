-- =============================================================================
-- Fix PostgREST 400 on /rest/v1/today_priorities_clean
-- (filter organization_id=eq.* or order=rank.asc fails if columns missing)
-- Use DROP + CREATE only — never CREATE OR REPLACE VIEW (PG cannot drop columns via REPLACE).
-- =============================================================================
-- STEP 1
DROP VIEW IF EXISTS public.today_priorities_clean CASCADE;

-- STEP 2 — organization_id from alerts row, else branches.organization_id; sort_score = priority_score
-- rank = 1..n per org (1 = highest priority); GET order=rank.asc&limit=3
CREATE VIEW public.today_priorities_clean AS
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
  ranked.rank
FROM (
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
    f.priority_score AS sort_score,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(f.organization_id, b.organization_id)
      ORDER BY f.priority_score DESC NULLS LAST, f.branch_id::text, COALESCE(f.alert_type, ''::text)
    )::integer AS rank
  FROM public.alerts_fix_this_first f
  LEFT JOIN public.branches b ON b.id::text = TRIM(BOTH FROM f.branch_id::text)
) ranked
WHERE ranked.organization_id IS NOT NULL;

COMMENT ON VIEW public.today_priorities_clean IS
  'Company Today: organization_id, rank (1=top), sort_score; GET filter organization_id, order=rank.asc, limit=3.';

GRANT SELECT ON public.today_priorities_clean TO anon, authenticated;

-- STEP 3 verify:
-- SELECT * FROM public.today_priorities_clean LIMIT 5;
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'today_priorities_clean'
--   ORDER BY ordinal_position;
