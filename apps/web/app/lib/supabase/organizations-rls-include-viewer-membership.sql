-- Allow viewers (branch members) to see organizations they have branch access to.
-- Run after rbac-schema / migration-org-branch-uuid-to-text. No recursion: does not reference organization_members in a way that triggers RLS on organization_members.

-- Drop existing policy so we can replace with one that includes branch membership
DROP POLICY IF EXISTS "Users can read accessible organizations" ON organizations;

-- Recreate: org members OR users with at least one branch in that org (viewer, branch_user, etc.)
CREATE POLICY "Users can read accessible organizations"
  ON organizations FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM branches b
      INNER JOIN branch_members bm ON bm.branch_id = b.id AND bm.user_id = auth.uid()
      WHERE b.organization_id = organizations.id
    )
  );
