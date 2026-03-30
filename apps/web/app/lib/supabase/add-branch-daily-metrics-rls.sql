-- =============================================================================
-- RLS + grants for public.branch_daily_metrics (canonical read model)
-- =============================================================================
-- Run after public.branch_daily_metrics exists. Mirrors rbac-schema.sql policies
-- that were on public.daily_metrics (SELECT only — view is not written via PostgREST).
--
-- If the view already uses security_invoker and base tables enforce RLS, you may
-- omit this file; use it when branch_daily_metrics must stand alone for PostgREST.
-- =============================================================================

GRANT SELECT ON public.branch_daily_metrics TO anon, authenticated;

ALTER VIEW public.branch_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read accessible branch daily metrics" ON public.branch_daily_metrics;
CREATE POLICY "Users can read accessible branch daily metrics"
  ON public.branch_daily_metrics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = branch_daily_metrics.branch_id
      AND (
        EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.organization_id = b.organization_id
          AND om.user_id = auth.uid()
        )
        OR
        EXISTS (
          SELECT 1 FROM public.branch_members bm
          WHERE bm.branch_id = b.id
          AND bm.user_id = auth.uid()
        )
      )
    )
  );
