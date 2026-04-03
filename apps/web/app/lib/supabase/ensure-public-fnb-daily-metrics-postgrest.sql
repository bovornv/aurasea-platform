-- =============================================================================
-- Ensure public.fnb_daily_metrics exists for PostgREST (Crystal Cafe / Enter Data)
-- =============================================================================
-- Fixes: GET/POST /rest/v1/fnb_daily_metrics → 404 (relation not exposed / missing).
--
-- Delivers:
--   - Table with branch_id, metric_date, revenue, total_customers, top3_menu_revenue,
--     additional_cost_today (+ optional staff_count, promo_spend, monthly_fixed_cost)
--   - UNIQUE (branch_id, metric_date) for upsert: on_conflict=branch_id,metric_date
--   - GRANTs for anon + authenticated (Supabase PostgREST)
--   - RLS policies aligned with branch_members (same pattern as accommodation_daily_metrics)
--   - NOTIFY pgrst, 'reload schema'
--
-- Safe to run multiple times (idempotent).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Create modern table if missing (e.g. after migration-unify-daily-metrics dropped it)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fnb_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id text NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  revenue numeric NOT NULL DEFAULT 0,
  total_customers integer NOT NULL DEFAULT 0,
  top3_menu_revenue numeric NULL,
  additional_cost_today numeric NOT NULL DEFAULT 0,
  staff_count integer NULL,
  promo_spend numeric NULL,
  monthly_fixed_cost numeric NULL,
  created_at timestamptz DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2) Legacy alignment: rename date → metric_date; add missing app columns; relax old NOT NULLs
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.fnb_daily_metrics') IS NULL THEN
    RETURN;
  END IF;

  -- metric_date from legacy "date"
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fnb_daily_metrics' AND column_name = 'date'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fnb_daily_metrics' AND column_name = 'metric_date'
  ) THEN
    ALTER TABLE public.fnb_daily_metrics RENAME COLUMN date TO metric_date;
  END IF;

  ALTER TABLE public.fnb_daily_metrics ADD COLUMN IF NOT EXISTS metric_date date;
  ALTER TABLE public.fnb_daily_metrics ADD COLUMN IF NOT EXISTS revenue numeric;
  ALTER TABLE public.fnb_daily_metrics ADD COLUMN IF NOT EXISTS total_customers integer;
  ALTER TABLE public.fnb_daily_metrics ADD COLUMN IF NOT EXISTS top3_menu_revenue numeric;
  ALTER TABLE public.fnb_daily_metrics ADD COLUMN IF NOT EXISTS additional_cost_today numeric;
  ALTER TABLE public.fnb_daily_metrics ADD COLUMN IF NOT EXISTS staff_count integer;
  ALTER TABLE public.fnb_daily_metrics ADD COLUMN IF NOT EXISTS promo_spend numeric;
  ALTER TABLE public.fnb_daily_metrics ADD COLUMN IF NOT EXISTS monthly_fixed_cost numeric;
  ALTER TABLE public.fnb_daily_metrics ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

  -- Backfill revenue from legacy total_sales
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fnb_daily_metrics' AND column_name = 'total_sales'
  ) THEN
    UPDATE public.fnb_daily_metrics
    SET revenue = COALESCE(revenue, total_sales, 0)
    WHERE revenue IS NULL;
  END IF;

  UPDATE public.fnb_daily_metrics SET revenue = 0 WHERE revenue IS NULL;
  ALTER TABLE public.fnb_daily_metrics ALTER COLUMN revenue SET DEFAULT 0;
  ALTER TABLE public.fnb_daily_metrics ALTER COLUMN revenue SET NOT NULL;

  UPDATE public.fnb_daily_metrics SET total_customers = 0 WHERE total_customers IS NULL;
  ALTER TABLE public.fnb_daily_metrics ALTER COLUMN total_customers SET DEFAULT 0;
  ALTER TABLE public.fnb_daily_metrics ALTER COLUMN total_customers SET NOT NULL;

  UPDATE public.fnb_daily_metrics SET additional_cost_today = 0 WHERE additional_cost_today IS NULL;
  ALTER TABLE public.fnb_daily_metrics ALTER COLUMN additional_cost_today SET DEFAULT 0;
  ALTER TABLE public.fnb_daily_metrics ALTER COLUMN additional_cost_today SET NOT NULL;

  -- App upsert does not send legacy required columns — allow NULL / defaults
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fnb_daily_metrics' AND column_name = 'cash_balance'
  ) THEN
    ALTER TABLE public.fnb_daily_metrics ALTER COLUMN cash_balance DROP NOT NULL;
    UPDATE public.fnb_daily_metrics SET cash_balance = COALESCE(cash_balance, 0) WHERE cash_balance IS NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fnb_daily_metrics' AND column_name = 'total_operating_cost'
  ) THEN
    ALTER TABLE public.fnb_daily_metrics ALTER COLUMN total_operating_cost DROP NOT NULL;
    UPDATE public.fnb_daily_metrics SET total_operating_cost = COALESCE(total_operating_cost, 0) WHERE total_operating_cost IS NULL;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3) Unique index for PostgREST upsert (on_conflict=branch_id,metric_date)
