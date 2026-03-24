/**
 * Server-side access resolution (Supabase RPC). Single source of truth for org/branch access.
 */
'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

export type OrgAccessPayload = {
  ok: boolean;
  allowed?: boolean;
  organization_role?: string | null;
  source?: string | null;
  code?: string;
};

export type BranchAccessPayload = {
  ok: boolean;
  allowed?: boolean;
  effective_role?: string | null;
  source?: string | null;
  organization_id?: string | null;
  reason?: string;
  code?: string;
};

export type AccessibleBranchesPayload = {
  ok: boolean;
  branch_ids?: string[];
  branch_memberships?: Array<{ branch_id: string; role: string }>;
  code?: string;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function parseOrgAccess(data: unknown): OrgAccessPayload {
  const o = asRecord(data);
  if (!o) return { ok: false, code: 'invalid_payload' };
  return {
    ok: Boolean(o.ok),
    allowed: o.allowed === undefined ? undefined : Boolean(o.allowed),
    organization_role: (o.organization_role as string) ?? null,
    source: (o.source as string) ?? null,
    code: o.code as string | undefined,
  };
}

function parseBranchAccess(data: unknown): BranchAccessPayload {
  const o = asRecord(data);
  if (!o) return { ok: false, code: 'invalid_payload' };
  return {
    ok: Boolean(o.ok),
    allowed: o.allowed === undefined ? undefined : Boolean(o.allowed),
    effective_role: (o.effective_role as string) ?? null,
    source: (o.source as string) ?? null,
    organization_id: (o.organization_id as string) ?? null,
    reason: o.reason as string | undefined,
    code: o.code as string | undefined,
  };
}

function parseAccessibleBranches(data: unknown): AccessibleBranchesPayload {
  const o = asRecord(data);
  if (!o) return { ok: false, code: 'invalid_payload' };
  const rawIds = o.branch_ids;
  let branch_ids: string[] | undefined;
  if (Array.isArray(rawIds)) {
    branch_ids = rawIds.map((x) => String(x));
  }
  const rawM = o.branch_memberships;
  let branch_memberships: Array<{ branch_id: string; role: string }> | undefined;
  if (Array.isArray(rawM)) {
    branch_memberships = rawM.map((row) => {
      const r = asRecord(row);
      return {
        branch_id: String(r?.branch_id ?? ''),
        role: String(r?.role ?? ''),
      };
    });
  }
  return {
    ok: Boolean(o.ok),
    branch_ids,
    branch_memberships,
    code: o.code as string | undefined,
  };
}

export async function resolveAccessViaRpc(
  supabase: SupabaseClient,
  args: {
    organizationId: string | null;
    branchId: string | null;
  }
): Promise<{
  orgAccess: OrgAccessPayload | null;
  branchAccess: BranchAccessPayload | null;
  accessible: AccessibleBranchesPayload;
}> {
  const { organizationId, branchId } = args;

  const branchesResult = await supabase.rpc('get_my_accessible_branches' as never);
  if (branchesResult.error) {
    throw new Error(branchesResult.error.message || 'get_my_accessible_branches failed');
  }
  const accessible = parseAccessibleBranches(branchesResult.data as unknown);

  let orgAccess: OrgAccessPayload | null = null;
  if (organizationId) {
    const orgResult = await supabase.rpc(
      'get_my_organization_access' as never,
      { p_organization_id: organizationId } as never
    );
    if (orgResult.error) {
      throw new Error(orgResult.error.message || 'get_my_organization_access failed');
    }
    orgAccess = parseOrgAccess(orgResult.data as unknown);
  }

  let branchAccess: BranchAccessPayload | null = null;
  if (branchId) {
    const brResult = await supabase.rpc(
      'get_my_branch_access' as never,
      { p_branch_id: branchId } as never
    );
    if (brResult.error) {
      throw new Error(brResult.error.message || 'get_my_branch_access failed');
    }
    branchAccess = parseBranchAccess(brResult.data as unknown);
  }

  return { orgAccess, branchAccess, accessible };
}
