/**
 * POST /api/invite
 * Production: store only token_hash; invite link uses NEXT_PUBLIC_BASE_URL, path /accept-invite.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomUUID } from 'crypto';
import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import { BRANCH_SELECT } from '../../lib/db-selects';
import { sendInviteEmail } from '../../lib/send-invite-email';
import { insertRbacAudit } from '../../utils/rbac-audit';

function getClientIp(request: NextRequest): string | null {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    null
  );
}

function getBaseUrl(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (env) {
    const base = env.replace(/\/$/, '');
    return base.startsWith('http') ? base : `https://${base}`;
  }
  const origin = request.nextUrl.origin;
  if (process.env.NODE_ENV === 'production' && origin.startsWith('http://')) {
    return origin.replace('http://', 'https://');
  }
  return origin;
}

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseAvailable()) {
      return NextResponse.json(
        { error: 'Supabase not available' },
        { status: 503 }
      );
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase client not available' },
        { status: 503 }
      );
    }

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { email, role, organizationId, branchId } = body;

    // Validate input
    if (!email || !role) {
      return NextResponse.json(
        { error: 'Email and role are required' },
        { status: 400 }
      );
    }

    // Validate scope (either organizationId or branchId, not both)
    if (!organizationId && !branchId) {
      return NextResponse.json(
        { error: 'Either organizationId or branchId is required' },
        { status: 400 }
      );
    }

    if (organizationId && branchId) {
      return NextResponse.json(
        { error: 'Cannot specify both organizationId and branchId' },
        { status: 400 }
      );
    }

    // Role by scope: org = owner, admin, manager; branch = owner, manager, staff (viewer removed)
    const validOrgRoles = ['owner', 'admin', 'manager'];
    const validBranchRoles = ['owner', 'manager', 'staff'];
    if (organizationId && !validOrgRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role for organization invite' }, { status: 400 });
    }
    if (branchId && !validBranchRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role for branch invite (use owner, manager, or staff)' }, { status: 400 });
    }

    // Super admin bypass
    const { data: superAdminRow } = await supabase.rpc('is_super_admin');
    const isSuperAdmin = superAdminRow === true;

    if (!isSuperAdmin) {
      if (organizationId) {
        const { data } = await supabase
          .from('organization_members')
          .select('role')
          .eq('organization_id', organizationId)
          .eq('user_id', user.id)
          .maybeSingle();
        const orgMember = data as { role: string } | null;

        if (!orgMember || !['owner', 'admin'].includes(orgMember.role)) {
          return NextResponse.json(
            { error: 'Only organization owners can invite members' },
            { status: 403 }
          );
        }
      } else if (branchId) {
      // Branch invitation - owners, managers, and branch managers can invite
      const { data: branchData } = await supabase
        .from('branches')
        .select(BRANCH_SELECT)
        .eq('id', branchId)
        .maybeSingle();
      const branch = branchData as { organization_id: string; module_type?: string | null } | null;

      if (!branch) {
        return NextResponse.json(
          { error: 'Branch not found' },
          { status: 404 }
        );
      }

      // Check if user is organization owner/manager
      const { data: orgMemberData } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', branch.organization_id)
        .eq('user_id', user.id)
        .maybeSingle();
      const orgMember = orgMemberData as { role: string } | null;

      // Check if user is branch manager
      const { data: branchMemberData } = await supabase
        .from('branch_members')
        .select('role')
        .eq('branch_id', branchId)
        .eq('user_id', user.id)
        .maybeSingle();
      const branchMember = branchMemberData as { role: string } | null;

      const canInvite =
        (orgMember && ['owner', 'admin'].includes(orgMember.role)) ||
        (branchMember && branchMember.role === 'manager');

      if (!canInvite) {
          return NextResponse.json(
            { error: 'Insufficient permissions to invite branch members' },
            { status: 403 }
          );
        }
      }
    }

    const rawToken = randomUUID();
    const tokenHash = createHash('sha256').update(rawToken, 'utf8').digest('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    const inviteRow = {
      organization_id: organizationId || null,
      branch_id: branchId || null,
      email,
      role,
      token_hash: tokenHash,
      token: null,
      invited_by: user.id,
      expires_at: expiresAt.toISOString(),
      accepted: false,
    };
    const { data: invitation, error: inviteError } = await supabase
      .from('invitations')
      .insert(inviteRow as never)
      .select()
      .single();

    if (inviteError) {
      return NextResponse.json(
        { error: 'Failed to create invitation' },
        { status: 500 }
      );
    }

    const inv = invitation as { id: string } | null;
    const ipAddress = getClientIp(request);
    const userAgent = request.headers.get('user-agent') ?? null;
    try {
      await insertRbacAudit(supabase, user.id, {
        action: 'invitation_created',
        targetType: 'invitation',
        targetId: inv?.id ?? null,
        organizationId: organizationId ?? null,
        branchId: branchId ?? null,
        ipAddress,
        userAgent,
        details: { email, role, invitation_id: inv?.id },
      });
    } catch (auditErr) {
      return NextResponse.json(
        { error: 'Audit log failed. Invitation created but operation rejected.' },
        { status: 500 }
      );
    }

    const baseUrl = getBaseUrl(request);
    const inviteLink = `${baseUrl}/accept-invite?token=${encodeURIComponent(rawToken)}`;
    const scope = organizationId ? 'organization' : 'branch';
    const emailResult = await sendInviteEmail(email, inviteLink, role, scope);

    return NextResponse.json({
      success: true,
      invitation: {
        id: inv?.id ?? '',
        email,
        role,
        expiresAt: expiresAt.toISOString(),
        inviteLink,
        emailSent: emailResult.sent,
        emailError: emailResult.error ?? undefined,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
