-- RLS policies for accommodation_daily_metrics
-- Fixes 403 (Forbidden) "new row violates row-level security policy" on INSERT.
-- Ensures authenticated users who are branch_members (owner, manager, staff) can insert/select/update.

-- Ensure RLS is enabled (idempotent)
ALTER TABLE accommodation_daily_metrics ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (avoid duplicate name errors)
DROP POLICY IF EXISTS "allow_insert_branch_members" ON accommodation_daily_metrics;
DROP POLICY IF EXISTS "allow_select_branch_members" ON accommodation_daily_metrics;
DROP POLICY IF EXISTS "allow_update_branch_members" ON accommodation_daily_metrics;

-- INSERT: allow authenticated branch members (owner, manager, staff)
CREATE POLICY "allow_insert_branch_members"
ON accommodation_daily_metrics
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM branch_members
    WHERE branch_members.branch_id = accommodation_daily_metrics.branch_id
    AND branch_members.user_id = auth.uid()
    AND branch_members.role IN ('owner', 'manager', 'staff')
  )
);

-- SELECT: allow authenticated branch members (any role that can see the branch)
CREATE POLICY "allow_select_branch_members"
ON accommodation_daily_metrics
FOR SELECT                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM branch_members
    WHERE branch_members.branch_id = accommodation_daily_metrics.branch_id
    AND branch_members.user_id = auth.uid()
  )
);

-- UPDATE: allow authenticated branch members (owner, manager, staff)
CREATE POLICY "allow_update_branch_members"
ON accommodation_daily_metrics
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM branch_members
    WHERE branch_members.branch_id = accommodation_daily_metrics.branch_id
    AND branch_members.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM branch_members
    WHERE branch_members.branch_id = accommodation_daily_metrics.branch_id
    AND branch_members.user_id = auth.uid()
    AND branch_members.role IN ('owner', 'manager', 'staff')
  )
);

-- Same policies for fnb_daily_metrics (F&B daily entry)
ALTER TABLE fnb_daily_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_insert_fnb_branch_members" ON fnb_daily_metrics;
DROP POLICY IF EXISTS "allow_select_fnb_branch_members" ON fnb_daily_metrics;
DROP POLICY IF EXISTS "allow_update_fnb_branch_members" ON fnb_daily_metrics;

CREATE POLICY "allow_insert_fnb_branch_members"
ON fnb_daily_metrics
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM branch_members
    WHERE branch_members.branch_id = fnb_daily_metrics.branch_id
    AND branch_members.user_id = auth.uid()
    AND branch_members.role IN ('owner', 'manager', 'staff')
  )
);

CREATE POLICY "allow_select_fnb_branch_members"
ON fnb_daily_metrics
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM branch_members
    WHERE branch_members.branch_id = fnb_daily_metrics.branch_id
    AND branch_members.user_id = auth.uid()
  )
);

CREATE POLICY "allow_update_fnb_branch_members"
ON fnb_daily_metrics
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM branch_members
    WHERE branch_members.branch_id = fnb_daily_metrics.branch_id
    AND branch_members.user_id = auth.uid()
  )
);
