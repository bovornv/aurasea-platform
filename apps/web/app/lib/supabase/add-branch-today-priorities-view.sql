-- Branch Today — core priorities list (single section)
-- GET /rest/v1/today_branch_priorities?select=*&branch_id=eq.{branch_id}&order=rank.asc&limit=3
-- Source: public.alerts_fix_this_first

DROP VIEW IF EXISTS public.today_branch_priorities CASCADE;

CREATE VIEW public.today_branch_priorities AS
SELECT
  f.branch_id::text AS branch_id,
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
FROM public.alerts_fix_this_first f
WHERE f.branch_id IS NOT NULL;

COMMENT ON VIEW public.today_branch_priorities IS
  'Branch priorities from alerts_fix_this_first; filter by branch_id; order rank ASC; limit 3.';

GRANT SELECT ON public.today_branch_priorities TO anon, authenticated;

-- Verify:
-- SELECT * FROM public.today_branch_priorities WHERE branch_id = '...' ORDER BY rank ASC LIMIT 3;
