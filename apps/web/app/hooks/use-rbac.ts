/**
 * Central RBAC hook for navigation and route protection.
 * Single source for "who can see what" in the UI. Use this instead of inline role checks.
 */
'use client';

import { useMemo } from 'react';
import { useUserRole } from '../contexts/user-role-context';
import { canAccessCompanySettings as canAccessCompanySettingsMatrix, canViewCompanyOverview } from '../utils/rbac/permission-matrix';
import type { RbacRole } from '../utils/rbac/permission-matrix';

export interface RBAC {
  /** Owner and admin can access company (org) Settings. Manager, staff, viewer denied. */
  canAccessCompanySettings: boolean;
  /** Can access branch settings page/tab. Only owner, admin, manager. Staff and viewer must not see it. */
  canAccessBranchSettings: boolean;
  /** Can log data (owner, manager, branch_manager, branch_user). */
  canLogData: boolean;
  /** Can invite users (org: owner; branch: owner, manager, branch_manager). */
  canInviteUsers: boolean;
  /** Can view company overview and trends (ORG_ROLES: owner, admin). Viewer is branch-only. */
  canViewCompanyOverview: boolean;
  /** Can delete branch (owner only). */
  canDeleteBranch: boolean;
  /** True only for org owner (or super_admin). Use to gate delete org, transfer ownership, billing. Admin must not have these. */
  isOrganizationOwner: boolean;
  /** Raw role for edge cases. Prefer the can* flags. */
  role: ReturnType<typeof useUserRole>['role'];
  isLoading: boolean;
}

export function useRBAC(): RBAC {
  const { role, isLoading } = useUserRole();

  return useMemo(() => {
    if (!role) {
      return {
        canAccessCompanySettings: false,
        canAccessBranchSettings: false,
        canLogData: false,
        canInviteUsers: false,
        canViewCompanyOverview: false,
        canDeleteBranch: false,
        isOrganizationOwner: false,
        role: null,
        isLoading,
      };
    }
    const effectiveRole = role.effectiveRole;
    const canAccessBranchSettings =
      effectiveRole != null && (role.isSuperAdmin || ['owner', 'admin', 'manager'].includes(effectiveRole));
    const canAccessCompanySettings =
      role.isSuperAdmin || (effectiveRole != null && canAccessCompanySettingsMatrix(effectiveRole as RbacRole));
    const isOrganizationOwner = role.isSuperAdmin || role.effectiveRole === 'owner';

    return {
      canAccessCompanySettings,
      canAccessBranchSettings,
      canLogData: role.canLogData,
      canInviteUsers: role.isSuperAdmin || role.canManageOrganization || role.canEditBranch,
      canViewCompanyOverview: role.isSuperAdmin || (role.effectiveRole != null && canViewCompanyOverview(role.effectiveRole as RbacRole)),
      canDeleteBranch: role.isSuperAdmin || role.effectiveRole === 'owner',
      isOrganizationOwner,
      role,
      isLoading,
    };
  }, [role, isLoading]);
}
