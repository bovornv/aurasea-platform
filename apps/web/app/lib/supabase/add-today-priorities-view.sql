-- today_priorities — Company Today "Today's Priorities" (one section; no duplication)
-- GET /rest/v1/today_priorities?select=*&order=sort_score.desc&limit=5&organization_id=eq.{uuid}
-- Source: alerts_fix_this_first only.
DROP VIEW IF EXISTS today_action_plan CASCADE;
DROP VIEW IF EXISTS today_priorities CASCADE;

CREATE VIEW today_priorities AS
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
  'Company Today: priorities; order by sort_score DESC.';

GRANT SELECT ON today_priorities TO anon, authenticated;

-- Clean feed for redesigned UI (numbered “what to do” + cards)
-- DROP + CREATE only (not OR REPLACE) when column set changes.
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
  'organization_id, rank (1=top); order rank.asc, limit 3; branch in short_title.';

GRANT SELECT ON today_priorities_clean TO anon, authenticated;

-- Stable shape for app/API use: keep legacy column order, append business_type at end.
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
      WHEN COALESCE(NULLIF(TRIM(BOTH FROM c.branch_name), ''), b.name, '') ILIKE '%cafe%' THEN 'fnb'::text
      ELSE 'accommodation'::text
    END
  ) AS business_type
FROM today_priorities_clean c
LEFT JOIN branches b ON b.id::text = TRIM(BOTH FROM c.branch_id::text);

COMMENT ON VIEW today_priorities_view IS
  'Schema-stable priorities view: existing columns in order + business_type appended last.';

GRANT SELECT ON today_priorities_view TO anon, authenticated;
