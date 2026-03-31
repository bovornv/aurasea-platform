-- Company Today priorities API: public.company_priorities_current
-- App reads this relation (see today-priorities-service.fetchCompanyTodayPriorities).
-- If you already maintain a richer rollup, replace the body but keep column names compatible
-- with public.today_priorities_company_view (organization_id, branch_id, title, description, rank, …).
--
-- Default: thin alias to the existing company priorities view from fix-today-priorities-stable-schema.sql

CREATE OR REPLACE VIEW public.company_priorities_current AS
SELECT *
FROM public.today_priorities_company_view;

COMMENT ON VIEW public.company_priorities_current IS
  'Company Today priorities; same rows/columns as today_priorities_company_view unless customized.';

GRANT SELECT ON public.company_priorities_current TO anon, authenticated;
