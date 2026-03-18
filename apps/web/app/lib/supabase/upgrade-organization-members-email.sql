-- Add email to organization_members for readability and debugging.
-- user_id remains source of truth; email is auto-filled from auth.users.

-- 1. Add email column (nullable for existing rows; new inserts should set it)
ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Backfill email from auth.users for existing rows
UPDATE organization_members om
SET email = u.email
FROM auth.users u
WHERE om.user_id = u.id AND (om.email IS NULL OR om.email = '');

-- 3. Trigger to auto-fill email on insert/update from auth.users
CREATE OR REPLACE FUNCTION organization_members_set_email_from_auth()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NULL OR NEW.email = '' THEN
    SELECT email INTO NEW.email FROM auth.users WHERE id = NEW.user_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_organization_members_set_email ON organization_members;
CREATE TRIGGER tr_organization_members_set_email
  BEFORE INSERT OR UPDATE OF user_id ON organization_members
  FOR EACH ROW EXECUTE PROCEDURE organization_members_set_email_from_auth();

COMMENT ON COLUMN organization_members.email IS 'Human-readable email; source of truth is user_id. Filled from auth.users when null.';
