# Supabase Auth — Production (www.auraseaos.com)

Configure Supabase Dashboard for production. No localhost in production.

## Site URL

- **Site URL:** `https://www.auraseaos.com`

## Redirect URLs

Add these in **Authentication → URL Configuration → Redirect URLs**:

- `https://www.auraseaos.com/**`
- `https://www.auraseaos.com/`
- `https://www.auraseaos.com/accept-invite`
- `https://www.auraseaos.com/complete-signup`

Remove `http://localhost:*` from production environment.

## Environment

- **Production:** Set `NEXT_PUBLIC_BASE_URL=https://www.auraseaos.com` (no trailing slash).
- Invite links use this base; path is `/accept-invite?token=...`.
- HTTPS-only in production; no insecure redirects.

## Email (invitations)

- Sender: `no-reply@auraseaos.com` (set `RESEND_FROM_EMAIL` or use default).
- Ensure SPF and DKIM are configured for `auraseaos.com` so delivery and inbox placement are correct.
