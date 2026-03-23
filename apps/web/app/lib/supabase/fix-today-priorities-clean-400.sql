-- =============================================================================
-- Fix PostgREST 400 on /rest/v1/today_priorities_clean
-- (filter organization_id=eq.* or order=sort_score.desc fails if columns missing)
-- =============================================================================
-- STEP 1
DROP VIEW IF EXISTS public.today_priorities_clean CASCADE;

-- STEP 2 — organization_id from alerts row, else branches.organization_id; sort_score = priority_score
CREATE VIEW public.today_priorities_clean AS
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
FROM public.alerts_fix_this_first f
LEFT JOIN public.branches b ON b.id::text = TRIM(BOTH FROM f.branch_id::text);

COMMENT ON VIEW public.today_priorities_clean IS
  'Company Today: includes organization_id + sort_score for PostgREST; sort_score aliases alerts_fix_this_first.priority_score.';

GRANT SELECT ON public.today_priorities_clean TO anon, authenticated;

-- STEP 3 verify:
-- SELECT * FROM public.today_priorities_clean LIMIT 5;
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'today_priorities_clean'
--   ORDER BY ordinal_position;
