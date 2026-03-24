/**
 * User Role Context
 *
 * RBAC aligned with Supabase:
 * - organization_members: owner, admin
 * - branch_members: owner, manager, staff (viewer removed; legacy viewer treated as staff)
 * Role is always derived from context (no localStorage caching).
 */
'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { useUserSession } from './user-session-context';
import { useOrganization } from './organization-context';
import { getSupabaseClient, isSupabaseAvailable } from '../lib/supabase/client';
import { resolveAccessViaRpc } from '../services/access-resolution-service';
import { devLog } from '../lib/dev-log';

/** Normalize role string for consistent comparison and display. */
function normalizeRole(role: string | null | undefined): string {
  return role?.toLowerCase().trim() ?? '';
}

/** Organization-level roles (organization_members table). */
export type OrganizationRole = 'owner' | 'admin';
/** Branch-level roles (branch_members table). Viewer removed; use staff. */
export type BranchRole = 'owner' | 'manager' | 'staff';
export type EffectiveRoleValue = 'owner' | 'admin' | 'manager' | 'staff';

/** Map legacy or DB role to allowed BranchRole (viewer/branch_user -> staff, branch_manager -> manager). */
export function normalizeBranchRole(role: string | null | undefined): BranchRole | null {
  const r = normalizeRole(role);
  if (r === 'manager' || r === 'staff' || r === 'owner') return r as BranchRole;
  if (r === 'viewer' || r === 'branch_user') return 'staff';
  if (r === 'branch_manager') return 'manager';
  return null;
}

/**
 * Resolve effective role: org role takes precedence when owner/admin; else branch role; else null.
 * Deterministic and scope-safe. Use for display and permission checks.
 */
export function resolveEffectiveRole(
  orgRole: string | null | undefined,
  branchRole: string | null | undefined
): EffectiveRoleValue | null {
  const org = normalizeRole(orgRole);
  const branch = normalizeBranchRole(branchRole) ?? normalizeRole(branchRole);
  if (org === 'owner' || org === 'admin') return org as EffectiveRoleValue;
  if (branch && (branch === 'manager' || branch === 'staff' || branch === 'owner')) return branch as EffectiveRoleValue;
  return null;
}

/** Branch segment from /org/:orgId/branch/:branchId/... (must not call useCurrentBranch here — provider runs outside its own context). */
function branchIdFromOrgBranchPath(pathname: string | null): string | null {
  if (!pathname) return null;
  const m = pathname.match(/\/org\/[^/]+\/branch\/([^/]+)/);
  const id = m?.[1];
  if (!id || id === '__all__') return null;
  return id;
}

function effectiveRoleFromRpc(
  raw: string | null | undefined,
  source: string | null | undefined
): EffectiveRoleValue | null {
  if (raw == null) return null;
  const r = normalizeRole(raw);
  if (source === 'organization' && (r === 'owner' || r === 'admin')) return r as EffectiveRoleValue;
  const b = normalizeBranchRole(raw);
  if (b) return b as EffectiveRoleValue;
  if (r === 'owner' || r === 'admin') return r as EffectiveRoleValue;
  return null;
}

export type FinalRole = 'super_admin' | EffectiveRoleValue | 'member';

export interface UserRole {
  isSuperAdmin: boolean;
  finalRole: FinalRole;
  organizationRole: OrganizationRole | null;
  organizationId: string | null;
  branchRoles: Map<string, BranchRole>;
  accessibleBranchIds: string[];
  /** Resolved role for UI and permissions (from resolveEffectiveRole). */
  effectiveRole: EffectiveRoleValue | null;
  canManageOrganization: boolean;
  canManageBranches: boolean;
  canEditBranch: boolean;
  canLogData: boolean;
  canViewOnly: boolean;
}

interface UserRoleContextType {
  role: UserRole | null;
  isLoading: boolean;
  error: Error | null;
  refreshRole: () => Promise<void>;
}

const UserRoleContext = createContext<UserRoleContextType | undefined>(undefined);

const FULL_ACCESS_SUPER_ADMIN_ROLE: UserRole = {
  isSuperAdmin: true,
  finalRole: 'super_admin',
  organizationRole: null,
  organizationId: null,
  branchRoles: new Map(),
  accessibleBranchIds: [],
  effectiveRole: 'owner',
  canManageOrganization: true,
  canManageBranches: true,
  canEditBranch: true,
  canLogData: true,
  canViewOnly: false,
};

