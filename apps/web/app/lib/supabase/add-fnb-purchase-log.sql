-- Migration: Add fnb_purchase_log table for tracking food and supply purchases
-- Run after fnb_daily_metrics already exists.

CREATE TABLE IF NOT EXISTS fnb_purchase_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  purchase_type text NOT NULL
    CHECK (purchase_type IN ('food_beverage', 'non_food_supplies')),
  amount integer NOT NULL CHECK (amount > 0),
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fnb_purchase_log_branch_date
  ON fnb_purchase_log(branch_id, purchase_date);

ALTER TABLE fnb_purchase_log ENABLE ROW LEVEL SECURITY;

-- Allow branch members to SELECT their own branch purchases
DROP POLICY IF EXISTS "branch_members_select_fnb_purchase_log" ON fnb_purchase_log;
CREATE POLICY "branch_members_select_fnb_purchase_log"
  ON fnb_purchase_log FOR SELECT
  USING (
    branch_id IN (
      SELECT branch_id FROM branch_members WHERE user_id = auth.uid()
    )
  );

-- Allow branch members to INSERT purchases for their branches
DROP POLICY IF EXISTS "branch_members_insert_fnb_purchase_log" ON fnb_purchase_log;
CREATE POLICY "branch_members_insert_fnb_purchase_log"
  ON fnb_purchase_log FOR INSERT
  WITH CHECK (
    branch_id IN (
      SELECT branch_id FROM branch_members WHERE user_id = auth.uid()
    )
  );

-- Allow branch members to DELETE their own purchases
DROP POLICY IF EXISTS "branch_members_delete_fnb_purchase_log" ON fnb_purchase_log;
CREATE POLICY "branch_members_delete_fnb_purchase_log"
  ON fnb_purchase_log FOR DELETE
  USING (
    branch_id IN (
      SELECT branch_id FROM branch_members WHERE user_id = auth.uid()
    )
  );

-- Super admins can manage all rows
DROP POLICY IF EXISTS "super_admin_all_fnb_purchase_log" ON fnb_purchase_log;
CREATE POLICY "super_admin_all_fnb_purchase_log"
  ON fnb_purchase_log FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND is_super_admin = true
    )
  );

-- Add other_cost_today to fnb_daily_metrics for one-off non-food costs logged in Enter Data
ALTER TABLE fnb_daily_metrics
  ADD COLUMN IF NOT EXISTS other_cost_today integer DEFAULT 0;
