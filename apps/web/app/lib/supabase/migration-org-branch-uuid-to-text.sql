-- ============================================================
-- Migration: organization_id and branch_id UUID → TEXT
-- ============================================================
-- Run in Supabase SQL Editor. Ensures no UUID remains in org/branch chain.
-- Backup your database before running.
-- Existing UUID values become their text form (e.g. 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11').
--
-- Tables touched: organizations, branches, organization_members, organization_owner_cache,
--   invitations, branch_members, daily_metrics, health_snapshots.
-- weekly_metrics: only if it exists (skipped if absent; weekly_metrics_backup is not modified).
--
-- Audit: No sim- branch IDs. No INSERT into daily_metrics; no simulation data. Foreign key
-- daily_metrics_branch_id_fkey ensures only existing branch IDs are valid for daily_metrics.
--
-- After running: execute verify-org-branch-text-migration.sql to confirm column types and FKs.
--
-- 1) Drop dependent RLS policies
-- 2) Drop foreign keys and triggers
-- 3) Convert id columns to TEXT
-- 4) Convert referencing columns to TEXT
-- 5) Recreate foreign keys and trigger
-- 6) Recreate RLS policies
-- ============================================================

-- ---------------------------------------------------------------------------
-- STEP 1: Drop dependent RLS policies
-- ---------------------------------------------------------------------------

-- daily_metrics (drop all known policy names; alter type fails if any policy references org/branch columns)
DROP POLICY IF EXISTS "Users can read their organization's daily metrics" ON daily_metrics;
DROP POLICY IF EXISTS "Users can read accessible daily metrics" ON daily_metrics;
DROP POLICY IF EXISTS "Users can access allowed branches" ON daily_metrics;
DROP POLICY IF EXISTS "Authorized users can insert daily metrics" ON daily_metrics;
DROP POLICY IF EXISTS "Authorized users can update daily metrics" ON daily_metrics;
DROP POLICY IF EXISTS "Users can insert their organization's daily metrics" ON daily_metrics;
DROP POLICY IF EXISTS "Users can update their organization's daily metrics" ON daily_metrics;

-- branches
DROP POLICY IF EXISTS "Users can read their organization's branches" ON branches;
DROP POLICY IF EXISTS "Users can read accessible branches" ON branches;
DROP POLICY IF EXISTS "Owners and managers can insert branches" ON branches;
DROP POLICY IF EXISTS "Authorized users can update branches" ON branches;
DROP POLICY IF EXISTS "Only owners can delete branches" ON branches;

-- organizations
DROP POLICY IF EXISTS "Users can read their organization's data" ON organizations;
DROP POLICY IF EXISTS "Users can read accessible organizations" ON organizations;

-- organization_members
DROP POLICY IF EXISTS "Users can read own organization memberships" ON organization_members;
DROP POLICY IF EXISTS "Owners can invite organization members" ON organization_members;
DROP POLICY IF EXISTS "Owners can update organization members" ON organization_members;
DROP POLICY IF EXISTS "Owners can delete organization members" ON organization_members;

-- organization_owner_cache
DROP POLICY IF EXISTS "Users can read own owner cache rows" ON organization_owner_cache;

-- branch_members
DROP POLICY IF EXISTS "Users can read accessible branch members" ON branch_members;
DROP POLICY IF EXISTS "Users can read own branch memberships" ON branch_members;
DROP POLICY IF EXISTS "Authorized users can invite branch members" ON branch_members;
DROP POLICY IF EXISTS "Authorized users can update branch members" ON branch_members;
DROP POLICY IF EXISTS "Authorized users can delete branch members" ON branch_members;

-- invitations
DROP POLICY IF EXISTS "Users can read own invitations" ON invitations;
DROP POLICY IF EXISTS "Users can read invitations to their email" ON invitations;
DROP POLICY IF EXISTS "Owners can create organization invitations" ON invitations;
DROP POLICY IF EXISTS "Authorized users can create branch invitations" ON invitations;
DROP POLICY IF EXISTS "Users can update own invitations" ON invitations;
DROP POLICY IF EXISTS "Users can accept invitations" ON invitations;

