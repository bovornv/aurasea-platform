-- Production: store only token_hash for invite links; raw token sent in email only.
-- Run in Supabase SQL Editor. No RLS or RBAC changes.

-- Add token_hash for lookup; keep token nullable for new rows (store only hash)
ALTER TABLE invitations
ADD COLUMN IF NOT EXISTS token_hash TEXT;

-- Unique index for secure lookup by hash
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_token_hash ON invitations(token_hash) WHERE token_hash IS NOT NULL;

-- Allow token to be null for new invites (existing rows keep token for backward compat)
ALTER TABLE invitations
ALTER COLUMN token DROP NOT NULL;

-- Backfill: for existing rows with token, set token_hash = sha256(token) so accept can find by hash
CREATE EXTENSION IF NOT EXISTS pgcrypto;
UPDATE invitations
SET token_hash = encode(digest(token, 'sha256'), 'hex')
WHERE token IS NOT NULL AND (token_hash IS NULL OR token_hash = '');
