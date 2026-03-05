-- Fix rbac_audit_log 403: ensure authenticated users can INSERT their own audit rows.
-- Error: new row violates row-level security policy for table "rbac_audit_log"

-- Drop existing INSERT policy if name differs or was altered
DROP POLICY IF EXISTS "Users can insert own audit log" ON rbac_audit_log;
DROP POLICY IF EXISTS "rbac_audit_log_insert_own" ON rbac_audit_log;

-- Allow insert when actor_id equals current user (authenticated only)
CREATE POLICY "rbac_audit_log_insert_own"
  ON rbac_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = actor_id);