-- Optional tables: health_snapshots and weekly_metrics are altered only if they exist.
-- weekly_metrics_backup is not modified by this migration.

-- ---------------------------------------------------------------------------
-- STEP 2: Drop trigger and foreign keys
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS tr_sync_organization_owner_cache ON organization_members;

-- FKs referencing organizations(id)
ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_organization_id_fkey;
ALTER TABLE organization_owner_cache DROP CONSTRAINT IF EXISTS organization_owner_cache_organization_id_fkey;
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_organization_id_fkey;
ALTER TABLE branches DROP CONSTRAINT IF EXISTS branches_organization_id_fkey;

-- FKs referencing branches(id)
ALTER TABLE branch_members DROP CONSTRAINT IF EXISTS branch_members_branch_id_fkey;
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_branch_id_fkey;
ALTER TABLE daily_metrics DROP CONSTRAINT IF EXISTS daily_metrics_branch_id_fkey;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'health_snapshots') THEN
    ALTER TABLE health_snapshots DROP CONSTRAINT IF EXISTS health_snapshots_branch_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'weekly_metrics') THEN
    ALTER TABLE weekly_metrics DROP CONSTRAINT IF EXISTS weekly_metrics_branch_id_fkey;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- STEP 3: Convert organizations.id to TEXT
-- ---------------------------------------------------------------------------

ALTER TABLE organizations
  ALTER COLUMN id TYPE TEXT USING id::TEXT;

-- ---------------------------------------------------------------------------
-- STEP 4: Convert referencing columns to TEXT
-- ---------------------------------------------------------------------------

-- branches.organization_id
ALTER TABLE branches
  ALTER COLUMN organization_id TYPE TEXT USING organization_id::TEXT;

-- organization_members.organization_id
ALTER TABLE organization_members
  ALTER COLUMN organization_id TYPE TEXT USING organization_id::TEXT;

-- organization_owner_cache: PK (organization_id, user_id) + column
ALTER TABLE organization_owner_cache DROP CONSTRAINT IF EXISTS organization_owner_cache_pkey;
ALTER TABLE organization_owner_cache
  ALTER COLUMN organization_id TYPE TEXT USING organization_id::TEXT;
ALTER TABLE organization_owner_cache
  ADD PRIMARY KEY (organization_id, user_id);

-- invitations.organization_id
ALTER TABLE invitations
  ALTER COLUMN organization_id TYPE TEXT USING organization_id::TEXT;

-- branches.id (if currently UUID)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'branches' AND column_name = 'id'
    AND data_type = 'uuid'
  ) THEN
    ALTER TABLE branches ALTER COLUMN id TYPE TEXT USING id::TEXT;
  END IF;
END $$;

-- weekly_metrics.branch_id (if table exists and column is UUID)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'weekly_metrics')
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'weekly_metrics' AND column_name = 'branch_id'
       AND data_type = 'uuid'
     ) THEN
    ALTER TABLE weekly_metrics ALTER COLUMN branch_id TYPE TEXT USING branch_id::TEXT;
  END IF;
END $$;

-- branch_members.branch_id, invitations.branch_id, daily_metrics.branch_id, health_snapshots.branch_id
-- are already TEXT in schema; if any are UUID in your DB, uncomment and run:
-- ALTER TABLE branch_members ALTER COLUMN branch_id TYPE TEXT USING branch_id::TEXT;
-- ALTER TABLE invitations ALTER COLUMN branch_id TYPE TEXT USING branch_id::TEXT;
-- ALTER TABLE daily_metrics ALTER COLUMN branch_id TYPE TEXT USING branch_id::TEXT;
-- ALTER TABLE health_snapshots ALTER COLUMN branch_id TYPE TEXT USING branch_id::TEXT;

