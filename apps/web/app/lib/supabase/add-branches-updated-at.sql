-- Migration: Add updated_at to branches for reorder/audit; trigger keeps it in sync.
-- Run in Supabase SQL Editor. No RBAC or other tables changed.

-- 1. Add column
ALTER TABLE branches
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2. Backfill existing rows
UPDATE branches SET updated_at = created_at WHERE updated_at IS NULL;

-- 3. Trigger to auto-set updated_at on UPDATE
CREATE OR REPLACE FUNCTION branches_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS branches_updated_at_trigger ON branches;
CREATE TRIGGER branches_updated_at_trigger
  BEFORE UPDATE ON branches
  FOR EACH ROW
  EXECUTE FUNCTION branches_set_updated_at();
