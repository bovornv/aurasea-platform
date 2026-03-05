-- Fix invitations RLS: owner/manager get 403 when fetching pending invitations.
-- Goal: super_admin sees all; owner/manager see invitations for their org; inviter sees own.
-- No recursion (do not reference invitations inside policy). No cross-org. Production safe.
-- Requires: public.is_super_admin(), organization_members, organization_owner_cache, branches.

-- Drop all existing SELECT policies on invitations (clean slate)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invitations' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.invitations', pol.policyname);
  END LOOP;
END $$;

-- Single SELECT policy: allow row if any condition is true (no recursion)
CREATE POLICY "invitations_select_safe"
  ON public.invitations
  FOR SELECT
  USING (
    -- 1. Super admin: see all (via platform_admins / is_super_admin)
    public.is_super_admin()
    OR
    -- 2. Inviter: see invitations they created
    (invited_by = auth.uid())
    OR
    -- 3. Invitee: see invitations sent to their email (for acceptance flow)
    (email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    OR
    -- 4. Owner/manager: see org-level invitations for their organization only
    (
      organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.user_id = auth.uid()
          AND om.organization_id = invitations.organization_id
          AND om.role IN ('owner', 'manager')
      )
    )
    OR
    -- 5. Owner/manager: see branch-level invitations for branches in their organization only
    (
      branch_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.branches b
        INNER JOIN public.organization_members om
          ON om.organization_id = b.organization_id
          AND om.user_id = auth.uid()
          AND om.role IN ('owner', 'manager')
        WHERE b.id = invitations.branch_id
      )
    )
  );
