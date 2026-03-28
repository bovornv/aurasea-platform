-- Optional: remove legacy unused view (app reads public.opportunities_today only).
DROP VIEW IF EXISTS public.opportunity_alerts CASCADE;
