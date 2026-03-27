-- Remove legacy What’s Working alias views (app uses public.whats_working_today only).
-- No new objects; safe when nothing depends on these views.
-- Order: child first (v_next references candidate).

DROP VIEW IF EXISTS public.whats_working_today_v_next;
DROP VIEW IF EXISTS public.whats_working_today__candidate;
