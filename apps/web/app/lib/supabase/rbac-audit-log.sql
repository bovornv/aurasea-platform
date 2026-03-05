-- RBAC Audit Log
-- Run after rbac-schema.sql. Logs invitation creation, acceptance, and (optionally) permission-denied.

CREATE TABLE IF NOT EXISTS rbac_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL CHECK (action IN ('invitation_created', 'invitation_accepted', 'permission_denied')),
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rbac_audit_actor_id ON rbac_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_created_at ON rbac_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_action ON rbac_audit_log(action);

ALTER TABLE rbac_audit_log ENABLE ROW LEVEL SECURITY;

-- Users can insert their own actions (actor_id must be self)
CREATE POLICY "Users can insert own audit log"
  ON rbac_audit_log FOR INSERT
  WITH CHECK (auth.uid() = actor_id);

-- Users can read their own audit entries
CREATE POLICY "Users can read own audit log"
  ON rbac_audit_log FOR SELECT
  USING (auth.uid() = actor_id);
