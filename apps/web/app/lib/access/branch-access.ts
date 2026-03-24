/**
 * Branch access resolution — schema-correct:
 * - organization_id is NOT on branch_members; resolve via branches.organization_id
 * - Org owner/admin (organization_members) may access all branches in that org without branch_members
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_BRANCH_ROLES = ['owner', 'manager', 'staff'] as const;

export type BranchAccessResult =
  | { allowed: true; organizationId: string }
  | { allowed: false; organizationId: string | null };

/**
 * True if the user is org owner/admin for the branch's organization OR has an allowed branch_members row.
 * Runs two parallel reads after resolving organization_id from public.branches (single round-trip for branch row).
 */
export async function resolveBranchAccess(
  supabase: SupabaseClient,
  params: { userId: string; branchId: string; allowedBranchRoles?: readonly string[] }
): Promise<BranchAccessResult> {
  const { userId, branchId, allowedBranchRoles = DEFAULT_BRANCH_ROLES } = params;

  const { data: branchRow, error: branchErr } = await supabase
    .from('branches')
    .select('organization_id')
    .eq('id', branchId)
    .maybeSingle();

  if (branchErr || !branchRow) {
    return { allowed: false, organizationId: null };
  }

  const organizationId = (branchRow as { organization_id?: string | null }).organization_id ?? null;
  if (!organizationId) {
    return { allowed: false, organizationId: null };
  }

  const [orgRes, bmRes] = await Promise.all([
    supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('branch_members')
      .select('role')
      .eq('branch_id', branchId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const orgRole = (orgRes.data as { role?: string } | null)?.role ?? '';
  if (orgRole === 'owner' || orgRole === 'admin') {
    return { allowed: true, organizationId };
  }

  const br = (bmRes.data as { role?: string } | null)?.role ?? '';
  if (br && allowedBranchRoles.includes(br)) {
    return { allowed: true, organizationId };
  }

  return { allowed: false, organizationId };
}
