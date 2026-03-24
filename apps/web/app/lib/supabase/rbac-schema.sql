-- RBAC Schema for AuraSea Platform
-- Multi-user support with organization and branch-level roles

-- ============================================================
-- TABLE 1: organization_members
-- ============================================================
-- Stores organization-level roles (owner, manager)
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager')),
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- One role per user per organization
  CONSTRAINT unique_org_member UNIQUE (organization_id, user_id)
);

-- ============================================================
-- TABLE 2: branch_members
-- ============================================================
-- Branch-level roles. No organization_id here — join branches ON branch_id for org context.
-- Stores branch-level roles (branch_manager, branch_user, viewer)
CREATE TABLE IF NOT EXISTS branch_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('branch_manager', 'branch_user', 'viewer')),
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- One role per user per branch
  CONSTRAINT unique_branch_member UNIQUE (branch_id, user_id)
);

-- ============================================================
-- TABLE 3: invitations
-- ============================================================
-- Secure invitation system with tokens
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'branch_manager', 'branch_user', 'viewer')),
  token TEXT NOT NULL UNIQUE, -- Secure random token
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted BOOLEAN DEFAULT FALSE,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure either organization_id or branch_id is set (not both)
  CONSTRAINT check_invitation_scope CHECK (
    (organization_id IS NOT NULL AND branch_id IS NULL) OR
    (organization_id IS NULL AND branch_id IS NOT NULL)
  )
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_branch_members_branch_id ON branch_members(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_members_user_id ON branch_members(user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_org_id ON invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_invitations_branch_id ON invitations(branch_id);

-- ============================================================
-- HELPER: organization_owner_cache (avoids RLS recursion)
-- ============================================================
-- Policies on organization_members cannot SELECT from organization_members (42P17).
-- This cache is maintained by trigger; policies check this table instead.
CREATE TABLE IF NOT EXISTS organization_owner_cache (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_owner_cache_user ON organization_owner_cache(user_id);

-- Keep cache in sync with organization_members (owners only)
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

-- Backfill existing owners (run once; safe to run again)
INSERT INTO organization_owner_cache (organization_id, user_id)
SELECT organization_id, user_id FROM organization_members WHERE role = 'owner'
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_owner_cache ENABLE ROW LEVEL SECURITY;

-- organization_owner_cache: users can only see rows where they are the owner (for policy checks)
CREATE POLICY "Users can read own owner cache rows"
  ON organization_owner_cache FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- organization_members RLS Policies (use cache to avoid recursion)
-- ============================================================

-- Users can read their own organization memberships
CREATE POLICY "Users can read own organization memberships"
  ON organization_members FOR SELECT
  USING (auth.uid() = user_id);

-- Only owners can insert (check cache, not organization_members)
CREATE POLICY "Owners can invite organization members"
  ON organization_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_owner_cache oo
      WHERE oo.organization_id = organization_members.organization_id
      AND oo.user_id = auth.uid()
    )
  );

-- Only owners can update
CREATE POLICY "Owners can update organization members"
  ON organization_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_owner_cache oo
      WHERE oo.organization_id = organization_members.organization_id
      AND oo.user_id = auth.uid()
    )
  );

-- Only owners can delete
CREATE POLICY "Owners can delete organization members"
  ON organization_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organization_owner_cache oo
      WHERE oo.organization_id = organization_members.organization_id
      AND oo.user_id = auth.uid()
    )
  );

-- ============================================================
-- branch_members RLS Policies
-- ============================================================

-- Users can read their own branch memberships only (avoids recursion: branches policy
-- and daily_metrics policy use EXISTS (branch_members WHERE user_id = auth.uid()) which
-- does not re-enter branch_members via branches.)
CREATE POLICY "Users can read own branch memberships"
  ON branch_members FOR SELECT
  USING (auth.uid() = user_id);

-- Organization owners/managers and branch managers can invite branch members
CREATE POLICY "Authorized users can invite branch members"
  ON branch_members FOR INSERT
  WITH CHECK (
    -- Organization owner/manager
    EXISTS (
      SELECT 1 FROM branches b
      JOIN organization_members om ON om.organization_id = b.organization_id
      WHERE b.id = branch_members.branch_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'manager')
    ) OR
    -- Branch manager
    EXISTS (
      SELECT 1 FROM branch_members bm
      WHERE bm.branch_id = branch_members.branch_id
      AND bm.user_id = auth.uid()
      AND bm.role = 'branch_manager'
    )
  );

-- Organization owners/managers and branch managers can update branch members
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

-- Organization owners/managers can delete branch members
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

-- ============================================================
-- invitations RLS Policies
-- ============================================================

-- Users can read invitations they created
CREATE POLICY "Users can read own invitations"
  ON invitations FOR SELECT
  USING (auth.uid() = invited_by);

-- Users can read invitations sent to their email (for acceptance)
CREATE POLICY "Users can read invitations to their email"
  ON invitations FOR SELECT
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Organization owners/managers can create organization invitations
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

-- Organization owners/managers and branch managers can create branch invitations
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

-- Users can update invitations they created (mark as accepted)
CREATE POLICY "Users can update own invitations"
  ON invitations FOR UPDATE
  USING (auth.uid() = invited_by);

-- Users can update invitations sent to their email (accept)
CREATE POLICY "Users can accept invitations"
  ON invitations FOR UPDATE
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    AND accepted = FALSE
    AND expires_at > NOW()
  );

-- ============================================================
-- Update existing tables RLS policies
-- ============================================================

-- Organizations: Users can only access organizations they're members of
DROP POLICY IF EXISTS "Users can read their organization's data" ON organizations;
CREATE POLICY "Users can read accessible organizations"
  ON organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()
    )
  );

-- Branches: Users can only access branches they have access to
DROP POLICY IF EXISTS "Users can read their organization's branches" ON branches;
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

-- Branches: Only owner/manager can insert (add branch)
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

-- Branches: Owner, manager, branch_manager can update (branch settings)
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

-- Branches: Only owner can delete
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

-- Daily metrics: Users can only access metrics for accessible branches
DROP POLICY IF EXISTS "Users can read their organization's daily metrics" ON daily_metrics;
CREATE POLICY "Users can read accessible daily metrics"
  ON daily_metrics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = daily_metrics.branch_id
      AND (
        -- Organization member
        EXISTS (
          SELECT 1 FROM organization_members om
          WHERE om.organization_id = b.organization_id
          AND om.user_id = auth.uid()
        ) OR
        -- Branch member
        EXISTS (
          SELECT 1 FROM branch_members bm
          WHERE bm.branch_id = b.id
          AND bm.user_id = auth.uid()
        )
      )
    )
  );

-- Daily metrics: Only branch_manager, branch_user, and organization owners/managers can insert
CREATE POLICY "Authorized users can insert daily metrics"
  ON daily_metrics FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = daily_metrics.branch_id
      AND (
        -- Organization owner/manager
        EXISTS (
          SELECT 1 FROM organization_members om
          WHERE om.organization_id = b.organization_id
          AND om.user_id = auth.uid()
          AND om.role IN ('owner', 'manager')
        ) OR
        -- Branch manager or branch user (not viewer)
        EXISTS (
          SELECT 1 FROM branch_members bm
          WHERE bm.branch_id = b.id
          AND bm.user_id = auth.uid()
          AND bm.role IN ('branch_manager', 'branch_user')
        )
      )
    )
  );

-- Daily metrics: Only branch_manager, branch_user, and organization owners/managers can update
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
