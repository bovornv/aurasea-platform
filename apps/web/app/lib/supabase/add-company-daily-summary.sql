-- company_daily_summary — org-level AI / batch copy for Company Today
-- App: fetchCompanyDailySummary → select *, eq(organization_id), order(updated_at desc), limit 1
--
-- Fixes PostgREST 404 when the relation does not exist.
-- Requires: public.organizations(id), organization_members, branches, branch_members (same as org RLS patterns).
--
-- If this name was a VIEW/MATVIEW, drop it so we can use a TABLE. If it is already a TABLE, keep it
-- (DROP VIEW errors when the relation is a table — Postgres requires the right DROP kind).

DO $$
DECLARE
  rk "char";
BEGIN
  SELECT c.relkind INTO rk
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'company_daily_summary';

  IF rk = 'v' THEN
    EXECUTE 'DROP VIEW public.company_daily_summary CASCADE';
  ELSIF rk = 'm' THEN
    EXECUTE 'DROP MATERIALIZED VIEW public.company_daily_summary CASCADE';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.company_daily_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL DEFAULT '',
  summary_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_daily_summary_org_updated
  ON public.company_daily_summary (organization_id, updated_at DESC);

COMMENT ON TABLE public.company_daily_summary IS
  'Latest org-level daily narrative; app reads newest row per organization_id.';

-- Keep updated_at fresh on UPDATE (optional for batch upserts)
CREATE OR REPLACE FUNCTION public.touch_company_daily_summary_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_company_daily_summary_updated_at ON public.company_daily_summary;
CREATE TRIGGER tr_company_daily_summary_updated_at
  BEFORE UPDATE ON public.company_daily_summary
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_company_daily_summary_updated_at();

ALTER TABLE public.company_daily_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_daily_summary_select_members ON public.company_daily_summary;
CREATE POLICY company_daily_summary_select_members
  ON public.company_daily_summary
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = company_daily_summary.organization_id
        AND om.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.branches b
      INNER JOIN public.branch_members bm
        ON bm.branch_id = b.id
       AND bm.user_id = auth.uid()
      WHERE b.organization_id = company_daily_summary.organization_id
    )
  );

GRANT SELECT ON public.company_daily_summary TO authenticated;
GRANT SELECT ON public.company_daily_summary TO anon;
