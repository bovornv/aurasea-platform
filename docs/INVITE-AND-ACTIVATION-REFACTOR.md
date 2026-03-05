# Invite Flow & First Dashboard Activation Refactor

## Summary

- **Invite** is no longer part of onboarding; suggestion appears after dashboard loads with calm, operational copy. Permissions enforced by API/RLS.
- **First dashboard** shows an activation block (placeholder chart, one observation, one suggested action) when there is no health score yet, with copy "Synced with your latest inputs" / "Tracking your operations".

---

## PART 1 — Invite Flow

### 1. Mandatory invite removed
- Onboarding has no invite step (unchanged: onboarding checklist is still 3 steps: business setup, profile/revenue, start monitoring).
- Route guard does not redirect to invite; users land on overview after setup.

### 2. Invite suggestion after dashboard
- **Group overview** (`group/overview/page.tsx`): Renders `InviteSuggestion` at top right (org context). Only when `role?.canManageOrganization` (owner).
- **Branch overview** (`branch/overview/page.tsx`): Renders `InviteSuggestion` at top right (branch context). Only when `role?.canEditBranch` (owner, manager, branch_manager). `branch_user` and `viewer` do not see it.

### 3. Softer framing
- **Org:** "Share this view with your team" / "Keep your team aligned. Add a manager or branch manager." (settings section title and description).
- **Branch:** "Add your branch manager" (suggestion button and settings section).

### 4. Contextual invite
- On **branch** page: suggestion copy is "Add your branch manager"; modal opens with branch context (branchId, branch roles only).
- On **org** page: suggestion copy is "Share this view with your team"; modal opens with org context (organizationId, manager or branch selector). If user selects a branch in the modal, role switches to branch roles (branch_manager, branch_user, viewer).

### 5. Invite modal
- **Components:** `components/invite-modal.tsx`, `components/invite-suggestion.tsx`.
- **Fields:** Email, Role (with short description under dropdown), Branch selector when org-level and multiple branches (first option: "Invite as org manager").
- **Role descriptions (EN):** Manager — "Can view all branches and manage team access."; Branch Manager — "Can manage this branch and invite branch users."; Branch User — "Can log data and view this branch."; Viewer — "View-only access to this branch."

### 6. Permissions (no frontend-only enforcement)
- **API** `POST /api/invite` enforces:
  - **Organization invite:** caller must be `organization_members.role === 'owner'` for that org (server-side check).
  - **Branch invite:** caller must be org owner/manager OR `branch_members.role === 'branch_manager'` for that branch (server-side check).
- **UI** only shows invite when `canManageOrganization` (org) or `canEditBranch` (branch). `branch_user` and `viewer` never see the invite option; if they call the API they receive 403.
- **RLS:** Invitation creation and reads should be protected by Supabase RLS on `invitations` and related tables; the API uses the authenticated Supabase user. Any frontend filtering is in addition to API/RLS, not the only enforcement.

---

## PART 2 — Activation Moment Dashboard

### 1. Non-empty first load
- When **group overview** has no `groupHealthScore` (no real data yet), the page no longer shows only `HealthScoreFallback`.
- It now shows: **InviteSuggestion** (top right) + **ActivationBlock** + any existing alerts if present.

### 2. Activation block content (`components/activation-block.tsx`)
- **1 chart:** Placeholder bar chart ("Chart will appear when you have data.").
- **1 flagged observation:** One highlighted card (yellow border) with business-type-specific copy (e.g. "Once you log room and revenue numbers, occupancy and cash runway will appear here" for hotel; "Once you log revenue and costs, cash runway and demand patterns will appear here" for F&B).
- **1 suggested action:** "Log your first numbers to start tracking." with link to Log Today.

### 3. Empty-state copy
- Activation block header: "Synced with your latest inputs." / "Tracking your operations."
- Tone: calm, operator-built, no hype.

### 4. Highlighted insight
- The single "Observation" card is visually highlighted (yellow border, light yellow background) so one actionable insight is prominent.

### 5. Branch overview
- Branch overview does not currently show a separate activation block when there is no data; it still uses existing HealthScoreFallback and content. To add activation on branch when no data, mirror the same pattern (no health score → show ActivationBlock + InviteSuggestion) in `branch/overview/page.tsx` if desired.

---

## PART 3 — Technical Safety

### RLS and backend
- **Invite permissions** are enforced in `apps/web/app/api/invite/route.ts`: org invite only for owner; branch invite for owner, manager, or branch_manager of that branch. No reliance on frontend-only checks for security.
- **Branch manager** cannot invite outside their branch: the API checks membership for the specific `branchId`; branch_manager only has access to their branch(es). Sending another branchId still requires being owner/manager (org-level) or branch_manager of that branch.
- **branch_user and viewer:** Do not see the invite button (InviteSuggestion checks `canEditBranch` / `canManageOrganization`). If they call the API, they get 403.

### Areas that still rely on frontend filtering
- **Who sees InviteSuggestion:** Driven by `role?.canManageOrganization` and `role?.canEditBranch` from `useUserRole()`. The actual enforcements are API and RLS; the UI only hides the option from users who would get 403 anyway.
- **Branch list in invite modal (org context):** Uses `businessGroupService.getAllBranches()` filtered by org. For a branch_manager who is on the org overview (if they could get there), they would only see their branch in the list; the API would still reject invites to branches they don’t manage. So this is consistent.

### Suggestions to improve activation further
1. **Branch overview empty state:** When branch has no health score / no data, show the same ActivationBlock (and InviteSuggestion) on branch overview for consistency.
2. **First-visit hint:** Optionally show the invite suggestion only after the user has viewed the dashboard once (e.g. after 5–10 seconds or after first scroll), so the first 15 seconds stay focused on the activation block.
3. **Real placeholder chart:** Replace the static bar placeholder with a minimal chart driven by business type (e.g. placeholder trend line or single metric) so the first chart feels more tangible.
4. **RLS audit:** Confirm Supabase RLS on `invitations`, `organization_members`, and `branch_members` so that all insert/update/select paths are covered and no one can create or read invitations without the same rules the API assumes.

---

## List of changed components

| File | Change |
|------|--------|
| `apps/web/app/components/invite-modal.tsx` | **New.** Modal: email, role (with description), optional branch selector; org vs branch context. |
| `apps/web/app/components/invite-suggestion.tsx` | **New.** Contextual CTA button; opens InviteModal; only when user can invite. |
| `apps/web/app/components/activation-block.tsx` | **New.** Placeholder chart, one observation, one suggested action; "Synced with your latest inputs" / "Tracking your operations." |
| `apps/web/app/group/overview/page.tsx` | InviteSuggestion (top right). When no groupHealthScore: show ActivationBlock + InviteSuggestion instead of HealthScoreFallback only. |
| `apps/web/app/branch/overview/page.tsx` | InviteSuggestion (top right) for branch context. |
| `apps/web/app/group/settings/page.tsx` | Section title and description: "Share this view with your team" / "Keep your team aligned. Add a manager or branch manager." |
| `apps/web/app/branch/settings/page.tsx` | Section label: "Add your branch manager" (replacing "Invite to this branch"). |

No changes to onboarding steps, route guard, or API invite logic (API already enforced permissions).
