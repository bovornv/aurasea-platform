-- Point public.today_summary_clean at public.today_summary_clean_v_next (same column contract).
-- Prerequisites: public.today_summary_clean_v_next exists and column list/order matches consumers of today_summary_clean.
-- Does NOT drop public.today_summary (legacy / direct consumers may still depend on it).
--
-- Apply after v_next is deployed. Uses OR REPLACE so existing dependents of today_summary_clean are preserved.

CREATE OR REPLACE VIEW public.today_summary_clean AS
SELECT * FROM public.today_summary_clean_v_next;

COMMENT ON VIEW public.today_summary_clean IS
  'Passthrough to public.today_summary_clean_v_next; stable API name for objects still reading today_summary_clean (e.g. alerts_enriched).';

GRANT SELECT ON public.today_summary_clean TO anon, authenticated;
