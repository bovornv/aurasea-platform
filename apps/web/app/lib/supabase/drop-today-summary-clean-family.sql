-- =============================================================================
-- Drop obsolete today_summary clean / candidate objects (single-source: today_summary)
-- =============================================================================
-- Apply ONLY after:
--   1) public.today_summary is the unified merged view (add-today-summary-view.sql).
--   2) Dependents rebuilt: rebuild-alerts-enriched-engine.sql (alerts_enriched uses today_summary).
--   3) public.today_priorities_ranked recreated via fix-today-priorities-stable-schema.sql.
--   4) Optional: add-aurasea-core-compatibility-views.sql (accommodation_health_today, etc.).
--
-- Verification (expect 0 rows each):
--   SELECT * FROM pg_depend d
--   JOIN pg_class c ON c.oid = d.refobjid
--   WHERE c.relname IN (
--     'today_summary_clean','today_summary_clean_v_next','today_summary__candidate',
--     'today_summary__from_daily_metrics_candidate','today_summary_clean__from_daily_metrics_candidate',
--     'today_summary_clean_dependents'
--   );
--
--   SELECT proname, pg_get_functiondef(oid) FROM pg_proc WHERE pg_get_functiondef(oid) ILIKE '%today_summary_clean%';
-- =============================================================================

DROP VIEW IF EXISTS public.today_summary_clean CASCADE;
DROP VIEW IF EXISTS public.today_summary_clean_dependents CASCADE;
DROP VIEW IF EXISTS public.today_summary_clean__from_daily_metrics_candidate CASCADE;
DROP VIEW IF EXISTS public.today_summary_clean_v_next CASCADE;
DROP VIEW IF EXISTS public.today_summary__candidate CASCADE;
DROP VIEW IF EXISTS public.today_summary__from_daily_metrics_candidate CASCADE;

-- =============================================================================
-- Verification checklist (manual)
-- =============================================================================
-- [ ] today_summary columns include: revenue, total_revenue, accommodation_revenue, fnb_revenue,
--     revenue_delta_day, occupancy_delta_week, accommodation_revenue_delta_day, fnb_revenue_delta_day,
--     customers, rooms_sold, rooms_available, utilized, capacity, health_score, adr, revpar, avg_ticket
-- [ ] SELECT * FROM pg_views WHERE definition ILIKE '%today_summary_clean%' AND schemaname='public'; → 0 rows
-- [ ] SELECT * FROM pg_views WHERE definition ILIKE '%today_summary_clean_v_next%'; → 0 rows
-- [ ] \dv public.today_summary__* public.today_summary_clean* → only today_summary remains
-- [ ] Repo grep: no app code references dropped object names
-- =============================================================================
