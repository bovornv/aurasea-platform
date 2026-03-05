-- Fix 42P17 infinite recursion on public.organization_members.
-- Run in Supabase SQL Editor. Drops all policies, recreates minimal non-recursive RLS.
-- Requires: public.is_super_admin() (run super-admin-rls.sql first if needed). Creates organization_owner_cache if missing.

-- ---------------------------------------------------------------------------
-- 1. Drop every existing policy on organization_members (no self-reference)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organization_members'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.organization_members', pol.policyname);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Ensure organization_owner_cache exists and is populated (owner check only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organization_owner_cache (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_owner_cache_user ON organization_owner_cache(user_id);

CREATE OR REPLACE FUNCTION public.sync_organization_owner_cache()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.role = 'owner') THEN
    INSERT INTO organization_owner_cache (organization_id, user_id)
    VALUES (NEW.organization_id, NEW.user_id)
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (OLD.role = 'owner' AND (NEW.role IS DISTINCT FROM 'owner' OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.user_id IS DISTINCT FROM OLD.user_id)) THEN
      DELETE FROM organization_owner_cache WHERE organization_id = OLD.organization_id AND user_id = OLD.user_id;
    END IF;
    IF (NEW.role = 'owner') THEN
      INSERT INTO organization_owner_cache (organization_id, user_id)
      VALUES (NEW.organization_id, NEW.user_id)
      ON CONFLICT (organization_id, user_id) DO NOTHING;
    END IF;
  ELSIF (TG_OP = 'DELETE' AND OLD.role = 'owner') THEN
    DELETE FROM organization_owner_cache WHERE organization_id = OLD.organization_id AND user_id = OLD.user_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_organization_owner_cache ON public.organization_members;
CREATE TRIGGER tr_sync_organization_owner_cache
  AFTER INSERT OR UPDATE OR DELETE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_organization_owner_cache();

INSERT INTO organization_owner_cache (organization_id, user_id)
SELECT organization_id, user_id FROM public.organization_members WHERE role = 'owner'
ON CONFLICT (organization_id, user_id) DO NOTHING;

ALTER TABLE organization_owner_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own owner cache rows" ON organization_owner_cache;
CREATE POLICY "Users can read own owner cache rows"
  ON organization_owner_cache FOR SELECT
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. Enable RLS on organization_members
-- ---------------------------------------------------------------------------
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. Super admin: full access (no reference to organization_members)
-- ---------------------------------------------------------------------------
CREATE POLICY "om_super_admin_all"
  ON public.organization_members
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- 5. SELECT: user may read only their own membership row
-- ---------------------------------------------------------------------------
CREATE POLICY "om_select_own"
  ON public.organization_members
  FOR SELECT
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 6. INSERT: only owners (via cache) or super_admin
-- ---------------------------------------------------------------------------
CREATE POLICY "om_insert_owner"
  ON public.organization_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_owner_cache oo
      WHERE oo.organization_id = organization_members.organization_id
      AND oo.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 7. UPDATE: only owners (via cache) or super_admin
-- ---------------------------------------------------------------------------
CREATE POLICY "om_update_owner"
  ON public.organization_members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_owner_cache oo
      WHERE oo.organization_id = organization_members.organization_id
      AND oo.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 8. DELETE: only owners (via cache) or super_admin
-- ---------------------------------------------------------------------------
CREATE POLICY "om_delete_owner"
  ON public.organization_members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organization_owner_cache oo
      WHERE oo.organization_id = organization_members.organization_id
      AND oo.user_id = auth.uid()
    )
  );
