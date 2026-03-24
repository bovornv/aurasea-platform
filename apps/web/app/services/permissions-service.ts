/**
 * Permissions Service
 *
 * Branch-scoped access. Role is always derived from context (no role in localStorage).
 * organization_members: owner, admin. branch_members: owner, manager, staff.
 */
'use client';

import { businessGroupService } from './business-group-service';
import type { Branch } from '../models/business-group';
import { BranchBusinessType } from '../models/business-group';

export type UserRole = 'owner' | 'admin' | 'manager' | 'staff';

export interface UserPermissions {
  role: UserRole | '';
  organizationId: string;
  branchIds: string[];
  email: string;
}

const STORAGE_KEY_PREFIX = 'user_permissions_';

/**
 * Get user permissions. Role is NOT read from localStorage (derive from UserRoleContext).
 * Only organizationId, branchIds, email are persisted for branch list and org context.
 */
export function getUserPermissions(email: string | null): UserPermissions {
  if (!email) {
    return { role: '', organizationId: '', branchIds: [], email: '' };
  }

  if (typeof window === 'undefined') {
    return { role: '', organizationId: '', branchIds: [], email };
  }

  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${email}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      const branchIds = parsed.branchIds ?? parsed.allowedBranchIds ?? [];
      return {
        role: '', // Always derive from context
        organizationId: parsed.organizationId ?? '',
        branchIds,
        email: parsed.email ?? email,
      };
    }
  } catch (err) {
    console.error('Failed to load user permissions:', err);
  }

  return { role: '', organizationId: '', branchIds: [], email };
}

/**
 * Persist only organizationId, branchIds, email. Do not persist role.
 */
export function setUserPermissions(permissions: UserPermissions): void {
  if (typeof window === 'undefined') return;
  try {
    const toStore = {
      organizationId: permissions.organizationId ?? '',
      branchIds: permissions.branchIds ?? [],
      email: permissions.email ?? '',
    };
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${permissions.email}`, JSON.stringify(toStore));
  } catch (err) {
    console.error('Failed to save user permissions:', err);
  }
}

/**
 * Check if user can access a specific branch
 */
export function canAccessBranch(
  permissions: UserPermissions,
  branchId: string
): boolean {
  if (permissions.role === 'owner' || permissions.role === 'admin') return true;
  if (permissions.branchIds.length === 0) return false;
  return permissions.branchIds.includes(branchId);
}

/**
 * Get list of branches user can access.
 * Accessible branches = branch_members for user (or all org branches for owner/admin).
 * Never filter by module; module context is derived from the selected branch's moduleType only.
 */
/**
 * Session permissions often omit `role` (not persisted). Use resolved org role from UserRoleContext
 * so owner/admin see all branches in the business group while permissions catch up.
 */
export function mergeOrgRoleForBranchList(
  permissions: UserPermissions,
  effectiveRole: string | null | undefined
): UserPermissions {
  if (permissions.role === 'owner' || permissions.role === 'admin') return permissions;
  const e = effectiveRole ?? '';
  if (e === 'owner' || e === 'admin') {
    return { ...permissions, role: e as UserRole };
  }
  return permissions;
}

export function getAccessibleBranches(permissions: UserPermissions): Branch[] {
  const allBranches = businessGroupService.getAllBranches();

  // Filter by organization_id if set
  let filteredBranches = allBranches;
  if (permissions.organizationId) {
    // Note: This assumes branches have organizationId field
    // For now, we'll filter by business group which represents the organization
    const businessGroup = businessGroupService.getBusinessGroup();
    if (businessGroup && businessGroup.id !== permissions.organizationId) {
      // If organization doesn't match, return empty (shouldn't happen in single-org setup)
      return [];
    }
  }

  if (permissions.role === 'owner' || permissions.role === 'admin') {
    const businessGroup = businessGroupService.getBusinessGroup();
    if (businessGroup) {
      return filteredBranches.filter(b => b.businessGroupId === businessGroup.id);
    }
    return filteredBranches;
  }

  // Branch-level roles see only branches they are in branch_members for
  if (permissions.branchIds.length === 0) {
    return [];
  }

  return filteredBranches.filter(branch =>
    permissions.branchIds.includes(branch.id)
  );
}

/**
 * Check if user can access "All Branches" view
 */
export function canAccessAllBranchesView(permissions: UserPermissions): boolean {
  return permissions.role === 'owner' || permissions.role === 'admin';
}

/**
 * Filter alerts by user permissions
 * Prevents cross-branch data leakage
 */
export function filterAlertsByPermissions<T extends { branchId?: string; organizationId?: string }>(
  items: T[],
  permissions: UserPermissions
): T[] {
  // Filter by organization_id first
  let filtered = items;
  if (permissions.organizationId) {
    filtered = filtered.filter(item => {
      // If item has organizationId, it must match
      // If item doesn't have organizationId, assume it belongs to current org (backward compatibility)
      return !item.organizationId || item.organizationId === permissions.organizationId;
    });
  }

  if (permissions.role === 'owner' || permissions.role === 'admin') {
    return filtered;
  }

  // Manager and branch roles see only alerts from accessible branches
  return filtered.filter(item => {
    if (!item.branchId) {
      // Alerts without branchId are excluded for non-owner roles
      return false;
    }
    return canAccessBranch(permissions, item.branchId);
  });
}

/**
 * Check if user can access a tab based on branch business type
 */
export function canAccessTab(
  permissions: UserPermissions,
  branch: Branch | null,
  tab: 'hotel' | 'cafe'
): boolean {
  if (!branch) {
    return false;
  }

  // Check if user can access this branch
  if (!canAccessBranch(permissions, branch.id)) {
    return false;
  }

  // Check if branch supports this tab
  if (tab === 'hotel') {
    return (
      branch.businessType === BranchBusinessType.HOTEL_RESORT ||
      branch.businessType === BranchBusinessType.HOTEL_WITH_CAFE
    );
  } else {
    // cafe tab
    return (
      branch.businessType === BranchBusinessType.CAFE_RESTAURANT ||
      branch.businessType === BranchBusinessType.HOTEL_WITH_CAFE
    );
  }
}

/**
 * Validate branch selection is allowed for user
 */
export function validateBranchSelection(
  permissions: UserPermissions,
  branchId: string | null
): boolean {
  if (!branchId) {
    // "All Branches" view - owner and admin (org-level) only
    return canAccessAllBranchesView(permissions);
  }

  // Check if user can access this specific branch
  return canAccessBranch(permissions, branchId);
}
