# AuraSea Invitation System — Testing Checklist

Hospitality-first, Thai default. Operating-layer identity.

## Manual Testing Checklist

### Prerequisites
- SMTP/Resend: Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in env.
- Supabase: `invitations` table with `token`, `expires_at`, `accepted`, `accepted_at`, `organization_id`, `branch_id`, `role`, `invited_by`, `email`.

### Test with

1. **New Gmail account**
   - Send invite to a Gmail address not yet in the org/branch.
   - Verify email received (inbox; check spam).
   - Subject must be: **คุณได้รับคำเชิญเข้าร่วมระบบ AuraSea**.
   - Body: AuraSea header, Thai copy, **[ เข้าร่วมระบบ ]** button, footer "Operating Layer for the Real Economy".

2. **Manager role (organization or branch)**
   - Invite as **manager** to a branch.
   - Accept with invited email; ensure role is manager.
   - Redirect must be to **branch overview** (`/org/{orgId}/branch/{branchId}/overview`).
   - No access-denied flash.

3. **Branch manager role**
   - Same as above; confirm manager can access branch settings and branch overview.

4. **Viewer role**
   - Invite as **viewer** to a branch.
   - Accept; confirm viewer can open branch overview and read-only routes only.
   - Redirect to branch overview; no access-denied loop.

5. **Admin role (organization)**
   - Invite as **admin** at organization level.
   - Accept; redirect must be to **company overview** (`/org/{orgId}/overview`).
   - No access-denied.

### Verify

| Check | Pass |
|-------|------|
| Email received | ☐ |
| Link valid (click opens accept page) | ☐ |
| Role applied correctly (org_members / branch_members) | ☐ |
| Correct route access after accept | ☐ |
| No access denied flash | ☐ |
| Expired token (48h+) rejected with clear message | ☐ |
| Already-accepted token rejected | ☐ |
| Wrong-email login: invite for A, logged in as B → error shown | ☐ |

### Development logging (dev only)

In browser/Node console when `NODE_ENV=development`:

- **Send invite:** `[INVITE_CREATED]` with invitationId, email, role, organizationId/branchId, expiresAt.
- **Email:** `[INVITE_EMAIL_SENT]` or `[INVITE_EMAIL_FAILED]` with to, sent, error.
- **Accept:** `[INVITE_ACCEPTED]` with invitationId, email, role, organizationId, branchId.

Production: no verbose logs; only non-sensitive error handling.

### Production hardening

- **SMTP:** Configure Resend (or SMTP) with valid `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.
- **Invite tokens:** One-time use; after accept, `accepted` is set to true and token is not reused.
- **Expired tokens:** Rejected with "This invitation has expired" (48h window).
- **RBAC:** Unchanged; invitation only creates membership; route access follows existing RBAC.
