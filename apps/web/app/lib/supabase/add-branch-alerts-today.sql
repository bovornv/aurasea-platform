-- branch_alerts_today — Branch Today “What needs attention” (PostgREST)
-- Same rows as alerts_today; filter with branch_id=eq.{id}. No current_date in the view — latest rows come from underlying metrics.
--
-- Requires: public.alerts_today (run rebuild-alerts-enriched-engine.sql first).
--
-- DROP + CREATE (not OR REPLACE): Postgres forbids OR REPLACE when column names/order differ from the old view.

DROP VIEW IF EXISTS public.branch_alerts_today CASCADE;

CREATE VIEW public.branch_alerts_today AS
SELECT * FROM public.alerts_today;

COMMENT ON VIEW public.branch_alerts_today IS
  'Passthrough of alerts_today for /rest/v1/branch_alerts_today; eq(branch_id) in the client.';

GRANT SELECT ON public.branch_alerts_today TO anon, authenticated;