-- ---------------------------------------------------------------------------
-- STEP 4b: Remove daily_metrics rows that reference non-existent branches
-- (e.g. sim-big-accommodation-001). Required so FK can be re-added.
-- ---------------------------------------------------------------------------

DELETE FROM daily_metrics
WHERE branch_id IS NOT NULL
  AND branch_id NOT IN (SELECT id FROM branches);

-- ---------------------------------------------------------------------------
-- STEP 5: Recreate foreign keys
-- ---------------------------------------------------------------------------

ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE organization_owner_cache
  ADD CONSTRAINT organization_owner_cache_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE invitations
  ADD CONSTRAINT invitations_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE branches
  ADD CONSTRAINT branches_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE branch_members
  ADD CONSTRAINT branch_members_branch_id_fkey
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;

ALTER TABLE invitations
  ADD CONSTRAINT invitations_branch_id_fkey
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;

ALTER TABLE daily_metrics
  ADD CONSTRAINT daily_metrics_branch_id_fkey
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'health_snapshots') THEN
    ALTER TABLE health_snapshots
      ADD CONSTRAINT health_snapshots_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'weekly_metrics') THEN
    ALTER TABLE weekly_metrics
      ADD CONSTRAINT weekly_metrics_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- STEP 5b: Recreate trigger for organization_owner_cache
-- ---------------------------------------------------------------------------

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

CREATE TRIGGER tr_sync_organization_owner_cache
  AFTER INSERT OR UPDATE OR DELETE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION sync_organization_owner_cache();

-- ---------------------------------------------------------------------------
-- STEP 6: Recreate RLS policies
-- ---------------------------------------------------------------------------

-- organization_owner_cache
CREATE POLICY "Users can read own owner cache rows"
  ON organization_owner_cache FOR SELECT
  USING (auth.uid() = user_id);

-- organization_members
CREATE POLICY "Users can read own organization memberships"
  ON organization_members FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Owners can invite organization members"
  ON organization_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_owner_cache oo
      WHERE oo.organization_id = organization_members.organization_id
      AND oo.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners can update organization members"
  ON organization_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_owner_cache oo
      WHERE oo.organization_id = organization_members.organization_id
      AND oo.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners can delete organization members"
  ON organization_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organization_owner_cache oo
      WHERE oo.organization_id = organization_members.organization_id
      AND oo.user_id = auth.uid()
    )
  );

-- branch_members
CREATE POLICY "Users can read own branch memberships"
  ON branch_members FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Authorized users can invite branch members"
  ON branch_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM branches b
      JOIN organization_members om ON om.organization_id = b.organization_id
      WHERE b.id = branch_members.branch_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'manager')
    ) OR
    EXISTS (
      SELECT 1 FROM branch_members bm
      WHERE bm.branch_id = branch_members.branch_id
      AND bm.user_id = auth.uid()
      AND bm.role = 'branch_manager'
    )
  );

CREATE POLICY "Authorized users can update branch members"
  ON branch_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM branches b
      JOIN organization_members om ON om.organization_id = b.organization_id
      WHERE b.id = branch_members.branch_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'manager')
    ) OR
    EXISTS (
      SELECT 1 FROM branch_members bm
      WHERE bm.branch_id = branch_members.branch_id
      AND bm.user_id = auth.uid()
      AND bm.role = 'branch_manager'
    )
  );

CREATE POLICY "Authorized users can delete branch members"
  ON branch_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM branches b
      JOIN organization_members om ON om.organization_id = b.organization_id
      WHERE b.id = branch_members.branch_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'manager')
    )
  );

-- invitations
CREATE POLICY "Users can read own invitations"
  ON invitations FOR SELECT
  USING (auth.uid() = invited_by);

