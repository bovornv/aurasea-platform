-- Fix: infinite recursion in policy for relation "branch_members" (42P17)
-- Happens when daily_metrics (or branches) is queried: daily_metrics → branches → branch_members → branches → ...
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query → Run).

-- Remove the recursive SELECT policy (if present). It allowed "read branch_members for branches
-- you can access" by referencing branches, and branches policy references branch_members → loop.
DROP POLICY IF EXISTS "Users can read accessible branch members" ON branch_members;

-- Ensure the non-recursive SELECT policy exists (only auth.uid() = user_id, no joins).
-- If you never had the recursive policy, this is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'branch_members' AND policyname = 'Users can read own branch memberships'
  ) THEN
    CREATE POLICY "Users can read own branch memberships"
      ON branch_members FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;
