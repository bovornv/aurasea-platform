-- RBAC: Assign first owner to an organization (run after rbac-schema.sql)
-- Replace YOUR_USER_UUID with the auth user's id from Supabase Dashboard → Authentication → Users.

INSERT INTO organization_members (organization_id, user_id, role)
SELECT o.id, 'YOUR_USER_UUID'::uuid, 'owner'
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM organization_members om WHERE om.organization_id = o.id AND om.user_id = 'YOUR_USER_UUID'::uuid
)
ON CONFLICT (organization_id, user_id) DO NOTHING;