export function UserRoleProvider({ children }: { children: ReactNode }) {
  const { isLoggedIn, email } = useUserSession();
  const { activeOrganizationId } = useOrganization();
  const params = useParams();
  const pathname = usePathname();
  const orgIdFromUrl = (params?.orgId as string) ?? null;
  const branchIdFromParams = (params?.branchId as string) ?? null;
  const branchIdFromPath = branchIdFromOrgBranchPath(pathname);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUserRole = useCallback(async () => {
    if (!isLoggedIn || !email) {
      setRole(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    if (!isSupabaseAvailable()) {
      setError(new Error('Supabase is not available'));
      setRole(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase client not available');
      }

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        setRole(null);
        setError(authError ? new Error(authError.message) : new Error('Not authenticated'));
        return;
      }

      const { data: platformAdmin } = await supabase
        .from('platform_admins')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      const platformAdminRow = platformAdmin as { role?: string } | null;
      if (platformAdminRow?.role === 'super_admin') {
        setRole({ ...FULL_ACCESS_SUPER_ADMIN_ROLE });
        return;
      }

      // URL org wins over context during refresh / tab restore until OrganizationContext syncs.
      const targetOrgId = orgIdFromUrl ?? activeOrganizationId ?? null;
      const targetBranchId =
        branchIdFromParams && branchIdFromParams !== '__all__'
          ? branchIdFromParams
          : branchIdFromPath;

      const { orgAccess, branchAccess, accessible } = await resolveAccessViaRpc(supabase, {
        organizationId: targetOrgId,
        branchId: targetBranchId,
      });

      if (!accessible.ok) {
        throw new Error(accessible.code || 'get_my_accessible_branches failed');
      }

      const accessibleBranchIds = accessible.branch_ids ?? [];
      const branchRoles = new Map<string, BranchRole>();
      for (const row of accessible.branch_memberships ?? []) {
        if (!row.branch_id) continue;
        const r = normalizeBranchRole(row.role) ?? 'staff';
        branchRoles.set(row.branch_id, r);
      }

      const organizationMemberRole: OrganizationRole | null =
        orgAccess?.allowed && orgAccess.organization_role
          ? (normalizeRole(orgAccess.organization_role) === 'owner' ||
              normalizeRole(orgAccess.organization_role) === 'admin'
              ? (orgAccess.organization_role as OrganizationRole)
              : null)
          : null;

      const organizationId = targetOrgId;

      const branchRoleForCurrent = targetBranchId
        ? (accessible.branch_memberships ?? []).find((m) => m.branch_id === targetBranchId)?.role ?? null
        : null;

      let effective: EffectiveRoleValue | null = resolveEffectiveRole(
        organizationMemberRole,
        branchRoleForCurrent
      );
      let accessSource: string | null =
        organizationMemberRole != null ? 'organization_members' : branchRoleForCurrent != null ? 'branch_members' : null;

      if (branchAccess?.allowed && branchAccess.effective_role) {
        const fromRpc = effectiveRoleFromRpc(branchAccess.effective_role, branchAccess.source ?? null);
        if (fromRpc) {
          effective = fromRpc;
          accessSource = branchAccess.source ?? 'rpc_branch';
        }
      }

      let finalRole: FinalRole;
      if (effective) {
        finalRole = effective;
      } else {
        finalRole = 'member';
      }

      const organizationRole = organizationMemberRole;
      const effectiveRole = effective;

      const canManageOrganization = effectiveRole === 'owner';
      const canManageBranches = effectiveRole === 'owner' || effectiveRole === 'admin';
      const canEditBranch =
        canManageBranches ||
        effectiveRole === 'manager' ||
        effectiveRole === 'staff' ||
        effectiveRole === 'owner';
      const canLogData = canEditBranch;
      const canViewOnly = false;

      const userRole: UserRole = {
        isSuperAdmin: false,
        finalRole,
        organizationRole,
        organizationId,
        branchRoles,
        accessibleBranchIds,
        effectiveRole,
        canManageOrganization,
        canManageBranches,
        canEditBranch,
        canLogData,
        canViewOnly,
      };

      if (process.env.NODE_ENV === 'development') {
        devLog('[ACCESS_RESOLUTION]', {
          authUserId: user.id,
          authUserEmail: email,
          selectedOrganizationId: targetOrgId,
          selectedBranchId: targetBranchId,
          orgAccess,
          branchAccess,
          accessibleBranchIds,
          resolvedEffectiveRole: effectiveRole,
          accessSource,
          redirectBeforeReady: false,
        });
      }

      setRole(userRole);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== 'User not authenticated') {
        console.error('[UserRole] Failed to fetch user role:', err);
      }
      setError(err instanceof Error ? err : new Error('Failed to fetch user role'));
      setRole(null);
    } finally {
      setIsLoading(false);
    }
  }, [isLoggedIn, email, activeOrganizationId, orgIdFromUrl, branchIdFromParams, branchIdFromPath]);

  useEffect(() => {
    fetchUserRole();
  }, [fetchUserRole]);

  return (
    <UserRoleContext.Provider
      value={{
        role,
        isLoading,
        error,
        refreshRole: fetchUserRole,
      }}
    >
      {children}
    </UserRoleContext.Provider>
  );
}

export function useUserRole() {
  const context = useContext(UserRoleContext);
  if (!context) {
    throw new Error('useUserRole must be used within UserRoleProvider');
  }
  return context;
}
