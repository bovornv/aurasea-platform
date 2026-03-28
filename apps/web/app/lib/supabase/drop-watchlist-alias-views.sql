-- Optional: remove legacy Watchlist alias views if they exist in your DB (app uses public.watchlist_today only).
-- Adjust names if your deployment used different suffixes.

DROP VIEW IF EXISTS public.watchlist_today_v_next;
DROP VIEW IF EXISTS public.watchlist_today__candidate;
