-- Upgrade branch_members: add email, standardize roles to owner|manager|staff (remove viewer).
-- user_id remains source of truth; email is for readability and debugging.

-- 1. Add email column (nullable for existing rows; new inserts should set it)
ALTER TABLE branch_members
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Migrate legacy role values to new set (viewer -> staff, branch_manager -> manager, branch_user -> staff)
UPDATE branch_members
SET role = CASE
  WHEN role IN ('viewer', 'branch_user') THEN 'staff'
  WHEN role = 'branch_manager' THEN 'manager'
  WHEN role IN ('owner', 'manager', 'staff') THEN role
  ELSE 'staff'
END;

-- 3. Drop existing role check constraint
ALTER TABLE branch_members DROP CONSTRAINT IF EXISTS branch_members_role_check;
-- If your DB uses a different constraint name, find it: SELECT conname FROM pg_constraint WHERE conrelid = 'branch_members'::regclass AND contype = 'c';

-- 4. Enforce allowed roles only: owner, manager, staff
ALTER TABLE branch_members
  ADD CONSTRAINT branch_members_role_check CHECK (role IN ('owner', 'manager', 'staff'));

-- 5. Backfill email from auth.users for existing rows (where email is null)
UPDATE branch_members bm
SET email = u.email
FROM auth.users u
WHERE bm.user_id = u.id AND (bm.email IS NULL OR bm.email = '');

-- 6. Optional: trigger to keep email in sync on insert/update (from auth.users)
-- New inserts should provide email; this is a fallback for legacy or admin inserts.
CREATE OR REPLACE FUNCTION branch_members_set_email_from_auth()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NULL OR NEW.email = '' THEN
    SELECT email INTO NEW.email FROM auth.users WHERE id = NEW.user_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_branch_members_set_email ON branch_members;
CREATE TRIGGER tr_branch_members_set_email
  BEFORE INSERT OR UPDATE OF user_id ON branch_members
  FOR EACH ROW EXECUTE PROCEDURE branch_members_set_email_from_auth();

COMMENT ON COLUMN branch_members.email IS 'Human-readable email; source of truth is user_id. Filled from auth.users when null.';
