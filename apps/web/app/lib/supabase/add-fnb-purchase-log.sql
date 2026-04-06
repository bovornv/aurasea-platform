-- Migration: Add fnb_purchase_log table for tracking food and supply purchases
-- Prerequisites: public.branches, public.branch_members. Run after public.fnb_daily_metrics exists (last ALTER).
-- platform_admins is created below if missing (Supabase uses auth.users, not a legacy public.users table).

CREATE TABLE IF NOT EXISTS public.fnb_purchase_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  purchase_type text NOT NULL
    CHECK (purchase_type IN ('food_beverage', 'non_food_supplies')),
  amount integer NOT NULL CHECK (amount > 0),
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fnb_purchase_log_branch_date
  ON public.fnb_purchase_log(branch_id, purchase_date);

ALTER TABLE public.fnb_purchase_log ENABLE ROW LEVEL SECURITY;

-- Super-admin lookup (auth.users — not public.users). Safe if super-admin-rls.sql already ran.
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow branch members to SELECT their own branch purchases
DROP POLICY IF EXISTS "branch_members_select_fnb_purchase_log" ON public.fnb_purchase_log;
CREATE POLICY "branch_members_select_fnb_purchase_log"
  ON public.fnb_purchase_log FOR SELECT
  USING (
    branch_id IN (
      SELECT branch_id FROM public.branch_members WHERE user_id = auth.uid()
    )
  );

-- Allow branch members to INSERT purchases for their branches
DROP POLICY IF EXISTS "branch_members_insert_fnb_purchase_log" ON public.fnb_purchase_log;
CREATE POLICY "branch_members_insert_fnb_purchase_log"
  ON public.fnb_purchase_log FOR INSERT
  WITH CHECK (
    branch_id IN (
      SELECT branch_id FROM public.branch_members WHERE user_id = auth.uid()
    )
  );

-- Allow branch members to DELETE their own purchases
DROP POLICY IF EXISTS "branch_members_delete_fnb_purchase_log" ON public.fnb_purchase_log;
CREATE POLICY "branch_members_delete_fnb_purchase_log"
  ON public.fnb_purchase_log FOR DELETE
  USING (
    branch_id IN (
      SELECT branch_id FROM public.branch_members WHERE user_id = auth.uid()
    )
  );

-- Super admins can manage all rows (platform_admins + auth.uid — not legacy public.users)
DROP POLICY IF EXISTS "super_admin_all_fnb_purchase_log" ON public.fnb_purchase_log;
CREATE POLICY "super_admin_all_fnb_purchase_log"
  ON public.fnb_purchase_log FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
  );

GRANT SELECT, INSERT, DELETE ON public.fnb_purchase_log TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.fnb_purchase_log TO service_role;

-- Add other_cost_today to fnb_daily_metrics for one-off non-food costs logged in Enter Data
ALTER TABLE public.fnb_daily_metrics
  ADD COLUMN IF NOT EXISTS other_cost_today integer DEFAULT 0;
