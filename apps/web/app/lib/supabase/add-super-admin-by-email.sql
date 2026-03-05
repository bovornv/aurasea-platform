-- Add a user as super admin by email. Run in Supabase SQL Editor after super-admin-rls.sql.
-- Replace the email with the target user's auth email.
-- If your platform_admins table has a "role" column, the INSERT below includes it; if not, use the second version.

-- Version A: table has (user_id, role, created_at) or similar with NOT NULL role
INSERT INTO platform_admins (user_id, role)
SELECT id, 'super_admin' FROM auth.users WHERE email = 'bovorn@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

-- Version B: table has only (user_id, created_at) — use this if Version A fails with "column role does not exist"
-- INSERT INTO platform_admins (user_id)
-- SELECT id FROM auth.users WHERE email = 'bovorn@gmail.com'
-- ON CONFLICT (user_id) DO NOTHING;
