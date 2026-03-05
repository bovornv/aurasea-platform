# RBAC Implementation Guide

## Overview

Full Role-Based Access Control (RBAC) implementation for AuraSea Platform with multi-user support, organization-level and branch-level roles, secure invitation system, and database-level enforcement via Row Level Security (RLS).

## Architecture

### Roles

**Organization-level roles:**
- `owner`: Full access to organization and all branches
- `manager`: Access to organization overview and branch management (cannot delete organization)

**Branch-level roles:**
- `branch_manager`: Can manage branch settings and log data
- `branch_user`: Can log data (cannot manage settings)
- `viewer`: Read-only access (cannot log data or manage settings)

### Database Schema

Three new tables:

1. **`organization_members`**: Stores organization-level roles
2. **`branch_members`**: Stores branch-level roles  
3. **`invitations`**: Secure invitation system with tokens

See `apps/web/app/lib/supabase/rbac-schema.sql` for full schema and RLS policies.

## Implementation Status

### ✅ PART 1: User Context Provider

**File:** `apps/web/app/contexts/user-role-context.tsx`

- `useUserRole()` hook fetches:
  - Organization role (`owner`/`manager`)
  - Branch roles (map of `branchId -> role`)
  - All accessible branch IDs
  - Effective role (highest privilege)
  - Permission flags (`canManageOrganization`, `canManageBranches`, `canEditBranch`, `canLogData`, `canViewOnly`)

**Integration:** Added `UserRoleProvider` to `apps/web/app/layout.tsx`

### ✅ PART 2: Route Guards

**File:** `apps/web/app/hooks/use-route-guard.ts`

**Protected Routes:**
- `/group/settings`: Only `owner`
- `/group/overview`: `owner`, `manager`
- `/group/alerts`: `owner`, `manager`
- `/group/trends`: `owner`, `manager`
- `/branch/settings`: `owner`, `manager`, `branch_manager`
- `/branch/log-today`: `owner`, `manager`, `branch_manager`, `branch_user` (NOT `viewer`)
- `/branch/overview`: All roles (including `viewer`)
- `/branch/alerts`: All roles
- `/branch/trends`: All roles

**Integration:** Added `useRouteGuard()` to:
- `apps/web/app/group/settings/page.tsx`
- `apps/web/app/branch/settings/page.tsx`
- `apps/web/app/branch/log-today/page.tsx`

### ✅ PART 3: Invitation Flow

**POST `/api/invite`** (`apps/web/app/api/invite/route.ts`):
- Validates permissions (owner for org invites, owner/manager/branch_manager for branch invites)
- Generates secure token (32-byte hex)
- Creates invitation record with 7-day expiry
- Returns invitation link (in production, send via email)

**GET `/invite/accept`** (`apps/web/app/invite/accept/page.tsx`):
- Validates token (exists, not expired, not accepted, email matches)
- Creates membership in `organization_members` or `branch_members`
- Marks invitation as accepted
- Redirects to dashboard

### ✅ PART 4: RLS Enforcement

**File:** `apps/web/app/lib/supabase/rbac-schema.sql`

**RLS Policies:**
- `organization_members`: Users can read their own memberships and org memberships for orgs they belong to
- `branch_members`: Users can read their own memberships and accessible branch memberships
- `invitations`: Users can read invitations they created or invitations sent to their email
- `organizations`: Users can only access organizations they're members of
- `branches`: Users can only access branches they have access to (via org membership or branch membership)
- `daily_metrics`: Users can only read/insert/update metrics for accessible branches

**Note:** All queries automatically use `auth.uid()` via RLS policies. No client-side filtering needed.

### ✅ PART 5: Role-Based UI Rendering

**Company Settings (`apps/web/app/group/settings/page.tsx`):**
- "Add Branch" button: Hidden for non-owners (`role?.canManageOrganization`)
- "Delete Branch" button: Hidden for non-owners
- Page access: Only owner; others redirect to `/unauthorized` or `/group/overview`

**Log Today (`apps/web/app/branch/log-today/page.tsx`):**
- "Save Today" button: Hidden for `viewer` role (`role?.canViewOnly`)
- Warning message shown for `viewer` role: "You have view-only access. You cannot save data."

