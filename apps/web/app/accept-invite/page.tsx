/**
 * /accept-invite?token=...
 * Production: validate by token_hash (or token for legacy). No dev logs. HTTPS-only.
 */
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getSupabaseClient, isSupabaseAvailable } from '../lib/supabase/client';
import { logRbacAudit } from '../utils/rbac-audit';
import { PageLayout } from '../components/page-layout';
import { LoadingSpinner } from '../components/loading-spinner';

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function acceptInvitation() {
      const rawToken = searchParams.get('token');
      if (!rawToken) {
        setStatus('error');
        setMessage('Invalid invitation link - missing token');
        return;
      }

      if (!isSupabaseAvailable()) {
        setStatus('error');
        setMessage('Supabase not available');
        return;
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        setStatus('error');
        setMessage('Supabase client not available');
        return;
      }

      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          setStatus('error');
          setMessage('Please log in to accept the invitation');
          router.push('/login');
          return;
        }

        const tokenHash = await sha256Hex(rawToken);
        let invitation: Record<string, unknown> | null = null;

        const { data: byHash, error: errHash } = await supabase
          .from('invitations')
          .select('*')
          .eq('token_hash', tokenHash)
          .maybeSingle();

        if (!errHash && byHash) {
          invitation = byHash as Record<string, unknown>;
        }
        if (!invitation) {
          const { data: byToken, error: errToken } = await supabase
            .from('invitations')
            .select('*')
            .eq('token', rawToken)
            .maybeSingle();
          if (!errToken && byToken) invitation = byToken as Record<string, unknown>;
        }

        if (!invitation) {
          setStatus('error');
          setMessage('Invalid or expired invitation');
          return;
        }

        const inv = invitation as {
          id: string;
          accepted?: boolean;
          expires_at: string;
          email: string;
          organization_id?: string;
          branch_id?: string;
          role: string;
          invited_by?: string;
        };

        if (inv.accepted) {
          setStatus('error');
          setMessage('This invitation has already been accepted');
          return;
        }

        if (new Date(inv.expires_at) <= new Date()) {
          setStatus('error');
          setMessage('This invitation has expired');
          return;
        }

        if (user.email !== inv.email) {
          setStatus('error');
          setMessage(`This invitation was sent to ${inv.email}, but you are logged in as ${user.email}`);
          return;
        }

        const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;
        try {
          await logRbacAudit(
            'invitation_accepted',
            inv.organization_id ? 'organization_members' : 'branch_members',
            inv.id,
            {
              email: inv.email,
              role: inv.role,
              organization_id: inv.organization_id ?? undefined,
              branch_id: inv.branch_id ?? undefined,
              invitation_id: inv.id,
            },
            {
              organizationId: inv.organization_id ?? null,
              branchId: inv.branch_id ?? null,
              userAgent,
            }
          );
          await logRbacAudit(
            'role_assigned',
            inv.organization_id ? 'organization_members' : 'branch_members',
            user.id,
            { email: inv.email, role: inv.role, invitation_id: inv.id },
            { organizationId: inv.organization_id ?? null, branchId: inv.branch_id ?? null, userAgent }
          );
        } catch (auditErr) {
          setStatus('error');
          setMessage(auditErr instanceof Error ? auditErr.message : 'Audit log failed. Role change aborted.');
          return;
        }

        if (inv.organization_id) {
          const { error: memberError } = await supabase
            .from('organization_members')
            .insert({
              organization_id: inv.organization_id,
              user_id: user.id,
              role: inv.role,
              invited_by: inv.invited_by,
            } as never);

          if (memberError) {
            if (memberError.code === '23505') {
              setStatus('error');
              setMessage('You are already a member of this organization');
              return;
            }
            throw memberError;
          }
        } else if (inv.branch_id) {
          const branchRole = inv.role === 'viewer' ? 'staff' : inv.role;
          const memberEmail = user.email ?? inv.email ?? null;
          if (!memberEmail) {
            setStatus('error');
            setMessage('Cannot add member without email');
            return;
          }
          const { error: memberError } = await supabase
            .from('branch_members')
            .insert({
              branch_id: inv.branch_id,
              user_id: user.id,
              role: branchRole,
              email: memberEmail,
              invited_by: inv.invited_by,
            } as never);

          if (memberError) {
            if (memberError.code === '23505') {
              setStatus('error');
              setMessage('You are already a member of this branch');
              return;
            }
            throw memberError;
          }
        }

        await supabase
          .from('invitations')
          .update({ accepted: true, accepted_at: new Date().toISOString() } as never)
          .eq('id', inv.id);

        let redirectUrl = '/';
        if (inv.organization_id && ['owner', 'admin'].includes(inv.role)) {
          redirectUrl = `/org/${inv.organization_id}/overview`;
        } else if (inv.branch_id) {
          const branchId = inv.branch_id;
          const orgId =
            inv.organization_id ??
            (await (async () => {
              const { data: branchRow } = await supabase
                .from('branches')
                .select('organization_id')
                .eq('id', branchId)
                .maybeSingle();
              return (branchRow as { organization_id?: string } | null)?.organization_id ?? null;
            })());
          if (orgId) redirectUrl = `/org/${orgId}/branch/${branchId}/overview`;
        } else if (inv.organization_id) {
          redirectUrl = `/org/${inv.organization_id}/overview`;
        }

        setStatus('success');
        setMessage('Invitation accepted successfully! Redirecting...');

        setTimeout(() => {
          router.replace(redirectUrl);
        }, 1500);
      } catch (error) {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Failed to accept invitation');
      }
    }

    acceptInvitation();
  }, [searchParams, router]);

  return (
    <PageLayout title="" subtitle="">
      <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        {status === 'loading' && (
          <>
            <LoadingSpinner />
            <p style={{ marginTop: '1rem', color: '#6b7280' }}>Processing invitation...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div style={{ fontSize: '18px', color: '#10b981', marginBottom: '1rem' }}>✓ Invitation Accepted</div>
            <p style={{ color: '#6b7280' }}>{message}</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={{ fontSize: '18px', color: '#ef4444', marginBottom: '1rem' }}>✗ Error</div>
            <p style={{ color: '#6b7280', marginBottom: '1rem' }}>{message}</p>
            <button
              onClick={() => router.push('/')}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Go to home
            </button>
          </>
        )}
      </div>
    </PageLayout>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<PageLayout title=""><LoadingSpinner /></PageLayout>}>
      <AcceptInviteContent />
    </Suspense>
  );
}
