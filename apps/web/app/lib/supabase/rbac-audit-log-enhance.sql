-- Enhance rbac_audit_log for role changes and invitation flows
-- Adds: organization_id, branch_id, ip_address, user_agent; extends action enum.

-- Add columns if not present (idempotent)
ALTER TABLE rbac_audit_log
  ADD COLUMN IF NOT EXISTS organization_id TEXT,
  ADD COLUMN IF NOT EXISTS branch_id TEXT,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Drop existing action check constraint if present (Postgres naming may vary)
ALTER TABLE rbac_audit_log DROP CONSTRAINT IF EXISTS rbac_audit_log_action_check;

-- Allow new actions: role_assigned, role_removed, invitation_created, invitation_accepted, permission_denied
ALTER TABLE rbac_audit_log
  ADD CONSTRAINT rbac_audit_log_action_check
  CHECK (action IN (
    'invitation_created', 'invitation_accepted', 'permission_denied',
    'role_assigned', 'role_removed'
  ));

-- Index for filtering by org/branch
CREATE INDEX IF NOT EXISTS idx_rbac_audit_organization_id ON rbac_audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_branch_id ON rbac_audit_log(branch_id);