**Unauthorized (403):**
- Route guard redirects to `/unauthorized?from=<path>` when user lacks role for the route
- `apps/web/app/unauthorized/page.tsx`: Shows "Access denied" and link back to dashboard

**Sensitive financial exposure (viewer role):**
- Branch Overview: Revenue at Risk and per-alert impact show "—" when `role?.canViewOnly`
- Branch Alerts: Total Revenue at Risk, Total Opportunity Gain, and per-alert amounts show "—"
- Debug Panel: Revenue Exposure and Liquidity Runway show "—"

### ⚠️ PART 6: Validation & Testing

**Required Tests:**

1. **Owner:**
   - ✅ Can access everything
   - ✅ Can add/delete branches
   - ✅ Can invite users

2. **Manager:**
   - ✅ Cannot delete company (no delete org functionality)
   - ✅ Can access company overview
   - ✅ Can invite branch users

3. **Branch User:**
   - ✅ Cannot access company overview (redirected to branch view)
   - ✅ Can log data
   - ✅ Cannot manage branch settings

4. **Viewer:**
   - ✅ Cannot log data (button hidden)
   - ✅ Can view branch overview/alerts/trends
   - ✅ Cannot access company overview

5. **Unauthorized Access:**
   - ✅ Unauthorized users redirect to `/unauthorized` (403-style)
   - ✅ RLS prevents cross-company data access
   - ✅ API routes (e.g. POST /api/invite) return 403 when permission denied

### 📋 PART 7: Database Migration & RLS

**File:** `apps/web/app/lib/supabase/rbac-schema.sql`

**RLS for branches (in addition to SELECT):**
- **INSERT:** Only organization owner/manager (add branch)
- **UPDATE:** Owner, manager, or branch_manager (branch settings)
- **DELETE:** Only organization owner (delete branch)

**First owner (required after RLS):** Each organization must have at least one `organization_members` row with role `owner`, or no one can access it.

- **Option A (recommended):** Run the seed script (uses `auth.users` to resolve email to user id):
  ```bash
  FIRST_OWNER_EMAIL=your@email.com npx ts-node --project scripts/tsconfig.json scripts/seed-rbac-first-owner.ts
  ```
  Ensure the user exists in Supabase Authentication first.

- **Option B:** Run SQL manually. Get your user UUID from Supabase Dashboard → Authentication → Users, then run `apps/web/app/lib/supabase/rbac-first-owner.sql` after replacing `YOUR_USER_UUID`.

**To Deploy:**

1. Run the SQL migration in Supabase SQL Editor:
   ```sql
   -- Copy contents of apps/web/app/lib/supabase/rbac-schema.sql
   ```

2. (Optional) Run the audit log migration:
   ```sql
   -- Copy contents of apps/web/app/lib/supabase/rbac-audit-log.sql
   ```

