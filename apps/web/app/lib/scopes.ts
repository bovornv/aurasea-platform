/**
 * Role-Based Scoping Utilities
 * 
 * Centralized logic for scoping data queries by user role.
 * Used by layouts and services to ensure data is filtered appropriately.
 */

'use client';

import type { UserRole, UserPermissions } from '../services/permissions-service';
import { getUserPermissions } from '../services/permissions-service';
import { businessGroupService } from '../services/business-group-service';
import type { Branch } from '../models/business-group';

/**
 * Get current user permissions
 */
export function getCurrentUserPermissions(): UserPermissions | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const email = localStorage.getItem('hospitality_user_email');
    if (!email) return null;
    
    return getUserPermissions(email);
  } catch {
    return null;
  }
}

/**
 * Get accessible branch IDs for current user
 * Returns empty array for owner (meaning all branches)
 */
export function getAccessibleBranchIds(): string[] {
  const permissions = getCurrentUserPermissions();
  if (!permissions) return [];
  
  // Owner sees all branches (empty array = all)
  if (permissions.role === 'owner' || permissions.role === 'admin') {
    return [];
  }
  
  // Manager and branch roles see only assigned branches
  return permissions.branchIds;
}

/**
 * Get accessible branches for current user
 */
export function getAccessibleBranches(): Branch[] {
  const permissions = getCurrentUserPermissions();
  if (!permissions) return [];
  
  const allBranches = businessGroupService.getAllBranches();
  
  // Owner sees all branches
  if (permissions.role === 'owner' || permissions.role === 'admin') {
    return allBranches;
  }
  
  // Manager and branch roles see only assigned branches
  if (permissions.branchIds.length === 0) {
    return [];
  }
  
  return allBranches.filter(branch =>
    permissions.branchIds.includes(branch.id)
  );
}

/**
 * Check if user can access a specific branch
 */
export function canAccessBranch(branchId: string | null): boolean {
  const permissions = getCurrentUserPermissions();
  if (!permissions) return false;
  
  // "All Branches" view - only owner/manager can access
  if (!branchId) {
    return permissions.role === 'owner' || permissions.role === 'admin';
  }
  
  // Owner/admin can access all branches
  if (permissions.role === 'owner' || permissions.role === 'admin') {
    return true;
  }
  
  // Manager and branch roles can only access assigned branches
  if (permissions.branchIds.length === 0) {
    return false;
  }
  
  return permissions.branchIds.includes(branchId);
}

/**
 * Check if user can access "All Branches" view
 */
export function canAccessAllBranchesView(): boolean {
  const permissions = getCurrentUserPermissions();
  if (!permissions) return false;
  
  return permissions.role === 'owner' || permissions.role === 'admin';
}

/**
 * Scope data by user role
 * Filters items to only those accessible by the current user
 */
export function scopeByRole<T extends { branchId?: string; organizationId?: string }>(
  items: T[]
): T[] {
  const permissions = getCurrentUserPermissions();
  if (!permissions) return [];
  
  // Filter by organization_id first
  let filtered = items;
  if (permissions.organizationId) {
    filtered = filtered.filter(item => {
      return !item.organizationId || item.organizationId === permissions.organizationId;
    });
  }
  
  // Owner sees all items in their organization
  if (permissions.role === 'owner' || permissions.role === 'admin') {
    return filtered;
  }
  
  // Manager and branch roles see only items from accessible branches
  return filtered.filter(item => {
    if (!item.branchId) {
      // Items without branchId are excluded for non-owner roles
      return false;
    }
    return canAccessBranch(item.branchId);
  });
}

/**
 * Scope branches by user role
 */
export function scopeBranches(branches: Branch[]): Branch[] {
  const permissions = getCurrentUserPermissions();
  if (!permissions) return [];
  
  // Owner sees all branches
  if (permissions.role === 'owner' || permissions.role === 'admin') {
    return branches;
  }
  
  // Manager and branch roles see only assigned branches
  if (permissions.branchIds.length === 0) {
    return [];
  }
  
  return branches.filter(branch =>
    permissions.branchIds.includes(branch.id)
  );
}