--     Legacy tables may already have UNIQUE (branch_id, date) → renamed to metric_date; then this IF NOT EXISTS is a no-op by name only.
--     If duplicate (branch_id, metric_date) rows exist, fix data before running.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS fnb_daily_metrics_branch_metric_date_uidx
  ON public.fnb_daily_metrics (branch_id, metric_date);

CREATE INDEX IF NOT EXISTS idx_fnb_daily_metrics_branch_id ON public.fnb_daily_metrics (branch_id);
CREATE INDEX IF NOT EXISTS idx_fnb_daily_metrics_metric_date ON public.fnb_daily_metrics (metric_date DESC);

-- -----------------------------------------------------------------------------
-- 4) Drop permissive legacy policies (from early migrations)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read their organization's fnb daily metrics" ON public.fnb_daily_metrics;
DROP POLICY IF EXISTS "Users can insert their organization's fnb daily metrics" ON public.fnb_daily_metrics;
DROP POLICY IF EXISTS "Users can update their organization's fnb daily metrics" ON public.fnb_daily_metrics;
DROP POLICY IF EXISTS "Users can delete their organization's fnb daily metrics" ON public.fnb_daily_metrics;

-- -----------------------------------------------------------------------------
-- 5) RLS — branch_members (requires public.branch_members)
-- -----------------------------------------------------------------------------
ALTER TABLE public.fnb_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_insert_fnb_branch_members" ON public.fnb_daily_metrics;
DROP POLICY IF EXISTS "allow_select_fnb_branch_members" ON public.fnb_daily_metrics;
DROP POLICY IF EXISTS "allow_update_fnb_branch_members" ON public.fnb_daily_metrics;

CREATE POLICY "allow_insert_fnb_branch_members"
ON public.fnb_daily_metrics
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.branch_members
    WHERE branch_members.branch_id = fnb_daily_metrics.branch_id
      AND branch_members.user_id = auth.uid()
      AND branch_members.role IN ('owner', 'manager', 'staff')
  )
);

CREATE POLICY "allow_select_fnb_branch_members"
ON public.fnb_daily_metrics
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.branch_members
    WHERE branch_members.branch_id = fnb_daily_metrics.branch_id
      AND branch_members.user_id = auth.uid()
  )
);

CREATE POLICY "allow_update_fnb_branch_members"
ON public.fnb_daily_metrics
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.branch_members
    WHERE branch_members.branch_id = fnb_daily_metrics.branch_id
      AND branch_members.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.branch_members
    WHERE branch_members.branch_id = fnb_daily_metrics.branch_id
      AND branch_members.user_id = auth.uid()
      AND branch_members.role IN ('owner', 'manager', 'staff')
  )
);

-- -----------------------------------------------------------------------------
-- 6) Grants — PostgREST roles
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fnb_daily_metrics TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fnb_daily_metrics TO service_role;

-- -----------------------------------------------------------------------------
-- 7) Refresh PostgREST schema cache
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE public.fnb_daily_metrics IS
  'F&B daily entry; upsert key (branch_id, metric_date). App maps customers→total_customers, top3 menu revenue→top3_menu_revenue.';

-- =============================================================================
-- Verification (manual)
-- =============================================================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'fnb_daily_metrics'
-- ORDER BY ordinal_position;
--
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'fnb_daily_metrics';
--
-- Test upsert (replace branch id):
-- INSERT INTO public.fnb_daily_metrics (branch_id, metric_date, revenue, total_customers, additional_cost_today)
-- VALUES ('YOUR_BRANCH_ID', CURRENT_DATE, 1000, 10, 0)
-- ON CONFLICT (branch_id, metric_date) DO UPDATE SET revenue = EXCLUDED.revenue, total_customers = EXCLUDED.total_customers;