CREATE POLICY "Users can read invitations to their email"
  ON invitations FOR SELECT
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "Owners can create organization invitations"
  ON invitations FOR INSERT
  WITH CHECK (
    organization_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = invitations.organization_id
      AND om.user_id = auth.uid()
      AND om.role = 'owner'
    )
  );

CREATE POLICY "Authorized users can create branch invitations"
  ON invitations FOR INSERT
  WITH CHECK (
    branch_id IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM branches b
        JOIN organization_members om ON om.organization_id = b.organization_id
        WHERE b.id = invitations.branch_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'manager')
      ) OR
      EXISTS (
        SELECT 1 FROM branch_members bm
        WHERE bm.branch_id = invitations.branch_id
        AND bm.user_id = auth.uid()
        AND bm.role = 'branch_manager'
      )
    )
  );

CREATE POLICY "Users can update own invitations"
  ON invitations FOR UPDATE
  USING (auth.uid() = invited_by);

CREATE POLICY "Users can accept invitations"
  ON invitations FOR UPDATE
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    AND accepted = FALSE
    AND expires_at > NOW()
  );

-- organizations
CREATE POLICY "Users can read accessible organizations"
  ON organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()
    )
  );

-- branches
CREATE POLICY "Users can read accessible branches"
  ON branches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = branches.organization_id
      AND om.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM branch_members bm
      WHERE bm.branch_id = branches.id
      AND bm.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners and managers can insert branches"
  ON branches FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = branches.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'manager')
    )
  );

CREATE POLICY "Authorized users can update branches"
  ON branches FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = branches.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'manager')
    ) OR
    EXISTS (
      SELECT 1 FROM branch_members bm
      WHERE bm.branch_id = branches.id
      AND bm.user_id = auth.uid()
      AND bm.role = 'branch_manager'
    )
  );

CREATE POLICY "Only owners can delete branches"
  ON branches FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = branches.organization_id
      AND om.user_id = auth.uid()
      AND om.role = 'owner'
    )
  );

-- daily_metrics
CREATE POLICY "Users can read accessible daily metrics"
  ON daily_metrics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = daily_metrics.branch_id
      AND (
        EXISTS (
          SELECT 1 FROM organization_members om
          WHERE om.organization_id = b.organization_id
          AND om.user_id = auth.uid()
        ) OR
        EXISTS (
          SELECT 1 FROM branch_members bm
          WHERE bm.branch_id = b.id
          AND bm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Authorized users can insert daily metrics"
  ON daily_metrics FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = daily_metrics.branch_id
      AND (
        EXISTS (
          SELECT 1 FROM organization_members om
          WHERE om.organization_id = b.organization_id
          AND om.user_id = auth.uid()
          AND om.role IN ('owner', 'manager')
        ) OR
        EXISTS (
          SELECT 1 FROM branch_members bm
          WHERE bm.branch_id = b.id
          AND bm.user_id = auth.uid()
          AND bm.role IN ('branch_manager', 'branch_user')
        )
      )
    )
  );

CREATE POLICY "Authorized users can update daily metrics"
  ON daily_metrics FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = daily_metrics.branch_id
      AND (
        EXISTS (
          SELECT 1 FROM organization_members om
          WHERE om.organization_id = b.organization_id
          AND om.user_id = auth.uid()
          AND om.role IN ('owner', 'manager')
        ) OR
        EXISTS (
          SELECT 1 FROM branch_members bm
          WHERE bm.branch_id = b.id
          AND bm.user_id = auth.uid()
          AND bm.role IN ('branch_manager', 'branch_user')
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Backfill organization_owner_cache (safe to run again)
-- No daily_metrics or simulation data inserted. daily_metrics inserts elsewhere
-- must use branch_id that exists in branches (enforced by daily_metrics_branch_id_fkey).
-- ---------------------------------------------------------------------------

INSERT INTO organization_owner_cache (organization_id, user_id)
SELECT organization_id, user_id FROM organization_members WHERE role = 'owner'
ON CONFLICT (organization_id, user_id) DO NOTHING;
