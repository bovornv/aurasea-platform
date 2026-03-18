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
import { useUserSession } from './user-session-context';
import { useOrganization } from './organization-context';
import { useCurrentBranch } from '../hooks/use-current-branch';
import { getSupabaseClient, isSupabaseAvailable } from '../lib/supabase/client';
import { BRANCH_SELECT } from '../lib/db-selects';

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
  const { branch: currentBranch, branchId: currentBranchId } = useCurrentBranch();
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUserRole = useCallback(async () => {
    if (!isLoggedIn || !email) {
      setRole(null);
      setIsLoading(false);
      return;
    }

    if (!isSupabaseAvailable()) {
      setRole({
        ...FULL_ACCESS_SUPER_ADMIN_ROLE,
        isSuperAdmin: false,
        finalRole: 'owner',
        organizationRole: 'owner',
        effectiveRole: 'owner',
      });
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

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setRole({
          ...FULL_ACCESS_SUPER_ADMIN_ROLE,
          isSuperAdmin: false,
          finalRole: 'owner',
          organizationRole: 'owner',
          effectiveRole: 'owner',
        });
        setIsLoading(false);
        return;
      }

      // Fetch platform_admins first to determine finalRole
      const { data: platformAdmin } = await supabase
        .from('platform_admins')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      // PART 1: Fetch organization-level role (for active org when set, else any membership)
      let orgMembersQuery = supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', user.id);
      if (activeOrganizationId) {
        orgMembersQuery = orgMembersQuery.eq('organization_id', activeOrganizationId);
      }
      const { data: orgMembers, error: orgError } = await orgMembersQuery.maybeSingle();

      if (orgError && orgError.code !== 'PGRST116') {
        console.warn('[UserRole] Error fetching organization role:', orgError);
      }

      const orgRow = orgMembers as { role: string; organization_id: string } | null;
      const organizationMemberRole = orgRow?.role as OrganizationRole | null;
      const organizationId = orgRow?.organization_id || activeOrganizationId || null;

      // Fetch branch-level roles (branch_members where user_id = current user)
      const { data: branchMembers, error: branchError } = await supabase
        .from('branch_members')
        .select('*')
        .eq('user_id', user.id);

      if (branchError) {
        console.warn('[UserRole] Error fetching branch roles:', branchError);
      }

      const branchRoles = new Map<string, BranchRole>();
      const accessibleBranchIds: string[] = [];

      const branchMembersList = (branchMembers ?? []) as { branch_id: string; role: string }[];
      branchMembersList.forEach(member => {
        const r = normalizeBranchRole(member.role) ?? 'staff';
        branchRoles.set(member.branch_id, r);
        accessibleBranchIds.push(member.branch_id);
      });

      // If organization owner/admin, get all branches in organization
      const orgRoleNormalized = normalizeRole(organizationMemberRole);
      if ((orgRoleNormalized === 'owner' || orgRoleNormalized === 'admin') && organizationId) {
        const { data: orgBranches } = await supabase
          .from('branches')
          .select(BRANCH_SELECT)
          .eq('organization_id', organizationId);

        const orgBranchesList = (orgBranches ?? []) as { id: string; module_type?: string | null }[];
        orgBranchesList.forEach(branch => {
          if (!accessibleBranchIds.includes(branch.id)) {
            accessibleBranchIds.push(branch.id);
          }
        });
      }

      // Resolve effective role: org owner/admin → org role; else branch role if exists; else null (no default)
      const branchRoleForCurrent =
        currentBranch?.id != null
          ? branchMembersList.find((bm) => bm.branch_id === currentBranch.id)?.role ?? null
          : null;
      const effective = resolveEffectiveRole(organizationMemberRole, branchRoleForCurrent);

      const platformAdminRow = platformAdmin as { role?: string } | null;
      let finalRole: FinalRole;
      if (platformAdminRow?.role === 'super_admin') {
        finalRole = 'super_admin';
      } else if (effective) {
        finalRole = effective;
      } else {
        finalRole = 'member';
      }

      const organizationRole = (organizationMemberRole as OrganizationRole) ?? null;
      const effectiveRole = effective;

      // Permissions from resolved effectiveRole only (deterministic, scope-safe)
      const canManageOrganization = effectiveRole === 'owner';
      const canManageBranches = effectiveRole === 'owner' || effectiveRole === 'admin';
      const canEditBranch = canManageBranches || effectiveRole === 'manager' || effectiveRole === 'staff' || effectiveRole === 'owner';
      const canLogData = canEditBranch;
      const canViewOnly = false;

      const userRole: UserRole = {
        isSuperAdmin: finalRole === 'super_admin',
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

      setRole(userRole);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== 'User not authenticated') {
        console.error('[UserRole] Failed to fetch user role:', err);
      }
      setError(err instanceof Error ? err : new Error('Failed to fetch user role'));
      
      setRole({
        ...FULL_ACCESS_SUPER_ADMIN_ROLE,
        isSuperAdmin: false,
        finalRole: 'owner',
        organizationRole: 'owner',
        effectiveRole: 'owner',
      });
    } finally {
      setIsLoading(false);
    }
  }, [isLoggedIn, email, activeOrganizationId, currentBranchId, currentBranch?.id]);

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
