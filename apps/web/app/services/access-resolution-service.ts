/**
 * Server-side access resolution (Supabase RPC). Single source of truth for org/branch access.
 * All IDs are strings at the JS boundary; SQL functions accept text and cast internally.
 */
'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { devLog } from '../lib/dev-log';

export type OrgAccessPayload = {
  ok: boolean;
  allowed?: boolean;
  organization_role?: string | null;
  source?: string | null;
  code?: string;
  reason?: string;
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
    reason: o.reason as string | undefined,
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
    organization_id: o.organization_id != null ? String(o.organization_id) : null,
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

function isDev(): boolean {
  return typeof process !== 'undefined' && process.env.NODE_ENV === 'development';
}

function serializeRpcError(err: { message?: string; code?: string; details?: string; hint?: string } | null): object {
  if (!err) return {};
  return {
    message: err.message,
    code: err.code,
    details: err.details,
    hint: err.hint,
  };
}

function rpcNotFoundHint(err: { message?: string; code?: string } | null): string {
  const code = err?.code ?? '';
  const msg = (err?.message ?? '').toLowerCase();
  if (code === 'PGRST202' || msg.includes('could not find') || msg.includes('404')) {
    return ' Ensure public.get_my_accessible_branches(), get_my_branch_access(text), get_my_organization_access(text) exist (run apps/web/app/lib/supabase/add-get-my-access-rpc.sql) and reload PostgREST schema if needed.';
  }
  return '';
}

export async function resolveAccessViaRpc(
  supabase: SupabaseClient,
  args: {
    organizationId: string | null;
    branchId: string | null;
    authUserId: string;
    authEmail: string | null;
  }
): Promise<{
  orgAccess: OrgAccessPayload | null;
  branchAccess: BranchAccessPayload | null;
  accessible: AccessibleBranchesPayload;
}> {
  const { organizationId, branchId, authUserId, authEmail } = args;

  const rpcAccessibleName = 'get_my_accessible_branches';
  const accessiblePayload = {};

  if (isDev()) {
    devLog('[ACCESS_RPC]', {
      authUserId,
      authEmail,
      selectedOrganizationId: organizationId,
      selectedBranchId: branchId,
      rpc: rpcAccessibleName,
      payload: accessiblePayload,
    });
  }

  const branchesResult = await supabase.rpc(rpcAccessibleName as never, accessiblePayload as never);
  if (isDev()) {
    devLog('[ACCESS_RPC]', {
      rpc: rpcAccessibleName,
      response: branchesResult.data,
      error: serializeRpcError(branchesResult.error),
    });
  }
  if (branchesResult.error) {
    const hint = rpcNotFoundHint(branchesResult.error);
    throw new Error(
      `${branchesResult.error.message || 'get_my_accessible_branches failed'}${hint}`
    );
  }
  const accessible = parseAccessibleBranches(branchesResult.data as unknown);

  let orgAccess: OrgAccessPayload | null = null;
  if (organizationId) {
    const rpcOrgName = 'get_my_organization_access';
    const orgArgs = { p_organization_id: organizationId };
    if (isDev()) {
      devLog('[ACCESS_RPC]', {
        authUserId,
        authEmail,
        selectedOrganizationId: organizationId,
        selectedBranchId: branchId,
        rpc: rpcOrgName,
        payload: orgArgs,
      });
    }
    const orgResult = await supabase.rpc(rpcOrgName as never, orgArgs as never);
    if (isDev()) {
      devLog('[ACCESS_RPC]', {
        rpc: rpcOrgName,
        response: orgResult.data,
        error: serializeRpcError(orgResult.error),
      });
    }
    if (orgResult.error) {
      const hint = rpcNotFoundHint(orgResult.error);
      throw new Error(`${orgResult.error.message || 'get_my_organization_access failed'}${hint}`);
    }
    orgAccess = parseOrgAccess(orgResult.data as unknown);
  }

  let branchAccess: BranchAccessPayload | null = null;
  if (branchId) {
    const rpcBranchName = 'get_my_branch_access';
    const branchArgs = { p_branch_id: branchId };
    if (isDev()) {
      devLog('[ACCESS_RPC]', {
        authUserId,
        authEmail,
        selectedOrganizationId: organizationId,
        selectedBranchId: branchId,
        rpc: rpcBranchName,
        payload: branchArgs,
      });
    }
    const brResult = await supabase.rpc(rpcBranchName as never, branchArgs as never);
    if (isDev()) {
      devLog('[ACCESS_RPC]', {
        rpc: rpcBranchName,
        response: brResult.data,
        error: serializeRpcError(brResult.error),
      });
    }
    if (brResult.error) {
      const hint = rpcNotFoundHint(brResult.error);
      throw new Error(`${brResult.error.message || 'get_my_branch_access failed'}${hint}`);
    }
    branchAccess = parseBranchAccess(brResult.data as unknown);
  }

  return { orgAccess, branchAccess, accessible };
}

/** Normalize IDs for comparisons (URL, RPC, and DB may differ only by whitespace/casing of uuid). */
export function normalizeAccessId(id: string | null | undefined): string {
  return (id ?? '').trim();
}
