-- Super admin: platform_admins table + is_super_admin() RPC + RLS bypass
-- Run after rbac-schema / migration-org-branch-uuid-to-text. Super admins see all orgs/branches and bypass org/branch restrictions.

-- 1. Table: platform admins (user_id only; no role column)
CREATE TABLE IF NOT EXISTS platform_admins (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. RPC: is_super_admin() — used by RLS and app
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid());
$$;

-- 3. RLS bypass policies (OR with existing policies)
-- Organizations: super admin sees all
DROP POLICY IF EXISTS "Super admins read all organizations" ON organizations;
CREATE POLICY "Super admins read all organizations"
  ON organizations FOR SELECT
  USING (public.is_super_admin());

-- Branches: super admin full access
DROP POLICY IF EXISTS "Super admins read all branches" ON branches;
CREATE POLICY "Super admins read all branches"
  ON branches FOR SELECT
  USING (public.is_super_admin());
DROP POLICY IF EXISTS "Super admins insert branches" ON branches;
CREATE POLICY "Super admins insert branches"
  ON branches FOR INSERT
  WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS "Super admins update branches" ON branches;
CREATE POLICY "Super admins update branches"
  ON branches FOR UPDATE
  USING (public.is_super_admin());
DROP POLICY IF EXISTS "Super admins delete branches" ON branches;
CREATE POLICY "Super admins delete branches"
  ON branches FOR DELETE
  USING (public.is_super_admin());

-- Organization members: super admin read all (for UI) + write
DROP POLICY IF EXISTS "Super admins read all organization members" ON organization_members;
CREATE POLICY "Super admins read all organization members"
  ON organization_members FOR SELECT
  USING (public.is_super_admin());
DROP POLICY IF EXISTS "Super admins insert organization members" ON organization_members;
CREATE POLICY "Super admins insert organization members"
  ON organization_members FOR INSERT
  WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS "Super admins update organization members" ON organization_members;
CREATE POLICY "Super admins update organization members"
  ON organization_members FOR UPDATE
  USING (public.is_super_admin());
DROP POLICY IF EXISTS "Super admins delete organization members" ON organization_members;
CREATE POLICY "Super admins delete organization members"
  ON organization_members FOR DELETE
  USING (public.is_super_admin());

-- Branch members: super admin full access
DROP POLICY IF EXISTS "Super admins read all branch members" ON branch_members;
CREATE POLICY "Super admins read all branch members"
  ON branch_members FOR SELECT
  USING (public.is_super_admin());
DROP POLICY IF EXISTS "Super admins insert branch members" ON branch_members;
CREATE POLICY "Super admins insert branch members"
  ON branch_members FOR INSERT
  WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS "Super admins update branch members" ON branch_members;
CREATE POLICY "Super admins update branch members"
  ON branch_members FOR UPDATE
  USING (public.is_super_admin());
DROP POLICY IF EXISTS "Super admins delete branch members" ON branch_members;
CREATE POLICY "Super admins delete branch members"
  ON branch_members FOR DELETE
  USING (public.is_super_admin());

-- Daily metrics: super admin read/insert/update
DROP POLICY IF EXISTS "Super admins read all daily metrics" ON daily_metrics;
CREATE POLICY "Super admins read all daily metrics"
  ON daily_metrics FOR SELECT
  USING (public.is_super_admin());
DROP POLICY IF EXISTS "Super admins insert daily metrics" ON daily_metrics;
CREATE POLICY "Super admins insert daily metrics"
  ON daily_metrics FOR INSERT
  WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS "Super admins update daily metrics" ON daily_metrics;
CREATE POLICY "Super admins update daily metrics"
  ON daily_metrics FOR UPDATE
  USING (public.is_super_admin());

-- Branch daily metrics (canonical read view): super admin read only (skip if view not created yet)
DO $bdm$
BEGIN
  IF to_regclass('public.branch_daily_metrics') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Super admins read all branch daily metrics" ON public.branch_daily_metrics';
    EXECUTE 'CREATE POLICY "Super admins read all branch daily metrics"
      ON public.branch_daily_metrics FOR SELECT
      USING (public.is_super_admin())';
  END IF;
END
$bdm$;

-- Invitations: super admin full access
DROP POLICY IF EXISTS "Super admins read all invitations" ON invitations;
CREATE POLICY "Super admins read all invitations"
  ON invitations FOR SELECT
  USING (public.is_super_admin());
DROP POLICY IF EXISTS "Super admins insert invitations" ON invitations;
CREATE POLICY "Super admins insert invitations"
  ON invitations FOR INSERT
  WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS "Super admins update invitations" ON invitations;
CREATE POLICY "Super admins update invitations"
  ON invitations FOR UPDATE
  USING (public.is_super_admin());

-- Organization owner cache: super admin can read (for policy checks)
DROP POLICY IF EXISTS "Super admins read owner cache" ON organization_owner_cache;
CREATE POLICY "Super admins read owner cache"
  ON organization_owner_cache FOR SELECT
  USING (public.is_super_admin());

-- Health snapshots if table exists (common in monitoring)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'health_snapshots') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Super admins read all health_snapshots" ON health_snapshots';
    EXECUTE 'CREATE POLICY "Super admins read all health_snapshots" ON health_snapshots FOR SELECT USING (public.is_super_admin())';
    EXECUTE 'DROP POLICY IF EXISTS "Super admins insert health_snapshots" ON health_snapshots';
    EXECUTE 'CREATE POLICY "Super admins insert health_snapshots" ON health_snapshots FOR INSERT WITH CHECK (public.is_super_admin())';
  END IF;
END $$;