3. Verify RLS is enabled:
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE schemaname = 'public' 
   AND tablename IN ('organization_members', 'branch_members', 'invitations', 'organizations', 'branches', 'daily_metrics');
   ```

4. Test RLS policies:
   ```sql
   -- As a test user, verify you can only see your own memberships
   SELECT * FROM organization_members WHERE user_id = auth.uid();
   SELECT * FROM branch_members WHERE user_id = auth.uid();
   ```

### 🔒 PART 8: Supabase Settings (Important)

**In Supabase Dashboard:**

1. **Authentication → Email Confirmation**
   - Enable email confirmation so invite links work with verified users

2. **Authentication → JWT & Session**
   - Enable secure JWT
   - Set session expiration (e.g. 1 hour for strict; 24h for UX)

3. **Authentication → Email Templates** (optional for invite flow)
   - Customize invite/confirmation emails if using Supabase Auth for invites

4. **RLS:** All policies in `rbac-schema.sql` use `auth.uid()` for user context.

5. **Security (production):** Never trust role from frontend; never store role in localStorage (only cache); always enforce in RLS; validate in backend API; double-check branch ownership.

6. **Invite email (optional):** In `apps/web/.env.local` set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (e.g. `AuraSea <noreply@yourdomain.com>`) to send invite emails via Resend. Without these, the invite link is only shown in the UI for copying.

## Security Best Practices

### ✅ DO:

- ✅ Enforce permissions at database level (RLS)
- ✅ Validate permissions in backend API routes
- ✅ Use `auth.uid()` in all RLS policies
- ✅ Check branch ownership before operations
- ✅ Use secure tokens for invitations (32-byte random)
- ✅ Set invitation expiry (7 days default)
- ✅ Log security events (invitations, role changes)

### ❌ DON'T:

- ❌ Trust role from frontend
- ❌ Store role in localStorage (only cache)
- ❌ Filter data client-side only
- ❌ Allow cross-company data access
- ❌ Skip permission checks in API routes
- ❌ Use weak tokens for invitations

## Next Steps

1. **First owner (done):** Run `FIRST_OWNER_EMAIL=you@example.com npm run seed:rbac-first-owner` once after applying rbac-schema so your user is an owner. See "First owner" in PART 7 above.

2. **Invite UI (done):** Group Settings → "Invite Users" section (owner-only). Enter email, send invite, copy link. "Pending invitations" list shows sent org invites with copy-link; expired ones marked.

3. **Email Service Integration (done):**
   - Optional Resend: set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (e.g. `AuraSea <noreply@yourdomain.com>`) in env. When set, POST /api/invite sends an invite email via Resend; response includes `emailSent` and `emailError`. UI shows "Invite email sent" or "Share link below" accordingly.

4. **Role Management UI:**
   - Pending invitations list (done on Group Settings)
   - Organization members table (done on Group Settings: Role, User ID suffix, Joined)
   - Branch Settings → User Access: branch members table, invite to branch (email + role: branch_manager/branch_user/viewer), pending branch invitations

5. **Audit Logging (done):**
   - Table `rbac_audit_log`: action (invitation_created | invitation_accepted | permission_denied), actor_id, target_type, target_id, details (jsonb). Run `apps/web/app/lib/supabase/rbac-audit-log.sql` after rbac-schema.
   - Logged: invitation created (Group + Branch Settings), invitation accepted (accept page), permission denied (unauthorized page). Client-side via `utils/rbac-audit.ts`; RLS allows insert/select for own actor_id.

6. **Testing:**
   - Unit tests for `useUserRole`, integration tests for invite flow, E2E for route guards

## Files Modified

- `apps/web/app/contexts/user-role-context.tsx` (NEW) — Org role tied to `activeOrganizationId`
- `apps/web/app/hooks/use-route-guard.ts` (NEW) — Redirects to `/unauthorized` on 403
- `apps/web/app/unauthorized/page.tsx` (NEW) — 403 "Access denied" page
- `apps/web/app/api/invite/route.ts` (NEW)
- `apps/web/app/invite/accept/page.tsx` (NEW)
- `apps/web/app/lib/supabase/rbac-schema.sql` (NEW) — Includes branches INSERT/UPDATE/DELETE RLS
- `apps/web/app/lib/supabase/rbac-audit-log.sql` (NEW) — Audit table + RLS; run after rbac-schema
- `apps/web/app/utils/rbac-audit.ts` (NEW) — Client-side audit logging helper
- `apps/web/app/lib/send-invite-email.ts` (NEW) — Server-side invite email via Resend (optional)
- `apps/web/app/layout.tsx` (MODIFIED - added UserRoleProvider)
- `apps/web/app/group/settings/page.tsx` (MODIFIED - route guard, Add/Delete Branch hidden, Invite Users section)
- `scripts/seed-rbac-first-owner.ts` (NEW - assign first owner to orgs)
- `apps/web/app/lib/supabase/rbac-first-owner.sql` (NEW - manual SQL to add first owner)
- `apps/web/app/branch/settings/page.tsx` (MODIFIED - route guard, branch members table, invite to branch, pending branch invitations)
- `apps/web/app/branch/log-today/page.tsx` (MODIFIED - route guard + role-based UI)
- `apps/web/app/branch/overview/page.tsx` (MODIFIED - hide financial exposure for viewer)
- `apps/web/app/branch/alerts/page.tsx` (MODIFIED - hide financial amounts for viewer)
- `apps/web/app/components/debug-panel.tsx` (MODIFIED - hide exposure/runway for viewer)

## Notes

- RLS policies automatically filter queries based on `auth.uid()`
- No changes needed to existing Supabase queries - RLS handles filtering
- Fallback to localStorage-based permissions for development (when Supabase unavailable)
- All role checks are defensive (default to most restrictive)
