-- Fix: infinite recursion in RLS policies (42P17) for organization_members and branch_members.
-- Run this on an existing DB that already has rbac-schema applied.
-- Then re-apply the organization_members + cache section from rbac-schema.sql if you need full idempotent schema.

-- 1. Drop the recursive SELECT policy (causes recursion when any query touches organization_members)
DROP POLICY IF EXISTS "Users can read organization members" ON organization_members;

-- 1b. Ensure safe SELECT policy exists (no self-reference; avoids 42P17 when daily_metrics/branches reference org_members)
DROP POLICY IF EXISTS "Users can read own organization memberships" ON organization_members;
CREATE POLICY "Users can read own organization memberships"
  ON organization_members FOR SELECT
  USING (auth.uid() = user_id);

-- 2. Helper table and trigger so INSERT/UPDATE/DELETE policies don't reference organization_members
CREATE TABLE IF NOT EXISTS organization_owner_cache (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_owner_cache_user ON organization_owner_cache(user_id);

CREATE OR REPLACE FUNCTION sync_organization_owner_cache()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_sync_organization_owner_cache ON organization_members;
CREATE TRIGGER tr_sync_organization_owner_cache
  AFTER INSERT OR UPDATE OR DELETE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION sync_organization_owner_cache();

INSERT INTO organization_owner_cache (organization_id, user_id)
SELECT organization_id, user_id FROM organization_members WHERE role = 'owner'
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- 3. RLS on cache (so policies can use it without recursion)
ALTER TABLE organization_owner_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own owner cache rows" ON organization_owner_cache;
CREATE POLICY "Users can read own owner cache rows"
  ON organization_owner_cache FOR SELECT
  USING (auth.uid() = user_id);

-- 4. Replace organization_members INSERT/UPDATE/DELETE policies to use cache instead of self-reference
DROP POLICY IF EXISTS "Owners can invite organization members" ON organization_members;
CREATE POLICY "Owners can invite organization members"
  ON organization_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_owner_cache oo
      WHERE oo.organization_id = organization_members.organization_id
      AND oo.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners can update organization members" ON organization_members;
CREATE POLICY "Owners can update organization members"
  ON organization_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_owner_cache oo
      WHERE oo.organization_id = organization_members.organization_id
      AND oo.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners can delete organization members" ON organization_members;
CREATE POLICY "Owners can delete organization members"
  ON organization_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organization_owner_cache oo
      WHERE oo.organization_id = organization_members.organization_id
      AND oo.user_id = auth.uid()
    )
  );

-- 5. Drop recursive branch_members SELECT policy (branch_members -> branches -> branch_members)
DROP POLICY IF EXISTS "Users can read accessible branch members" ON branch_members;
