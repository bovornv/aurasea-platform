# RLS migration order (Supabase)

Run these in **Supabase → SQL Editor** in this order when fixing 42P17 recursion and super-admin.

## 1. Super admin (optional)

If you use platform super-admins:

- **`super-admin-rls.sql`** — creates `platform_admins`, `public.is_super_admin()`, and RLS bypass policies for super-admin.
- **`add-super-admin-by-email.sql`** — add a user by email (edit the email in the file). If your `platform_admins` has a `role` column, use the Version A INSERT.

## 2. Fix organization_members recursion (42P17)

- **`fix-organization-members-rls-recursion.sql`** — drops all policies on `organization_members`, ensures `organization_owner_cache` + trigger, recreates non-recursive policies (super_admin, select own row, owner-only INSERT/UPDATE/DELETE via cache).

**Requires:** `public.is_super_admin()` must exist before running. If you don’t use super-admin, create a no-op function:

```sql
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT false; $$;
```

Then run `fix-organization-members-rls-recursion.sql`.

## 3. Verify

- Log in and open a page that loads `daily_metrics` (e.g. overview). No 500 / “infinite recursion” on `organization_members`.
- If super-admin: user in `platform_admins` should see “Super Admin” in the UI and have full access.
